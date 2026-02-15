import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'dart:ui';

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'package:provider/provider.dart';

import '../../services/localization_service.dart';

class SelfieCameraScreen extends StatefulWidget {
  const SelfieCameraScreen({super.key});

  @override
  State<SelfieCameraScreen> createState() => _SelfieCameraScreenState();
}

enum LivenessStep {
  detecting, // Waiting for a face
  lookLeft, // Yaw > Threshold
  lookRight, // Yaw < -Threshold
  holdStill, // Yaw ~ 0
  capturing,
}

class _SelfieCameraScreenState extends State<SelfieCameraScreen>
    with TickerProviderStateMixin {
  CameraController? _controller;
  FaceDetector? _faceDetector;
  bool _isStreaming = false;
  bool _isBusy = false;
  String? _error;

  LivenessStep _step = LivenessStep.detecting;
  double _progress = 0.0;
  String _instructionKey = 'position_face_in_circle';

  // Animation controllers
  late AnimationController _scanningController;
  late AnimationController _instructionController;
  late Animation<double> _instructionOpacity;

  // Logic tracking
  int _consecutiveFrames = 0;
  static const int _requiredConsecutive = 3;

  @override
  void initState() {
    super.initState();
    _scanningController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);

    _instructionController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _instructionOpacity = CurvedAnimation(
      parent: _instructionController,
      curve: Curves.easeInOut,
    );
    _instructionController.forward();

    _initMPL();
    _initCamera();
  }

  void _initMPL() {
    final options = FaceDetectorOptions(
      enableClassification: true,
      enableLandmarks: true,
      enableContours: false,
      enableTracking: true,
      performanceMode: FaceDetectorMode.accurate,
      minFaceSize: 0.15,
    );
    _faceDetector = FaceDetector(options: options);
  }

  Future<void> _initCamera() async {
    try {
      final cameras = await availableCameras();
      final frontCam = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.front,
        orElse: () => cameras.first,
      );

      _controller = CameraController(
        frontCam,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: Platform.isAndroid
            ? ImageFormatGroup.nv21
            : ImageFormatGroup.bgra8888,
      );

      await _controller!.initialize();
      await _controller!.lockCaptureOrientation();

      if (!mounted) return;
      setState(() {});

      _startStream();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Camera error: $e');
    }
  }

  Future<void> _startStream() async {
    if (_controller == null || _isStreaming) return;
    try {
      await _controller!.startImageStream(_processCameraImage);
      setState(() => _isStreaming = true);
    } catch (e) {
      debugPrint('Stream error: $e');
    }
  }

  Future<void> _stopStream() async {
    if (_controller == null || !_isStreaming) return;
    try {
      await _controller!.stopImageStream();
      setState(() => _isStreaming = false);
    } catch (_) {}
  }

  Future<void> _processCameraImage(CameraImage image) async {
    if (_isBusy || _faceDetector == null) return;
    _isBusy = true;

    try {
      final inputImage = _inputImageFromCameraImage(image);
      if (inputImage == null) return;

      final faces = await _faceDetector!.processImage(inputImage);
      _runLivenessLogic(faces);
    } catch (e) {
      debugPrint('Detection error: $e');
    } finally {
      if (mounted) _isBusy = false;
    }
  }

  void _updateInstruction(String key) {
    if (_instructionKey == key) return;
    _instructionController.reverse().then((_) {
      if (!mounted) return;
      setState(() => _instructionKey = key);
      _instructionController.forward();
    });
  }

  void _runLivenessLogic(List<Face> faces) {
    if (!mounted) return;

    if (faces.isEmpty) {
      if (_step != LivenessStep.capturing) {
        _updateInstruction('no_face_detected');
        setState(() => _progress = 0.0);
      }
      return;
    }

    final face = faces.reduce(
      (a, b) =>
          (a.boundingBox.width * a.boundingBox.height) >
              (b.boundingBox.width * b.boundingBox.height)
          ? a
          : b,
    );

    final yaw = face.headEulerAngleY ?? 0;
    const double yawThreshold = 25.0;

    switch (_step) {
      case LivenessStep.detecting:
        _updateInstruction('look_straight_camera');
        setState(() => _step = LivenessStep.lookLeft);
        break;

      case LivenessStep.lookLeft:
        _updateInstruction('turn_head_left');
        if (yaw > yawThreshold) {
          _consecutiveFrames++;
        } else {
          _consecutiveFrames = 0;
        }

        if (_consecutiveFrames >= _requiredConsecutive) {
          HapticFeedback.mediumImpact();
          setState(() {
            _step = LivenessStep.lookRight;
            _consecutiveFrames = 0;
            _progress = 0.33;
          });
        }
        break;

      case LivenessStep.lookRight:
        _updateInstruction('turn_head_right');
        if (yaw < -yawThreshold) {
          _consecutiveFrames++;
        } else {
          _consecutiveFrames = 0;
        }

        if (_consecutiveFrames >= _requiredConsecutive) {
          HapticFeedback.mediumImpact();
          setState(() {
            _step = LivenessStep.holdStill;
            _consecutiveFrames = 0;
            _progress = 0.66;
          });
        }
        break;

      case LivenessStep.holdStill:
        _updateInstruction('stay_still_look_center');
        if (yaw.abs() < 10) {
          _consecutiveFrames++;
        } else {
          _consecutiveFrames = 0;
        }

        if (_consecutiveFrames >= _requiredConsecutive) {
          HapticFeedback.heavyImpact();
          setState(() {
            _step = LivenessStep.capturing;
            _progress = 1.0;
          });
          _updateInstruction('verification_complete');
          _capture();
        }
        break;

      case LivenessStep.capturing:
        break;
    }
  }

  Future<void> _capture() async {
    await _stopStream();
    await Future.delayed(const Duration(milliseconds: 200));
    try {
      final file = await _controller!.takePicture();
      if (!mounted) return;
      Navigator.of(context).pop(file);
    } catch (e) {
      if (!mounted) return;
      final loc = Provider.of<LocalizationService>(context, listen: false);
      setState(() => _error = '${loc.translate('capture_failed')}: $e');
    }
  }

  static final _orientations = {
    DeviceOrientation.portraitUp: 0,
    DeviceOrientation.landscapeLeft: 90,
    DeviceOrientation.portraitDown: 180,
    DeviceOrientation.landscapeRight: 270,
  };

  InputImage? _inputImageFromCameraImage(CameraImage image) {
    if (_controller == null) return null;
    final camera = _controller!.description;
    final sensorOrientation = camera.sensorOrientation;

    InputImageRotation? rotation;
    if (Platform.isIOS) {
      rotation = InputImageRotationValue.fromRawValue(sensorOrientation);
    } else if (Platform.isAndroid) {
      var rotationCompensation =
          _orientations[_controller!.value.deviceOrientation];
      if (rotationCompensation == null) return null;
      if (camera.lensDirection == CameraLensDirection.front) {
        rotationCompensation = (sensorOrientation + rotationCompensation) % 360;
      } else {
        rotationCompensation =
            (sensorOrientation - rotationCompensation + 360) % 360;
      }
      rotation = InputImageRotationValue.fromRawValue(rotationCompensation);
    }
    if (rotation == null) return null;

    final format = InputImageFormatValue.fromRawValue(image.format.raw);
    if (format == null ||
        (Platform.isAndroid && format != InputImageFormat.nv21)) {
      if (Platform.isAndroid) return null;
    }

    final WriteBuffer allBytes = WriteBuffer();
    for (final Plane plane in image.planes) {
      allBytes.putUint8List(plane.bytes);
    }
    final bytes = allBytes.done().buffer.asUint8List();

    final metadata = InputImageMetadata(
      size: Size(image.width.toDouble(), image.height.toDouble()),
      rotation: rotation,
      format: format ?? InputImageFormat.bgra8888,
      bytesPerRow: image.planes[0].bytesPerRow,
    );

    return InputImage.fromBytes(bytes: bytes, metadata: metadata);
  }

  @override
  void dispose() {
    _scanningController.dispose();
    _instructionController.dispose();
    _stopStream();
    _faceDetector?.close();
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<LocalizationService>(
      builder: (context, loc, child) {
        if (_error != null) {
          return Scaffold(
            backgroundColor: Colors.black,
            body: Center(
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            ),
          );
        }
        if (_controller == null || !_controller!.value.isInitialized) {
          return const Scaffold(
            backgroundColor: Colors.black,
            body: Center(child: CircularProgressIndicator()),
          );
        }

        return Scaffold(
          backgroundColor: Colors.black,
          body: Stack(
            fit: StackFit.expand,
            children: [
              Transform(
                alignment: Alignment.center,
                transform: Matrix4.rotationY(pi),
                child: CameraPreview(_controller!),
              ),

              // Premium Acrylic Overlay
              ClipPath(
                clipper: _HoleClipper(),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 15, sigmaY: 15),
                  child: Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.black.withValues(alpha: 0.7),
                          Colors.black.withValues(alpha: 0.4),
                          Colors.black.withValues(alpha: 0.8),
                        ],
                      ),
                    ),
                  ),
                ),
              ),

              // Scanning Line Animation
              if (_step != LivenessStep.capturing)
                AnimatedBuilder(
                  animation: _scanningController,
                  builder: (context, child) {
                    return CustomPaint(
                      painter: _ScanningPainter(_scanningController.value),
                      child: const SizedBox.expand(),
                    );
                  },
                ),

              // Header & Instructions
              SafeArea(
                child: Align(
                  alignment: Alignment.topCenter,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 40),
                    child: Column(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.1),
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.security,
                                color: Colors.greenAccent.shade400,
                                size: 16,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                loc.translate('enrollment_title'),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 32),
                        FadeTransition(
                          opacity: _instructionOpacity,
                          child: SlideTransition(
                            position: _instructionOpacity.drive(
                              Tween<Offset>(
                                begin: const Offset(0, 0.1),
                                end: Offset.zero,
                              ),
                            ),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 40),
                              child: Text(
                                loc.translate(_instructionKey),
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 24,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: -0.5,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              // Oval Face Frame
              Center(
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    // Inner Glow
                    Container(
                      width: 290,
                      height: 390,
                      decoration: BoxDecoration(
                        shape: BoxShape.rectangle,
                        borderRadius: BorderRadius.circular(150),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.greenAccent.withValues(alpha: 0.1),
                            blurRadius: 20,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                    ),
                    // Progress Arc
                    CustomPaint(
                      painter: _ArcPainter(_progress),
                      child: const SizedBox(width: 300, height: 400),
                    ),
                  ],
                ),
              ),

              // Feedback Icons
              if (_step == LivenessStep.lookLeft)
                const _DirectionHint(
                  icon: Icons.chevron_left,
                  alignment: Alignment.centerLeft,
                ),
              if (_step == LivenessStep.lookRight)
                const _DirectionHint(
                  icon: Icons.chevron_right,
                  alignment: Alignment.centerRight,
                ),

              // Close Button
              Positioned(
                top: 50,
                right: 20,
                child: ClipOval(
                  child: BackdropFilter(
                    filter: ImageFilter.blur(sigmaX: 5, sigmaY: 5),
                    child: Container(
                      color: Colors.white.withValues(alpha: 0.1),
                      child: IconButton(
                        icon: const Icon(Icons.close, color: Colors.white),
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _DirectionHint extends StatelessWidget {
  final IconData icon;
  final Alignment alignment;
  const _DirectionHint({required this.icon, required this.alignment});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: alignment,
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 0.0, end: 1.0),
          duration: const Duration(milliseconds: 500),
          builder: (context, value, child) {
            return Opacity(
              opacity: value,
              child: Transform.translate(
                offset: Offset(
                  alignment == Alignment.centerLeft
                      ? 10 * (1 - value)
                      : -10 * (1 - value),
                  0,
                ),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.greenAccent.withValues(alpha: 0.2),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Colors.greenAccent.withValues(alpha: 0.4),
                    ),
                  ),
                  child: Icon(icon, color: Colors.greenAccent, size: 40),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _HoleClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    final path = Path()..addRect(Rect.fromLTWH(0, 0, size.width, size.height));
    final hole = Path()
      ..addOval(
        Rect.fromCenter(
          center: Offset(size.width / 2, size.height / 2),
          width: 300,
          height: 400,
        ),
      );
    return Path.combine(PathOperation.difference, path, hole);
  }

  @override
  bool shouldReclip(old) => false;
}

class _ArcPainter extends CustomPainter {
  final double progress;
  _ArcPainter(this.progress);

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromLTWH(0, 0, size.width, size.height);

    // Background Track
    final bgPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.1)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4;
    canvas.drawArc(rect, 0, 2 * pi, false, bgPaint);

    if (progress <= 0) return;

    // Progress Stroke
    final paint = Paint()
      ..shader = const LinearGradient(
        colors: [Colors.greenAccent, Colors.blueAccent],
      ).createShader(rect)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6
      ..strokeCap = StrokeCap.round;

    canvas.drawArc(rect, -pi / 2, 2 * pi * progress, false, paint);
  }

  @override
  bool shouldRepaint(_ArcPainter old) => old.progress != progress;
}

class _ScanningPainter extends CustomPainter {
  final double value;
  _ScanningPainter(this.value);

  @override
  void paint(Canvas canvas, Size size) {
    final centerX = size.width / 2;
    final centerY = size.height / 2;
    final holeWidth = 300.0;
    final holeHeight = 400.0;

    final y = centerY - (holeHeight / 2) + (holeHeight * value);

    final paint = Paint()
      ..shader =
          LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Colors.greenAccent.withValues(alpha: 0.0),
              Colors.greenAccent.withValues(alpha: 0.5),
              Colors.greenAccent.withValues(alpha: 0.0),
            ],
          ).createShader(
            Rect.fromLTWH(centerX - holeWidth / 2, y - 20, holeWidth, 40),
          )
      ..style = PaintingStyle.fill;

    canvas.drawRect(
      Rect.fromLTWH(centerX - holeWidth * 0.45, y - 1, holeWidth * 0.9, 2),
      Paint()..color = Colors.greenAccent.withValues(alpha: 0.8),
    );

    canvas.drawRect(
      Rect.fromLTWH(centerX - holeWidth * 0.45, y - 10, holeWidth * 0.9, 20),
      paint,
    );
  }

  @override
  bool shouldRepaint(_ScanningPainter old) => old.value != value;
}
