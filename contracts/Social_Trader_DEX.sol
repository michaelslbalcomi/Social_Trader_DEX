pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract SocialTraderDEXFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;
    uint256 public cooldownSeconds = 60; // Default 60 seconds cooldown

    bool public paused;
    uint256 public currentBatchId = 0;
    bool public batchOpen = false;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    // Encrypted state
    mapping(uint256 => euint32) public encryptedStrategySignals; // batchId -> encrypted signal
    mapping(uint256 => euint32) public encryptedAggregatedSignals; // batchId -> encrypted aggregated signal

    // Provider-specific encrypted state (example)
    mapping(address => mapping(uint256 => euint32)) public providerEncryptedSignals; // provider -> batchId -> encrypted signal

    // Events
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address account);
    event Unpaused(address account);
    event CooldownSecondsChanged(uint256 oldCooldown, uint256 newCooldown);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event SignalSubmitted(address indexed provider, uint256 indexed batchId);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 decryptedSignal);

    // Custom Errors
    error NotOwner();
    error NotProvider();
    error PausedState();
    error CooldownActive();
    error BatchNotOpen();
    error InvalidBatch();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidProof();
    error NotInitialized();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert PausedState();
        _;
    }

    modifier checkSubmissionCooldown() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier checkDecryptionCooldown() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function addProvider(address provider) external onlyOwner {
        isProvider[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        isProvider[provider] = false;
        emit ProviderRemoved(provider);
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setCooldownSeconds(uint256 newCooldown) external onlyOwner {
        require(newCooldown > 0, "Cooldown must be positive");
        emit CooldownSecondsChanged(cooldownSeconds, newCooldown);
        cooldownSeconds = newCooldown;
    }

    function openBatch() external onlyOwner whenNotPaused {
        if (batchOpen) {
            currentBatchId++;
        }
        batchOpen = true;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyOwner whenNotPaused {
        if (!batchOpen) revert BatchNotOpen();
        batchOpen = false;
        emit BatchClosed(currentBatchId);
    }

    function submitEncryptedSignal(euint32 encryptedSignal) external onlyProvider whenNotPaused checkSubmissionCooldown {
        if (!batchOpen) revert BatchNotOpen();
        _initIfNeeded(encryptedSignal);

        providerEncryptedSignals[msg.sender][currentBatchId] = encryptedSignal;
        lastSubmissionTime[msg.sender] = block.timestamp;
        emit SignalSubmitted(msg.sender, currentBatchId);
    }

    function aggregateSignalsAndRequestDecryption() external whenNotPaused checkDecryptionCooldown {
        if (!batchOpen) revert BatchNotOpen();
        if (currentBatchId == 0) revert InvalidBatch();

        euint32 memory aggregatedSignal = FHE.asEuint32(0);
        uint256 providerCount = 0;
        bool initialized = false;

        // Aggregate signals from all providers for the current batch
        for (uint256 i = 0; i < 100; i++) { // Example: iterate over a fixed number of potential providers
            // This loop is illustrative. A real implementation might use an array of providers.
            // For this example, we'll assume provider addresses are known or iterated differently.
            // Here, we just demonstrate aggregation logic.
            address provider = address(uint160(i)); // Example way to get provider address
            if (isProvider[provider]) {
                euint32 storage providerSignal = providerEncryptedSignals[provider][currentBatchId];
                if (FHE.isInitialized(providerSignal)) {
                    if (!initialized) {
                        aggregatedSignal = providerSignal;
                        initialized = true;
                    } else {
                        aggregatedSignal = FHE.add(aggregatedSignal, providerSignal);
                    }
                    providerCount++;
                }
            }
        }

        if (providerCount == 0) {
            revert("No signals to aggregate");
        }

        // Store the aggregated signal for this batch
        encryptedAggregatedSignals[currentBatchId] = aggregatedSignal;


        // 1. Prepare Ciphertexts for decryption
        // We are decrypting the aggregated signal for the current batch
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(aggregatedSignal);

        // 2. Compute State Hash
        bytes32 stateHash = _hashCiphertexts(cts);

        // 3. Request Decryption
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        // 4. Store Context
        decryptionContexts[requestId] = DecryptionContext({
            batchId: currentBatchId,
            stateHash: stateHash,
            processed: false
        });

        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        emit DecryptionRequested(requestId, currentBatchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        // a. Replay Guard
        if (decryptionContexts[requestId].processed) {
            revert ReplayAttempt();
        }

        // b. State Verification
        // Rebuild cts array in the exact same order as in `aggregateSignalsAndRequestDecryption`
        // We are decrypting the aggregated signal for the batch associated with this request
        uint256 targetBatchId = decryptionContexts[requestId].batchId;
        euint32 storage currentAggregatedSignal = encryptedAggregatedSignals[targetBatchId];

        // Ensure the ciphertext is initialized before trying to get its bytes
        if (!FHE.isInitialized(currentAggregatedSignal)) {
            revert NotInitialized();
        }

        bytes32[] memory currentCts = new bytes32[](1);
        currentCts[0] = FHE.toBytes32(currentAggregatedSignal);

        bytes32 currentStateHash = _hashCiphertexts(currentCts);

        if (currentStateHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        // c. Proof Verification
        if (!FHE.checkSignatures(requestId, cleartexts, proof)) {
            revert InvalidProof();
        }

        // d. Decode & Finalize
        // The cleartexts array should contain one element, the decrypted aggregated signal
        uint256 decryptedSignal = abi.decode(cleartexts, (uint256));

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, targetBatchId, decryptedSignal);
        // Further logic using decryptedSignal can be added here if needed.
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 storage x) internal {
        if (!FHE.isInitialized(x)) {
            x = FHE.asEuint32(0);
        }
    }

    function _requireInitialized(euint32 storage x) internal view {
        if (!FHE.isInitialized(x)) {
            revert NotInitialized();
        }
    }
}