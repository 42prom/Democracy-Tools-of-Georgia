import 'package:flutter/material.dart';
import '../../services/interfaces/i_api_service.dart';
import '../../services/service_locator.dart';
import '../../services/storage_service.dart';
import '../dashboard/dashboard_screen.dart';

class LivenessScreen extends StatefulWidget {
  const LivenessScreen({super.key});

  @override
  State<LivenessScreen> createState() => _LivenessScreenState();
}

class _LivenessScreenState extends State<LivenessScreen>
    with SingleTickerProviderStateMixin {
  LivenessStatus _status = LivenessStatus.moveCloser;
  late AnimationController _animationController;
  final IApiService _apiService = ServiceLocator.apiService;
  final StorageService _storageService = StorageService();

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );

    _startLiveness();
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  void _startLiveness() async {
    // Simulate liveness check (Phase 0 - mock)
    await Future.delayed(const Duration(seconds: 2));

    if (mounted) {
      setState(() => _status = LivenessStatus.smile);
    }

    await Future.delayed(const Duration(seconds: 2));

    if (mounted) {
      setState(() => _status = LivenessStatus.success);
      _animationController.forward();

      // Mock enrollment
      final credential = await _apiService.mockEnrollment();
      _apiService.setCredential(credential);
      await _storageService.saveCredential(credential);
      await _storageService.setEnrolled(true);

      await Future.delayed(const Duration(seconds: 2));

      if (mounted) {
        // Navigate to dashboard (with bottom nav footer)
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(
            builder: (context) => const DashboardScreen(),
          ),
          (route) => false,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Liveness Check'),
      ),
      body: SafeArea(
        child: Stack(
          children: [
            // Camera preview placeholder (Phase 0 - dark background)
            Container(
              color: Colors.black,
              child: Center(
                child: CustomPaint(
                  size: const Size(280, 380),
                  painter: OvalFramePainter(
                    color: _status == LivenessStatus.success
                        ? Colors.green
                        : Theme.of(context).primaryColor,
                  ),
                ),
              ),
            ),
            // Text overlay
            Positioned(
              top: 80,
              left: 0,
              right: 0,
              child: Text(
                _getStatusText(),
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      shadows: [
                        const Shadow(
                          blurRadius: 4,
                          color: Colors.black,
                        ),
                      ],
                    ),
                textAlign: TextAlign.center,
              ),
            ),
            // Success checkmark animation
            if (_status == LivenessStatus.success)
              Center(
                child: ScaleTransition(
                  scale: _animationController,
                  child: const Icon(
                    Icons.check_circle,
                    size: 120,
                    color: Colors.green,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  String _getStatusText() {
    switch (_status) {
      case LivenessStatus.moveCloser:
        return 'Move closer';
      case LivenessStatus.smile:
        return 'Smile';
      case LivenessStatus.success:
        return 'Verified!';
    }
  }
}

enum LivenessStatus { moveCloser, smile, success }

class OvalFramePainter extends CustomPainter {
  final Color color;

  OvalFramePainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3;

    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(size.width / 2, size.height / 2),
        width: size.width,
        height: size.height,
      ),
      paint,
    );
  }

  @override
  bool shouldRepaint(OvalFramePainter oldDelegate) => color != oldDelegate.color;
}
