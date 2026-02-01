# Mobile Verification Layer

Privacy-preserving identity verification for DTFG mobile app with **replaceable implementations**.

## Overview

This verification layer provides clean interfaces for three core verification services:

1. **DocumentScanner** - Extract personal number from ID documents
2. **LivenessVerifier** - Verify user is physically present (anti-spoofing)
3. **FaceMatcher** - Match selfie against document photo

## Architecture

```
verification/
├── verification_models.dart      # Shared data models
├── document_scanner.dart         # Document scanning interface + mock
├── liveness_verifier.dart        # Liveness verification interface + mock
├── face_matcher.dart             # Face matching interface + mock
├── verification_service.dart     # Barrel file for easy imports
├── example_usage.dart            # Usage examples
└── README.md                     # This file
```

## Design Principles

### 1. **Interface-Based Design**
All services are defined as abstract interfaces. This allows swapping implementations without changing app logic.

```dart
// Define interface
abstract class DocumentScanner {
  Future<DocumentScanResult> scanDocument(DocumentScanInput input);
}

// MVP implementation
class ManualPnEntryScanner implements DocumentScanner { ... }

// Future Phase 1 implementation
class NFCDocumentScanner implements DocumentScanner { ... }
```

### 2. **No PII Storage**
- Personal numbers extracted but **never stored locally**
- Document photos kept as temporary local references only
- Biometric data is **never** stored - only pass/fail scores
- All sensitive data sent directly to backend via HTTPS

### 3. **Mock Implementations for MVP**
Phase 0 provides working mock implementations:
- **ManualPnEntryScanner** - Manual 11-digit entry
- **MockLivenessVerifier** - Randomized liveness checks (80% pass rate)
- **MockFaceMatcher** - Randomized face matching (85% pass rate)

### 4. **Plug-and-Play Real Implementations**
Phase 1 will add real ML/SDK implementations:
- **NFCDocumentScanner** - Read Georgian biometric passports via NFC
- **MLLivenessVerifier** - FaceTec, iProov, or custom ML model
- **MLFaceMatcher** - AWS Rekognition, Azure Face API, or custom model

## Quick Start

### Import
```dart
import 'package:mobile/services/verification/verification_service.dart';
```

### Basic Usage

#### 1. Document Scanning (Manual Entry - MVP)
```dart
final scanner = ManualPnEntryScanner();

// Validate and scan personal number
final result = await scanner.scanManualEntry('12345678901');

if (result.isValid) {
  print('PN: ${result.pnDigits}');
  print('Confidence: ${result.confidence}');
} else {
  print('Error: ${result.errorMessage}');
}
```

#### 2. Liveness Verification (Mock)
```dart
final verifier = MockLivenessVerifier();

// Get random challenge
final challenge = verifier.getRandomChallenge(); // 'blink', 'smile', etc.

// Verify liveness
final result = await verifier.verifyLiveness(
  LivenessInput(challengeType: challenge)
);

if (result.passed) {
  print('Liveness passed: ${result.score}');
}
```

#### 3. Face Matching (Mock)
```dart
final matcher = MockFaceMatcher();

final result = await matcher.matchFaces(
  FaceMatchInput(
    selfieBytes: selfieImageBytes,
    documentPhotoBytes: docPhotoBytes,
  )
);

if (result.passed) {
  print('Face match score: ${result.score}');
}
```

### Complete Verification Flow

```dart
// Initialize services
final scanner = ManualPnEntryScanner();
final livenessVerifier = MockLivenessVerifier();
final faceMatcher = MockFaceMatcher();

try {
  // Step 1: Scan document
  final scanResult = await scanner.scanManualEntry(userInput);
  if (!scanResult.isValid) throw Exception(scanResult.errorMessage);

  // Step 2: Verify liveness
  final challenge = livenessVerifier.getRandomChallenge();
  final livenessResult = await livenessVerifier.verifyLiveness(
    LivenessInput(challengeType: challenge)
  );
  if (!livenessResult.passed) throw Exception('Liveness check failed');

  // Step 3: Match face
  final faceResult = await faceMatcher.matchFaces(
    FaceMatchInput(
      selfieBytes: selfieBytes,
      documentPhotoBytes: docPhotoBytes,
    )
  );
  if (!faceResult.passed) throw Exception('Face match failed');

  // Step 4: Send to backend
  final payload = {
    'pnDigits': scanResult.pnDigits,
    'liveness': livenessResult.toJson(),
    'faceMatch': faceResult.toJson(),
  };

  // POST to /api/v1/auth/login-or-enroll
  final response = await apiService.loginOrEnroll(payload);

} catch (e) {
  print('Verification failed: $e');
}
```

## Available Implementations

### Document Scanners

| Implementation | Status | Use Case |
|----------------|--------|----------|
| `ManualPnEntryScanner` | ✅ MVP Ready | Manual 11-digit entry, digits-only validation |
| `NFCDocumentScanner` | 🔲 Phase 1 | Read Georgian biometric passport via NFC |
| `OCRDocumentScanner` | 🔲 Phase 1 | OCR scan of physical ID card using camera |

### Liveness Verifiers

| Implementation | Status | Use Case |
|----------------|--------|----------|
| `MockLivenessVerifier` | ✅ MVP Ready | Randomized results (80% pass rate) |
| `AlwaysPassLivenessVerifier` | ✅ Dev Tool | Always passes (for UI development) |
| `MLLivenessVerifier` | 🔲 Phase 1 | Real ML-based liveness detection |

### Face Matchers

| Implementation | Status | Use Case |
|----------------|--------|----------|
| `MockFaceMatcher` | ✅ MVP Ready | Randomized results (85% pass rate) |
| `AlwaysPassFaceMatcher` | ✅ Dev Tool | Always passes (for UI development) |
| `DeterministicFaceMatcher` | ✅ Testing | Fixed score for predictable tests |
| `MLFaceMatcher` | 🔲 Phase 1 | Real ML-based face matching |

## Data Models

### DocumentScanResult
```dart
{
  pnDigits: String,          // 11-digit personal number
  confidence: double,        // 0.0 to 1.0
  docPhotoLocalRef: String?, // Local file reference (optional)
  isValid: bool,
  errorMessage: String?,
  timestamp: DateTime
}
```

### LivenessResult
```dart
{
  passed: bool,
  score: double,             // 0.0 to 1.0
  challenge: String,         // 'blink', 'smile', 'turn_head', etc.
  errorMessage: String?,
  timestamp: DateTime
}
```

### FaceMatchResult
```dart
{
  passed: bool,
  score: double,             // 0.0 to 1.0 (similarity score)
  errorMessage: String?,
  timestamp: DateTime
}
```

## Error Handling

All verification services throw `VerificationException`:

```dart
try {
  final result = await scanner.scanDocument(input);
} catch (e) {
  if (e is VerificationException) {
    switch (e.type) {
      case VerificationErrorType.invalidPersonalNumber:
        // Handle invalid PN
        break;
      case VerificationErrorType.cameraPermissionDenied:
        // Request camera permission
        break;
      // ... other cases
    }
  }
}
```

## Testing

### Run Example Usage
```bash
cd mobile
dart run lib/services/verification/example_usage.dart
```

This runs comprehensive examples of all verification services.

### Unit Tests
```bash
flutter test test/services/verification/
```

## Integration with Backend

The verification results are sent to the backend's `/api/v1/auth/login-or-enroll` endpoint:

```dart
final payload = {
  'pnDigits': scanResult.pnDigits,
  'liveness': {
    'passed': livenessResult.passed,
    'score': livenessResult.score,
  },
  'faceMatch': {
    'passed': faceResult.passed,
    'score': faceResult.score,
  },
  // Optional demographic data (Phase 1)
  'gender': 'M',
  'birthYear': 1990,
  'regionCodes': ['reg_tbilisi'],
};

final response = await http.post(
  Uri.parse('$baseUrl/api/v1/auth/login-or-enroll'),
  body: jsonEncode(payload),
);
```

Backend response:
```json
{
  "success": true,
  "userId": "uuid",
  "sessionAttestation": "eyJhbGc...",
  "isNewUser": true
}
```

## Upgrading to Real Implementations (Phase 1)

To swap mock implementations with real ones:

### Example: Replace MockLivenessVerifier with FaceTec SDK

```dart
// Before (Phase 0 - Mock)
final verifier = MockLivenessVerifier();

// After (Phase 1 - Real SDK)
final verifier = FaceTecLivenessVerifier(
  licenseKey: 'your-license-key',
);

// App code stays the same!
final result = await verifier.verifyLiveness(
  LivenessInput(challengeType: challenge)
);
```

All app logic remains unchanged because implementations follow the same interface.

## Privacy & Security

✅ **NO PII stored on device** - Personal numbers only in memory
✅ **NO biometric storage** - Only pass/fail scores recorded
✅ **NO photo uploads** - Document photos kept locally only
✅ **HTTPS only** - All backend communication encrypted
✅ **Session attestation** - JWT tokens with 2-minute expiry
✅ **Rate limiting** - Backend enforces attempt limits

## Future Enhancements (Phase 1+)

- [ ] NFC passport reading (ICAO 9303 compliant)
- [ ] Real ML-based liveness detection (FaceTec/iProov)
- [ ] Real face matching (AWS Rekognition/Azure Face API)
- [ ] Passive liveness detection (no user challenges)
- [ ] Advanced anti-spoofing (depth detection, texture analysis)
- [ ] Multi-factor verification (device attestation + biometrics)

## License

Internal DTFG project - All rights reserved
