# Social Trader DEX: A Privacy-Preserving Social Trading Platform 

Social Trader DEX is a decentralized exchange (DEX) designed to empower users with privacy-preserving social trading capabilities. This platform enables traders to follow and replicate the strategies of top-performing traders while maintaining the confidentiality of their trading tactics. At the core of Social Trader DEX lies **Zama's Fully Homomorphic Encryption (FHE) technology**, ensuring that sensitive information remains secure and private throughout the trading process.

## Problem Statement

In today's finance-centric world, many traders struggle with the lack of transparency and security in sharing their trading strategies. While social trading platforms provide insight into successful traders, they often expose sensitive information, making it vulnerable to competition and malicious actors. Traders are hesitant to share their strategies due to the fear of leaking their hard-earned knowledge and expertise. Additionally, ordinary users looking to invest often lack the necessary expertise to identify and follow truly successful traders without compromising their data privacy.

## The FHE Solution

Zama's Fully Homomorphic Encryption (FHE) addresses these challenges by allowing encrypted computations to be performed on encrypted data. This means that traders' strategies can be encrypted and shared with followers without exposing the underlying details. 

Using Zama's open-source libraries, such as **Concrete**, **TFHE-rs**, or the **zama-fhe SDK**, Social Trader DEX ensures that both the trades and the strategies remain confidential. Traders can securely encrypt their positions and strategies, while followers can copy the encrypted signals without ever visualizing the specifics of those trades, thereby preventing competitive strategies from being exposed.

## Key Features

- **Encrypted Trading Strategies**: Top traders can encrypt their trading strategies securely, allowing followers to replicate trades without knowing the specifics.
- **Homomorphic Execution of Trades**: Followers execute trades based on encrypted signals, ensuring confidentiality.
- **Protection of Trader's Alpha**: Traders' proprietary strategies remain private, substantially reducing the risk of information leakage.
- **Trusted Social Trading Tools**: Users have access to a reliable dashboard that showcases top traders based on their performance while safeguarding sensitive data.
- **User-Friendly Interface**: Intuitive design makes it accessible for users of all expertise levels, from beginners to professional traders.

## Technology Stack

- **Zama FHE SDK**: The primary component for confidential computing, enabling homomorphic encryption functionalities.
- **Node.js**: JavaScript runtime for building scalable applications.
- **Hardhat**: A development environment for Ethereum-based applications.
- **Solidity**: Programming language for writing smart contracts.
- **Web3.js**: JavaScript library to interact with the Ethereum blockchain.

## Directory Structure

Below is the structured representation of the project:

```
Social_Trader_DEX/
├── contracts/
│   └── Social_Trader_DEX.sol
├── scripts/
│   ├── deploy.js
│   └── followTrader.js
├── test/
│   ├── traderTests.js
│   └── followTests.js
├── package.json
└── README.md
```

## Installation Guide

To set up the Social Trader DEX project, ensure you have Node.js installed on your machine. Follow the steps below:

1. **Download the project files**: Avoid using `git clone` or any other repository URLs.
2. **Install dependencies**: Navigate to the project directory and run:
    ```bash
    npm install
    ```
   This command will fetch the required Zama FHE libraries and other dependencies.

## Build & Run Guide

Once you have installed the project dependencies, you can compile and run the project using the following commands:

1. **Compile the smart contracts**:
    ```bash
    npx hardhat compile
    ```
2. **Run tests to ensure everything is functioning correctly**:
    ```bash
    npx hardhat test
    ```
3. **Deploy the contract to a local Ethereum network**:
    ```bash
    npx hardhat run scripts/deploy.js --network localhost
    ```

## Sample Code Snippet

Here’s a brief code snippet demonstrating how a user might follow a trader on the platform:

```javascript
const { ethers } = require("hardhat");

async function followTrader(traderAddress) {
    const traderContract = await ethers.getContractAt("Social_Trader_DEX", traderAddress);
    
    // This function would initiate a follow request to the trader's strategy
    const transaction = await traderContract.followEncryptedTradingSignals();
    
    await transaction.wait();
    console.log(`Successfully following trader at address: ${traderAddress}`);
}
```

This code allows users to follow a trader, triggering the encrypted copying of their trading signals securely.

## Acknowledgements

### Powered by Zama

We extend our heartfelt thanks to the Zama team for their groundbreaking work in Fully Homomorphic Encryption. Their open-source tools empower developers to create confidential applications on the blockchain, making projects like Social Trader DEX a reality. Your innovation is paving the way for a more secure financial ecosystem, and we are proud to be part of this journey.

---

With Social Trader DEX, trade confidently! Unlock the potential of social trading while ensuring your strategies stay private and secure.
