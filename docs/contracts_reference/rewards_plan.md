# Rewards Plan

## Objectives

- Incentivize participation.
- Prevent gamification (Sybil attacks).

## Mechanism

1.  **Trigger**: User submits a vote successfully (HTTP 200 OK from Server).
2.  **Async Process**: Server pushes a `RewardJob` to a background queue.
3.  **Execution**:
    - Worker checks internal ledger: "Has User X received reward for Poll Y?"
    - If No: Worker constructs a transaction calling `RewardToken.mint(userWallet, amount)`.
    - Worker sends TX to Blockchain.
4.  **Claim**: User sees balance update in App Wallet tab.

## Abuse Controls

- **Cap**: Max 1 reward per Poll.
- **Blacklist**: Admins can pause rewards for suspicious cohorts.
