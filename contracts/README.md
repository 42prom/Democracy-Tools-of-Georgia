# DTG Smart Contracts

Phase 2 Implementation Plan.

## Overview

We utilize ERC-4337 (Account Abstraction) to give every voter a "Gasless Wallet".
The Voter's device holds a Private Key (Passkey/Secure Enclave).
The System operates a **Verifying Paymaster** that sponsors gas ONLY for valid vote transactions.

## Architecture

1.  **AccountFactory**: Deploys `SimpleAccount` proxies for users deterministically (`CREATE2`).
2.  **Paymaster**: Checks `validUntil`, `validAfter`, and `signature` from the DTG Backend.
3.  **VoteAnchor**: A simple contract to store Merkle Roots of vote batches for auditability.

