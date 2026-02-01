/// Shared data models for verification services
/// These models are used across all verification components
library;

/// Result from document scanning operation
class DocumentScanResult {
  /// Personal number extracted (11 digits for Georgian ID)
  final String pnDigits;

  /// Confidence score (0.0 to 1.0)
  final double confidence;

  /// Local reference to captured document photo (optional)
  /// NOTE: Photo NOT sent to server - only kept locally for UI feedback
  final String? docPhotoLocalRef;

  /// Timestamp when scan was performed
  final DateTime timestamp;

  /// Whether the scan was successful
  final bool isValid;

  /// Error message if scan failed
  final String? errorMessage;

  DocumentScanResult({
    required this.pnDigits,
    required this.confidence,
    this.docPhotoLocalRef,
    DateTime? timestamp,
    this.isValid = true,
    this.errorMessage,
  }) : timestamp = timestamp ?? DateTime.now();

  Map<String, dynamic> toJson() => {
    'pnDigits': pnDigits,
    'confidence': confidence,
    'docPhotoLocalRef': docPhotoLocalRef,
    'timestamp': timestamp.toIso8601String(),
    'isValid': isValid,
    'errorMessage': errorMessage,
  };
}

/// Result from liveness verification check
class LivenessResult {
  /// Whether liveness check passed
  final bool passed;

  /// Liveness score (0.0 to 1.0)
  final double score;

  /// Challenge type used (e.g., "blink", "smile", "turn_head")
  final String challenge;

  /// Timestamp when check was performed
  final DateTime timestamp;

  /// Error message if check failed
  final String? errorMessage;

  LivenessResult({
    required this.passed,
    required this.score,
    required this.challenge,
    DateTime? timestamp,
    this.errorMessage,
  }) : timestamp = timestamp ?? DateTime.now();

  Map<String, dynamic> toJson() => {
    'passed': passed,
    'score': score,
    'challenge': challenge,
    'timestamp': timestamp.toIso8601String(),
    'errorMessage': errorMessage,
  };
}

/// Result from face matching operation
class FaceMatchResult {
  /// Whether face match passed
  final bool passed;

  /// Face match score (0.0 to 1.0)
  final double score;

  /// Timestamp when match was performed
  final DateTime timestamp;

  /// Error message if match failed
  final String? errorMessage;

  FaceMatchResult({
    required this.passed,
    required this.score,
    DateTime? timestamp,
    this.errorMessage,
  }) : timestamp = timestamp ?? DateTime.now();

  Map<String, dynamic> toJson() => {
    'passed': passed,
    'score': score,
    'timestamp': timestamp.toIso8601String(),
    'errorMessage': errorMessage,
  };
}

/// Input for document scanning
class DocumentScanInput {
  /// Optional: Camera capture bytes
  final List<int>? imageBytes;

  /// Optional: Manual entry mode flag
  final bool manualEntry;

  DocumentScanInput({this.imageBytes, this.manualEntry = false});
}

/// Input for liveness verification
class LivenessInput {
  /// Challenge type to perform
  final String challengeType;

  /// Camera capture for verification
  final List<int>? videoBytes;

  LivenessInput({required this.challengeType, this.videoBytes});
}

/// Input for face matching
class FaceMatchInput {
  /// Selfie capture bytes
  final List<int> selfieBytes;

  /// Document photo bytes (from NFC chip or document scan)
  final List<int> documentPhotoBytes;

  FaceMatchInput({required this.selfieBytes, required this.documentPhotoBytes});
}

/// Verification error types
enum VerificationErrorType {
  invalidDocument,
  invalidPersonalNumber,
  cameraPermissionDenied,
  livenessCheckFailed,
  faceMatchFailed,
  networkError,
  unknownError,
}

/// Exception thrown during verification
class VerificationException implements Exception {
  final VerificationErrorType type;
  final String message;

  VerificationException({required this.type, required this.message});

  @override
  String toString() => 'VerificationException: $message (${type.name})';
}
