import 'dart:math';
import 'verification_models.dart';

/// Abstract interface for face matching
/// Compares selfie against document photo (from NFC chip or scan)
abstract class FaceMatcher {
  /// Match face from selfie against document photo
  ///
  /// Returns [FaceMatchResult] with pass/fail and similarity score
  /// Throws [VerificationException] on failure
  Future<FaceMatchResult> matchFaces(FaceMatchInput input);

  /// Get minimum similarity threshold for passing
  double getPassingThreshold();

  /// Get matcher capabilities
  FaceMatcherCapabilities getCapabilities();
}

/// Capabilities supported by a face matcher
class FaceMatcherCapabilities {
  final bool supportsLiveComparison;
  final bool supportsPhotoComparison;
  final double minConfidenceScore;
  final double maxConfidenceScore;

  FaceMatcherCapabilities({
    this.supportsLiveComparison = true,
    this.supportsPhotoComparison = true,
    this.minConfidenceScore = 0.0,
    this.maxConfidenceScore = 1.0,
  });
}

/// Mock implementation for Phase 0 development
/// Simulates face matching with randomized results
class MockFaceMatcher implements FaceMatcher {
  final Random _random = Random();

  /// Success rate for mock verification (0.0 to 1.0)
  /// Set to 0.85 for realistic testing (85% pass rate)
  final double mockSuccessRate;

  /// Minimum score for passing (0.0 to 1.0)
  final double passingThreshold;

  MockFaceMatcher({
    this.mockSuccessRate = 0.85,
    this.passingThreshold = 0.75,
  });

  @override
  Future<FaceMatchResult> matchFaces(FaceMatchInput input) async {
    // Validate inputs
    if (input.selfieBytes.isEmpty) {
      throw VerificationException(
        type: VerificationErrorType.unknownError,
        message: 'Selfie image is required',
      );
    }

    if (input.documentPhotoBytes.isEmpty) {
      throw VerificationException(
        type: VerificationErrorType.unknownError,
        message: 'Document photo is required',
      );
    }

    // Simulate processing time (realistic face matching takes 1-3 seconds)
    final processingTime = 1000 + _random.nextInt(2000);
    await Future.delayed(Duration(milliseconds: processingTime));

    // Generate random similarity score (biased toward success)
    final score = _generateMockScore();

    // Determine if passed
    final passed = score >= passingThreshold;

    return FaceMatchResult(
      passed: passed,
      score: score,
      errorMessage: passed ? null : 'Face match failed - photos do not match sufficiently',
    );
  }

  /// Generate realistic mock score with some randomness
  double _generateMockScore() {
    // 85% chance of high score (0.75-1.0), 15% chance of low score (0.0-0.75)
    if (_random.nextDouble() < mockSuccessRate) {
      // Success range: 0.75 to 1.0
      return 0.75 + (_random.nextDouble() * 0.25);
    } else {
      // Failure range: 0.0 to 0.75
      return _random.nextDouble() * 0.75;
    }
  }

  @override
  double getPassingThreshold() {
    return passingThreshold;
  }

  @override
  FaceMatcherCapabilities getCapabilities() {
    return FaceMatcherCapabilities(
      supportsLiveComparison: true,
      supportsPhotoComparison: true,
      minConfidenceScore: 0.0,
      maxConfidenceScore: 1.0,
    );
  }
}

/// Always-pass mock for development testing
/// Useful when you want to skip face matching during UI development
class AlwaysPassFaceMatcher implements FaceMatcher {
  @override
  Future<FaceMatchResult> matchFaces(FaceMatchInput input) async {
    // Quick simulation
    await Future.delayed(const Duration(milliseconds: 500));

    return FaceMatchResult(
      passed: true,
      score: 0.92,
    );
  }

  @override
  double getPassingThreshold() {
    return 0.75;
  }

  @override
  FaceMatcherCapabilities getCapabilities() {
    return FaceMatcherCapabilities(
      supportsLiveComparison: true,
      supportsPhotoComparison: true,
      minConfidenceScore: 0.0,
      maxConfidenceScore: 1.0,
    );
  }
}

/// Deterministic mock for testing
/// Always returns the same score for predictable testing
class DeterministicFaceMatcher implements FaceMatcher {
  final double fixedScore;

  DeterministicFaceMatcher({
    this.fixedScore = 0.85,
  });

  @override
  Future<FaceMatchResult> matchFaces(FaceMatchInput input) async {
    await Future.delayed(const Duration(milliseconds: 500));

    return FaceMatchResult(
      passed: fixedScore >= getPassingThreshold(),
      score: fixedScore,
    );
  }

  @override
  double getPassingThreshold() {
    return 0.75;
  }

  @override
  FaceMatcherCapabilities getCapabilities() {
    return FaceMatcherCapabilities(
      supportsLiveComparison: true,
      supportsPhotoComparison: true,
      minConfidenceScore: 0.0,
      maxConfidenceScore: 1.0,
    );
  }
}

/// Placeholder for future real ML-based face matching implementation
/// Will integrate with AWS Rekognition, Azure Face API, or similar in Phase 1
class MLFaceMatcher implements FaceMatcher {
  @override
  Future<FaceMatchResult> matchFaces(FaceMatchInput input) async {
    throw VerificationException(
      type: VerificationErrorType.unknownError,
      message: 'ML face matching not yet implemented - use MockFaceMatcher for MVP',
    );
  }

  @override
  double getPassingThreshold() {
    return 0.75;
  }

  @override
  FaceMatcherCapabilities getCapabilities() {
    return FaceMatcherCapabilities(
      supportsLiveComparison: true,
      supportsPhotoComparison: true,
      minConfidenceScore: 0.0,
      maxConfidenceScore: 1.0,
    );
  }
}
