// ignore_for_file: unused_local_variable, avoid_print

/// Example usage of verification services
/// This file demonstrates how to integrate the verification layer
library;

import 'verification_service.dart';

/// Example: Complete verification flow
Future<void> exampleCompleteVerification() async {
  print('=== Complete Verification Flow Example ===\n');

  // Step 1: Initialize verification services
  final documentScanner = ManualPnEntryScanner();
  final livenessVerifier = MockLivenessVerifier(mockSuccessRate: 0.8);
  final faceMatcher = MockFaceMatcher(mockSuccessRate: 0.85);

  try {
    // Step 2: Document scanning (manual entry for MVP)
    print('Step 1: Scanning document...');
    final scanResult = await documentScanner.scanManualEntry('12345678901');

    if (!scanResult.isValid) {
      print('❌ Document scan failed: ${scanResult.errorMessage}');
      return;
    }
    print('✓ Document scanned successfully');
    print('  Personal Number: ${scanResult.pnDigits}');
    print(
      '  Confidence: ${(scanResult.confidence * 100).toStringAsFixed(1)}%\n',
    );

    // Step 3: Liveness verification
    print('Step 2: Performing liveness check...');
    final challenge = livenessVerifier.getRandomChallenge();
    print('  Challenge: $challenge');

    final livenessResult = await livenessVerifier.verifyLiveness(
      LivenessInput(challengeType: challenge),
    );

    if (!livenessResult.passed) {
      print('❌ Liveness check failed: ${livenessResult.errorMessage}');
      return;
    }
    print('✓ Liveness check passed');
    print('  Score: ${(livenessResult.score * 100).toStringAsFixed(1)}%\n');

    // Step 4: Face matching
    print('Step 3: Matching face...');
    final faceMatchResult = await faceMatcher.matchFaces(
      FaceMatchInput(
        selfieBytes: [1, 2, 3], // Mock selfie data
        documentPhotoBytes: [4, 5, 6], // Mock document photo data
      ),
    );

    if (!faceMatchResult.passed) {
      print('❌ Face match failed: ${faceMatchResult.errorMessage}');
      return;
    }
    print('✓ Face match passed');
    print('  Score: ${(faceMatchResult.score * 100).toStringAsFixed(1)}%\n');

    // Step 5: All checks passed - prepare data for backend
    print('=== All verification checks passed ===');
    print('Ready to send to backend:');
    print('  pnDigits: ${scanResult.pnDigits}');
    print('  liveness: ${livenessResult.toJson()}');
    print('  faceMatch: ${faceMatchResult.toJson()}');
  } catch (e) {
    print('❌ Verification failed: $e');
  }
}

/// Example: Document scanning with validation
Future<void> exampleDocumentScanning() async {
  print('=== Document Scanning Example ===\n');

  final scanner = ManualPnEntryScanner();

  // Test valid personal number
  print('Testing valid PN: 12345678901');
  final result1 = await scanner.scanManualEntry('12345678901');
  print('Valid: ${result1.isValid}, Confidence: ${result1.confidence}\n');

  // Test invalid personal number (too short)
  print('Testing invalid PN: 123456');
  final result2 = await scanner.scanManualEntry('123456');
  print('Valid: ${result2.isValid}, Error: ${result2.errorMessage}\n');

  // Test invalid personal number (contains letters)
  print('Testing invalid PN: 1234567890A');
  final result3 = await scanner.scanManualEntry('1234567890A');
  print('Valid: ${result3.isValid}, Error: ${result3.errorMessage}\n');

  // Check capabilities
  final capabilities = scanner.getCapabilities();
  print('Scanner capabilities:');
  print('  NFC: ${capabilities.supportsNFC}');
  print('  OCR: ${capabilities.supportsOCR}');
  print('  Manual: ${capabilities.supportsManualEntry}');
  print('  Camera: ${capabilities.supportsCamera}');
}

/// Example: Liveness verification with different challenges
Future<void> exampleLivenessVerification() async {
  print('=== Liveness Verification Example ===\n');

  final verifier = MockLivenessVerifier(mockSuccessRate: 0.8);

  // Get supported challenges
  final challenges = verifier.getSupportedChallenges();
  print('Supported challenges: ${challenges.join(", ")}\n');

  // Test multiple challenges
  for (final challenge in challenges.take(3)) {
    print('Testing challenge: $challenge');
    final result = await verifier.verifyLiveness(
      LivenessInput(challengeType: challenge),
    );
    print('  Passed: ${result.passed}');
    print('  Score: ${(result.score * 100).toStringAsFixed(1)}%\n');
  }

  // Check capabilities
  final capabilities = verifier.getCapabilities();
  print('Verifier capabilities:');
  print('  Passive liveness: ${capabilities.supportsPassiveLiveness}');
  print('  Active liveness: ${capabilities.supportsActiveLiveness}');
  print('  Requires camera: ${capabilities.requiresCamera}');
}

/// Example: Face matching with different matchers
Future<void> exampleFaceMatching() async {
  print('=== Face Matching Example ===\n');

  // Mock matcher (randomized results)
  print('1. Testing MockFaceMatcher:');
  final mockMatcher = MockFaceMatcher(mockSuccessRate: 0.85);
  final mockResult = await mockMatcher.matchFaces(
    FaceMatchInput(selfieBytes: [1, 2, 3], documentPhotoBytes: [4, 5, 6]),
  );
  print('  Passed: ${mockResult.passed}');
  print('  Score: ${(mockResult.score * 100).toStringAsFixed(1)}%\n');

  // Always-pass matcher (for UI development)
  print('2. Testing AlwaysPassFaceMatcher:');
  final alwaysPassMatcher = AlwaysPassFaceMatcher();
  final alwaysPassResult = await alwaysPassMatcher.matchFaces(
    FaceMatchInput(selfieBytes: [1, 2, 3], documentPhotoBytes: [4, 5, 6]),
  );
  print('  Passed: ${alwaysPassResult.passed}');
  print('  Score: ${(alwaysPassResult.score * 100).toStringAsFixed(1)}%\n');

  // Deterministic matcher (for testing)
  print('3. Testing DeterministicFaceMatcher (score=0.85):');
  final deterministicMatcher = DeterministicFaceMatcher(fixedScore: 0.85);
  final deterministicResult = await deterministicMatcher.matchFaces(
    FaceMatchInput(selfieBytes: [1, 2, 3], documentPhotoBytes: [4, 5, 6]),
  );
  print('  Passed: ${deterministicResult.passed}');
  print('  Score: ${(deterministicResult.score * 100).toStringAsFixed(1)}%\n');
}

/// Example: Error handling
Future<void> exampleErrorHandling() async {
  print('=== Error Handling Example ===\n');

  final scanner = ManualPnEntryScanner();

  try {
    // This will fail - invalid personal number
    final result = await scanner.scanManualEntry('invalid');
    if (!result.isValid) {
      print('Validation failed: ${result.errorMessage}');
    }
  } catch (e) {
    if (e is VerificationException) {
      print('VerificationException caught:');
      print('  Type: ${e.type.name}');
      print('  Message: ${e.message}');
    }
  }

  print('\nTesting unimplemented feature:');
  try {
    final nfcScanner = NFCDocumentScanner();
    await nfcScanner.scanDocument(DocumentScanInput());
  } catch (e) {
    if (e is VerificationException) {
      print('Expected error: ${e.message}');
    }
  }
}

/// Example: Integration with backend API
Future<void> exampleBackendIntegration() async {
  print('=== Backend Integration Example ===\n');

  // Perform all verification steps
  final documentScanner = ManualPnEntryScanner();
  final livenessVerifier = AlwaysPassLivenessVerifier();
  final faceMatcher = AlwaysPassFaceMatcher();

  final scanResult = await documentScanner.scanManualEntry('12345678901');
  final livenessResult = await livenessVerifier.verifyLiveness(
    LivenessInput(challengeType: 'blink'),
  );
  final faceMatchResult = await faceMatcher.matchFaces(
    FaceMatchInput(selfieBytes: [1, 2, 3], documentPhotoBytes: [4, 5, 6]),
  );

  // Prepare payload for backend /auth/login-or-enroll endpoint
  final backendPayload = {
    'pnDigits': scanResult.pnDigits,
    'liveness': livenessResult.toJson(),
    'faceMatch': faceMatchResult.toJson(),
    // Optional: demographic data from NFC chip (Phase 1)
    // 'gender': 'M',
    // 'birthYear': 1990,
    // 'regionCodes': ['reg_tbilisi'],
  };

  print('Payload ready for backend:');
  print(backendPayload);
  print('\n// Send to: POST /api/v1/auth/login-or-enroll');
  print('// Response will include: { success, userId, sessionAttestation }');
}

/// Run all examples
void main() async {
  print('╔════════════════════════════════════════════════════════════╗');
  print('║  DTFG Mobile Verification Layer - Example Usage           ║');
  print('╚════════════════════════════════════════════════════════════╝\n');

  await exampleCompleteVerification();
  print('\n${'─' * 60}\n');

  await exampleDocumentScanning();
  print('\n${'─' * 60}\n');

  await exampleLivenessVerification();
  print('\n${'─' * 60}\n');

  await exampleFaceMatching();
  print('\n${'─' * 60}\n');

  await exampleErrorHandling();
  print('\n${'─' * 60}\n');

  await exampleBackendIntegration();
}
