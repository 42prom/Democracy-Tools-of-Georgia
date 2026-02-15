# DTG Mobile App

Flutter mobile application for Democracy Tools Of Georgia.

## ✅ Implementation Complete

### Screens Implemented

1. **Enrollment Flow** (NO footer until success):
   - Step 1.1: Intro - "Verify Identity"
   - Step 1.2: NFC Scan - Mock passport reading with animations
   - Step 1.3: Liveness - Mock camera check with oval frame

2. **Dashboard** (Main Tab - footer appears after enrollment):
   - Top Bar: "Democratic Tools" + Profile icon
   - Poll Feed: PollCard components
   - Empty State: "You have no active polls"
   - Bottom Nav: Home | Voting | Wallet

3. **Voting Flow**:
   - Step 3.1: Poll Details - Radio options
   - Step 3.2: Confirm Vote - Summary + biometric auth
   - Step 3.3: Re-Auth Modal - FaceID/TouchID
   - Step 3.4: Receipt - "Vote Submitted!" with tx hash

4. **Wallet**:
   - Balance Card: "0.00 DTG"
   - Actions: Send, Receive (QR), Scan
   - Transaction History (empty state)

## Design

- **Theme**: Dark Mode, Facebook Blue (#1877F2)
- **Typography**: Inter (Google Fonts)
- **Components**: Rounded cards, elevated buttons

## Getting Started

```bash
cd mobile
flutter pub get
flutter run
```

## Key Features

✅ **NO Footer in Enrollment** - Steps 1-3 have no bottom nav
✅ **Biometric Re-Auth** - Voting requires FaceID/TouchID
✅ **Wallet Read-Only** - Balance + Receive QR code
✅ **Dark Theme** - Facebook blue accents throughout

## Project Structure

```
lib/
├── config/theme.dart              # Dark theme
├── models/poll.dart               # Data models
├── services/                      # API & storage
├── screens/
│   ├── enrollment/                # Steps 1.1-1.3 (NO footer)
│   ├── dashboard/                 # Main screen (WITH footer)
│   ├── voting/                    # Steps 3.1-3.4
│   └── wallet/                    # Wallet screen
└── widgets/bottom_nav.dart        # Bottom navigation
```

## Phase 0 vs Phase 1

**Phase 0** (Current - Mock):
- NFC scan mocked (animation only)
- Liveness check mocked
- Mock enrollment credential
- Biometric auth for voting ✅
- Wallet read-only ✅

**Phase 1** (Future - Real):
- Real NFC passport reading
- Real camera liveness detection
- Blockchain wallet integration
- Send/Receive tokens

## Running

```bash
# iOS
flutter run -d iPhone

# Android
flutter run -d emulator

# Build
flutter build apk --release
```

## Status

✅ All screens implemented per [docs/ui_mobile_spec.md](../docs/ui_mobile_spec.md)
✅ UX rules enforced (NO footer until enrollment complete)
✅ Dark theme with Facebook blue
✅ Biometric re-auth for voting
✅ Wallet read-only first

**Ready for Phase 0 testing** 🎉

