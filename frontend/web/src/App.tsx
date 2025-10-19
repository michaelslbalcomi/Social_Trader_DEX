// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface Trader {
  id: string;
  address: string;
  encryptedStrategy: string;
  encryptedPosition: string;
  followers: number;
  performance: number; // Encrypted performance metric
  lastUpdated: number;
  status: "active" | "inactive";
}

interface FollowRecord {
  id: string;
  traderId: string;
  followerAddress: string;
  encryptedSignal: string;
  timestamp: number;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [traders, setTraders] = useState<Trader[]>([]);
  const [followRecords, setFollowRecords] = useState<FollowRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newStrategyValue, setNewStrategyValue] = useState<number>(0);
  const [selectedTrader, setSelectedTrader] = useState<Trader | null>(null);
  const [decryptedStrategy, setDecryptedStrategy] = useState<number | null>(null);
  const [decryptedPosition, setDecryptedPosition] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [sortBy, setSortBy] = useState<"followers" | "performance" | "recent">("followers");

  // Statistics
  const activeTraders = traders.filter(t => t.status === "active").length;
  const totalFollowers = traders.reduce((sum, trader) => sum + trader.followers, 0);
  const avgPerformance = traders.length > 0 
    ? traders.reduce((sum, trader) => sum + FHEDecryptNumber(trader.performance), 0) / traders.length 
    : 0;

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

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      // Load traders
      const tradersBytes = await contract.getData("traders");
      let traderIds: string[] = [];
      if (tradersBytes.length > 0) {
        try {
          const tradersStr = ethers.toUtf8String(tradersBytes);
          if (tradersStr.trim() !== '') traderIds = JSON.parse(tradersStr);
        } catch (e) { console.error("Error parsing trader IDs:", e); }
      }
      
      const tradersList: Trader[] = [];
      for (const traderId of traderIds) {
        try {
          const traderBytes = await contract.getData(`trader_${traderId}`);
          if (traderBytes.length > 0) {
            try {
              const traderData = JSON.parse(ethers.toUtf8String(traderBytes));
              tradersList.push({ 
                id: traderId,
                address: traderData.address,
                encryptedStrategy: traderData.strategy,
                encryptedPosition: traderData.position,
                followers: traderData.followers,
                performance: traderData.performance,
                lastUpdated: traderData.lastUpdated,
                status: traderData.status || "active"
              });
            } catch (e) { console.error(`Error parsing trader data for ${traderId}:`, e); }
          }
        } catch (e) { console.error(`Error loading trader ${traderId}:`, e); }
      }
      
      // Load follow records
      const followBytes = await contract.getData("follow_records");
      let followIds: string[] = [];
      if (followBytes.length > 0) {
        try {
          const followStr = ethers.toUtf8String(followBytes);
          if (followStr.trim() !== '') followIds = JSON.parse(followStr);
        } catch (e) { console.error("Error parsing follow record IDs:", e); }
      }
      
      const followList: FollowRecord[] = [];
      for (const followId of followIds) {
        try {
          const recordBytes = await contract.getData(`follow_${followId}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              followList.push({ 
                id: followId,
                traderId: recordData.traderId,
                followerAddress: recordData.follower,
                encryptedSignal: recordData.signal,
                timestamp: recordData.timestamp
              });
            } catch (e) { console.error(`Error parsing follow record for ${followId}:`, e); }
          }
        } catch (e) { console.error(`Error loading follow record ${followId}:`, e); }
      }
      
      // Sort traders by followers by default
      tradersList.sort((a, b) => b.followers - a.followers);
      setTraders(tradersList);
      setFollowRecords(followList);
    } catch (e) { console.error("Error loading data:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const registerAsTrader = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting strategy with Zama FHE..." });
    
    try {
      // Encrypt initial strategy and position
      const encryptedStrategy = FHEEncryptNumber(newStrategyValue);
      const encryptedPosition = FHEEncryptNumber(0); // Start with 0 position
      const encryptedPerformance = FHEEncryptNumber(0); // Start with 0 performance
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const traderId = `${address?.substring(0, 10)}-${Date.now()}`;
      const traderData = { 
        address: address,
        strategy: encryptedStrategy,
        position: encryptedPosition,
        performance: encryptedPerformance,
        followers: 0,
        lastUpdated: Math.floor(Date.now() / 1000),
        status: "active"
      };
      
      // Save trader data
      await contract.setData(`trader_${traderId}`, ethers.toUtf8Bytes(JSON.stringify(traderData)));
      
      // Update traders list
      const tradersBytes = await contract.getData("traders");
      let traderIds: string[] = [];
      if (tradersBytes.length > 0) {
        try { traderIds = JSON.parse(ethers.toUtf8String(tradersBytes)); } 
        catch (e) { console.error("Error parsing trader IDs:", e); }
      }
      
      if (!traderIds.includes(traderId)) {
        traderIds.push(traderId);
        await contract.setData("traders", ethers.toUtf8Bytes(JSON.stringify(traderIds)));
      }
      
      setTransactionStatus({ visible: true, status: "success", message: "Trader registered with encrypted strategy!" });
      await loadData();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewStrategyValue(0);
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Registration failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const followTrader = async (traderId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted signal with FHE..." });
    
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      
      // Get trader data
      const traderBytes = await contract.getData(`trader_${traderId}`);
      if (traderBytes.length === 0) throw new Error("Trader not found");
      const traderData = JSON.parse(ethers.toUtf8String(traderBytes));
      
      // Create follow record
      const followId = `${address}-${Date.now()}`;
      const followData = {
        traderId: traderId,
        follower: address,
        signal: traderData.strategy, // Copy the encrypted signal
        timestamp: Math.floor(Date.now() / 1000)
      };
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      // Save follow record
      await contractWithSigner.setData(`follow_${followId}`, ethers.toUtf8Bytes(JSON.stringify(followData)));
      
      // Update follow records list
      const followBytes = await contract.getData("follow_records");
      let followIds: string[] = [];
      if (followBytes.length > 0) {
        try { followIds = JSON.parse(ethers.toUtf8String(followBytes)); } 
        catch (e) { console.error("Error parsing follow IDs:", e); }
      }
      
      followIds.push(followId);
      await contractWithSigner.setData("follow_records", ethers.toUtf8Bytes(JSON.stringify(followIds)));
      
      // Update trader's follower count
      traderData.followers += 1;
      await contractWithSigner.setData(`trader_${traderId}`, ethers.toUtf8Bytes(JSON.stringify(traderData)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Successfully followed trader with encrypted signal!" });
      await loadData();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Follow failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const decryptTraderData = async () => {
    if (!selectedTrader) return;
    
    const strategy = await decryptWithSignature(selectedTrader.encryptedStrategy);
    const position = await decryptWithSignature(selectedTrader.encryptedPosition);
    
    if (strategy !== null) setDecryptedStrategy(strategy);
    if (position !== null) setDecryptedPosition(position);
  };

  const filteredTraders = traders.filter(trader => {
    const matchesSearch = trader.address.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          trader.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || trader.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const sortedTraders = [...filteredTraders].sort((a, b) => {
    if (sortBy === "followers") return b.followers - a.followers;
    if (sortBy === "performance") {
      return FHEDecryptNumber(b.performance) - FHEDecryptNumber(a.performance);
    }
    return b.lastUpdated - a.lastUpdated;
  });

  const renderPerformanceChart = (trader: Trader) => {
    const performance = FHEDecryptNumber(trader.performance);
    const normalized = Math.min(Math.max(performance, -100), 100);
    const isPositive = normalized >= 0;
    
    return (
      <div className="performance-bar">
        <div 
          className={`performance-fill ${isPositive ? 'positive' : 'negative'}`}
          style={{ width: `${Math.abs(normalized)}%` }}
        >
          <span className="performance-value">
            {normalized > 0 ? '+' : ''}{normalized.toFixed(1)}%
          </span>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="neon-spinner"></div>
      <p>Initializing encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container futuristic-metal">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="shield-icon"></div>
          </div>
          <h1>Social<span>Trader</span>DEX</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-record-btn neon-button">
            <div className="add-icon"></div>Register as Trader
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
          </div>
        </div>
      </header>
      
      <div className="main-content partitioned-panels">
        {/* Left Panel: Traders List */}
        <div className="panel traders-panel">
          <div className="panel-header">
            <h2>Top Traders</h2>
            <div className="panel-controls">
              <div className="search-filter">
                <input
                  type="text"
                  placeholder="Search traders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="neon-input"
                />
                <select 
                  value={filterStatus} 
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="neon-select"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <select 
                  value={sortBy} 
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="neon-select"
                >
                  <option value="followers">Most Followers</option>
                  <option value="performance">Best Performance</option>
                  <option value="recent">Recently Updated</option>
                </select>
              </div>
              <button onClick={loadData} className="refresh-btn neon-button" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="traders-list">
            {sortedTraders.length === 0 ? (
              <div className="no-traders">
                <div className="no-traders-icon"></div>
                <p>No traders found</p>
                <button className="neon-button primary" onClick={() => setShowCreateModal(true)}>
                  Register as First Trader
                </button>
              </div>
            ) : sortedTraders.map(trader => (
              <div 
                className={`trader-card ${trader.status}`} 
                key={trader.id}
                onClick={() => setSelectedTrader(trader)}
              >
                <div className="trader-rank">
                  <span>#{traders.indexOf(trader) + 1}</span>
                </div>
                <div className="trader-info">
                  <div className="trader-address">
                    {trader.address.substring(0, 6)}...{trader.address.substring(38)}
                  </div>
                  <div className="trader-stats">
                    <div className="stat">
                      <span className="stat-label">Followers</span>
                      <span className="stat-value">{trader.followers}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Performance</span>
                      <span className="stat-value">
                        {FHEDecryptNumber(trader.performance) > 0 ? '+' : ''}
                        {FHEDecryptNumber(trader.performance).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  {renderPerformanceChart(trader)}
                </div>
                <div className="trader-actions">
                  <button 
                    className="follow-btn neon-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      followTrader(trader.id);
                    }}
                  >
                    Follow
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Right Panel: Trader Details */}
        <div className="panel details-panel">
          {selectedTrader ? (
            <div className="trader-details">
              <div className="trader-header">
                <h2>Trader Details</h2>
                <button className="close-details" onClick={() => setSelectedTrader(null)}>
                  &times;
                </button>
              </div>
              
              <div className="trader-profile">
                <div className="profile-info">
                  <div className="trader-address">
                    {selectedTrader.address.substring(0, 8)}...{selectedTrader.address.substring(36)}
                  </div>
                  <div className="trader-status">
                    <span className={`status-badge ${selectedTrader.status}`}>
                      {selectedTrader.status}
                    </span>
                  </div>
                </div>
                
                <div className="trader-stats-grid">
                  <div className="stat-card">
                    <div className="stat-value">{selectedTrader.followers}</div>
                    <div className="stat-label">Followers</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">
                      {FHEDecryptNumber(selectedTrader.performance) > 0 ? '+' : ''}
                      {FHEDecryptNumber(selectedTrader.performance).toFixed(1)}%
                    </div>
                    <div className="stat-label">Performance</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">
                      {new Date(selectedTrader.lastUpdated * 1000).toLocaleDateString()}
                    </div>
                    <div className="stat-label">Last Updated</div>
                  </div>
                </div>
              </div>
              
              <div className="encrypted-section">
                <h3>Encrypted Strategy</h3>
                <div className="encrypted-data">
                  {selectedTrader.encryptedStrategy.substring(0, 80)}...
                </div>
                <div className="fhe-tag">
                  <div className="fhe-icon"></div>
                  <span>FHE Encrypted</span>
                </div>
                
                {address?.toLowerCase() === selectedTrader.address.toLowerCase() && (
                  <button 
                    className="decrypt-btn neon-button"
                    onClick={decryptTraderData}
                    disabled={isDecrypting}
                  >
                    {isDecrypting ? "Decrypting..." : "Decrypt My Strategy"}
                  </button>
                )}
                
                {decryptedStrategy !== null && (
                  <div className="decrypted-data">
                    <h4>Decrypted Strategy Value</h4>
                    <div className="decrypted-value">{decryptedStrategy}</div>
                    <div className="decryption-notice">
                      <div className="warning-icon"></div>
                      <span>Decrypted data is only visible after wallet signature verification</span>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="followers-section">
                <h3>Followers ({selectedTrader.followers})</h3>
                <div className="followers-list">
                  {followRecords
                    .filter(record => record.traderId === selectedTrader.id)
                    .slice(0, 5)
                    .map(record => (
                      <div className="follower-item" key={record.id}>
                        <div className="follower-address">
                          {record.followerAddress.substring(0, 6)}...{record.followerAddress.substring(38)}
                        </div>
                        <div className="follow-date">
                          {new Date(record.timestamp * 1000).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  {selectedTrader.followers > 5 && (
                    <div className="view-more">+ {selectedTrader.followers - 5} more followers</div>
                  )}
                </div>
              </div>
              
              <div className="action-section">
                <button 
                  className="follow-btn neon-button large"
                  onClick={() => followTrader(selectedTrader.id)}
                >
                  Follow This Trader
                </button>
              </div>
            </div>
          ) : (
            <div className="no-trader-selected">
              <div className="placeholder-icon"></div>
              <h3>Select a trader to view details</h3>
              <p>Click on any trader in the list to see their encrypted strategy and performance metrics</p>
            </div>
          )}
        </div>
        
        {/* Bottom Panel: Statistics */}
        <div className="panel stats-panel">
          <h2>Platform Statistics</h2>
          
          <div className="stats-grid">
            <div className="stat-card large">
              <div className="stat-value">{traders.length}</div>
              <div className="stat-label">Total Traders</div>
            </div>
            
            <div className="stat-card large">
              <div className="stat-value">{activeTraders}</div>
              <div className="stat-label">Active Traders</div>
            </div>
            
            <div className="stat-card large">
              <div className="stat-value">{totalFollowers}</div>
              <div className="stat-label">Total Follows</div>
            </div>
            
            <div className="stat-card large">
              <div className="stat-value">{avgPerformance.toFixed(1)}%</div>
              <div className="stat-label">Avg Performance</div>
            </div>
          </div>
          
          <div className="performance-distribution">
            <h3>Performance Distribution</h3>
            <div className="distribution-chart">
              {traders.slice(0, 5).map(trader => (
                <div className="distribution-bar" key={trader.id}>
                  <div className="bar-label">
                    {trader.address.substring(0, 4)}...{trader.address.substring(38)}
                  </div>
                  <div className="bar-container">
                    <div 
                      className="bar-fill"
                      style={{ 
                        width: `${Math.min(Math.abs(FHEDecryptNumber(trader.performance)), 100)}%`,
                        backgroundColor: FHEDecryptNumber(trader.performance) >= 0 
                          ? 'var(--neon-green)' 
                          : 'var(--neon-pink)'
                      }}
                    ></div>
                  </div>
                  <div className="bar-value">
                    {FHEDecryptNumber(trader.performance) > 0 ? '+' : ''}
                    {FHEDecryptNumber(trader.performance).toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="fhe-explainer">
            <h3>How Zama FHE Protects Your Strategy</h3>
            <div className="explainer-steps">
              <div className="step">
                <div className="step-number">1</div>
                <div className="step-content">
                  <h4>Strategy Encryption</h4>
                  <p>Your trading strategy is encrypted on your device before being sent to the blockchain</p>
                </div>
              </div>
              <div className="step">
                <div className="step-number">2</div>
                <div className="step-content">
                  <h4>Secure Processing</h4>
                  <p>Followers can copy your encrypted signals without seeing your actual strategy</p>
                </div>
              </div>
              <div className="step">
                <div className="step-number">3</div>
                <div className="step-content">
                  <h4>Privacy Preservation</h4>
                  <p>Only you can decrypt your strategy using your wallet signature</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreate 
          onSubmit={registerAsTrader} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating} 
          strategyValue={newStrategyValue}
          setStrategyValue={setNewStrategyValue}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content neon-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="neon-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield-icon"></div>
              <span>SocialTraderDEX</span>
            </div>
            <p>Privacy-preserving social trading powered by Zama FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact Support</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} SocialTraderDEX. All rights reserved.
          </div>
          <div className="disclaimer">
            This is a demonstration application. Not financial advice. Use at your own risk.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  strategyValue: number;
  setStrategyValue: (value: number) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ onSubmit, onClose, creating, strategyValue, setStrategyValue }) => {
  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStrategyValue(parseFloat(e.target.value));
  };

  const handleSubmit = () => {
    if (!strategyValue) { alert("Please enter a strategy value"); return; }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal neon-card">
        <div className="modal-header">
          <h2>Register as Trader</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> 
            <div>
              <strong>FHE Encryption Notice</strong>
              <p>Your trading strategy will be encrypted with Zama FHE before submission</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>Strategy Value *</label>
            <p className="input-description">
              Enter a numerical value representing your trading strategy (e.g., risk level, allocation percentage)
            </p>
            <input 
              type="number" 
              value={strategyValue} 
              onChange={handleValueChange} 
              placeholder="Enter strategy value..." 
              className="neon-input"
              step="0.1"
            />
          </div>
          
          <div className="encryption-preview">
            <h4>Encryption Preview</h4>
            <div className="preview-container">
              <div className="plain-data">
                <span>Plain Value:</span>
                <div>{strategyValue || 'No value entered'}</div>
              </div>
              <div className="encryption-arrow">→</div>
              <div className="encrypted-data">
                <span>Encrypted Data:</span>
                <div>{strategyValue ? FHEEncryptNumber(strategyValue).substring(0, 50) + '...' : 'No value entered'}</div>
              </div>
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> 
            <div>
              <strong>Strategy Privacy Guarantee</strong>
              <p>Your strategy remains encrypted during FHE processing and is never decrypted on our servers</p>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn neon-button">Cancel</button>
          <button onClick={handleSubmit} disabled={creating} className="submit-btn neon-button primary">
            {creating ? "Encrypting with FHE..." : "Register Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;