import 'package:flutter/material.dart';
import 'dart:math';
import '../../services/verification/verification_service.dart';
import '../../services/auth_api.dart';
import '../../services/storage_service.dart';
import '../../services/service_locator.dart';
import '../dashboard/dashboard_screen.dart';

/// Step 2: Liveness verification + Face matching
/// NO FOOTER - Full screen enrollment flow
class VerificationScreen extends StatefulWidget {
  final String pnDigits;

  const VerificationScreen({super.key, required this.pnDigits});

  @override
  State<VerificationScreen> createState() => _VerificationScreenState();
}

class _VerificationScreenState extends State<VerificationScreen> {
  final _livenessVerifier = MockLivenessVerifier(mockSuccessRate: 0.8);
  final _faceMatcher = MockFaceMatcher(mockSuccessRate: 0.85);
  final _authApi = ServiceLocator.authApi;
  final _storage = StorageService();

  bool _isLivenessComplete = false;
  bool _isFaceMatchComplete = false;
  bool _isSubmitting = false;

  LivenessResult? _livenessResult;
  FaceMatchResult? _faceMatchResult;

  String? _errorMessage;
  String _currentChallenge = '';

  @override
  void initState() {
    super.initState();
    _startVerification();
  }

  Future<void> _startVerification() async {
    // Step 1: Liveness verification
    await _performLivenessCheck();

    // Step 2: Face matching (if liveness passed)
    if (_livenessResult?.passed == true) {
      await _performFaceMatch();
    }

    // Step 3: Submit to backend (if both passed)
    if (_livenessResult?.passed == true && _faceMatchResult?.passed == true) {
      await _submitToBackend();
    }
  }

  Future<void> _performLivenessCheck() async {
    setState(() {
      _currentChallenge = _livenessVerifier.getRandomChallenge();
    });

    try {
      final result = await _livenessVerifier.verifyLiveness(
        LivenessInput(challengeType: _currentChallenge),
      );

      setState(() {
        _livenessResult = result;
        _isLivenessComplete = true;
      });

      if (!result.passed) {
        setState(() {
          _errorMessage = 'Liveness check failed. Please try again.';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Liveness verification failed: $e';
        _isLivenessComplete = true;
      });
    }
  }

  Future<void> _performFaceMatch() async {
    // Simulate delay for UI feedback
    await Future.delayed(const Duration(milliseconds: 500));

    try {
      // Mock image bytes - in real implementation, this would be actual camera captures
      final selfieBytes = List<int>.generate(100, (i) => Random().nextInt(256));
      final docPhotoBytes = List<int>.generate(
        100,
        (i) => Random().nextInt(256),
      );

      final result = await _faceMatcher.matchFaces(
        FaceMatchInput(
          selfieBytes: selfieBytes,
          documentPhotoBytes: docPhotoBytes,
        ),
      );

      setState(() {
        _faceMatchResult = result;
        _isFaceMatchComplete = true;
      });

      if (!result.passed) {
        setState(() {
          _errorMessage = 'Face match failed. Please try again.';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Face matching failed: $e';
        _isFaceMatchComplete = true;
      });
    }
  }

  Future<void> _submitToBackend() async {
    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      // Call backend login-or-enroll endpoint
      final response = await _authApi.loginOrEnroll(
        pnDigits: widget.pnDigits,
        liveness: _livenessResult!.toJson(),
        faceMatch: _faceMatchResult!.toJson(),
        // Optional: Add demographic data when available (Phase 1)
        // gender: 'M',
        // birthYear: 1990,
        // regionCodes: ['reg_tbilisi'],
      );

      // Store credentials securely (prefer long-lived credential token)
      final credential = response.credentialToken ?? response.sessionAttestation;
      await _storage.saveCredential(credential);
      await _storage.saveUserId(response.userId);
      await _storage.setEnrolled(true); // Mark user as enrolled

      // Update API service with new credential immediately
      ServiceLocator.apiService.setCredential(credential);

      // Navigate to dashboard
      if (mounted) {
        // Remove all previous routes and navigate to dashboard
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (context) => const DashboardScreen()),
          (route) => false,
        );

        // Show success message
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              response.isNewUser
                  ? '✓ Account created successfully!'
                  : '✓ Welcome back!',
            ),
            backgroundColor: Colors.green,
          ),
        );
      }
    } on AuthException catch (e) {
      setState(() {
        _errorMessage = e.message;
        _isSubmitting = false;
      });

      // Show error dialog for specific error codes
      if (e.reasonCode == 'RATE_LIMIT' && mounted) {
        _showRateLimitDialog();
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Authentication failed: $e';
        _isSubmitting = false;
      });
    }
  }

  void _showRateLimitDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Too Many Attempts'),
        content: const Text(
          'Your account has been temporarily locked due to multiple failed attempts. Please try again later.',
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              Navigator.of(context).pop(); // Return to intro
            },
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  Future<void> _retry() async {
    setState(() {
      _isLivenessComplete = false;
      _isFaceMatchComplete = false;
      _isSubmitting = false;
      _livenessResult = null;
      _faceMatchResult = null;
      _errorMessage = null;
    });

    await _startVerification();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // NO BOTTOM NAVIGATION - Enrollment flow
      appBar: AppBar(
        title: const Text('Verification'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 20),

              // Step indicator
              _buildStepIndicator(currentStep: 2, totalSteps: 2),
              const SizedBox(height: 40),

              // Title
              Text(
                'Biometric Verification',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 12),

              // Description
              Text(
                'Verifying your identity...',
                style: Theme.of(
                  context,
                ).textTheme.bodyLarge?.copyWith(color: Colors.grey[600]),
              ),
              const SizedBox(height: 40),

              // Verification steps
              Expanded(
                child: ListView(
                  children: [
                    _buildVerificationStep(
                      icon: Icons.face,
                      title: 'Liveness Check',
                      subtitle:
                          'Challenge: ${_getChallengeLabel(_currentChallenge)}',
                      isComplete: _isLivenessComplete,
                      isPassed: _livenessResult?.passed,
                      score: _livenessResult?.score,
                    ),
                    const SizedBox(height: 16),
                    _buildVerificationStep(
                      icon: Icons.compare_arrows,
                      title: 'Face Match',
                      subtitle: 'Comparing with document photo',
                      isComplete: _isFaceMatchComplete,
                      isPassed: _faceMatchResult?.passed,
                      score: _faceMatchResult?.score,
                    ),
                    const SizedBox(height: 16),
                    _buildVerificationStep(
                      icon: Icons.cloud_upload,
                      title: 'Backend Submission',
                      subtitle: 'Finalizing verification',
                      isComplete: _isSubmitting,
                      isPassed: null, // In progress
                      score: null,
                    ),
                  ],
                ),
              ),

              // Error message
              if (_errorMessage != null)
                Container(
                  padding: const EdgeInsets.all(12),
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: Colors.red[50],
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.red[200]!),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.error_outline, color: Colors.red[700]),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _errorMessage!,
                          style: TextStyle(color: Colors.red[900]),
                        ),
                      ),
                    ],
                  ),
                ),

              // Retry button (shown on error)
              if (_errorMessage != null && !_isSubmitting)
                ElevatedButton(
                  onPressed: _retry,
                  style: ElevatedButton.styleFrom(
                    minimumSize: const Size(double.infinity, 56),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text(
                    'Retry Verification',
                    style: TextStyle(fontSize: 16),
                  ),
                ),

              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildVerificationStep({
    required IconData icon,
    required String title,
    required String subtitle,
    required bool isComplete,
    required bool? isPassed,
    required double? score,
  }) {
    Color statusColor;
    IconData statusIcon;

    if (isPassed == true) {
      statusColor = Colors.green;
      statusIcon = Icons.check_circle;
    } else if (isPassed == false) {
      statusColor = Colors.red;
      statusIcon = Icons.error;
    } else if (isComplete) {
      statusColor = Colors.orange;
      statusIcon = Icons.hourglass_empty;
    } else {
      statusColor = Colors.grey;
      statusIcon = Icons.pending;
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[300]!),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: statusColor.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: statusColor, size: 28),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: TextStyle(fontSize: 14, color: Colors.grey[600]),
                ),
                if (score != null) ...[
                  const SizedBox(height: 8),
                  LinearProgressIndicator(
                    value: score,
                    backgroundColor: Colors.grey[200],
                    valueColor: AlwaysStoppedAnimation<Color>(statusColor),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Score: ${(score * 100).toStringAsFixed(1)}%',
                    style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          if (!isComplete)
            SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(statusColor),
              ),
            )
          else
            Icon(statusIcon, color: statusColor, size: 28),
        ],
      ),
    );
  }

  Widget _buildStepIndicator({
    required int currentStep,
    required int totalSteps,
  }) {
    return Row(
      children: List.generate(totalSteps, (index) {
        final stepNumber = index + 1;
        final isActive = stepNumber == currentStep;
        final isCompleted = stepNumber < currentStep;

        return Expanded(
          child: Container(
            margin: EdgeInsets.only(right: index < totalSteps - 1 ? 8 : 0),
            child: Column(
              children: [
                Container(
                  height: 4,
                  decoration: BoxDecoration(
                    color: isActive || isCompleted
                        ? Theme.of(context).primaryColor
                        : Colors.grey[300],
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Step $stepNumber',
                  style: TextStyle(
                    fontSize: 12,
                    color: isActive
                        ? Theme.of(context).primaryColor
                        : Colors.grey[600],
                    fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
                  ),
                ),
              ],
            ),
          ),
        );
      }),
    );
  }

  String _getChallengeLabel(String challenge) {
    switch (challenge) {
      case 'blink':
        return 'Blink your eyes';
      case 'smile':
        return 'Smile';
      case 'turn_head':
        return 'Turn your head';
      case 'nod':
        return 'Nod your head';
      default:
        return challenge;
    }
  }
}
