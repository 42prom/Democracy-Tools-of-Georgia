import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/localization_service.dart';

class DocumentCameraScreen extends StatefulWidget {
  const DocumentCameraScreen({super.key});

  @override
  State<DocumentCameraScreen> createState() => _DocumentCameraScreenState();
}

class _DocumentCameraScreenState extends State<DocumentCameraScreen> {
  CameraController? _controller;
  bool _initialized = false;
  bool _capturing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _initCamera();
  }

  Future<void> _initCamera() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        if (!mounted) return;
        final loc = Provider.of<LocalizationService>(context, listen: false);
        setState(() => _error = loc.translate('no_cameras_found'));
        return;
      }

      // 0 is usually back camera
      final camera = cameras.first;
      _controller = CameraController(
        camera,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );

      await _controller!.initialize();
      // Lock orientation to portrait if possible
      await _controller!.lockCaptureOrientation();

      if (!mounted) return;
      setState(() => _initialized = true);
    } catch (e) {
      if (!mounted) return;
      final loc = Provider.of<LocalizationService>(context, listen: false);
      setState(() => _error = '${loc.translate('camera_error')}: $e');
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _capture() async {
    if (_controller == null ||
        !_controller!.value.isInitialized ||
        _capturing) {
      return;
    }

    setState(() => _capturing = true);
    try {
      final file = await _controller!.takePicture();
      if (!mounted) return;
      Navigator.of(context).pop(file);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<LocalizationService>(
      builder: (context, loc, child) {
        if (_error != null) {
          return Scaffold(
            backgroundColor: Colors.black,
            body: Center(
              child: Text(_error!, style: const TextStyle(color: Colors.white)),
            ),
          );
        }

        if (!_initialized || _controller == null) {
          return const Scaffold(
            backgroundColor: Colors.black,
            body: Center(child: CircularProgressIndicator(color: Colors.white)),
          );
        }

        return Scaffold(
          backgroundColor: Colors.black,
          body: Stack(
            fit: StackFit.expand,
            children: [
              // 1. Camera Preview
              CameraPreview(_controller!),

              // 2. Overlay
              Container(
                decoration: ShapeDecoration(
                  color: Colors.black54,
                  shape: _OverlayShape(
                    borderColor: Colors.white,
                    borderRadius: 12,
                    borderLength: 40,
                    borderWidth: 4,
                    cutOutSize: const Size(340, 220),
                  ),
                ),
              ),

              // 3. Top Hint
              Positioned(
                top: 100,
                left: 0,
                right: 0,
                child: Column(
                  children: [
                    const Icon(
                      Icons.credit_card_outlined,
                      color: Colors.white,
                      size: 48,
                    ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        loc.translate('place_id_in_frame'),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        loc.translate('ensure_good_lighting'),
                        style: const TextStyle(color: Colors.white70, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),

              // 4. Close Button
              Positioned(
                top: 48,
                right: 24,
                child: IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close, color: Colors.white, size: 32),
                ),
              ),

              // 5. Capture Button
              Positioned(
                bottom: 60,
                left: 0,
                right: 0,
                child: Center(
                  child: GestureDetector(
                    onTap: _capture,
                    child: Container(
                      height: 80,
                      width: 80,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 5),
                        color: _capturing ? Colors.white : Colors.white24,
                      ),
                      child: _capturing
                          ? const CircularProgressIndicator(color: Colors.black)
                          : null,
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

// Custom Painter for the dark overlay with cutout
class _OverlayShape extends ShapeBorder {
  final Color borderColor;
  final double borderWidth;
  final double borderRadius;
  final double borderLength;
  final Size cutOutSize;

  const _OverlayShape({
    required this.borderColor,
    this.borderWidth = 4.0,
    this.borderRadius = 0.0,
    this.borderLength = 20.0,
    required this.cutOutSize,
  });

  @override
  EdgeInsetsGeometry get dimensions => EdgeInsets.zero;

  @override
  Path getInnerPath(Rect rect, {TextDirection? textDirection}) {
    return Path()
      ..fillType = PathFillType.evenOdd
      ..addPath(getOuterPath(rect), Offset.zero);
  }

  @override
  Path getOuterPath(Rect rect, {TextDirection? textDirection}) {
    // Return path for the overlay (dark area with hole)
    final double width = rect.width;
    final double height = rect.height;
    final double left = (width - cutOutSize.width) / 2;
    final double top = (height - cutOutSize.height) / 2;
    final double right = left + cutOutSize.width;
    final double bottom = top + cutOutSize.height;

    // Outer rectangle (screen)
    final Path path = Path()..addRect(rect);

    // Inner rectangle (cutout)
    final Path cutout = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTRB(left, top, right, bottom),
          Radius.circular(borderRadius),
        ),
      );

    return Path.combine(PathOperation.difference, path, cutout);
  }

  @override
  void paint(Canvas canvas, Rect rect, {TextDirection? textDirection}) {
    final double width = rect.width;
    final double height = rect.height;
    final double left = (width - cutOutSize.width) / 2;
    final double top = (height - cutOutSize.height) / 2;
    final double right = left + cutOutSize.width;
    final double bottom = top + cutOutSize.height;

    final paintBorder = Paint()
      ..color = borderColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = borderWidth;

    // Draw corners
    final path = Path();
    // Top Left
    path.moveTo(left, top + borderLength);
    path.lineTo(left, top);
    path.lineTo(left + borderLength, top);

    // Top Right
    path.moveTo(right - borderLength, top);
    path.lineTo(right, top);
    path.lineTo(right, top + borderLength);

    // Bottom Right
    path.moveTo(right, bottom - borderLength);
    path.lineTo(right, bottom);
    path.lineTo(right - borderLength, bottom);

    // Bottom Left
    path.moveTo(left + borderLength, bottom);
    path.lineTo(left, bottom);
    path.lineTo(left, bottom - borderLength);

    canvas.drawPath(path, paintBorder);
  }

  @override
  ShapeBorder scale(double t) => this;
}
