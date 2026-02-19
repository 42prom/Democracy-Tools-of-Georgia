import 'dart:convert';

import 'package:dmrtd/dmrtd.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_nfc_kit/flutter_nfc_kit.dart';
import 'package:intl/intl.dart';
import 'package:logging/logging.dart';
import 'package:lottie/lottie.dart';
import 'package:provider/provider.dart';

import '../../models/verification_models.dart';
import '../../services/interfaces/i_api_service.dart';
import '../../services/localization_service.dart';
import '../../services/service_locator.dart';
import '../../widgets/scanning_progress_indicator.dart';
import '../../widgets/ui_components.dart';
import 'document_entry_screen.dart';
import 'enrollment_step_header.dart';
import 'liveness_screen.dart';
import 'profile_creation_screen.dart';

/// Step 1/3: NFC Scan (Real ICAO 9303 Implementation)
class NfcScanScreen extends StatefulWidget {
  const NfcScanScreen({
    super.key,
    required this.policy,
    this.enrollmentSessionId,
    required this.mrzData,
    this.docPortraitBase64,
  });

  final VerificationPolicy policy;
  final String? enrollmentSessionId;
  final MrzData mrzData;
  final String? docPortraitBase64;

  @override
  State<NfcScanScreen> createState() => _NfcScanScreenState();
}

class _NfcScanScreenState extends State<NfcScanScreen> {
  final IApiService _api = ServiceLocator.apiService;
  final _dateFormat = DateFormat('dd-MM-yyyy');

  // Mutable state for retries/edits
  late MrzData _currentMrz;

  @override
  void initState() {
    super.initState();
    _currentMrz = widget.mrzData;
    _checkNfc();
  }

  bool _nfcEnabled = false;
  bool _scanning = false;
  bool _submitting = false;
  String? _error;
  String? _statusKey; // Translation key for status text
  String? _mode; // login/register from backend

  // Show "Edit" button if BAC failed
  bool _showEditButton = false;

  @override
  void dispose() {
    FlutterNfcKit.finish().catchError((_) {});
    super.dispose();
  }

  Future<void> _checkNfc() async {
    try {
      final availability = await FlutterNfcKit.nfcAvailability;
      final ok = availability == NFCAvailability.available;
      if (!mounted) return;
      setState(() => _nfcEnabled = ok);
    } catch (_) {
      if (!mounted) return;
      setState(() => _nfcEnabled = false);
    }
  }

  Future<void> _startScan() async {
    setState(() {
      _error = null;
      _scanning = true;
      _statusKey = 'hold_phone_near_chip';
      _showEditButton = false;
    });

    try {
      final loc = Provider.of<LocalizationService>(context, listen: false);
      // 1. Poll for tag
      await FlutterNfcKit.poll(
        timeout: const Duration(seconds: 20),
        iosAlertMessage: loc.translate('hold_phone_near_chip'),
        readIso14443A: true,
        readIso14443B: true,
      );

      setState(() => _statusKey = 'chip_detected_auth');
      HapticFeedback.lightImpact(); // Tactile feedback

      // 2. Prepare keys
      final keys = DBAKey(
        _currentMrz.documentNumber,
        _currentMrz.birthDate,
        _currentMrz.expiryDate,
      );

      // Create Passport
      final transceiver = FlutterNfcKitProvider();
      final passport = Passport(transceiver);

      // 3. Perform BAC
      try {
        await passport.startSession(keys);
      } catch (e) {
        debugPrint('BAC Failed: $e');
        throw Exception(
          'Access Denied. logic mismatch.', // Catch-phrase for logic below
        );
      }

      setState(() => _statusKey = 'reading_document_1_3');

      // 4. Read Data Groups
      // DG1: MRZ Data (Verified Source of Truth)
      final dg1 = await passport.readEfDG1();
      final chipMrz = dg1.mrz;

      setState(() => _statusKey = 'reading_personal_2_3');

      // DG11: Additional Personal Details (Often contains 11-digit Personal Number)
      String? chipPersonalNumber;
      try {
        final dg11 = await passport.readEfDG11();
        chipPersonalNumber = dg11.personalNumber;
        // PII redacted from logs for security (TASK-P0-PII-01)
        debugPrint('DEBUG: Extracted Personal Number from DG11: [REDACTED]');
      } catch (e) {
        debugPrint('DEBUG: DG11 not available or failed: $e');
      }

      // PII redacted from logs for security (TASK-P0-PII-01)
      debugPrint('CHIP DG11 Personal Number: [REDACTED]');
      debugPrint('CHIP Nationality: "${chipMrz.nationality}"');

      setState(() => _statusKey = 'reading_photo_3_3');
      final dg2 = await passport.readEfDG2();

      // 5. Decode Image
      final imageBytes = dg2.imageData;
      String? base64Image;
      if (imageBytes != null && imageBytes.isNotEmpty) {
        base64Image = base64Encode(imageBytes);
      }

      await FlutterNfcKit.finish(iosAlertMessage: loc.translate('success'));

      // 6. Submit using CHIP data
      await _submitData(
        base64Image,
        chipMrz: chipMrz,
        chipPn: chipPersonalNumber,
      );
    } on PlatformException catch (e) {
      if (!mounted) return;
      final loc = Provider.of<LocalizationService>(context, listen: false);
      await FlutterNfcKit.finish(
        iosErrorMessage: loc.translate('nfc_scan_failed'),
      );
      if (!mounted) return;

      String cleanError = loc.translate('scan_failed_retry');
      if (e.message?.contains("Communication error") == true ||
          e.code == "500") {
        cleanError = loc.translate('lost_connection_chip');
      } else if (e.message?.contains("Tag was lost") == true) {
        cleanError = loc.translate('tag_lost');
      } else {
        cleanError = e.message ?? cleanError;
      }

      setState(() {
        _scanning = false;
        _statusKey = null;
      });

      DTGErrorDialog.show(
        context,
        title: loc.translate('nfc_scan_failed'),
        message: cleanError,
        icon: Icons.contactless_outlined,
      );
    } catch (e) {
      if (!mounted) return;
      final loc = Provider.of<LocalizationService>(context, listen: false);
      await FlutterNfcKit.finish(
        iosErrorMessage: loc.translate('nfc_scan_failed'),
      );
      if (!mounted) return;

      String msg = e.toString().replaceAll('Exception:', '').trim();
      bool isAccessDenied = msg.contains("Access Denied");

      if (isAccessDenied) {
        msg = loc.translate('access_denied_mrz');
      }

      setState(() {
        _scanning = false;
        _statusKey = null;
        _showEditButton = isAccessDenied;
      });

      DTGErrorDialog.show(
        context,
        title: isAccessDenied
            ? loc.translate('auth_failed')
            : loc.translate('nfc_error'),
        message: msg,
        icon: isAccessDenied ? Icons.lock_outline : Icons.error_outline,
        buttonText: isAccessDenied
            ? loc.translate('check_data')
            : loc.translate('try_again'),
      );

      if (isAccessDenied) {
        // Auto-show dialog so user sees the "wrong" data immediately
        await Future.delayed(const Duration(milliseconds: 300));
        if (!mounted) return;
        _showEditDialog();
      }
    }
  }

  Future<void> _submitData(
    String? nfcPortraitBase64, {
    MRZ? chipMrz,
    String? chipPn,
  }) async {
    // If we have chip data, prefer it over OCR
    final effectiveDocNum =
        chipMrz?.documentNumber ?? _currentMrz.documentNumber;
    final effectiveDob = chipMrz?.dateOfBirth ?? _currentMrz.birthDate;
    final effectiveExpiry = chipMrz?.dateOfExpiry ?? _currentMrz.expiryDate;
    final effectiveNationality =
        chipMrz?.nationality ?? _currentMrz.nationality;

    // Personal Number Strategy:
    // 0. Try DG11 (New!)
    // 1. Try Chip "optionalData" (cleaned)
    // 2. Try Chip "optionalData2" (cleaned) - Often used for TD1 (ID Cards)
    // 3. Try OCR "personalNumber"
    String effectivePn = '';

    if (chipPn != null && chipPn.isNotEmpty) {
      effectivePn = chipPn.trim();
    }

    if (effectivePn.isEmpty && chipMrz != null) {
      if (chipMrz.optionalData.isNotEmpty) {
        effectivePn = chipMrz.optionalData.replaceAll('<', '').trim();
      }
      if (effectivePn.isEmpty &&
          chipMrz.optionalData2 != null &&
          chipMrz.optionalData2!.isNotEmpty) {
        effectivePn = chipMrz.optionalData2!.replaceAll('<', '').trim();
      }
    }

    if (effectivePn.isEmpty) {
      effectivePn = _currentMrz.personalNumber;
    }

    // PII redacted from logs for security (TASK-P0-PII-01)
    debugPrint(
      'DEBUG: effectivePn before final sanitization: [REDACTED, len=${effectivePn.length}]',
    );
    effectivePn = effectivePn.replaceAll(RegExp(r'[^0-9]'), '');

    if (widget.policy.nfc.requirePersonalNumber && effectivePn.isEmpty) {
      final pn = await _promptForPersonalNumber();
      if (!mounted) return;
      if (pn == null || pn.isEmpty) {
        final loc = Provider.of<LocalizationService>(context, listen: false);
        throw Exception(loc.translate('personal_number_required'));
      }
      effectivePn = pn;
    }

    setState(() {
      _scanning = false;
      _submitting = true;
      _statusKey = 'verifying';
    });

    HapticFeedback.mediumImpact();

    try {
      final resp = await _api.submitNfc({
        'enrollmentSessionId': widget.enrollmentSessionId,
        'docNumber': effectiveDocNum,
        'dob': effectiveDob.toIso8601String().split('T')[0],
        'expiry': effectiveExpiry.toIso8601String().split('T')[0],
        'personalNumber': effectivePn,
        'nationality': effectiveNationality,
        'gender': (chipMrz != null
            ? chipMrz.gender.toString()
            : _currentMrz.sex),
        'docPortraitBase64': nfcPortraitBase64,
      });

      if (!mounted) return;

      // Show success state briefly before navigating
      setState(() => _mode = resp.mode);
      await Future.delayed(const Duration(milliseconds: 500));
      if (!mounted) return;

      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) {
            if (resp.mode == 'register') {
              return ProfileCreationScreen(
                policy: widget.policy,
                enrollmentSessionId: resp.enrollmentSessionId,
                firstName: chipMrz?.firstName ?? '',
                lastName: chipMrz?.lastName ?? '',
                gender: chipMrz?.gender ?? _currentMrz.sex,
                birthDate: chipMrz?.dateOfBirth ?? _currentMrz.birthDate,
                docPortraitBase64:
                    nfcPortraitBase64 ?? widget.docPortraitBase64 ?? '',
                livenessNonce: resp.livenessNonce,
              );
            }
            return resp.next == 'liveness'
                ? LivenessScreen(
                    policy: widget.policy,
                    enrollmentSessionId: resp.enrollmentSessionId,
                    livenessNonce: resp.livenessNonce,
                    firstName: chipMrz?.firstName ?? '',
                    lastName: chipMrz?.lastName ?? '',
                    docPortraitBase64:
                        nfcPortraitBase64 ?? widget.docPortraitBase64 ?? '',
                  )
                : DocumentEntryScreen(
                    policy: widget.policy,
                    enrollmentSessionId: resp.enrollmentSessionId,
                    initialDocNumber: effectiveDocNum,
                    initialDob: effectiveDob,
                    initialExpiry: effectiveExpiry,
                    initialPersonalNumber: effectivePn,
                    initialFirstName: chipMrz?.firstName ?? '',
                    initialLastName: chipMrz?.lastName ?? '',
                  );
          },
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
          _statusKey = null;
        });
      }
    }
  }

  Future<String?> _promptForPersonalNumber() async {
    final loc = Provider.of<LocalizationService>(context, listen: false);
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: Text(loc.translate('missing_personal_number')),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(loc.translate('personal_number_not_found')),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              decoration: InputDecoration(
                labelText: loc.translate('personal_number'),
                border: const OutlineInputBorder(),
              ),
              keyboardType: TextInputType.text, // Alphanumeric allowed?
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(loc.translate('cancel')),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: Text(loc.translate('confirm')),
          ),
        ],
      ),
    );
  }

  Future<void> _showEditDialog() async {
    final docController = TextEditingController(
      text: _currentMrz.documentNumber,
    );
    final dobController = TextEditingController(
      text: _dateFormat.format(_currentMrz.birthDate),
    );
    final expController = TextEditingController(
      text: _dateFormat.format(_currentMrz.expiryDate),
    );
    final natController = TextEditingController(text: _currentMrz.nationality);

    final loc = Provider.of<LocalizationService>(context, listen: false);
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(loc.translate('edit_mrz_data')),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                loc.translate('correct_mrz_values'),
                style: const TextStyle(fontSize: 13, color: Colors.grey),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: docController,
                decoration: InputDecoration(
                  labelText: loc.translate('doc_num_label'),
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: dobController,
                decoration: InputDecoration(
                  labelText: loc.translate('dob_format'),
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: expController,
                decoration: InputDecoration(
                  labelText: loc.translate('expiry_format'),
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: natController,
                decoration: InputDecoration(
                  labelText: loc.translate('nationality_format'),
                ),
                maxLength: 3,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(loc.translate('cancel')),
          ),
          ElevatedButton(
            onPressed: () {
              try {
                // Parse dates using the same format as display
                DateTime parseDate(String input) {
                  return _dateFormat.parse(input.trim());
                }

                setState(() {
                  _currentMrz = MrzData(
                    documentNumber: docController.text.toUpperCase().trim(),
                    birthDate: parseDate(dobController.text),
                    expiryDate: parseDate(expController.text),
                    personalNumber: _currentMrz.personalNumber,
                    nationality: natController.text.toUpperCase().trim(),
                    sex: _currentMrz.sex,
                  );
                  _error = null;
                  _showEditButton = false;
                });
                Navigator.pop(ctx);
              } catch (e) {
                ScaffoldMessenger.of(ctx).showSnackBar(
                  SnackBar(content: Text(loc.translate('invalid_date_format'))),
                );
              }
            },
            child: Text(loc.translate('save_retry_btn')),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Consumer<LocalizationService>(
      builder: (context, loc, child) {
        return Scaffold(
          appBar: AppBar(title: Text(loc.translate('nfc_scan'))),
          body: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  EnrollmentStepHeader(
                    step: 1,
                    total: 2,
                    title: loc.translate('nfc_scan'),
                    subtitle: loc.translate('nfc_unlock_subtitle'),
                  ),
                  const SizedBox(height: 20),

                  // Scan Info from MRZ
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: cs.surfaceContainerHighest.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: cs.outlineVariant.withValues(alpha: 0.5),
                      ),
                    ),
                    child: Column(
                      children: [
                        Text(
                          loc.translate('ready_to_auth'),
                          style: TextStyle(
                            color: cs.primary,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '${loc.translate('doc_num_label')}: ${_currentMrz.documentNumber}',
                        ),
                        Text(
                          '${loc.translate('date_of_birth')}: ${_dateFormat.format(_currentMrz.birthDate)}',
                        ),
                        Text(
                          '${loc.translate('expiry_date')}: ${_dateFormat.format(_currentMrz.expiryDate)}',
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 16),

                  // GUIDANCE / STATUS
                  Expanded(
                    child: Hero(
                      tag: 'nfcToFaceHero',
                      createRectTween: (begin, end) {
                        return MaterialRectCenterArcTween(
                          begin: begin,
                          end: end,
                        );
                      },
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(24),
                        decoration: BoxDecoration(
                          color: cs.surface,
                          borderRadius: BorderRadius.circular(24),
                          border: Border.all(
                            color: cs.outlineVariant.withValues(alpha: 0.6),
                          ),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            _submitting
                                ? Icon(
                                    Icons.check_circle,
                                    size: 100,
                                    color: Colors.green.shade600,
                                  )
                                : _scanning
                                ? const ScanningProgressIndicator(size: 140)
                                : SizedBox(
                                    height: 140,
                                    child: LottieBuilder.asset(
                                      'assets/lottie/nfc_tap_guide.json',
                                      animate: true,
                                      repeat: true,
                                      frameBuilder:
                                          (context, child, composition) {
                                            if (composition == null) {
                                              return Icon(
                                                Icons.nfc_rounded,
                                                size: 80,
                                                color: cs.onSurface.withValues(
                                                  alpha: 0.2,
                                                ),
                                              );
                                            }
                                            return child;
                                          },
                                    ),
                                  ),

                            const SizedBox(height: 24),
                            // Use Material for Text to avoid Hero text issues
                            Material(
                              color: Colors.transparent,
                              child: Text(
                                _scanning
                                    ? loc.translate(_statusKey ?? 'scanning')
                                    : (_submitting
                                          ? loc.translate('processing')
                                          : loc.translate('start_scan')),
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                  color: cs.onSurface,
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),
                            if (!_scanning && !_submitting)
                              Material(
                                color: Colors.transparent,
                                child: Text(
                                  loc.translate('tap_to_auth'),
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: 16,
                                    color: cs.onSurface.withValues(alpha: 0.7),
                                  ),
                                ),
                              ),
                            if (_mode != null) ...[
                              const SizedBox(height: 24),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 8,
                                ),
                                decoration: BoxDecoration(
                                  color: Colors.green.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      Icons.check_circle,
                                      color: Colors.green.shade700,
                                      size: 20,
                                    ),
                                    const SizedBox(width: 8),
                                    Material(
                                      color: Colors.transparent,
                                      child: Text(
                                        _mode == 'login'
                                            ? loc.translate('welcome_back')
                                            : loc.translate(
                                                'registration_started',
                                              ),
                                        style: TextStyle(
                                          color: Colors.green.shade900,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 24),

                  if (_error != null)
                    Container(
                      padding: const EdgeInsets.all(12),
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: Colors.red.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: Colors.red.withValues(alpha: 0.25),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(
                                Icons.error_outline,
                                color: Colors.red,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  _error!,
                                  style: const TextStyle(color: Colors.red),
                                ),
                              ),
                            ],
                          ),
                          if (_showEditButton)
                            Padding(
                              padding: const EdgeInsets.only(top: 8, left: 34),
                              child: OutlinedButton(
                                onPressed: _showEditDialog,
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: Colors.red,
                                  side: const BorderSide(color: Colors.red),
                                ),
                                child: Text(loc.translate('edit_mrz_data')),
                              ),
                            ),
                        ],
                      ),
                    ),

                  ElevatedButton.icon(
                    onPressed: (!_nfcEnabled || _scanning || _submitting)
                        ? null
                        : _startScan,
                    icon: (_scanning || _submitting)
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.waves_rounded),
                    label: Text(
                      _submitting
                          ? loc.translate('validating')
                          : (_scanning
                                ? loc.translate('scanning')
                                : loc.translate('start_nfc_scan')),
                    ),
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size(double.infinity, 56),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                      elevation: 2,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

// Transceiver Bridge
class FlutterNfcKitProvider extends ComProvider {
  FlutterNfcKitProvider() : super(Logger('FlutterNfcKitProvider'));

  @override
  Future<void> connect() async {
    // Already polled in logic
  }

  @override
  Future<void> disconnect() async {
    // Handled by finish
  }

  @override
  bool isConnected() => true;

  @override
  Future<Uint8List> transceive(final Uint8List data) async {
    return await FlutterNfcKit.transceive(data);
  }
}
