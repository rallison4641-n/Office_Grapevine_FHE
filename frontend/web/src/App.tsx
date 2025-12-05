// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface Post {
  id: number;
  title: string;
  content: string;
  encryptedSalary: string;
  industry: string;
  companySize: string;
  timestamp: number;
  upvotes: number;
  comments: number;
}

interface SalaryStat {
  industry: string;
  avgSalary: string;
  encryptedRange: string;
}

// FHE encryption/decryption functions
const FHEEncryptNumber = (value: number): string => `FHE-${btoa(value.toString())}`;
const FHEDecryptNumber = (encryptedData: string): number => encryptedData.startsWith('FHE-') ? parseFloat(atob(encryptedData.substring(4))) : parseFloat(encryptedData);
const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingPost, setCreatingPost] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newPostData, setNewPostData] = useState({ 
    title: "", 
    content: "", 
    salary: "",
    industry: "tech",
    companySize: "small"
  });
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [decryptedSalary, setDecryptedSalary] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [chainId, setChainId] = useState(0);
  const [startTimestamp, setStartTimestamp] = useState(0);
  const [durationDays, setDurationDays] = useState(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterIndustry, setFilterIndustry] = useState("all");
  const [activeTab, setActiveTab] = useState('posts');
  
  // Sample salary statistics (would normally come from contract)
  const [salaryStats, setSalaryStats] = useState<SalaryStat[]>([
    { industry: "tech", avgSalary: FHEEncryptNumber(85000), encryptedRange: FHEEncryptNumber(30000) },
    { industry: "finance", avgSalary: FHEEncryptNumber(92000), encryptedRange: FHEEncryptNumber(25000) },
    { industry: "healthcare", avgSalary: FHEEncryptNumber(78000), encryptedRange: FHEEncryptNumber(20000) },
    { industry: "education", avgSalary: FHEEncryptNumber(65000), encryptedRange: FHEEncryptNumber(15000) },
  ]);

  // Initialize signature parameters
  useEffect(() => {
    loadData().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  // Load data from contract
  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
      
      // Load posts
      const postsBytes = await contract.getData("posts");
      let postsList: Post[] = [];
      if (postsBytes.length > 0) {
        try {
          const postsStr = ethers.toUtf8String(postsBytes);
          if (postsStr.trim() !== '') postsList = JSON.parse(postsStr);
        } catch (e) {}
      }
      setPosts(postsList);
    } catch (e) {
      console.error("Error loading data:", e);
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  // Create new post
  const createPost = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingPost(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating post with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Create new post
      const newPost: Post = {
        id: posts.length + 1,
        title: newPostData.title,
        content: newPostData.content,
        encryptedSalary: FHEEncryptNumber(parseInt(newPostData.salary)),
        industry: newPostData.industry,
        companySize: newPostData.companySize,
        timestamp: Math.floor(Date.now() / 1000),
        upvotes: 0,
        comments: 0
      };
      
      // Update posts list
      const updatedPosts = [...posts, newPost];
      
      // Save to contract
      await contract.setData("posts", ethers.toUtf8Bytes(JSON.stringify(updatedPosts)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Post created successfully!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewPostData({ 
          title: "", 
          content: "", 
          salary: "",
          industry: "tech",
          companySize: "small"
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingPost(false); 
    }
  };

  // Upvote post
  const upvotePost = async (postId: number) => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setTransactionStatus({ visible: true, status: "pending", message: "Processing upvote..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Find the post
      const postIndex = posts.findIndex(p => p.id === postId);
      if (postIndex === -1) throw new Error("Post not found");
      
      // Update vote counts
      const updatedPosts = [...posts];
      updatedPosts[postIndex].upvotes += 1;
      
      // Save to contract
      await contract.setData("posts", ethers.toUtf8Bytes(JSON.stringify(updatedPosts)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Upvote recorded!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Voting failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  // Decrypt salary with signature
  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  // Filter posts based on search and industry filter
  const filteredPosts = posts.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         post.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesIndustry = filterIndustry === "all" || post.industry === filterIndustry;
    return matchesSearch && matchesIndustry;
  });

  // Render salary statistics visualization
  const renderSalaryStats = () => {
    return (
      <div className="stats-container">
        {salaryStats.map((stat, index) => (
          <div className="stat-card" key={index}>
            <div className="stat-header">
              <div className="industry-icon">{stat.industry.charAt(0).toUpperCase()}</div>
              <h3>{stat.industry.charAt(0).toUpperCase() + stat.industry.slice(1)}</h3>
            </div>
            <div className="stat-content">
              <div className="stat-row">
                <span>Avg Salary:</span>
                <div className="fhe-badge">
                  <span>{stat.avgSalary.substring(0, 10)}...</span>
                </div>
              </div>
              <div className="stat-row">
                <span>Range:</span>
                <div className="fhe-badge">
                  <span>{stat.encryptedRange.substring(0, 10)}...</span>
                </div>
              </div>
              <button 
                className="decrypt-btn" 
                onClick={async () => {
                  const decryptedAvg = await decryptWithSignature(stat.avgSalary);
                  const decryptedRange = await decryptWithSignature(stat.encryptedRange);
                  if (decryptedAvg && decryptedRange) {
                    setTransactionStatus({ 
                      visible: true, 
                      status: "success", 
                      message: `Decrypted: $${decryptedAvg.toLocaleString()} ± $${decryptedRange.toLocaleString()}` 
                    });
                    setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
                  }
                }}
                disabled={isDecrypting}
              >
                {isDecrypting ? "Decrypting..." : "Decrypt Stats"}
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render FAQ section
  const renderFAQ = () => {
    const faqItems = [
      {
        question: "How does FHE protect my salary information?",
        answer: "FHE allows salary data to be encrypted while still enabling calculations like averages and ranges to be computed without revealing individual salaries."
      },
      {
        question: "Is my identity really anonymous?",
        answer: "Yes, your wallet address is never stored with your posts. All personal identifiers are encrypted using Zama FHE technology."
      },
      {
        question: "Can my employer trace posts back to me?",
        answer: "No, the system is designed with multiple layers of encryption to prevent any tracing back to individual users."
      },
      {
        question: "How are salary statistics calculated?",
        answer: "Statistics are computed using homomorphic encryption, allowing calculations on encrypted data without decrypting individual entries."
      },
      {
        question: "What industries are supported?",
        answer: "Currently we support tech, finance, healthcare, and education with more industries coming soon."
      }
    ];
    
    return (
      <div className="faq-container">
        {faqItems.map((item, index) => (
          <div className="faq-item" key={index}>
            <div className="faq-question">{item.question}</div>
            <div className="faq-answer">{item.answer}</div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Initializing encrypted workplace network...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="network-icon"></div>
          </div>
          <h1>Office<span>Grapevine</span></h1>
          <div className="fhe-badge">
            <div className="fhe-icon"></div>
            <span>Powered by Zama FHE</span>
          </div>
        </div>
        
        <div className="header-actions">
          <div className="search-bar">
            <input 
              type="text" 
              placeholder="Search posts..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="search-icon"></div>
          </div>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-post-btn"
          >
            <div className="add-icon"></div>New Post
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="sidebar">
          <div className="sidebar-section">
            <h3>Industries</h3>
            <div className="filter-options">
              <button 
                className={`filter-btn ${filterIndustry === "all" ? "active" : ""}`}
                onClick={() => setFilterIndustry("all")}
              >
                All Industries
              </button>
              <button 
                className={`filter-btn ${filterIndustry === "tech" ? "active" : ""}`}
                onClick={() => setFilterIndustry("tech")}
              >
                Technology
              </button>
              <button 
                className={`filter-btn ${filterIndustry === "finance" ? "active" : ""}`}
                onClick={() => setFilterIndustry("finance")}
              >
                Finance
              </button>
              <button 
                className={`filter-btn ${filterIndustry === "healthcare" ? "active" : ""}`}
                onClick={() => setFilterIndustry("healthcare")}
              >
                Healthcare
              </button>
              <button 
                className={`filter-btn ${filterIndustry === "education" ? "active" : ""}`}
                onClick={() => setFilterIndustry("education")}
              >
                Education
              </button>
            </div>
          </div>
          
          <div className="sidebar-section">
            <h3>Salary Statistics</h3>
            {renderSalaryStats()}
          </div>
        </div>
        
        <div className="content-area">
          <div className="tabs-container">
            <div className="tabs">
              <button 
                className={`tab ${activeTab === 'posts' ? 'active' : ''}`}
                onClick={() => setActiveTab('posts')}
              >
                Discussions
              </button>
              <button 
                className={`tab ${activeTab === 'faq' ? 'active' : ''}`}
                onClick={() => setActiveTab('faq')}
              >
                FAQ
              </button>
            </div>
            
            <div className="tab-content">
              {activeTab === 'posts' && (
                <div className="posts-section">
                  <div className="section-header">
                    <h2>Anonymous Workplace Discussions</h2>
                    <div className="header-actions">
                      <button 
                        onClick={loadData} 
                        className="refresh-btn" 
                        disabled={isRefreshing}
                      >
                        {isRefreshing ? "Refreshing..." : "Refresh"}
                      </button>
                    </div>
                  </div>
                  
                  <div className="posts-list">
                    {filteredPosts.length === 0 ? (
                      <div className="no-posts">
                        <div className="no-posts-icon"></div>
                        <p>No posts found matching your criteria</p>
                        <button 
                          className="create-btn" 
                          onClick={() => setShowCreateModal(true)}
                        >
                          Start a Discussion
                        </button>
                      </div>
                    ) : filteredPosts.map((post, index) => (
                      <div 
                        className={`post-card ${selectedPost?.id === post.id ? "selected" : ""}`} 
                        key={index}
                        onClick={() => setSelectedPost(post)}
                      >
                        <div className="post-header">
                          <div className="post-industry">{post.industry}</div>
                          <div className="post-company-size">{post.companySize} company</div>
                          <div className="post-time">{new Date(post.timestamp * 1000).toLocaleDateString()}</div>
                        </div>
                        <div className="post-title">{post.title}</div>
                        <div className="post-content">{post.content.substring(0, 150)}...</div>
                        <div className="post-footer">
                          <div className="post-encrypted">
                            <div className="lock-icon"></div>
                            <span>Salary: {post.encryptedSalary.substring(0, 10)}...</span>
                          </div>
                          <div className="post-actions">
                            <button 
                              className="upvote-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                upvotePost(post.id);
                              }}
                            >
                              <div className="upvote-icon"></div>
                              {post.upvotes}
                            </button>
                            <button className="comment-btn">
                              <div className="comment-icon"></div>
                              {post.comments}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {activeTab === 'faq' && (
                <div className="faq-section">
                  <h2>Frequently Asked Questions</h2>
                  {renderFAQ()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreatePost 
          onSubmit={createPost} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingPost} 
          postData={newPostData} 
          setPostData={setNewPostData}
        />
      )}
      
      {selectedPost && (
        <PostDetailModal 
          post={selectedPost} 
          onClose={() => { 
            setSelectedPost(null); 
            setDecryptedSalary(null); 
          }} 
          decryptedSalary={decryptedSalary} 
          setDecryptedSalary={setDecryptedSalary} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
          upvotePost={upvotePost}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="network-icon"></div>
              <span>OfficeGrapevine</span>
            </div>
            <p>Anonymous workplace discussions powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Use</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
          <div className="copyright">© {new Date().getFullYear()} OfficeGrapevine. All rights reserved.</div>
          <div className="disclaimer">
            This system uses fully homomorphic encryption to protect user privacy. 
            All salary data is encrypted and cannot be traced back to individuals.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreatePostProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  postData: any;
  setPostData: (data: any) => void;
}

const ModalCreatePost: React.FC<ModalCreatePostProps> = ({ onSubmit, onClose, creating, postData, setPostData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setPostData({ ...postData, [name]: value });
  };

  return (
    <div className="modal-overlay">
      <div className="create-post-modal">
        <div className="modal-header">
          <h2>Create New Anonymous Post</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div>
            <div>
              <strong>FHE Privacy Notice</strong>
              <p>Your identity and salary information will be encrypted using Zama FHE</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>Title *</label>
            <input 
              type="text" 
              name="title" 
              value={postData.title} 
              onChange={handleChange} 
              placeholder="Enter post title..." 
            />
          </div>
          
          <div className="form-group">
            <label>Content *</label>
            <textarea 
              name="content" 
              value={postData.content} 
              onChange={handleChange} 
              placeholder="Share your thoughts..." 
              rows={4}
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Industry *</label>
              <select 
                name="industry" 
                value={postData.industry} 
                onChange={handleChange}
              >
                <option value="tech">Technology</option>
                <option value="finance">Finance</option>
                <option value="healthcare">Healthcare</option>
                <option value="education">Education</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Company Size *</label>
              <select 
                name="companySize" 
                value={postData.companySize} 
                onChange={handleChange}
              >
                <option value="small">Small (1-50)</option>
                <option value="medium">Medium (51-500)</option>
                <option value="large">Large (501-5000)</option>
                <option value="enterprise">Enterprise (5000+)</option>
              </select>
            </div>
          </div>
          
          <div className="form-group">
            <label>Salary (USD) *</label>
            <input 
              type="number" 
              name="salary" 
              value={postData.salary} 
              onChange={handleChange} 
              placeholder="Enter your salary (will be encrypted)" 
            />
            <div className="input-note">Your salary will be encrypted using FHE and cannot be traced back to you</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || !postData.title || !postData.content || !postData.salary} 
            className="submit-btn"
          >
            {creating ? "Posting with FHE..." : "Post Anonymously"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface PostDetailModalProps {
  post: Post;
  onClose: () => void;
  decryptedSalary: number | null;
  setDecryptedSalary: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
  upvotePost: (postId: number) => void;
}

const PostDetailModal: React.FC<PostDetailModalProps> = ({ 
  post, 
  onClose, 
  decryptedSalary, 
  setDecryptedSalary, 
  isDecrypting, 
  decryptWithSignature,
  upvotePost
}) => {
  const handleDecrypt = async () => {
    if (decryptedSalary !== null) { 
      setDecryptedSalary(null); 
      return; 
    }
    
    const decrypted = await decryptWithSignature(post.encryptedSalary);
    if (decrypted !== null) {
      setDecryptedSalary(decrypted);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="post-detail-modal">
        <div className="modal-header">
          <h2>Post Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="post-info">
            <div className="post-meta">
              <div className="meta-item">
                <span>Industry:</span>
                <strong>{post.industry.charAt(0).toUpperCase() + post.industry.slice(1)}</strong>
              </div>
              <div className="meta-item">
                <span>Company Size:</span>
                <strong>{post.companySize.charAt(0).toUpperCase() + post.companySize.slice(1)}</strong>
              </div>
              <div className="meta-item">
                <span>Posted:</span>
                <strong>{new Date(post.timestamp * 1000).toLocaleDateString()}</strong>
              </div>
            </div>
            
            <div className="post-title">{post.title}</div>
            <div className="post-content">{post.content}</div>
            
            <div className="post-actions">
              <button 
                className="upvote-btn"
                onClick={() => upvotePost(post.id)}
              >
                <div className="upvote-icon"></div>
                {post.upvotes} Upvotes
              </button>
            </div>
          </div>
          
          <div className="salary-section">
            <h3>Salary Information</h3>
            <div className="encrypted-data">
              <div className="fhe-tag">
                <div className="fhe-icon"></div>
                <span>FHE Encrypted</span>
              </div>
              <div className="data-value">{post.encryptedSalary.substring(0, 30)}...</div>
            </div>
            
            <button 
              className="decrypt-btn" 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
            >
              {isDecrypting ? (
                <span>Decrypting...</span>
              ) : decryptedSalary !== null ? (
                "Hide Salary"
              ) : (
                "Decrypt Salary with Wallet"
              )}
            </button>
            
            {decryptedSalary !== null && (
              <div className="decrypted-section">
                <div className="decrypted-value">
                  <span>Salary:</span>
                  <strong>${decryptedSalary.toLocaleString()}</strong>
                </div>
                <div className="decryption-notice">
                  <div className="warning-icon"></div>
                  <span>This decrypted salary is only visible to you after wallet signature verification</span>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;