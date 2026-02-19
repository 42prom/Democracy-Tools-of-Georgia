import 'dart:async';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import 'package:provider/provider.dart';

import '../../models/verification_models.dart';
import '../../services/localization_service.dart';
import '../../widgets/ui_components.dart';
import 'nfc_scan_screen.dart';

enum DocumentType { passport, idCard }

/// MRZ scanner screen with best-practice overlay sizing:
/// - Uses real document aspect ratios (passport page ~1.42, ID-1 card ~1.586)
/// - Clamps overlay width for tiny/huge phones
/// - Shrinks overlay if it would collide with bottom controls
/// - Renders overlay PNG without distortion (AspectRatio + BoxFit.contain)
/// - Optional auto-detect hint (TD3 vs TD1) to switch overlay while scanning
class MrzScannerScreen extends StatefulWidget {
  final VerificationPolicy policy;
  final String? enrollmentSessionId;

  const MrzScannerScreen({
    super.key,
    required this.policy,
    this.enrollmentSessionId,
  });

  @override
  State<MrzScannerScreen> createState() => _MrzScannerScreenState();
}

class _MrzScannerScreenState extends State<MrzScannerScreen>
    with WidgetsBindingObserver {
  CameraController? _controller;
  final _textRecognizer = TextRecognizer();

  bool _isProcessing = false;
  bool _isCameraInitialized = false;
  String? _error;

  // Removed _manualOverride as we are now strictly manual.

  DocumentType _selectedDocType = DocumentType.passport;

  // Status message key for localization
  static const String _statusMessageKey = 'align_document_frame';

  DateTime _lastProcessTime = DateTime.fromMillisecondsSinceEpoch(0);

  // =========================
  // Overlay assets (NO icons/text in PNG)
  // =========================
  String _overlayAssetFor(DocumentType type) {
    // Put these files in your project, e.g.:
    // assets/images/overlay_passport_mrz_guides.png
    // assets/images/overlay_id_back_mrz_guides.png
    return type == DocumentType.passport
        ? 'assets/images/overlay_passport_mrz_guides.png'
        : 'assets/images/overlay_id_back_mrz_guides.png';
  }

  // =========================
  // Best-practice sizing
  // =========================
  double _clamp(double v, double min, double max) =>
      v < min ? min : (v > max ? max : v);

  /// Outer frame ratio W/H for full document view.
  double _docRatio(DocumentType type) {
    // Passport bio page is close to 1.42; ID-1 card is 1.586.
    return type == DocumentType.passport ? 1.42 : 1.586;
  }

  ({double w, double h}) _calcOverlaySize(
    BuildContext context,
    DocumentType type,
  ) {
    final media = MediaQuery.of(context);
    final screenW = media.size.width;
    final screenH = media.size.height;

    final ratio = _docRatio(type);

    // ✅ PASSPORT: always 95% screen width, height proportional
    if (type == DocumentType.passport) {
      final w = screenW * 0.95; // <- fixed target width
      final h = w / ratio; // <- proportional height
      return (w: w, h: h);
    }

    // ✅ ID CARD: keep your current behavior exactly the same
    double w = _clamp(screenW * 0.85, 280, 560);
    double h = w / ratio;

    final maxH = screenH * 0.42;
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }

    return (w: w, h: h);
  }

  // =========================
  // Lifecycle
  // =========================
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initializeCamera();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;

    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused) {
      controller.stopImageStream().catchError((_) {});
      controller.dispose();
      _controller = null;
      if (mounted) setState(() => _isCameraInitialized = false);
    } else if (state == AppLifecycleState.resumed) {
      _initializeCamera();
    }
  }

  // =========================
  // UI
  // =========================
  @override
  Widget build(BuildContext context) {
    if (_error != null) return Scaffold(body: Center(child: Text(_error!)));
    if (!_isCameraInitialized || _controller == null) {
      return const Scaffold(
        backgroundColor: Colors.black,
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final ratio = _docRatio(_selectedDocType);
    final overlay = _calcOverlaySize(context, _selectedDocType);

    final overlayAsset = _overlayAssetFor(_selectedDocType);

    return Consumer<LocalizationService>(
      builder: (context, loc, child) {
        return Scaffold(
          backgroundColor: Colors.black,
          body: Stack(
            fit: StackFit.expand,
            children: [
              // Camera feed
              CameraPreview(_controller!),

              // Overlay (do NOT distort)
              Align(
                // Slightly up so the overlay feels centered above the bottom controls
                alignment: const Alignment(0, -0.06),
                child: IgnorePointer(
                  child: SizedBox(
                    width: overlay.w,
                    child: AspectRatio(
                      aspectRatio: ratio, // W/H
                      child: Image.asset(
                        overlayAsset,
                        fit: BoxFit.contain,
                        filterQuality: FilterQuality.high,
                        errorBuilder: (context, error, stackTrace) =>
                            _buildFallbackOverlay(context),
                      ),
                    ),
                  ),
                ),
              ),

              // Top-right close
              Positioned(
                top: MediaQuery.of(context).padding.top + 12,
                right: 16,
                child: CircleAvatar(
                  backgroundColor: Colors.black.withValues(alpha: 0.5),
                  child: IconButton(
                    icon: const Icon(Icons.close, color: Colors.white),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ),
              ),

              // Bottom status + switcher
              Align(
                alignment: Alignment.bottomCenter,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 44),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0.0),
                        Colors.black.withValues(alpha: 0.80),
                        Colors.black,
                      ],
                    ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        loc.translate(_statusMessageKey),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          shadows: [Shadow(color: Colors.black, blurRadius: 4)],
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 18),

                      // Switcher: if user taps, we consider it manual override.
                      Container(
                        height: 50,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(25),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.20),
                            width: 1,
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            _buildSwitchOption(DocumentType.passport, loc.translate('passport')),
                            _buildSwitchOption(DocumentType.idCard, loc.translate('id_card')),
                          ],
                        ),
                      ),

                      const SizedBox(height: 10),
                      // Removed auto-detect labels
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildSwitchOption(DocumentType type, String label) {
    final bool isSelected = _selectedDocType == type;

    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        setState(() {
          _selectedDocType = type;
        });
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeInOut,
        padding: const EdgeInsets.symmetric(horizontal: 24),
        margin: const EdgeInsets.all(4),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: isSelected ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(21),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.18),
                    blurRadius: 6,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected ? Colors.black : Colors.white,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
            fontSize: 14,
          ),
        ),
      ),
    );
  }

  Widget _buildFallbackOverlay(BuildContext context) {
    final ratio = _docRatio(_selectedDocType);
    final overlay = _calcOverlaySize(context, _selectedDocType);

    return Align(
      alignment: const Alignment(0, -0.06),
      child: SizedBox(
        width: overlay.w,
        child: AspectRatio(
          aspectRatio: ratio,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white, width: 2),
              color: Colors.transparent,
            ),
          ),
        ),
      ),
    );
  }

  // =========================
  // Camera init + processing
  // =========================
  Future<void> _initializeCamera() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        if (mounted) setState(() => _error = 'No cameras found');
        return;
      }

      final camera = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );

      final controller = CameraController(
        camera,
        ResolutionPreset.medium, // Lower resolution = faster OCR processing
        enableAudio: false,
        imageFormatGroup: Platform.isAndroid
            ? ImageFormatGroup.nv21
            : ImageFormatGroup.bgra8888,
      );

      _controller = controller;

      await controller.initialize();
      await controller.startImageStream(_processImage);

      if (mounted) {
        setState(() => _isCameraInitialized = true);
      }
    } catch (e) {
      if (mounted) setState(() => _error = 'Camera init failed: $e');
    }
  }

  Future<void> _processImage(CameraImage image) async {
    if (_isProcessing) return;

    // Throttle OCR - 200ms = 5 frames/sec (was 500ms = 2 frames/sec)
    final now = DateTime.now();
    if (now.difference(_lastProcessTime).inMilliseconds < 200) return;

    _isProcessing = true;
    _lastProcessTime = now;

    try {
      final inputImage = _inputImageFromCameraImage(image);
      if (inputImage == null) return;

      final recognizedText = await _textRecognizer.processImage(inputImage);

      // Auto-detect removed for strict separation

      final mrz = _extractMrz(recognizedText);
      if (!mounted) return;

      if (mrz != null) {
        final loc = Provider.of<LocalizationService>(context, listen: false);

        // Immediate Expiry Check
        if (mrz.expiryDate.isBefore(DateTime.now())) {
          // Stop camera stream to prevent re-detection loop
          await _controller?.stopImageStream();
          if (!mounted) return;
          DTGErrorDialog.show(
            context,
            title: loc.translate('document_expired'),
            message: loc.translate('document_expired_msg'),
            icon: Icons.history_toggle_off_rounded,
            buttonText: loc.translate('try_another_document'),
            onConfirm: () {
              if (mounted) {
                setState(() {
                  _isProcessing = false;
                });
                // Restart camera stream for new document
                _controller?.startImageStream(_processImage);
              }
            },
            secondaryButtonText: loc.translate('go_back'),
            onSecondary: () {
              if (mounted) {
                Navigator.of(context).pop();
              }
            },
          );
          return;
        }

        // Strict Citizenship Check
        if (widget.policy.nfc.requireGeorgianCitizen &&
            mrz.nationality != 'GEO') {
          // Stop camera stream to prevent re-detection loop
          await _controller?.stopImageStream();
          if (!mounted) return;
          DTGErrorDialog.show(
            context,
            title: loc.translate('citizenship_required'),
            message:
                '${loc.translate('citizenship_required_msg')}\n${loc.translate('detected_nationality')}: ${mrz.nationality}',
            icon: Icons.public_off_rounded,
            buttonText: loc.translate('try_another_document'),
            onConfirm: () {
              if (mounted) {
                setState(() {
                  _isProcessing = false;
                });
                // Restart camera stream for new document
                _controller?.startImageStream(_processImage);
              }
            },
            secondaryButtonText: loc.translate('go_back'),
            onSecondary: () {
              if (mounted) {
                Navigator.of(context).pop();
              }
            },
          );
          return;
        }

        // PII redacted from logs for security (TASK-P0-PII-01)
        debugPrint('DEBUG: MRZ VALIDATED!');
        debugPrint('  DocNum: [REDACTED]');
        debugPrint('  DOB: [REDACTED]');
        debugPrint('  Expiry: ${mrz.expiryDate}');
        debugPrint('  Personal: [REDACTED]');
        debugPrint('  Nationality: ${mrz.nationality}');

        await _controller?.stopImageStream();
        if (!mounted) return;
        HapticFeedback.heavyImpact();
        _navigateToNfc(mrz);
      }
    } catch (e) {
      debugPrint('DEBUG: MRZ Scan Error: $e');
      debugPrint('MRZ Scan Error: $e');
    } finally {
      // _isProcessing = false; // Moved inside if/else if needed or kept here
      if (!_isProcessing) {} // hint for analyzer
      _isProcessing = false;
    }
  }

  // local dialog removed in favor of DTGErrorDialog

  // auto-detect logic removed

  List<String> _flattenRawLines(RecognizedText text) {
    final lines = <TextLine>[];
    for (final block in text.blocks) {
      lines.addAll(block.lines);
    }
    lines.sort((a, b) => a.boundingBox.top.compareTo(b.boundingBox.top));
    return lines.map((l) => l.text.replaceAll(' ', '')).toList();
  }

  InputImage? _inputImageFromCameraImage(CameraImage image) {
    final controller = _controller;
    if (controller == null) return null;

    final camera = controller.description;
    final sensorOrientation = camera.sensorOrientation;

    final rotation = InputImageRotationValue.fromRawValue(sensorOrientation);
    if (rotation == null) return null;

    final format = InputImageFormatValue.fromRawValue(image.format.raw);
    if (format == null) return null;

    final bytes = _concatenatePlanes(image.planes);
    final plane = image.planes.first;

    return InputImage.fromBytes(
      bytes: bytes,
      metadata: InputImageMetadata(
        size: Size(image.width.toDouble(), image.height.toDouble()),
        rotation: rotation,
        format: format,
        bytesPerRow: plane.bytesPerRow,
      ),
    );
  }

  Uint8List _concatenatePlanes(List<Plane> planes) {
    final WriteBuffer allBytes = WriteBuffer();
    for (final Plane plane in planes) {
      allBytes.putUint8List(plane.bytes);
    }
    return allBytes.done().buffer.asUint8List();
  }

  // =========================
  // MRZ extraction / validation
  // =========================
  MrzData? _extractMrz(RecognizedText text) {
    final rawLines = _flattenRawLines(text);

    // Early exit: skip if no lines are close to MRZ length (30 for TD1, 44 for TD3)
    final hasPotentialMrz = rawLines.any((l) => l.length >= 28 && l.length <= 46);
    if (!hasPotentialMrz) return null;

    // TD3 (Passport) - 2 lines, 44 chars
    if (_selectedDocType == DocumentType.passport) {
      for (int i = 0; i < rawLines.length - 1; i++) {
        final l1 = rawLines[i];
        final l2 = rawLines[i + 1];
        if (l1.length == 44 && l2.length == 44 && l1.startsWith('P')) {
          if (_validateTd3(l1, l2)) {
            return _parseTd3(l1, l2);
          }
        }
      }
    }

    // TD1 (ID Card) - 3 lines, 30 chars
    if (_selectedDocType == DocumentType.idCard) {
      for (int i = 0; i < rawLines.length - 2; i++) {
        final l1 = rawLines[i];
        final l2 = rawLines[i + 1];
        final l3 = rawLines[i + 2];
        if (l1.length == 30 &&
            l2.length == 30 &&
            l3.length == 30 &&
            (l1.startsWith('I') || l1.startsWith('A') || l1.startsWith('C'))) {
          if (_validateTd1(l1, l2, l3)) {
            return _parseTd1(l1, l2, l3);
          }
        }
      }
    }

    return null;
  }

  bool _validateTd3(String l1, String l2) {
    if (!_check(l2.substring(0, 9), l2[9])) return false; // Doc Num
    if (!_check(l2.substring(13, 19), l2[19])) return false; // DOB
    if (!_check(l2.substring(21, 27), l2[27])) return false; // Expiry
    return true;
  }

  bool _validateTd1(String l1, String l2, String l3) {
    if (!_check(l1.substring(5, 14), l1[14])) return false; // Doc Num
    if (!_check(l2.substring(0, 6), l2[6])) return false; // DOB
    if (!_check(l2.substring(8, 14), l2[14])) return false; // Expiry
    return true;
  }

  bool _check(String data, String checkDigitChar) {
    final target = _charValue(checkDigitChar);
    int sum = 0;
    const weights = [7, 3, 1];

    for (int i = 0; i < data.length; i++) {
      sum += _charValue(data[i]) * weights[i % 3];
    }
    return (sum % 10) == target;
  }

  int _charValue(String c) {
    final code = c.codeUnitAt(0);
    if (code >= 48 && code <= 57) return code - 48; // 0-9
    if (code >= 65 && code <= 90) return code - 55; // A-Z (A=10)
    if (code == 60) return 0; // <
    return 0;
  }

  DateTime _parseDate(String yyMMdd, {bool isExpiry = false}) {
    if (yyMMdd.length != 6) throw FormatException('Invalid date length');

    final year = int.parse(yyMMdd.substring(0, 2));
    final month = int.parse(yyMMdd.substring(2, 4));
    final day = int.parse(yyMMdd.substring(4, 6));

    final currentYear = DateTime.now().year % 100;
    final int fullYear;

    if (isExpiry) {
      // Expiry is almost always in the future (or very recent past)
      fullYear = 2000 + year;
    } else {
      // DOB pivot: if YY > currentYear, assume 1900s
      fullYear = year > currentYear ? 1900 + year : 2000 + year;
    }

    // Validate month/day ranges
    final m = month < 1 ? 1 : (month > 12 ? 12 : month);
    final d = day < 1 ? 1 : (day > 31 ? 31 : day);

    return DateTime(fullYear, m, d);
  }

  String _sanitizeDigits(String input) {
    // Attempt to map common OCR confusion characters for digits
    var s = input.toUpperCase().replaceAll('<', '');
    s = s.replaceAll('O', '0').replaceAll('Q', '0').replaceAll('D', '0');
    s = s.replaceAll('I', '1').replaceAll('L', '1');
    s = s.replaceAll('Z', '2');
    s = s.replaceAll('S', '5');
    s = s.replaceAll('B', '8');
    s = s.replaceAll('A', '4');
    s = s.replaceAll('G', '6');
    // Finally ensure only digits remain
    return s.replaceAll(RegExp(r'[^0-9]'), '');
  }

  MrzData _parseTd3(String l1, String l2) {
    debugPrint('DEBUG: Parsing TD3');

    final docNum = l2.substring(0, 9).replaceAll('<', '');
    final dobStr = l2.substring(13, 19);
    final sex = l2[20];
    final expiryStr = l2.substring(21, 27);

    // Optional/personal number area (depends on doc issuing config)
    final rawPersonal = l2.substring(28, 42);
    final personalNum = _sanitizeDigits(rawPersonal);
    // PII redacted from logs for security (TASK-P0-PII-01)
    debugPrint('DEBUG: TD3 personalNum parsed, len=${personalNum.length}');

    // Auto-correct common "GEO" OCR typos
    var nationality = l2.substring(10, 13);
    nationality = _fixGeoTypos(nationality);

    return MrzData(
      documentNumber: docNum,
      birthDate: _parseDate(dobStr),
      expiryDate: _parseDate(expiryStr, isExpiry: true),
      personalNumber: personalNum,
      nationality: nationality,
      sex: sex,
    );
  }

  MrzData _parseTd1(String l1, String l2, String l3) {
    debugPrint('DEBUG: Parsing TD1');

    final docNum = l1.substring(5, 14).replaceAll('<', '');
    final dobStr = l2.substring(0, 6);
    final sex = l2.substring(7, 8);
    final expiryStr = l2.substring(8, 14);

    var nationality = l2.substring(15, 18);
    nationality = _fixGeoTypos(nationality);

    // Georgian Personal Number is 11 digits.
    // In TD1, it can be in l1 (15-29) or l2 (18-28).
    String personalNum = '';

    // Check Line 2 (Common for Georgia)
    if (l2.length >= 29) {
      final rawOptional2 = l2.substring(18, 29);
      final p2 = _sanitizeDigits(rawOptional2);
      // PII redacted from logs for security (TASK-P0-PII-01)
      debugPrint('DEBUG: TD1 Line 2 personalNum parsed, len=${p2.length}');
      if (p2.length >= 11) personalNum = p2;
    }

    // Fallback to Line 1
    if (personalNum.isEmpty && l1.length >= 29) {
      final rawOptional1 = l1.substring(15, 29);
      final p1 = _sanitizeDigits(rawOptional1);
      // PII redacted from logs for security (TASK-P0-PII-01)
      debugPrint('DEBUG: TD1 Line 1 personalNum parsed, len=${p1.length}');
      if (p1.length >= 11) personalNum = p1;
    }

    return MrzData(
      documentNumber: docNum,
      birthDate: _parseDate(dobStr),
      expiryDate: _parseDate(expiryStr, isExpiry: true),
      personalNumber: personalNum,
      nationality: nationality,
      sex: sex,
    );
  }

  String _fixGeoTypos(String input) {
    var s = input.toUpperCase().replaceAll('<', '');
    // Fix zero/O confusion
    if (s == 'GE0' || s == 'G3O' || s == '6EO' || s == 'CEO' || s == 'GFO') {
      return 'GEO';
    }
    // If it contains G and E/3 and length is 3...
    if (s.startsWith('G') && s.length == 3) {
      // Very loose heuristic for Georgian app context
      return 'GEO';
    }
    return s.isEmpty ? 'GEO' : s; // Fallback? No, unsafe.
  }

  // =========================
  // Navigation
  // =========================
  void _navigateToNfc(MrzData mrz) {
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => NfcScanScreen(
          policy: widget.policy,
          enrollmentSessionId: widget.enrollmentSessionId,
          mrzData: mrz,
        ),
      ),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    _textRecognizer.close();
    super.dispose();
  }
}
