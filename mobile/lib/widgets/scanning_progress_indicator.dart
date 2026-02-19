import 'package:flutter/material.dart';

/// Custom scanning progress indicator with filling animation
/// Shows a pulsating circle that fills with green color
class ScanningProgressIndicator extends StatefulWidget {
  const ScanningProgressIndicator({
    super.key,
    this.size = 120.0,
  });

  final double size;

  @override
  State<ScanningProgressIndicator> createState() =>
      _ScanningProgressIndicatorState();
}

class _ScanningProgressIndicatorState extends State<ScanningProgressIndicator>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _opacityAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: false);

    _scaleAnimation = Tween<double>(begin: 0.8, end: 1.2).animate(
      CurvedAnimation(
        parent: _controller,
        curve: Curves.easeInOut,
      ),
    );

    _opacityAnimation = Tween<double>(begin: 0.3, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: Curves.easeInOut,
      ),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          return Stack(
            alignment: Alignment.center,
            children: [
              // Outer pulsating circle
              Transform.scale(
                scale: _scaleAnimation.value,
                child: Container(
                  width: widget.size,
                  height: widget.size,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Colors.green.withValues(alpha: _opacityAnimation.value * 0.5),
                      width: 3,
                    ),
                  ),
                ),
              ),
              // Inner filling circle
              CustomPaint(
                size: Size(widget.size * 0.7, widget.size * 0.7),
                painter: _FillingCirclePainter(
                  progress: _controller.value,
                ),
              ),
              // Center icon
              Icon(
                Icons.nfc_rounded,
                size: widget.size * 0.3,
                color: Colors.white.withValues(alpha: 0.9),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Custom painter for the filling circle effect
class _FillingCirclePainter extends CustomPainter {
  _FillingCirclePainter({required this.progress});

  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;

    // Background circle (dark)
    final bgPaint = Paint()
      ..color = Colors.grey.shade800
      ..style = PaintingStyle.fill;
    canvas.drawCircle(center, radius, bgPaint);

    // Filling from bottom to top
    final fillHeight = size.height * progress;
    final fillRect = Rect.fromLTWH(
      0,
      size.height - fillHeight,
      size.width,
      fillHeight,
    );

    // Clip to circle shape
    final clipPath = Path()..addOval(Rect.fromCircle(center: center, radius: radius));
    canvas.clipPath(clipPath);

    // Draw filling gradient
    final fillPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.bottomCenter,
        end: Alignment.topCenter,
        colors: [
          Colors.green.shade700,
          Colors.green.shade400,
        ],
      ).createShader(fillRect);

    canvas.drawRect(fillRect, fillPaint);
  }

  @override
  bool shouldRepaint(_FillingCirclePainter oldDelegate) {
    return oldDelegate.progress != progress;
  }
}
