# Security Notes

## Key Management

- **User Keys**: Generated on device (P-256). Stored in Secure Enclave.
- **Admin Keys**: Multi-sig (Gnosis Safe) required for Contract Upgrades.
- **Paymaster Signer Key**: Hot wallet on backend (AWS KMS).

## Threat Vectors

- **Paymaster Drain**: Attacker submits valid signatures but reverts transaction to burn gas.
  - _Mitigation_: Paymaster logic checks gas limits and bans addresses that revert too often.
- **Key Loss**: User loses phone.
  - _Mitigation_: Social Recovery (Phase 3) or simply Re-Enroll (New Key, New Address). Old assets lost unless recovery logic exists. For MVP: Re-enroll = New Account.
