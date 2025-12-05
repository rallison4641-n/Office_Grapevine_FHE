pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";


contract OfficeGrapevineFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchNotOpen();
    error BatchAlreadyOpen();
    error BatchNotClosed();
    error InvalidParameter();
    error ReplayDetected();
    error StateMismatch();
    error DecryptionFailed();

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    struct SalaryData {
        euint32 encryptedSalary;
        euint32 encryptedCompanySize;
        euint32 encryptedYearsExperience;
    }

    struct AggregatedBatchData {
        euint32 totalEncryptedSalary;
        euint32 totalEncryptedCompanySize;
        euint32 totalEncryptedYearsExperience;
        euint32 count;
    }

    address public owner;
    mapping(address => bool) public providers;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    uint256 public currentBatchId;
    bool public batchOpen;
    AggregatedBatchData public currentAggregatedData;

    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event ContractPaused();
    event ContractUnpaused();
    event CooldownSecondsChanged(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event SalaryDataSubmitted(address indexed provider, uint256 indexed batchId);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 averageSalary, uint256 averageCompanySize, uint256 averageYearsExperience);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!providers[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier submissionRateLimited() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        lastSubmissionTime[msg.sender] = block.timestamp;
        _;
    }

    modifier decryptionRateLimited() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        _;
    }

    constructor() {
        owner = msg.sender;
        providers[owner] = true;
        cooldownSeconds = 60;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address oldOwner = owner;
        owner = newOwner;
        providers[newOwner] = true;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        providers[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        providers[provider] = false;
        emit ProviderRemoved(provider);
    }

    function pauseContract() external onlyOwner whenNotPaused {
        paused = true;
        emit ContractPaused();
    }

    function unpauseContract() external onlyOwner {
        paused = false;
        emit ContractUnpaused();
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        if (newCooldownSeconds == 0) revert InvalidParameter();
        uint256 oldCooldownSeconds = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSecondsChanged(oldCooldownSeconds, newCooldownSeconds);
    }

    function openBatch() external onlyOwner whenNotPaused {
        if (batchOpen) revert BatchAlreadyOpen();
        currentBatchId++;
        batchOpen = true;
        // Reset aggregation for the new batch
        currentAggregatedData = AggregatedBatchData({
            totalEncryptedSalary: FHE.asEuint32(0),
            totalEncryptedCompanySize: FHE.asEuint32(0),
            totalEncryptedYearsExperience: FHE.asEuint32(0),
            count: FHE.asEuint32(0)
        });
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyOwner whenNotPaused {
        if (!batchOpen) revert BatchNotOpen();
        batchOpen = false;
        emit BatchClosed(currentBatchId);
    }

    function submitSalaryData(
        euint32 encryptedSalary,
        euint32 encryptedCompanySize,
        euint32 encryptedYearsExperience
    ) external onlyProvider whenNotPaused submissionRateLimited {
        if (!batchOpen) revert BatchNotOpen();

        _initIfNeeded(encryptedSalary);
        _initIfNeeded(encryptedCompanySize);
        _initIfNeeded(encryptedYearsExperience);

        currentAggregatedData.totalEncryptedSalary = FHE.add(currentAggregatedData.totalEncryptedSalary, encryptedSalary);
        currentAggregatedData.totalEncryptedCompanySize = FHE.add(currentAggregatedData.totalEncryptedCompanySize, encryptedCompanySize);
        currentAggregatedData.totalEncryptedYearsExperience = FHE.add(currentAggregatedData.totalEncryptedYearsExperience, encryptedYearsExperience);
        currentAggregatedData.count = FHE.add(currentAggregatedData.count, FHE.asEuint32(1));

        emit SalaryDataSubmitted(msg.sender, currentBatchId);
    }

    function requestAverageSalaryDecryption() external onlyProvider whenNotPaused decryptionRateLimited {
        if (batchOpen) revert BatchNotClosed(); // Ensure batch is closed before decryption

        euint32 _count = currentAggregatedData.count;
        _initIfNeeded(_count);

        ebool countIsZero = FHE.eq(_count, FHE.asEuint32(0));
        if (FHE.isInitialized(countIsZero) && countIsZero.ciphertext[0] != bytes32(0)) { // Check if count is zero
            revert InvalidParameter(); // Cannot divide by zero
        }

        euint32 averageSalary = FHE.div(currentAggregatedData.totalEncryptedSalary, _count);
        euint32 averageCompanySize = FHE.div(currentAggregatedData.totalEncryptedCompanySize, _count);
        euint32 averageYearsExperience = FHE.div(currentAggregatedData.totalEncryptedYearsExperience, _count);

        bytes32[] memory cts = new bytes32[](3);
        cts[0] = FHE.toBytes32(averageSalary);
        cts[1] = FHE.toBytes32(averageCompanySize);
        cts[2] = FHE.toBytes32(averageYearsExperience);

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: currentBatchId,
            stateHash: stateHash,
            processed: false
        });

        emit DecryptionRequested(requestId, currentBatchId);
    }

    function myCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        if (decryptionContexts[requestId].processed) {
            revert ReplayDetected();
        }

        // Rebuild cts in the exact same order as in requestAverageSalaryDecryption
        euint32 averageSalary = FHE.div(currentAggregatedData.totalEncryptedSalary, currentAggregatedData.count);
        euint32 averageCompanySize = FHE.div(currentAggregatedData.totalEncryptedCompanySize, currentAggregatedData.count);
        euint32 averageYearsExperience = FHE.div(currentAggregatedData.totalEncryptedYearsExperience, currentAggregatedData.count);

        bytes32[] memory cts = new bytes32[](3);
        cts[0] = FHE.toBytes32(averageSalary);
        cts[1] = FHE.toBytes32(averageCompanySize);
        cts[2] = FHE.toBytes32(averageYearsExperience);

        bytes32 currentHash = _hashCiphertexts(cts);
        if (currentHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        try FHE.checkSignatures(requestId, cleartexts, proof) {
            // Decode cleartexts in the same order
            uint256 clearAverageSalary = abi.decode(cleartexts, (uint256));
            uint256 clearAverageCompanySize;
            uint256 clearAverageYearsExperience;
            assembly {
                clearAverageCompanySize := mload(add(add(cleartexts, 0x20), 0x20))
                clearAverageYearsExperience := mload(add(add(cleartexts, 0x20), 0x40))
            }

            decryptionContexts[requestId].processed = true;
            emit DecryptionCompleted(
                requestId,
                decryptionContexts[requestId].batchId,
                clearAverageSalary,
                clearAverageCompanySize,
                clearAverageYearsExperience
            );
        } catch {
            revert DecryptionFailed();
        }
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 val) internal pure {
        if (!FHE.isInitialized(val)) {
            val.ciphertext = new bytes32[](1);
        }
    }

    function _initIfNeeded(ebool val) internal pure {
        if (!FHE.isInitialized(val)) {
            val.ciphertext = new bytes32[](1);
        }
    }

    function _requireInitialized(euint32 val) internal pure {
        if (!FHE.isInitialized(val)) {
            revert InvalidParameter();
        }
    }

    function _requireInitialized(ebool val) internal pure {
        if (!FHE.isInitialized(val)) {
            revert InvalidParameter();
        }
    }
}