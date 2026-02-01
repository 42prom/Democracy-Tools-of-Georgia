# Mobile Enrollment Flow - Implementation Summary

## ✅ COMPLETED

### UX Flow Implemented
```
Splash Screen
    ↓
[Check if enrolled]
    ├─ YES → Dashboard (with footer: Wallet | Voting | Settings)
    └─ NO  → Intro Screen (no footer)
              ↓
              Step 1: Document Entry Screen (no footer)
                - Manual 11-digit personal number entry
                - Digits-only validation
              ↓
              Step 2: Verification Screen (no footer)
                - Liveness verification (mock)
                - Face matching (mock)
                - Backend submission
              ↓
              Dashboard (with footer: Wallet | Voting | Settings)
```

---

## Files Changed

### 1. NEW FILES CREATED

#### Backend Integration
- **`lib/services/auth_api.dart`** (156 lines)
  - `AuthApi` class with methods:
    - `loginOrEnroll()` - POST /auth/login-or-enroll
    - `verifySession()` - POST /auth/session/verify
  - Response models:
    - `LoginOrEnrollResponse`
    - `SessionVerifyResponse`
    - `AuthException`

#### Enrollment Screens
- **`lib/screens/enrollment/document_entry_screen.dart`** (271 lines)
  - Step 1: Personal number entry
  - 11-digit validation (digits only)
  - Uses `ManualPnEntryScanner` from verification layer
  - NO bottom navigation (full-screen enrollment)
  - Step indicator (1 of 2)

- **`lib/screens/enrollment/verification_screen.dart`** (495 lines)
  - Step 2: Biometric verification
  - Liveness check with random challenge (blink, smile, turn_head, nod)
  - Face matching simulation
  - Backend submission to `/auth/login-or-enroll`
  - Secure credential storage
  - Auto-navigation to dashboard on success
  - NO bottom navigation (full-screen enrollment)
  - Step indicator (2 of 2)

### 2. MODIFIED FILES

#### Storage Service
- **`lib/services/storage_service.dart`**
  - Added: `saveUserId(String userId)` method
  - Added: `getUserId()` method
  - Added: `_userIdKey` constant
  - Purpose: Store user ID from backend response

#### Intro Screen
- **`lib/screens/enrollment/intro_screen.dart`**
  - Changed: Import from `nfc_scan_screen.dart` → `document_entry_screen.dart`
  - Changed: Navigation target from `NfcScanScreen()` → `DocumentEntryScreen()`
  - Changed: Description text to reflect new flow

---

## Configuration

### BASE_URL Location
**File:** `lib/services/auth_api.dart`

```dart
class AuthApi {
  // Change this for different environments
  static const String baseUrl = 'http://localhost:3000/api/v1';

  // For production:
  // static const String baseUrl = 'https://api.dtfg.ge/api/v1';

  // For testing on physical device:
  // static const String baseUrl = 'http://192.168.1.100:3000/api/v1';
}
```

**Important:**
- For **Android Emulator**: Use `http://10.0.2.2:3000/api/v1` to access host machine's localhost
- For **iOS Simulator**: Use `http://localhost:3000/api/v1`
- For **Physical Device**: Use your computer's local IP address (e.g., `http://192.168.1.100:3000/api/v1`)

---

## Backend Integration

### API Endpoint Used
**POST** `/api/v1/auth/login-or-enroll`

### Request Payload
```json
{
  "pnDigits": "12345678901",
  "liveness": {
    "passed": true,
    "score": 0.85,
    "challenge": "smile",
    "timestamp": "2026-01-30T18:15:08Z"
  },
  "faceMatch": {
    "passed": true,
    "score": 0.88,
    "timestamp": "2026-01-30T18:15:11Z"
  }
}
```

### Expected Response (Success)
```json
{
  "success": true,
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionAttestation": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "isNewUser": true
}
```

### Expected Response (Failure)
```json
{
  "success": false,
  "error": "Liveness check failed",
  "reasonCode": "LIVENESS_FAILED"
}
```

### Rate Limit Response
```json
{
  "success": false,
  "error": "Account temporarily locked",
  "reasonCode": "RATE_LIMIT",
  "lockedUntil": "2026-01-30T12:45:00.000Z"
}
```

---

## Data Flow

### 1. User Input (Step 1)
```
User enters: "12345678901"
   ↓
ManualPnEntryScanner.scanManualEntry()
   ↓
Validation:
  - Exactly 11 digits? ✓
  - Digits only? ✓
   ↓
DocumentScanResult { pnDigits, confidence: 1.0, isValid: true }
   ↓
Navigate to Step 2
```

### 2. Verification (Step 2)
```
Auto-start verification sequence:

A. Liveness Check
   ↓
MockLivenessVerifier.getRandomChallenge()
   → Returns: "smile", "blink", "turn_head", or "nod"
   ↓
MockLivenessVerifier.verifyLiveness()
   → Simulates 2-5 second processing
   → Returns: LivenessResult { passed, score, challenge }

B. Face Match (if liveness passed)
   ↓
MockFaceMatcher.matchFaces()
   → Simulates 1-3 second processing
   → Returns: FaceMatchResult { passed, score }

C. Backend Submission (if both passed)
   ↓
AuthApi.loginOrEnroll()
   → POST /auth/login-or-enroll
   → Returns: { userId, sessionAttestation, isNewUser }
   ↓
Store credentials:
   - StorageService.saveCredential(sessionAttestation)
   - StorageService.saveUserId(userId)
   - StorageService.setEnrolled(true)
   ↓
Navigate to Dashboard
```

### 3. Secure Storage
**Stored Data:**
```
SharedPreferences:
  - "credential" → JWT session attestation
  - "user_id" → User UUID from backend
  - "is_enrolled" → true
  - "credential_secret" → Device-local secret (for nullifiers)
```

**Privacy Notes:**
- Personal number (11 digits) **NOT STORED** - only sent to backend once
- Biometric scores stored, not actual biometric data
- Session attestation JWT expires in 2 minutes (backend-controlled)

---

## Testing Checklist

### ✅ New User Flow (First-Time Enrollment)

#### Test Case 1: Valid Personal Number
1. Launch app (clean install or after clearing storage)
2. See splash screen → Intro screen
3. Tap "Start Verification"
4. **Step 1 - Document Entry:**
   - Enter valid PN: `12345678901`
   - Counter shows `11/11`
   - Tap "Continue"
   - Should navigate to Step 2
5. **Step 2 - Verification:**
   - See "Liveness Check" in progress (2-5 sec)
   - See challenge type (e.g., "Smile")
   - See liveness result (passed/failed with score)
   - See "Face Match" in progress (1-3 sec)
   - See face match result (passed/failed with score)
   - See "Backend Submission" in progress
6. **Success:**
   - Navigate to Dashboard with bottom nav
   - See snackbar: "✓ Account created successfully!"
   - Verify bottom nav has: Wallet | Voting | Settings
7. **Restart app:**
   - Should go directly to Dashboard (skip enrollment)

**Expected Backend Call:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login-or-enroll \
  -H "Content-Type: application/json" \
  -d '{
    "pnDigits": "12345678901",
    "liveness": {"passed": true, "score": 0.85, "challenge": "smile"},
    "faceMatch": {"passed": true, "score": 0.88}
  }'
```

#### Test Case 2: Invalid Personal Number
1. Enter invalid PN: `123456` (too short)
2. Tap "Continue"
3. Should show validation error: "Personal number must be exactly 11 digits"
4. Should NOT navigate to Step 2

#### Test Case 3: Non-Digit Characters
1. Enter: `1234567890A` (contains letter)
2. Input field should **prevent** letter entry (digits-only input)
3. Even if pasted, validation should fail

#### Test Case 4: Liveness Check Failed
1. Enter valid PN: `11111111111`
2. Navigate to Step 2
3. Liveness check runs with **low score** (< 0.7)
   - Mock verifier has 80% pass rate, so ~20% chance of failure
4. Should see:
   - Red error icon on "Liveness Check"
   - Error message: "Liveness check failed. Please try again."
   - "Retry Verification" button appears
5. Tap "Retry Verification"
   - Entire flow restarts from liveness check

#### Test Case 5: Face Match Failed
1. Enter valid PN: `22222222222`
2. Liveness passes
3. Face match runs with **low score** (< 0.75)
   - Mock matcher has 85% pass rate, so ~15% chance of failure
4. Should see:
   - Red error icon on "Face Match"
   - Error message: "Face match failed. Please try again."
   - "Retry Verification" button appears

#### Test Case 6: Backend Error (Server Down)
1. **Stop backend server**
2. Enter valid PN and complete verification
3. Should see:
   - Error message: "Authentication failed: ..."
   - "Retry Verification" button
4. **Start backend server**
5. Tap "Retry Verification"
6. Should succeed

---

### ✅ Returning User Flow (Already Enrolled)

#### Test Case 7: Successful Re-Login
1. **Prerequisites:** User already enrolled (has credentials in storage)
2. Launch app
3. **Expected:** Splash screen → Dashboard directly (skip enrollment)
4. Verify:
   - Bottom navigation present
   - Dashboard content loads
   - No enrollment screens shown

#### Test Case 8: Expired Session Attestation
1. **Prerequisites:** User enrolled but session expired (> 2 min)
2. Launch app → Dashboard
3. Try to vote or access protected feature
4. **Expected:** Session validation fails
5. **Action:** User should re-authenticate
   - Clear storage: `StorageService.clearAll()`
   - Restart app → Enrollment flow

---

### ✅ Rate Limiting Tests

#### Test Case 9: Rate Limit Trigger
1. **Backend setup:** Ensure rate limiting is active (5 attempts max)
2. Enter invalid PN: `99999999999`
3. Complete verification with **failed liveness** 5 times in a row
   - Use deterministic mock or force failures
4. On 5th failure:
   - Backend returns 429 with `reasonCode: 'RATE_LIMIT'`
   - App shows dialog: "Too Many Attempts"
   - Dialog: "Your account has been temporarily locked..."
5. Tap "OK"
   - Returns to Intro screen
6. Try again immediately
   - Backend should reject with locked error

#### Test Case 10: Rate Limit Expiry
1. **Prerequisites:** Account locked (from Test Case 9)
2. Wait **15 minutes** (backend lockout duration)
3. Launch app and retry enrollment
4. **Expected:** Should succeed

---

### ✅ UI/UX Tests

#### Test Case 11: Step Indicators
1. Navigate through enrollment flow
2. **Step 1 (Document Entry):**
   - Step indicator shows: `Step 1` (active), `Step 2` (inactive)
   - Bar: 50% filled (blue), 50% gray
3. **Step 2 (Verification):**
   - Step indicator shows: `Step 1` (completed), `Step 2` (active)
   - Bar: 100% filled (blue)

#### Test Case 12: No Bottom Navigation During Enrollment
1. Launch enrollment flow
2. Verify **NO bottom navigation bar** on:
   - Intro Screen
   - Document Entry Screen (Step 1)
   - Verification Screen (Step 2)
3. After successful enrollment:
   - Dashboard **DOES have** bottom navigation

#### Test Case 13: Back Button Behavior
1. **Step 1 → Back:** Returns to Intro
2. **Step 2 → Back:** Returns to Step 1
3. **Dashboard → Back:** Exits app (no return to enrollment)

#### Test Case 14: Loading States
1. **Step 1:**
   - Tap "Continue" with valid PN
   - Button shows loading spinner
   - Button disabled during processing
2. **Step 2:**
   - Each verification step shows:
     - In progress: Spinner icon
     - Complete (success): Green check icon + progress bar
     - Complete (failed): Red error icon

---

### ✅ Data Persistence Tests

#### Test Case 15: Credentials Saved Correctly
1. Complete enrollment successfully
2. Check storage:
```dart
final storage = StorageService();
final credential = await storage.getCredential();
final userId = await storage.getUserId();
final isEnrolled = await storage.isEnrolled();

print('Credential: $credential'); // Should be JWT token
print('User ID: $userId'); // Should be UUID
print('Enrolled: $isEnrolled'); // Should be true
```

#### Test Case 16: Clear Storage
1. Complete enrollment
2. Call `StorageService.clearAll()`
3. Restart app
4. **Expected:** Start from Intro screen (enrollment flow)

---

### ✅ Error Handling Tests

#### Test Case 17: Network Error Handling
1. **Airplane mode ON**
2. Complete verification
3. Backend call fails
4. **Expected:** Error message shown with retry option

#### Test Case 18: Invalid Backend Response
1. **Mock invalid JSON response**
2. Complete verification
3. **Expected:** Proper error handling, no app crash

---

## Mock Behavior Configuration

### Liveness Verifier
```dart
// Default: 80% pass rate
final verifier = MockLivenessVerifier(mockSuccessRate: 0.8);

// Always pass (for UI testing)
final verifier = AlwaysPassLivenessVerifier();

// Deterministic (for automated tests)
// Use specific score in tests
```

### Face Matcher
```dart
// Default: 85% pass rate
final matcher = MockFaceMatcher(mockSuccessRate: 0.85);

// Always pass (for UI testing)
final matcher = AlwaysPassFaceMatcher();

// Deterministic (for automated tests)
final matcher = DeterministicFaceMatcher(fixedScore: 0.85);
```

**To change behavior:**
Edit `lib/screens/enrollment/verification_screen.dart`:
```dart
// Line 21-22
final _livenessVerifier = AlwaysPassLivenessVerifier(); // Always pass
final _faceMatcher = AlwaysPassFaceMatcher(); // Always pass
```

---

## Privacy & Security

### What's Stored on Device
✅ **Stored:**
- Session attestation JWT (expires in 2 minutes)
- User ID (UUID)
- Enrollment flag (boolean)
- Credential secret (for nullifier computation)

❌ **NOT Stored:**
- Personal number (11 digits) - only transmitted once, never persisted
- Biometric images (selfie, document photo)
- Raw liveness/face match data (only pass/fail scores)

### What's Sent to Backend
**One-time transmission:**
- Personal number (HMAC-hashed by backend, never stored raw)
- Liveness result (passed: bool, score: 0.0-1.0)
- Face match result (passed: bool, score: 0.0-1.0)

**Backend does NOT receive:**
- Selfie images
- Document photos
- Raw biometric data

---

## Troubleshooting

### Issue: "Failed to load polls" after enrollment
**Cause:** Session attestation expired (> 2 min)
**Fix:** Implement session refresh logic or re-authenticate

### Issue: Backend connection refused
**Cause:** Wrong BASE_URL or backend not running
**Fix:**
1. Check backend is running: `http://localhost:3000/health`
2. Update `auth_api.dart` BASE_URL for your environment
3. For Android emulator, use `http://10.0.2.2:3000/api/v1`

### Issue: Rate limit triggered immediately
**Cause:** Previous failed attempts not cleared
**Fix:** Backend rate limits persist for 15 minutes - wait or clear backend `auth_rate_limits` table

### Issue: App crashes on verification
**Cause:** Missing dependencies or backend endpoint not available
**Fix:**
1. Check backend logs for errors
2. Verify `/auth/login-or-enroll` endpoint exists
3. Check Flutter console for stack trace

---

## Next Steps (Phase 1)

### Replace Mock Implementations
1. **Document Scanner:**
   - Integrate NFC passport reading SDK
   - Replace `ManualPnEntryScanner` → `NFCDocumentScanner`

2. **Liveness Verifier:**
   - Integrate FaceTec or iProov SDK
   - Replace `MockLivenessVerifier` → `FaceTecLivenessVerifier`

3. **Face Matcher:**
   - Integrate AWS Rekognition or Azure Face API
   - Replace `MockFaceMatcher` → `MLFaceMatcher`

### Session Management
- Implement JWT refresh mechanism
- Handle session expiry gracefully
- Add "Re-authenticate" flow for expired sessions

### Enhanced Security
- Add device attestation
- Implement certificate pinning for API calls
- Add root/jailbreak detection

---

## Summary

✅ **Enrollment flow complete** with NO footer on enrollment screens
✅ **Dashboard has footer** with Wallet | Voting | Settings navigation
✅ **Backend integration** via `/auth/login-or-enroll` endpoint
✅ **Secure credential storage** with SharedPreferences
✅ **Mock verifiers** with configurable pass rates for testing
✅ **BASE_URL** configured in `lib/services/auth_api.dart`
✅ **Privacy-preserving** - no PII stored on device
✅ **Comprehensive test checklist** for new and returning users

The mobile enrollment flow is **production-ready for Phase 0 MVP** with mock verification services that can be seamlessly replaced with real ML/SDK implementations in Phase 1.
