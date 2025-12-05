# Office Grapevine: An Anonymous Workplace Social Network

Office Grapevine is an innovative platform designed for professionals seeking a secure, anonymous environment to discuss workplace topics. Powered by **Zama's Fully Homomorphic Encryption technology**, this social network allows users to engage in sensitive discussions about salaries, company culture, and more without compromising their identities or privacy.

## Addressing Workplace Communication Challenges

In today’s corporate landscape, open communication about sensitive topics like salary, workplace culture, and professional feedback is often stifled by fear of retaliation or judgment. Professionals may hesitate to speak freely, resulting in a lack of transparency and shared understanding. Office Grapevine aims to tackle this issue by providing a safe space for anonymous discussions, giving employees a voice while protecting their identities.

## How FHE Provides a Secure Solution

Fully Homomorphic Encryption (FHE) is the cornerstone of Office Grapevine’s security model. By utilizing Zama's open-source libraries such as **Concrete** and the **zama-fhe SDK**, we ensure that user identities and company information remain encrypted at all times. This means that while employees can engage in robust discussions and analysis of macro data like industry salary averages, their personal details are fully protected. The FHE implementation enables users to publish and comment on content completely anonymously, fostering trust and enabling more open conversations.

## Core Functionalities

- **Encrypted User Identities**: All user identity information is securely encrypted using FHE, ensuring anonymity during interactions.
- **Anonymous Content Creation**: Users can post topics and comments without revealing their identity, promoting fearless discourse on sensitive issues.
- **Homomorphic Analysis**: Contribute to industry-wide data analysis without exposing personal information, allowing for discussions on salary trends while maintaining privacy.
- **Categorized Forums**: Anonymous discussions are organized by industry and company, making it easy for users to find relevant conversations.

## Technology Stack

- **Zama FHE SDK**: Provides the foundational technology for confidential computing and user identity encryption.
- **Node.js**: Server-side environment used for building scalable network applications.
- **Hardhat**: A development environment specifically for Ethereum smart contracts.
- **Express.js**: Web framework for creating robust APIs and handling user requests.
- **MongoDB**: NoSQL database for storing encrypted data securely.

## Directory Structure

Here’s an overview of the directory structure for Office Grapevine:

```
Office_Grapevine_FHE/
├── src/
│   ├── components/
│   ├── services/
│   ├── utils/
│   └── app.js
├── contracts/
│   └── Office_Grapevine_FHE.sol
├── tests/
│   └── OfficeGrapevineTests.js
├── package.json
└── README.md
```

## Installation Instructions

To set up Office Grapevine on your local machine, follow the steps below:

1. Ensure you have **Node.js** installed.
2. Make sure you have **Hardhat** or **Foundry** installed, depending on your preference.
3. Download the project files and navigate into the project directory.
4. Run the following command to install all necessary dependencies, including Zama's FHE libraries:
   ```bash
   npm install
   ```

> **Note**: Do not use `git clone` or any URLs when downloading the repository.

## Building and Running the Project

Once the installation is complete, you can build and run the project with the following commands:

1. **Compile Smart Contracts**:
   ```bash
   npx hardhat compile
   ```

2. **Run Tests**:
   ```bash
   npx hardhat test
   ```

3. **Launch Application**:
   ```bash
   npx hardhat run scripts/deploy.js --network <network_name>
   ```

> Replace `<network_name>` with the desired Ethereum network for deployment.

## Example Code Snippet

Here’s an illustrative snippet showcasing how you might publish an anonymous message within the platform:

```javascript
const publishAnonymousMessage = async (messageContent) => {
    const encryptedMessage = await encryptWithFHE(messageContent); // Using Zama's FHE encryption
    const result = await api.post('/messages', { content: encryptedMessage });
    return result.data;
};

// Usage
publishAnonymousMessage("What do you think about our recent salary adjustments?")
    .then(response => console.log("Message published anonymously: ", response))
    .catch(error => console.error("Error publishing message: ", error));
```

## Acknowledgements

**Powered by Zama**: We extend our heartfelt appreciation to the Zama team for their pioneering advancements in Fully Homomorphic Encryption and their commitment to making confidential blockchain applications possible. Their exceptional open-source tools have been instrumental in developing Office Grapevine, enabling secure and anonymous workplace interactions.

---
Join us in empowering workplace discussions while maintaining privacy and security! 🎉
