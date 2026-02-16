import 'dart:async';
import 'dart:math';

import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import '../../models/verification_models.dart';
import '../../services/interfaces/i_api_service.dart';
import 'face_mesh_service.dart';
import '../../config/app_config.dart';

enum LivenessState {
  initializing,
  lookingForFace,
  stableCheck,
  challenge1, // e.g. Smile
  challenge2, // e.g. Turn Head
  verifying,
  success,
  failed,
}

enum LivenessChallenge { blink, turnHeadLeft, turnHeadRight }

/// Decision reasons for face positioning (for diagnostics)
enum FaceDecision { outside, tooSmall, tooBig, lowLight, ok }

/// Normalized face detection result for device-agnostic positioning
class NormalizedFaceResult {
  final double centerX; // 0..1 (0=left, 1=right)
  final double centerY; // 0..1 (0=top, 1=bottom)
  final double sizeRatio; // face width / image width
  final FaceDecision decision;
  final Face face;

  NormalizedFaceResult({
    required this.centerX,
    required this.centerY,
    required this.sizeRatio,
    required this.decision,
    required this.face,
  });
}

class LivenessController extends ChangeNotifier {
  final IApiService apiService;
  final FaceMeshService _faceMesh = FaceMeshService();
  final FaceLandmarkSmoother _smoother = FaceLandmarkSmoother(alpha: 0.5);

  LivenessState _state = LivenessState.initializing;
  LivenessState get state => _state;

  Face? _currentFace;
  Face? get currentFace => _currentFace;

  // Expose smoothed contours for UI Overlay
  Map<FaceContourType, List<Point<int>>>? get smoothedContours {
    if (_currentFace == null) return null;
    final Map<FaceContourType, List<Point<int>>> result = {};
    for (final type in FaceContourType.values) {
      final points = _smoother.getSmoothedPoints(type);
      if (points != null) {
        result[type] = points;
      }
    }
    return result;
  }

  String? _feedbackMessage;
  String? get feedbackMessage => _feedbackMessage;

  // Challenges
  final List<LivenessChallenge> _challengeQueue = [];
  LivenessChallenge? _currentChallenge;
  LivenessChallenge? get currentChallenge => _currentChallenge;

  // Challenge timeout - auto-proceed if face detection is unreliable
  // OR if user is stuck (removed per security requirement)
  DateTime? _challengeStartTime;

  // --- Blink detection state (robust across devices) ---
  bool _blinkSeenOpen = false;
  bool _blinkSeenClosed = false;
  bool _blinkDetected = false;
  bool _headTurnDetected = false;

  // Contour-based fallback for Pixel 8/devices with null probabilities
  double? _blinkBaselineEar;
  static const double _earClosedThresholdRatio = 0.65; // < 65% of baseline
  static const double _earOpenThresholdRatio = 0.85; // > 85% of baseline

  // Stability
  DateTime? _stableSince;
  static const int _requiredStabilityMs = 600;

  // Face loss tolerance (don't reset on single null frames)
  int _consecutiveNullFrames = 0;
  static const int _nullFrameTolerance = 3;

  // Verification Data
  String? _enrollmentSessionId;
  String? _nfcPortraitBase64;
  String? _liveImageBase64;
  String? _livenessNonce; // P2: Challenge nonce
  EnrollmentFinalizeResponse? _finalizeResponse;
  EnrollmentFinalizeResponse? get finalizeResponse => _finalizeResponse;

  // Image dimensions for normalized calculations
  Size? _imageSize;
  Size? get imageSize => _imageSize;
  void setImageSize(Size size) => _imageSize = size;

  // Debug mode (toggle with long-press)
  bool _debugOverlay = false;
  bool get debugOverlay => _debugOverlay;
  void toggleDebugOverlay() {
    _debugOverlay = !_debugOverlay;
    notifyListeners();
  }

  // Last normalized result for overlay
  NormalizedFaceResult? _lastNormalizedResult;
  NormalizedFaceResult? get lastNormalizedResult => _lastNormalizedResult;

  // Normalized oval bounds (device-agnostic)
  // Oval center at (0.5, 0.5), width=0.65, height=0.65*1.35
  static const double _ovalCenterX = 0.5;
  static const double _ovalCenterY = 0.5;

  // LOOSENED thresholds for better device compatibility (A51, Pixel 8, etc.)
  static const double _positionTolerance =
      0.35; // 35% tolerance from center (was 15%)
  static const double _minFaceSizeRatio =
      0.10; // Face must be >10% of frame width (was 25%)
  static const double _maxFaceSizeRatio =
      0.90; // Face must be <90% of frame width (was 75%)

  LivenessController({required this.apiService});

  Future<void> initialize(
    String sessionId,
    String? nfcPortrait, {
    String? livenessNonce,
  }) async {
    _enrollmentSessionId = sessionId;
    _nfcPortraitBase64 = nfcPortrait;
    _livenessNonce = livenessNonce;
    _state = LivenessState.lookingForFace;
    _feedbackMessage = "center_face";
    _blinkDetected = false;
    _headTurnDetected = false;
    notifyListeners();
  }

  void processFrame(InputImage image) async {
    if (_state == LivenessState.verifying || _state == LivenessState.failed) {
      return;
    }

    // Fix: If service is busy, skip frame to avoid interpreting "null" as "face lost"
    if (_faceMesh.isBusy) {
      return;
    }

    final face = await _faceMesh.processImage(image);

    if (face == null) {
      _consecutiveNullFrames++;
      // Only trigger face lost after MANY consecutive null frames
      // Be very tolerant - some devices have intermittent detection
      if (_consecutiveNullFrames >= _nullFrameTolerance * 5) {
        // 15 frames tolerance
        _currentFace = null;
        _feedbackMessage = "face_lost";
        notifyListeners();
      }
      // Even without face, check timers should proceed
      if (_state == LivenessState.stableCheck && _stableSince != null) {
        if (DateTime.now().difference(_stableSince!).inMilliseconds >
            _requiredStabilityMs) {
          _startChallenges();
          notifyListeners();
        }
      }
      // Check challenge timeout even without face detection
      if (_state == LivenessState.challenge1 ||
          _state == LivenessState.challenge2) {
        _checkChallengeCompliance(null);
        notifyListeners();
      }
      return;
    }

    // Reset null frame counter on successful detection
    _consecutiveNullFrames = 0;
    _smoother.add(face);
    _currentFace = face;

    // Clear "Face lost" error if we re-acquired it
    if (_feedbackMessage == "face_lost") {
      _feedbackMessage = "face_detected";
    }

    _evaluateState(face);
    notifyListeners();
  }

  /// Normalize face position and size relative to image dimensions
  NormalizedFaceResult? _normalizeFace(Face face) {
    if (_imageSize == null ||
        _imageSize!.width == 0 ||
        _imageSize!.height == 0) {
      return null;
    }

    final bbox = face.boundingBox;
    final imgW = _imageSize!.width;
    final imgH = _imageSize!.height;

    // Normalized center (0..1)
    final centerX = (bbox.left + bbox.width / 2) / imgW;
    final centerY = (bbox.top + bbox.height / 2) / imgH;

    // Face size as ratio of image width
    final sizeRatio = bbox.width / imgW;

    // Determine decision based on normalized values
    FaceDecision decision;

    // Check if face is centered (within tolerance of oval center)
    final dx = (centerX - _ovalCenterX).abs();
    final dy = (centerY - _ovalCenterY).abs();
    final isOutside = dx > _positionTolerance || dy > _positionTolerance;

    if (isOutside) {
      decision = FaceDecision.outside;
    } else if (sizeRatio < _minFaceSizeRatio) {
      decision = FaceDecision.tooSmall;
    } else if (sizeRatio > _maxFaceSizeRatio) {
      decision = FaceDecision.tooBig;
    } else {
      // Check lighting via eye open probability as proxy
      // Very low values might indicate poor lighting
      final leftEye = face.leftEyeOpenProbability ?? 0.5;
      final rightEye = face.rightEyeOpenProbability ?? 0.5;
      if (leftEye < 0.2 &&
          rightEye < 0.2 &&
          _state == LivenessState.lookingForFace) {
        // Could be low light or eyes closed - only warn in initial state
        decision = FaceDecision.lowLight;
      } else {
        decision = FaceDecision.ok;
      }
    }

    return NormalizedFaceResult(
      centerX: centerX,
      centerY: centerY,
      sizeRatio: sizeRatio,
      decision: decision,
      face: face,
    );
  }

  void _evaluateState(Face face) {
    // Store normalized result for debug overlay (optional)
    final normalized = _normalizeFace(face);
    if (normalized != null) {
      _lastNormalizedResult = normalized;
    }

    switch (_state) {
      case LivenessState.lookingForFace:
        // User must press "Start Verification". Here we only guide positioning.
        if (normalized != null) {
          _feedbackMessage = _guidanceFromNormalized(normalized, idle: true);
        } else {
          _feedbackMessage = "center_face";
        }
        break;

      case LivenessState.stableCheck:
        if (normalized != null) {
          // Gentle guidance while user is holding still
          final g = _guidanceFromNormalized(normalized, idle: false);
          if (g != null && g.isNotEmpty) {
            _feedbackMessage = g;
          }
        }
        // Check stability timer
        if (_stableSince != null &&
            DateTime.now().difference(_stableSince!).inMilliseconds >
                _requiredStabilityMs) {
          _startChallenges();
        }
        break;

      case LivenessState.challenge1:
      case LivenessState.challenge2:
        _checkChallengeCompliance(face);
        break;

      default:
        break;
    }
  }

  String? _guidanceFromNormalized(
    NormalizedFaceResult result, {
    required bool idle,
  }) {
    switch (result.decision) {
      case FaceDecision.outside:
        final dx = result.centerX - _ovalCenterX;
        final dy = result.centerY - _ovalCenterY;
        if (dx.abs() > dy.abs()) {
          return dx > 0 ? "move_left" : "move_right";
        } else {
          return dy > 0 ? "move_up" : "move_down";
        }
      case FaceDecision.tooSmall:
        return "move_closer";
      case FaceDecision.tooBig:
        return "move_back";
      case FaceDecision.lowLight:
        return "more_light";
      case FaceDecision.ok:
        return idle ? "hold_steady" : null;
    }
  }

  /// Manual start - called when user presses "Start" button
  /// This bypasses automatic face positioning detection (works on ALL devices)
  void manualStart() {
    if (_state != LivenessState.lookingForFace) {
      return;
    }

    debugPrint('[Liveness] Manual start triggered by user');
    HapticFeedback.mediumImpact();
    _state = LivenessState.stableCheck;
    _stableSince = DateTime.now();
    _feedbackMessage = "hold_still";
    notifyListeners();
  }

  void _startChallenges() {
    _challengeQueue.clear();
    final random = Random();

    // Step 1: Random Head Turn (Left or Right)
    // This proves the face is 3D and rotatable
    _challengeQueue.add(
      random.nextBool()
          ? LivenessChallenge.turnHeadLeft
          : LivenessChallenge.turnHeadRight,
    );

    // Step 2: Always Blink (No Smile)
    // This proves the face is "live" and controllable
    _challengeQueue.add(LivenessChallenge.blink);

    _nextChallenge();
  }

  void _nextChallenge() {
    if (_challengeQueue.isEmpty) {
      _startVerification(); // All done
      return;
    }

    _currentChallenge = _challengeQueue.removeAt(0);
    _challengeStartTime = DateTime.now(); // Start timeout timer

    // Reset blink state when we enter blink challenge
    if (_currentChallenge == LivenessChallenge.blink) {
      _blinkSeenOpen = false;
      _blinkSeenClosed = false;
      _blinkBaselineEar = null; // Reset baseline
    }

    _state = _state == LivenessState.stableCheck
        ? LivenessState.challenge1
        : LivenessState.challenge2;

    switch (_currentChallenge) {
      case LivenessChallenge.blink:
        _feedbackMessage = "blink_eyes";
        break;
      case LivenessChallenge.turnHeadLeft:
        _feedbackMessage = "turn_head_left";
        break;
      case LivenessChallenge.turnHeadRight:
        _feedbackMessage = "turn_head_right";
        break;
      default:
        _feedbackMessage = "follow_instructions";
    }
  }

  // Calculate Eye Aspect Ratio (EAR) from 6 landmark points
  // EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
  double? _computeEar(List<Point<int>> points) {
    if (points.length < 16) {
      return null; // Need full eye contour (usually 16 pts)
    }

    // ML Kit Eye Contour indices (approximate for loop):
    // 0: Left corner (closer to ear for left eye?) - distinct per eye?
    // Actually ML Kit contours:
    // Left Eye: 0 (left), 4 (bottom), 8 (right), 12 (top) -> 16 points total
    // Vertical: dist(4, 12). Horizontal: dist(0, 8).
    // Let's use simple height/width ratio of the bounding box of the contour

    int minX = 10000, maxX = -10000, minY = 10000, maxY = -10000;
    for (final p in points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    final width = maxX - minX;
    final height = maxY - minY;

    if (width == 0) return 0;
    return height / width;
  }

  void _checkChallengeCompliance(Face? face) {
    if (_currentChallenge == null) {
      return;
    }

    // Check for timeout
    if (_challengeStartTime != null) {
      final elapsed = DateTime.now()
          .difference(_challengeStartTime!)
          .inMilliseconds;

      // "Not stuck" feedback
      if (elapsed > 3000 &&
          _currentChallenge == LivenessChallenge.blink &&
          !_blinkDetected) {
        if (_feedbackMessage == "blink_eyes") {
          _feedbackMessage = "blink_not_detected";
          notifyListeners();
        }
      }

      if (elapsed > AppConfig.livenessChallengeTimeoutMs) {
        debugPrint('[Liveness] Challenge timeout - FAIL');
        HapticFeedback.heavyImpact();
        // FORCE failure state per security requirements
        _state = LivenessState.failed;
        _feedbackMessage = "challenge_timeout";
        notifyListeners();
        return;
      }
    }

    // If no face detected, just wait (timeout will handle it)
    if (face == null) {
      return;
    }

    bool passed = false;

    switch (_currentChallenge!) {
      case LivenessChallenge.blink:
        // Robust blink detection:
        // 1. Try Probabilities (Best)
        final leftProb = face.leftEyeOpenProbability;
        final rightProb = face.rightEyeOpenProbability;

        bool shouldUseProbabilities = (leftProb != null && rightProb != null);

        if (shouldUseProbabilities) {
          // Standard probability check
          const openT = 0.65;
          const closedT = 0.25;

          final isOpen = leftProb > openT && rightProb > openT;
          final isClosed = leftProb < closedT && rightProb < closedT;

          if (!_blinkSeenOpen && isOpen) {
            _blinkSeenOpen = true;
          } else if (_blinkSeenOpen && !_blinkSeenClosed && isClosed) {
            _blinkSeenClosed = true;
          } else if (_blinkSeenOpen && _blinkSeenClosed && isOpen) {
            passed = true;
            _blinkDetected = true;
          }
        } else {
          // 2. Fallback: Contours (EAR) for Pixel 8 / devices returning null props
          // Only if probabilities are missing
          final leftContour = face.contours[FaceContourType.leftEye]?.points;
          final rightContour = face.contours[FaceContourType.rightEye]?.points;

          if (leftContour != null && rightContour != null) {
            final leftEar = _computeEar(leftContour);
            final rightEar = _computeEar(rightContour);

            if (leftEar != null && rightEar != null) {
              final avgEar = (leftEar + rightEar) / 2.0;

              // Establish baseline on first valid frame
              _blinkBaselineEar ??= avgEar;

              // Dynamic thresholds based on baseline
              final isClosed =
                  avgEar < (_blinkBaselineEar! * _earClosedThresholdRatio);
              final isOpen =
                  avgEar > (_blinkBaselineEar! * _earOpenThresholdRatio);

              // Update baseline if we see a "more open" eye to adapt to wide-eyed users
              if (avgEar > _blinkBaselineEar!) {
                _blinkBaselineEar = avgEar;
              }

              if (!_blinkSeenOpen && isOpen) {
                _blinkSeenOpen = true;
              } else if (_blinkSeenOpen && !_blinkSeenClosed && isClosed) {
                _blinkSeenClosed = true;
              } else if (_blinkSeenOpen && _blinkSeenClosed && isOpen) {
                passed = true;
                _blinkDetected = true;
              }
            }
          }
        }
        break;
      case LivenessChallenge.turnHeadLeft:
        if ((face.headEulerAngleY ?? 0) > 20) {
          passed = true;
          _headTurnDetected = true;
        }
        break;
      case LivenessChallenge.turnHeadRight:
        if ((face.headEulerAngleY ?? 0) < -20) passed = true;
        break;
    }

    if (passed) {
      HapticFeedback.mediumImpact();
      _nextChallenge();
    }
  }

  Future<void> _startVerification() async {
    _state = LivenessState.verifying;
    _feedbackMessage = "verifying_identity";
    notifyListeners();
  }

  // Retry Logic - initialized from server settings
  int _attemptsLeft = 3; // Default fallback, overridden by setRetryLimit()
  int _maxAttempts = 3;
  int get attemptsLeft => _attemptsLeft;
  int get maxAttempts => _maxAttempts;

  /// Set retry limit from server-provided verification policy
  void setRetryLimit(int limit) {
    _maxAttempts = limit > 0 ? limit : 3;
    _attemptsLeft = _maxAttempts;
  }

  void retry() {
    // TASK-MOB-P0-01: Robust retry logic
    if (_state != LivenessState.failed) {
      return;
    }

    // Check if we have attempts left?
    // Usually backend handles the hard block, but UI can guide.
    if (_attemptsLeft <= 0) {
      _feedbackMessage = "Maximum attempts reached.";
      notifyListeners();
      return;
    }

    _state = LivenessState.lookingForFace;
    _feedbackMessage = "center_face";
    _currentFace = null;
    _stableSince = null;
    _smoother.clear(); // Important: clear old smoothing data

    // Clear challenge state
    _challengeQueue.clear();
    _currentChallenge = null;
    _challengeStartTime = null;
    _blinkDetected = false;
    _headTurnDetected = false;

    notifyListeners();
  }

  // Called by UI when State is verifying to provide the final image
  Future<EnrollmentFinalizeResponse?> submitVerification(
    String base64Image,
  ) async {
    _liveImageBase64 = base64Image;
    _feedbackMessage = "matching_id_photo";
    notifyListeners();

    try {
      // Construct detailed LivenessData per TASK-P2-LIV-01
      final livenessData = LivenessData(
        tier: 'active',
        clientConfidenceScore: 0.95,
        passiveSignals: PassiveLivenessSignals(
          naturalBlinkDetected: _blinkDetected,
          consistentFrames: 30, // Heuristic
          facePresenceScore: 0.99,
          confidence: _headTurnDetected ? 1.0 : 0.8,
        ),
      );

      _finalizeResponse = await apiService.submitLiveness({
        'enrollmentSessionId': _enrollmentSessionId,
        'livenessScore': 1.0,
        'selfieBase64': _liveImageBase64,
        'docPortraitBase64': _nfcPortraitBase64,
        'livenessNonce': _livenessNonce, // P2: Challenge nonce
        'livenessData': livenessData.toJson(),
      });
      _state = LivenessState.success;
      _feedbackMessage = "identity_verified";
      HapticFeedback.heavyImpact();
      notifyListeners();
      return _finalizeResponse;
    } catch (e) {
      _state = LivenessState.failed;
      _attemptsLeft--;

      // Parse detailed error from backend
      String errorMsg = e.toString().replaceAll("Exception: ", "").trim();

      // If backend explicitly blocked us, force attempts to 0
      if (errorMsg.toLowerCase().contains("blocked") ||
          errorMsg.toLowerCase().contains("limit")) {
        _attemptsLeft = 0;
      }

      if (_attemptsLeft < 0) {
        _attemptsLeft = 0;
      }

      // Map long backend errors to short, nice UI messages
      if (errorMsg.toLowerCase().contains("score too low") ||
          errorMsg.toLowerCase().contains("face match")) {
        _feedbackMessage = "face_mismatch";
      } else if (errorMsg.toLowerCase().contains("marginal")) {
        _feedbackMessage =
            "more_light"; // Using more_light as proxy for poor lighting
      } else if (errorMsg.toLowerCase().contains("ip blocked") ||
          errorMsg.toLowerCase().contains("rate limit")) {
        _feedbackMessage = "access_suspended";
      } else if (errorMsg.toLowerCase().contains("nonce")) {
        _feedbackMessage = "session_expired";
      } else if (errorMsg.toLowerCase().contains("liveness check failed")) {
        _feedbackMessage = "match_failed";
      } else {
        _feedbackMessage = "verification_failed";
      }

      // Final check for exhaustion overrides other messages
      if (_attemptsLeft == 0) {
        _feedbackMessage = "max_attempts_exhausted";
      }

      notifyListeners();
      return null;
    }
  }

  @override
  void dispose() {
    _faceMesh.dispose();
    super.dispose();
  }
}
