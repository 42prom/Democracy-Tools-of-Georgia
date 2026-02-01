# Files Changed - Mobile Enrollment Flow Integration

## NEW FILES CREATED ✨

### Backend Integration
1. **`lib/services/auth_api.dart`** (156 lines)
   - Purpose: Authentication API client for login/enrollment
   - Key methods: `loginOrEnroll()`, `verifySession()`
   - **BASE_URL configured here:** `http://localhost:3000/api/v1`

### Enrollment Screens
2. **`lib/screens/enrollment/document_entry_screen.dart`** (271 lines)
   - Purpose: Step 1 - Personal number entry (NO footer)
   - Features: 11-digit validation, digits-only input, step indicator

3. **`lib/screens/enrollment/verification_screen.dart`** (495 lines)
   - Purpose: Step 2 - Liveness + face match + backend submission (NO footer)
   - Features: Auto-runs verification, shows progress, handles errors, navigates to dashboard

---

## MODIFIED FILES 📝

### Storage Service
4. **`lib/services/storage_service.dart`**
   - **Added:** `saveUserId(String userId)` - Store user ID from backend
   - **Added:** `getUserId()` - Retrieve stored user ID
   - **Added:** `_userIdKey` constant

### Enrollment Entry Point
5. **`lib/screens/enrollment/intro_screen.dart`**
   - **Changed:** Import from `nfc_scan_screen.dart` → `document_entry_screen.dart`
   - **Changed:** Navigation from `NfcScanScreen()` → `DocumentEntryScreen()`
   - **Changed:** Description text to match new flow

---

## EXISTING FILES (Unchanged but Important)

### App Entry & Navigation
- **`lib/main.dart`**
  - Checks enrollment status on startup
  - Routes: Not enrolled → IntroScreen | Enrolled → DashboardScreen
  - Already correct - no changes needed

### Dashboard (With Footer)
- **`lib/screens/dashboard/dashboard_screen.dart`**
  - Contains bottom navigation: Wallet | Voting | Settings
  - Already implemented - no changes needed

### Verification Layer (Previously Created)
- **`lib/services/verification/`**
  - `verification_models.dart`
  - `document_scanner.dart`
  - `liveness_verifier.dart`
  - `face_matcher.dart`
  - All used by enrollment screens

---

## Configuration Locations 🔧

### BASE_URL
**File:** `lib/services/auth_api.dart` (Line 6)
```dart
static const String baseUrl = 'http://localhost:3000/api/v1';
```

**Change for:**
- **Android Emulator:** `http://10.0.2.2:3000/api/v1`
- **iOS Simulator:** `http://localhost:3000/api/v1`
- **Physical Device:** `http://YOUR_COMPUTER_IP:3000/api/v1` (e.g., `http://192.168.1.100:3000/api/v1`)
- **Production:** `https://api.dtfg.ge/api/v1`

### Mock Verification Behavior
**File:** `lib/screens/enrollment/verification_screen.dart` (Lines 21-22)
```dart
final _livenessVerifier = MockLivenessVerifier(mockSuccessRate: 0.8);
final _faceMatcher = MockFaceMatcher(mockSuccessRate: 0.85);
```

**Change for always-pass testing:**
```dart
final _livenessVerifier = AlwaysPassLivenessVerifier();
final _faceMatcher = AlwaysPassFaceMatcher();
```

---

## Quick Test Checklist ✅

### New User Flow
1. Clean install → Splash → Intro → Tap "Start Verification"
2. Enter valid PN: `12345678901` → Tap "Continue"
3. Watch verification run (Step 2 auto-starts)
4. See Dashboard with footer (Wallet | Voting | Settings)
5. Restart app → Should go directly to Dashboard

### Returning User Flow
1. User already enrolled → Launch app
2. Should skip enrollment and go straight to Dashboard

### Invalid Input
1. Enter short PN: `123456` → Should show error, stay on Step 1
2. Try letters: Input field blocks non-digits

### Backend Integration
```bash
# Start backend server
cd backend && npm run dev

# Test endpoint
curl -X POST http://localhost:3000/api/v1/auth/login-or-enroll \
  -H "Content-Type: application/json" \
  -d '{"pnDigits":"12345678901","liveness":{"passed":true,"score":0.85},"faceMatch":{"passed":true,"score":0.88}}'
```

---

## Summary

**5 files total:**
- 3 new files created
- 2 files modified
- All enrollment flow screens have **NO footer**
- Dashboard screen has **footer** (Wallet | Voting | Settings)
- BASE_URL: `lib/services/auth_api.dart`
- Ready for testing!
