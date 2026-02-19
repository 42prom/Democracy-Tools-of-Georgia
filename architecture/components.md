# System Components

```mermaid
graph TD
    User[User Mobile App]
    Admin[Admin Web Panel]

    subgraph "DMZ / API Gateway"
        WAF[WAF / Rate Limiter]
        API[Back-end API (Node.js)]
    end

    subgraph "Trusted Zone"
        Auth[Identity Service]
        Vote[Voting Service]
        Anchor[Vote Anchor Service]
        DB[(Postgres DB)]
        Redis[(Redis - Nonces)]
    end

    subgraph "Public Blockchain"
        L2[Ethereum L2]
        SmartContracts[Reward Factory, Ledger Anchor]
    end

    User -->|HTTPS + Attestation| WAF
    Admin -->|HTTPS + MFA| WAF
    WAF --> API

    API --> Auth
    API --> Vote

    Auth -->|Risk Checks| DB
    Vote -->|Store Vote Chain| DB
    Vote -->|Check Nonce| Redis

    Anchor -->|Fetch Head Hash| DB
    Anchor -->|Commit Anchor| L2

    Vote -->|Sponsor Rewards| L2
```

## Trust Boundaries

1.  **Mobile App is Untrusted**: We assume `Rooted` until proven via Attestation. We assume User is malicious (trying to double vote).
2.  **API is Semi-Trusted**: Can read DB, but cannot decrypt Private Keys (stored in HSM) or invent User Signatures.
3.  **Database is Sensitive**: Contains Verification Metadata (Risk Scores) and Votes. MUST separate `votes` from `users`.
