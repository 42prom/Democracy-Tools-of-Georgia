import 'dart:ui';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import '../../services/liveness/liveness_controller.dart';
import 'liveness_animations.dart';

/// Updated FaceContourOverlay - New flagship mesh style (pale, thin, photo-like triangulation)
/// + Universal corner brackets that work on ALL phone models
class FaceContourOverlay extends StatefulWidget {
  final LivenessController controller;
  final Size previewSize;
  final double? cameraAspectRatio;
  final bool showHud;
  final bool showHolePunch;
  final bool showDebug;
  final VoidCallback? onRetry;

  const FaceContourOverlay({
    super.key,
    required this.controller,
    required this.previewSize,
    this.cameraAspectRatio,
    this.showHud = true,
    this.showHolePunch = true,
    this.showDebug = true,
    this.onRetry,
  });

  @override
  State<FaceContourOverlay> createState() => _FaceContourOverlayState();
}

class _FaceContourOverlayState extends State<FaceContourOverlay>
    with SingleTickerProviderStateMixin {
  late AnimationController _scanController;
  bool _hasScanned = false;

  @override
  void initState() {
    super.initState();
    _scanController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    );
  }

  @override
  void didUpdateWidget(FaceContourOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
  }

  @override
  void dispose() {
    _scanController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([widget.controller, _scanController]),
      builder: (context, child) {
        final state = widget.controller.state;
        final msg = widget.controller.feedbackMessage;
        final face = widget.controller.currentFace;

        if (state == LivenessState.lookingForFace && face != null) {
          if (!_scanController.isAnimating && !_hasScanned) {
            _scanController.forward();
            _hasScanned = true;
          }
        } else if (state == LivenessState.lookingForFace && face == null) {
          if (_hasScanned) {
            _scanController.reset();
            _hasScanned = false;
          }
        }

        return Stack(
          fit: StackFit.expand,
          children: [
            if (widget.showHolePunch)
              CustomPaint(
                size: Size.infinite,
                painter: _ScannerOverlayPainter(
                  controller: widget.controller,
                  showHud: widget.showHud,
                  showMesh:
                      state == LivenessState.lookingForFace ||
                      state == LivenessState.stableCheck,
                  scanProgress: _scanController.value,
                ),
              ),

            if (widget.showDebug && widget.controller.debugOverlay)
              CustomPaint(
                size: Size.infinite,
                painter: _DebugOverlayPainter(
                  normalizedResult: widget.controller.lastNormalizedResult,
                  previewSize: widget.previewSize,
                ),
              ),

            if (widget.showHud)
              Align(
                alignment: const Alignment(0, -0.7),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(30),
                  child: BackdropFilter(
                    filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 28,
                        vertical: 18,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade900.withValues(alpha: 0.4),
                        borderRadius: BorderRadius.circular(30),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.15),
                          width: 1.5,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.2),
                            blurRadius: 20,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (state == LivenessState.challenge1 ||
                              state == LivenessState.challenge2)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Text(
                                state == LivenessState.challenge1
                                    ? "STEP 1/2"
                                    : "STEP 2/2",
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.8),
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 1.5,
                                ),
                              ),
                            ),

                          if (state == LivenessState.challenge1 ||
                              state == LivenessState.challenge2)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: LivenessChallengeAnimation(
                                challenge: widget.controller.currentChallenge!,
                                size: 60,
                              ),
                            ),

                          if (msg != null && msg.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: Text(
                                msg,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: 0.5,
                                  shadows: [
                                    Shadow(
                                      blurRadius: 4,
                                      color: Colors.black45,
                                      offset: Offset(0, 2),
                                    ),
                                  ],
                                ),
                                textAlign: TextAlign.center,
                              ),
                            ),

                          if (state == LivenessState.failed)
                            GestureDetector(
                              onTap: widget.onRetry ?? widget.controller.retry,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 24,
                                  vertical: 12,
                                ),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(30),
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.red.withValues(alpha: 0.4),
                                      blurRadius: 12,
                                      spreadRadius: 2,
                                    ),
                                  ],
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(
                                      Icons.refresh_rounded,
                                      color: Colors.red,
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      "Try Again (${widget.controller.attemptsLeft})",
                                      style: const TextStyle(
                                        color: Colors.red,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 16,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _ScannerOverlayPainter extends CustomPainter {
  final LivenessController controller;
  final bool showHud;
  final bool showMesh;
  final double scanProgress;

  static final Paint _meshLinePaint = Paint()
    ..color = Colors.white.withValues(alpha: 0.75)
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.2;

  static final Paint _meshDotPaint = Paint()
    ..color = Colors.white.withValues(alpha: 0.9)
    ..style = PaintingStyle.fill;

  _ScannerOverlayPainter({
    required this.controller,
    required this.showHud,
    required this.showMesh,
    required this.scanProgress,
  }) : super(repaint: controller);

  @override
  void paint(Canvas canvas, Size size) {
    _drawCornerBrackets(canvas, size);

    final contours = controller.smoothedContours;
    final imageSize = controller.imageSize;

    if (showMesh && contours != null && imageSize != null) {
      _drawFlagshipMesh(canvas, size, contours, imageSize);
    }
  }

  void _drawCornerBrackets(Canvas canvas, Size size) {
    final double inset = size.width * 0.085;
    final double len = size.width * 0.105;
    final double thickness = size.width * 0.0075;

    final paint = Paint()
      ..color = Colors.yellow.withValues(alpha: 0.96)
      ..strokeWidth = thickness
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    paint.maskFilter = const MaskFilter.blur(BlurStyle.normal, 1.5);

    canvas.drawLine(Offset(inset, inset), Offset(inset + len, inset), paint);
    canvas.drawLine(Offset(inset, inset), Offset(inset, inset + len), paint);

    canvas.drawLine(
      Offset(size.width - inset, inset),
      Offset(size.width - inset - len, inset),
      paint,
    );
    canvas.drawLine(
      Offset(size.width - inset, inset),
      Offset(size.width - inset, inset + len),
      paint,
    );

    canvas.drawLine(
      Offset(inset, size.height - inset),
      Offset(inset + len, size.height - inset),
      paint,
    );
    canvas.drawLine(
      Offset(inset, size.height - inset),
      Offset(inset, size.height - inset - len),
      paint,
    );

    canvas.drawLine(
      Offset(size.width - inset, size.height - inset),
      Offset(size.width - inset - len, size.height - inset),
      paint,
    );
    canvas.drawLine(
      Offset(size.width - inset, size.height - inset),
      Offset(size.width - inset, size.height - inset - len),
      paint,
    );
  }

  void _drawFlagshipMesh(
    Canvas canvas,
    Size size,
    Map<FaceContourType, List<Point<int>>> contours,
    Size imageSize,
  ) {
    final double scaleX = size.width / imageSize.width;
    final double scaleY = size.height / imageSize.height;

    final faceOval = contours[FaceContourType.face] ?? [];
    final leftEye = contours[FaceContourType.leftEye] ?? [];
    final rightEye = contours[FaceContourType.rightEye] ?? [];
    final leftEyebrow = contours[FaceContourType.leftEyebrowTop] ?? [];
    final rightEyebrow = contours[FaceContourType.rightEyebrowTop] ?? [];
    final noseBridge = contours[FaceContourType.noseBridge] ?? [];
    final noseBottom = contours[FaceContourType.noseBottom] ?? [];
    final upperLip = contours[FaceContourType.upperLipTop] ?? [];
    final lowerLip = contours[FaceContourType.lowerLipBottom] ?? [];

    Offset? pt(Point<int>? p) {
      if (p == null) return null;
      return Offset((imageSize.width - p.x) * scaleX, p.y * scaleY);
    }

    void drawPath(List<Point<int>> points, bool close) {
      if (points.isEmpty) return;
      final path = Path();
      bool first = true;
      for (final p in points) {
        final off = pt(p);
        if (off == null) continue;
        if (off.dy > scanProgress * size.height) continue;
        if (first) {
          path.moveTo(off.dx, off.dy);
          first = false;
        } else {
          path.lineTo(off.dx, off.dy);
        }
      }
      if (close && !first) path.close();
      canvas.drawPath(path, _meshLinePaint);

      for (final p in points) {
        final off = pt(p);
        if (off != null && off.dy <= scanProgress * size.height) {
          canvas.drawCircle(off, 1.6, _meshDotPaint);
        }
      }
    }

    void connect(Point<int>? a, Point<int>? b) {
      final pa = pt(a), pb = pt(b);
      if (pa != null && pb != null) {
        final scanY = scanProgress * size.height;
        if (pa.dy <= scanY || pb.dy <= scanY) {
          canvas.drawLine(pa, pb, _meshLinePaint);
        }
      }
    }

    drawPath(faceOval, false);
    drawPath(leftEye, true);
    drawPath(rightEye, true);
    drawPath(leftEyebrow, false);
    drawPath(rightEyebrow, false);
    drawPath(noseBridge, false);
    drawPath(noseBottom, false);
    drawPath(upperLip, false);
    drawPath(lowerLip, false);

    if (faceOval.isNotEmpty) {
      final top = faceOval[0];
      final leftTemple = faceOval[32 % faceOval.length];
      final rightTemple = faceOval[4];
      final chin = faceOval[18];

      connect(top, noseBridge.isNotEmpty ? noseBridge.first : null);
      connect(leftTemple, leftEyebrow.isNotEmpty ? leftEyebrow.last : null);
      connect(rightTemple, rightEyebrow.isNotEmpty ? rightEyebrow.last : null);

      if (leftEye.isNotEmpty && rightEye.isNotEmpty) {
        connect(leftEye[8], noseBottom.isNotEmpty ? noseBottom.first : null);
        connect(rightEye[0], noseBottom.isNotEmpty ? noseBottom.last : null);
      }

      if (upperLip.isNotEmpty && noseBottom.isNotEmpty) {
        connect(noseBottom.first, upperLip.first);
        connect(noseBottom.last, upperLip.last);
      }

      if (faceOval.length > 27) {
        connect(leftEye.isNotEmpty ? leftEye[0] : null, faceOval[27]);
        connect(rightEye.isNotEmpty ? rightEye[8] : null, faceOval[9]);
        connect(faceOval[27], chin);
        connect(faceOval[9], chin);
      }

      connect(leftTemple, chin);
      connect(rightTemple, chin);
      connect(faceOval[27], faceOval[9]);
    }
  }

  @override
  bool shouldRepaint(covariant _ScannerOverlayPainter oldDelegate) {
    return oldDelegate.controller != controller ||
        oldDelegate.showHud != showHud ||
        oldDelegate.showMesh != showMesh ||
        oldDelegate.scanProgress != scanProgress;
  }
}

class _DebugOverlayPainter extends CustomPainter {
  final NormalizedFaceResult? normalizedResult;
  final Size previewSize;

  _DebugOverlayPainter({
    required this.normalizedResult,
    required this.previewSize,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (normalizedResult == null) return;

    final result = normalizedResult!;

    final faceCenterX = result.centerX * size.width;
    final faceCenterY = result.centerY * size.height;
    final faceWidth = result.sizeRatio * size.width;
    final faceHeight = faceWidth * 1.35;

    final faceRect = Rect.fromCenter(
      center: Offset(faceCenterX, faceCenterY),
      width: faceWidth,
      height: faceHeight,
    );

    Color bboxColor;
    switch (result.decision) {
      case FaceDecision.ok:
        bboxColor = Colors.green;
        break;
      case FaceDecision.outside:
        bboxColor = Colors.orange;
        break;
      case FaceDecision.tooSmall:
        bboxColor = Colors.yellow;
        break;
      case FaceDecision.tooBig:
        bboxColor = Colors.red;
        break;
      case FaceDecision.lowLight:
        bboxColor = Colors.purple;
        break;
    }

    final bboxPaint = Paint()
      ..color = bboxColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.0;

    canvas.drawRect(faceRect, bboxPaint);

    final centerPaint = Paint()
      ..color = bboxColor
      ..style = PaintingStyle.fill;

    canvas.drawCircle(Offset(faceCenterX, faceCenterY), 8, centerPaint);

    final crosshairPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.5)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;

    final screenCenterX = size.width / 2;
    final screenCenterY = size.height / 2;

    canvas.drawLine(
      Offset(screenCenterX - 30, screenCenterY),
      Offset(screenCenterX + 30, screenCenterY),
      crosshairPaint,
    );
    canvas.drawLine(
      Offset(screenCenterX, screenCenterY - 30),
      Offset(screenCenterX, screenCenterY + 30),
      crosshairPaint,
    );

    final textPainter = TextPainter(
      text: TextSpan(
        text:
            'cx=${result.centerX.toStringAsFixed(2)} '
            'cy=${result.centerY.toStringAsFixed(2)} '
            'sz=${result.sizeRatio.toStringAsFixed(2)}\n'
            '${result.decision.name}',
        style: const TextStyle(
          color: Colors.white,
          fontSize: 12,
          backgroundColor: Colors.black54,
        ),
      ),
      textDirection: TextDirection.ltr,
    );
    textPainter.layout();
    textPainter.paint(canvas, const Offset(10, 100));
  }

  @override
  bool shouldRepaint(covariant _DebugOverlayPainter oldDelegate) {
    return oldDelegate.normalizedResult != normalizedResult;
  }
}
