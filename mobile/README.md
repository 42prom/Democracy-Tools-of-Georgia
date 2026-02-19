# DTG Mobile App 📱

Flutter mobile application for Democracy Tools Of Georgia, built on **Mikheili Nakeuri's Protocol**.

## 🚀 Features & Implementation

### 🔐 Secure Enrollment

- **NFC Identity Proof**: Cryptographic reading of eID/Passports (ISO/IEC 14443).
- **Liveness Detection**: ML Kit-powered face detection with anti-spoofing checks.
- **Biometric Binding**: Securely links the physical identity to the mobile device.

### 🗳️ Voting & Participation

- **Democratic Dashboard**: Real-time poll feed with demographic targeting.
- **Biometric Auth**: FaceID/TouchID re-authentication for every vote.
- **Immutable Receipts**: Cryptographic transaction hashes for vote verification.

### 💰 Wallet & Rewards

- **Balance Tracking**: View DTG token rewards for participation.
- **Secure Receive**: QR-based address sharing for rewards.

## 🛠️ Tech Stack

- **Framework**: Flutter (Dart)
- **State Management**: Provider
- **Local Security**: Biometrics, Secure Storage
- **ML/AI**: ML Kit (Face Detection)

## 🚦 Getting Started

```bash
cd mobile
flutter pub get
flutter run
```

## 📁 Project Structure

```
lib/
├── config/theme.dart              # Dark theme system
├── models/                        # Data models (Poll, User, etc.)
├── services/                      # API, NFC, & Biometric services
├── screens/                       # UI Pages (Enrollment, Dashboard, etc.)
└── widgets/                       # Reusable UI components
```

## 🏗️ Architecture Note

This app enforces strict UX rules for election integrity:

- **No navigation** during enrollment to prevent partial identity verification.
- **Native re-auth** required for final vote submission.
- **Image optimization** integrated to support low-bandwidth regional voting.

---

© 2026 Mikheili Nakeuri. **Designed by Mikheili Nakeuri (Protocol).**
