# DTG Admin Panel 🖥️

Admin web interface for Democracy Tools Of Georgia, built on **Mikheili Nakeuri's Protocol**.

## 🚀 Features

### 🗳️ Poll Management

- **Universal Creator**: Support for Multiple Choice and Referendum styles.
- **Audience Targeting**: Selective polling by age, gender, and region.
- **Privacy Assurance**: Automatic k-anonymity checks (k=30) during audience estimation.

### 🛡️ Security & Oversight

- **Audit Ledger**: Real-time view of the cryptographic Hash Chain for all votes.
- **Blockchain Verification**: Direct links to public explorers for verified anchors.
- **Security Logs**: Aggregated system event monitoring with privacy protection.

### 🏗️ Settings & Localization

- **Regional Hierarchy**: Management of multi-level regional structures.
- **System Health**: Proxy monitoring for backend and biometric service status.

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: TailwindCSS
- **State/Data**: React Router, Axios, Recharts
- **Icons**: Lucide React

## 🚦 Getting Started

```bash
cd admin
npm install
npm run dev
```

The app will be available at [http://localhost:5173](http://localhost:5173). API requests are proxied to the backend server.

## 🏗️ Technical Notes

- **Privacy-First Analytics**: Results are suppressed if the participant count for a specific cell is below the k-anonymity threshold.
- **Security Logging**: All logs show aggregated counts to prevent identity inference.
- **Authentication**: Uses secure bearer token administration.

---

© 2026 Mikheili Nakeuri. **Designed by Mikheili Nakeuri (Protocol).**
