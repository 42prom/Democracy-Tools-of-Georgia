import 'dart:math';
import 'verification_models.dart';

/// Abstract interface for liveness verification
/// Implementations can use camera-based ML models or biometric SDKs
abstract class LivenessVerifier {
  /// Perform liveness verification check
  ///
  /// Returns [LivenessResult] with pass/fail and score
  /// Throws [VerificationException] on failure
  Future<LivenessResult> verifyLiveness(LivenessInput input);

  /// Get available challenge types
  List<String> getSupportedChallenges();

  /// Get random challenge for user to perform
  String getRandomChallenge();

  /// Get verifier capabilities
  LivenessVerifierCapabilities getCapabilities();
}

/// Capabilities supported by a liveness verifier
class LivenessVerifierCapabilities {
  final bool supportsPassiveLiveness; // Passive detection without user action
  final bool supportsActiveLiveness; // Requires user challenges (blink, smile, etc)
  final bool requiresCamera;
  final List<String> supportedChallenges;

  LivenessVerifierCapabilities({
    this.supportsPassiveLiveness = false,
    this.supportsActiveLiveness = true,
    this.requiresCamera = true,
    this.supportedChallenges = const ['blink', 'smile', 'turn_head'],
  });
}

/// Mock implementation for Phase 0 development
/// Simulates liveness checks with randomized results
class MockLivenessVerifier implements LivenessVerifier {
  final Random _random = Random();

  /// Success rate for mock verification (0.0 to 1.0)
  /// Set to 0.8 for realistic testing (80% pass rate)
  final double mockSuccessRate;

  /// Minimum score for passing (0.0 to 1.0)
  final double passingThreshold;

  MockLivenessVerifier({
    this.mockSuccessRate = 0.8,
    this.passingThreshold = 0.7,
  });

  @override
  Future<LivenessResult> verifyLiveness(LivenessInput input) async {
    // Simulate processing time (realistic liveness check takes 2-5 seconds)
    final processingTime = 2000 + _random.nextInt(3000);
    await Future.delayed(Duration(milliseconds: processingTime));

    // Generate random score (biased toward success)
    final score = _generateMockScore();

    // Determine if passed
    final passed = score >= passingThreshold;

    return LivenessResult(
      passed: passed,
      score: score,
      challenge: input.challengeType,
      errorMessage: passed ? null : 'Liveness verification failed - please try again',
    );
  }

  /// Generate realistic mock score with some randomness
  double _generateMockScore() {
    // 80% chance of high score (0.7-1.0), 20% chance of low score (0.0-0.7)
    if (_random.nextDouble() < mockSuccessRate) {
      // Success range: 0.7 to 1.0
      return 0.7 + (_random.nextDouble() * 0.3);
    } else {
      // Failure range: 0.0 to 0.7
      return _random.nextDouble() * 0.7;
    }
  }

  @override
  List<String> getSupportedChallenges() {
    return ['blink', 'smile', 'turn_head', 'nod'];
  }

  @override
  String getRandomChallenge() {
    final challenges = getSupportedChallenges();
    return challenges[_random.nextInt(challenges.length)];
  }

  @override
  LivenessVerifierCapabilities getCapabilities() {
    return LivenessVerifierCapabilities(
      supportsPassiveLiveness: false,
      supportsActiveLiveness: true,
      requiresCamera: true,
      supportedChallenges: getSupportedChallenges(),
    );
  }
}

/// Always-pass mock for development testing
/// Useful when you want to skip liveness checks during UI development
class AlwaysPassLivenessVerifier implements LivenessVerifier {
  @override
  Future<LivenessResult> verifyLiveness(LivenessInput input) async {
    // Quick simulation
    await Future.delayed(const Duration(milliseconds: 500));

    return LivenessResult(
      passed: true,
      score: 0.95,
      challenge: input.challengeType,
    );
  }

  @override
  List<String> getSupportedChallenges() {
    return ['blink'];
  }

  @override
  String getRandomChallenge() {
    return 'blink';
  }

  @override
  LivenessVerifierCapabilities getCapabilities() {
    return LivenessVerifierCapabilities(
      supportsPassiveLiveness: true,
      supportsActiveLiveness: false,
      requiresCamera: false,
      supportedChallenges: ['blink'],
    );
  }
}

/// Placeholder for future real ML-based liveness implementation
/// Will integrate with FaceTec, iProov, or similar SDK in Phase 1
class MLLivenessVerifier implements LivenessVerifier {
  @override
  Future<LivenessResult> verifyLiveness(LivenessInput input) async {
    throw VerificationException(
      type: VerificationErrorType.unknownError,
      message: 'ML liveness verification not yet implemented - use MockLivenessVerifier for MVP',
    );
  }

  @override
  List<String> getSupportedChallenges() {
    return ['passive_detection'];
  }

  @override
  String getRandomChallenge() {
    return 'passive_detection';
  }

  @override
  LivenessVerifierCapabilities getCapabilities() {
    return LivenessVerifierCapabilities(
      supportsPassiveLiveness: true,
      supportsActiveLiveness: true,
      requiresCamera: true,
      supportedChallenges: ['passive_detection', 'blink', 'smile', 'turn_head'],
    );
  }
}
