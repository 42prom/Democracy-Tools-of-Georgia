# DTG Risk Register

| ID       | Risk                                 | Severity | Likelihood | Mitigation Strategy                                                                                            | Owner      |
| :------- | :----------------------------------- | :------- | :--------- | :------------------------------------------------------------------------------------------------------------- | :--------- |
| **R-01** | **Admin accesses PII**               | Critical | Low        | System Architecture prevents PII storage. Admin UI has no PII views.                                           | Arch       |
| **R-02** | **Coerced Voting (Vote Buying)**     | High     | Medium     | User must physically hold device to generate `nullifier`. "Fake" app mode (decoy) could be considered later.   | Product    |
| **R-03** | **Deepfake Bypass**                  | High     | Medium     | Multi-modal liveness (Active + Passive). 3rd party vendor (e.g., Facetec/iProov) specialized in anti-spoofing. | Eng        |
| **R-04** | **Database Breach**                  | Critical | Low        | Encryption at Rest. Separation of concerns (Security Logs vs Votes). Minimal data retention.                   | SecOps     |
| **R-05** | **Inference Attack via API**         | High     | High       | Strict k-anonymity (k=30). Rate limiting. Complexity limits on queries.                                        | Data       |
| **R-06** | **Wallet Gas Drain**                 | Medium   | Medium     | Paymaster Gating (Vote-Proof required). Strict daily caps.                                                     | Blockchain |
| **R-07** | **Device Theft**                     | Medium   | Low        | Requires Device PIN/Bio to access KeyStore.                                                                    | OS         |
| **R-08** | **Service Downtime on Election Day** | High     | Medium     | CDN caching for static assets. Read-Replicas for Poll Config. Queue-based ingestion for Votes.                 | DevOps     |

