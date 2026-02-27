import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../models/verification_models.dart';
import '../../services/interfaces/i_api_service.dart';
import '../../services/localization_service.dart';
import '../../services/service_locator.dart';

import 'document_camera_screen.dart';
import 'enrollment_step_header.dart';
import 'liveness_screen.dart';

class DocumentEntryScreen extends StatefulWidget {
  const DocumentEntryScreen({
    super.key,
    required this.policy,
    required this.enrollmentSessionId,
    this.initialPersonalNumber,
    this.initialFirstName,
    this.initialLastName,
    this.initialDob,
    this.initialExpiry,
    this.initialDocNumber,
  });

  final VerificationPolicy policy;
  final String? enrollmentSessionId;

  final String? initialPersonalNumber;
  final String? initialFirstName;
  final String? initialLastName;
  final DateTime? initialDob;
  final DateTime? initialExpiry;
  final String? initialDocNumber;

  @override
  State<DocumentEntryScreen> createState() => _DocumentEntryScreenState();
}

class _DocumentEntryScreenState extends State<DocumentEntryScreen> {
  final IApiService _api = ServiceLocator.apiService;

  XFile? _docPhoto;
  String? _docPortraitBase64; // MVP: we treat full image as portrait input

  late final TextEditingController _pnController;
  late final TextEditingController _firstNameController;
  late final TextEditingController _lastNameController;
  late final TextEditingController _docNumController;
  late final TextEditingController _dobController;
  late final TextEditingController _expiryController;

  DateTime? _dob;
  DateTime? _expiry;

  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _pnController = TextEditingController(text: widget.initialPersonalNumber);
    _firstNameController = TextEditingController(text: widget.initialFirstName);
    _lastNameController = TextEditingController(text: widget.initialLastName);
    _docNumController = TextEditingController(text: widget.initialDocNumber);

    _dob = widget.initialDob;
    _expiry = widget.initialExpiry;

    _dobController = TextEditingController(
      text: _dob != null ? _fmt(_dob!) : '',
    );
    _expiryController = TextEditingController(
      text: _expiry != null ? _fmt(_expiry!) : '',
    );
  }

  @override
  void dispose() {
    _pnController.dispose();
    _firstNameController.dispose();
    _lastNameController.dispose();
    _docNumController.dispose();
    _dobController.dispose();
    _expiryController.dispose();
    super.dispose();
  }

  String _fmt(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _selectDate(BuildContext context, bool isDob) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: (isDob ? _dob : _expiry) ?? DateTime.now(),
      firstDate: DateTime(1900),
      lastDate: DateTime(2100),
    );
    if (picked != null && mounted) {
      setState(() {
        if (isDob) {
          _dob = picked;
          _dobController.text = _fmt(picked);
        } else {
          _expiry = picked;
          _expiryController.text = _fmt(picked);
        }
      });
    }
  }

  Future<void> _captureDocPhoto() async {
    setState(() => _error = null);
    try {
      // Use custom camera screen
      final XFile? file = await Navigator.of(
        context,
      ).push(MaterialPageRoute(builder: (_) => const DocumentCameraScreen()));

      if (!mounted) return;
      if (file == null) return;

      final bytes = await file.readAsBytes();
      final b64 = base64Encode(bytes);
      setState(() {
        _docPhoto = file;
        _docPortraitBase64 = b64;
      });
    } catch (_) {
      if (!mounted) return;
      final loc = Provider.of<LocalizationService>(context, listen: false);
      setState(() => _error = loc.translate('capture_error'));
    }
  }

  Future<void> _continue() async {
    final loc = Provider.of<LocalizationService>(context, listen: false);

    // Note: session ID validation is relaxed here as IntroScreen now guarantees NFC flow
    // or checks policy. If missing, we show error but don't crash.
    if (widget.policy.nfc.requireNfc &&
        (widget.enrollmentSessionId == null ||
            widget.enrollmentSessionId!.isEmpty)) {
      setState(
        () => _error = loc.translate('session_missing_error'),
      );
      return;
    }
    if (widget.policy.documentScanner.requireDocumentPhotoScan &&
        _docPortraitBase64 == null) {
      setState(
        () => _error = loc.translate('document_photo_required'),
      );
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final sessionId =
          widget.enrollmentSessionId ??
          'mvp_session_${DateTime.now().millisecondsSinceEpoch}';
      final resp = await _api.submitDocument({
        'enrollmentSessionId': sessionId,
        'personalNumber': _pnController.text.trim(),
        'dob': _dobController.text.trim(),
        'expiry': _expiryController.text.trim(),
        'docNumber': _docNumController.text.trim().toUpperCase(),
        'docPortraitBase64': _docPortraitBase64,
      });

      if (!mounted) return;

      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => LivenessScreen(
            policy: widget.policy,
            enrollmentSessionId: sessionId,
            livenessNonce: resp.livenessNonce,
            docPortraitBase64: _docPortraitBase64!,
            firstName: _firstNameController.text.trim(),
            lastName: _lastNameController.text.trim(),
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Consumer<LocalizationService>(
      builder: (context, loc, child) {
        return Scaffold(
          appBar: AppBar(title: Text(loc.translate('document_scan'))),
          body: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  Expanded(
                    child: SingleChildScrollView(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          EnrollmentStepHeader(
                            step: 2,
                            total: 3,
                            title: loc.translate('document_scan'),
                            subtitle: loc.translate('fallback_scan_subtitle'),
                          ),
                          const SizedBox(height: 16),

                          Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: cs.surface,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                color: cs.outlineVariant.withValues(alpha: 0.6),
                              ),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  Icons.document_scanner_outlined,
                                  color: cs.primary,
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        loc.translate('policy'),
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        widget.policy.documentScanner.strictness ==
                                                'strict'
                                            ? loc.translate('strict_match')
                                            : loc.translate('lenient_match'),
                                        style: TextStyle(
                                          color: cs.onSurface.withValues(
                                            alpha: 0.70,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),

                          const SizedBox(height: 14),

                          const SizedBox(height: 14),

                          // Data Review Fields (NFC Scanned - Editable for corrections)
                          _buildEditableField(
                            loc.translate('personal_number'),
                            _pnController,
                            TextInputType.number,
                          ),
                          _buildEditableField(loc.translate('first_name'), _firstNameController),
                          _buildEditableField(loc.translate('last_name'), _lastNameController),
                          _buildEditableField(loc.translate('document_number'), _docNumController),

                          _buildDateField(loc.translate('date_of_birth'), _dobController, true),
                          _buildDateField(loc.translate('expiry_date'), _expiryController, false),

                          const SizedBox(height: 24),

                          if (widget
                              .policy
                              .documentScanner
                              .requireDocumentPhotoScan)
                            OutlinedButton.icon(
                              onPressed: _submitting ? null : _captureDocPhoto,
                              icon: const Icon(Icons.photo_camera_outlined),
                              label: Text(
                                _docPhoto == null
                                    ? loc.translate('capture_document_photo')
                                    : loc.translate('retake_document_photo'),
                              ),
                              style: OutlinedButton.styleFrom(
                                minimumSize: const Size(double.infinity, 52),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(14),
                                ),
                              ),
                            ),

                          if (_docPhoto != null) ...[
                            const SizedBox(height: 10),
                            Container(
                              height: 160,
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.05),
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(
                                  color: cs.outlineVariant.withValues(alpha: 0.6),
                                ),
                              ),
                              clipBehavior: Clip.antiAlias,
                              child: Image.file(
                                File(_docPhoto!.path),
                                fit: BoxFit.cover,
                                width: double.infinity,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 16),

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
                      child: Row(
                        children: [
                          const Icon(Icons.error_outline, color: Colors.red),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              _error!,
                              style: const TextStyle(color: Colors.red),
                            ),
                          ),
                        ],
                      ),
                    ),

                  ElevatedButton(
                    onPressed: _submitting ? null : _continue,
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size(double.infinity, 56),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: _submitting
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(
                                Colors.white,
                              ),
                            ),
                          )
                        : Text(
                            loc.translate('continue_btn'),
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
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

  Widget _buildEditableField(
    String label,
    TextEditingController controller, [
    TextInputType keyboardType = TextInputType.text,
  ]) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 4),
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          TextField(
            controller: controller,
            keyboardType: keyboardType,
            decoration: InputDecoration(
              filled: true,
              fillColor: Theme.of(
                context,
              ).colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                  color: Theme.of(
                    context,
                  ).colorScheme.outlineVariant.withValues(alpha: 0.5),
                ),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                  color: Theme.of(
                    context,
                  ).colorScheme.outlineVariant.withValues(alpha: 0.5),
                ),
              ),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 12,
              ),
            ),
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }

  Widget _buildDateField(
    String label,
    TextEditingController controller,
    bool isDob,
  ) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 4),
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          InkWell(
            onTap: () => _selectDate(context, isDob),
            borderRadius: BorderRadius.circular(12),
            child: IgnorePointer(
              child: TextField(
                controller: controller,
                decoration: InputDecoration(
                  filled: true,
                  fillColor: Theme.of(
                    context,
                  ).colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                  suffixIcon: const Icon(Icons.calendar_today_outlined),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(
                      color: Theme.of(
                        context,
                      ).colorScheme.outlineVariant.withValues(alpha: 0.5),
                    ),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(
                      color: Theme.of(
                        context,
                      ).colorScheme.outlineVariant.withValues(alpha: 0.5),
                    ),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                ),
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
