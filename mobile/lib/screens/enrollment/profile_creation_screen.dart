import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/verification_models.dart';
import '../../services/interfaces/i_api_service.dart';
import '../../services/localization_service.dart';
import '../../services/service_locator.dart';
import '../../services/storage_service.dart';
import '../../widgets/region_selection_sheet.dart';
import '../../widgets/ui_components.dart';
import 'enrollment_step_header.dart';
import 'liveness_screen.dart';

class ProfileCreationScreen extends StatefulWidget {
  final VerificationPolicy policy;
  final String enrollmentSessionId;
  final String firstName;
  final String lastName;
  final String gender;
  final DateTime birthDate;
  final String? docPortraitBase64;
  final String? livenessNonce;

  const ProfileCreationScreen({
    super.key,
    required this.policy,
    required this.enrollmentSessionId,
    required this.firstName,
    required this.lastName,
    required this.gender,
    required this.birthDate,
    this.docPortraitBase64,
    this.livenessNonce,
  });

  @override
  State<ProfileCreationScreen> createState() => _ProfileCreationScreenState();
}

class _ProfileCreationScreenState extends State<ProfileCreationScreen> {
  final IApiService _api = ServiceLocator.apiService;
  final _formKey = GlobalKey<FormState>();

  late TextEditingController _nameController;
  late TextEditingController _surnameController;
  late TextEditingController _genderController;
  late TextEditingController _ageController; // derived from DOB
  late TextEditingController _dobController; // Added
  final TextEditingController _regionController = TextEditingController();

  Region? _selectedRegion;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.firstName);
    _surnameController = TextEditingController(text: widget.lastName);
    _genderController = TextEditingController(text: widget.gender);
    _dobController = TextEditingController(
      text: widget.birthDate.toString().split(' ')[0],
    ); // Simple ISO date
    _ageController = TextEditingController(
      text: _calculateAge(widget.birthDate).toString(),
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _surnameController.dispose();
    _genderController.dispose();
    _dobController.dispose();
    _ageController.dispose();
    _regionController.dispose();
    super.dispose();
  }

  int _calculateAge(DateTime birthDate) {
    final now = DateTime.now();
    int age = now.year - birthDate.year;
    if (now.month < birthDate.month ||
        (now.month == birthDate.month && now.day < birthDate.day)) {
      age--;
    }
    return age;
  }

  Future<void> _selectRegion() async {
    final result = await showModalBottomSheet<Region>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => FractionallySizedBox(
        heightFactor: 0.85,
        child: RegionSelectionSheet(
          apiService: _api,
          selectedCode: _selectedRegion?.code,
        ),
      ),
    );

    if (result != null) {
      setState(() {
        _selectedRegion = result;
        _regionController.text = result.nameEn;
      });
    }
  }

  Future<void> _submit() async {
    final loc = Provider.of<LocalizationService>(context, listen: false);

    if (!_formKey.currentState!.validate()) return;
    if (_selectedRegion == null) {
      DTGErrorDialog.show(
        context,
        title: loc.translate('region_required'),
        message: loc.translate('select_origin_region'),
        icon: Icons.map_rounded,
      );
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      await _api.updateProfile(
        enrollmentSessionId: widget.enrollmentSessionId,
        firstName: widget.firstName,
        lastName: widget.lastName,
        regionCodes: [_selectedRegion!.code],
      );

      // Save profile info locally
      final storage = StorageService();
      await storage.saveName(widget.firstName, widget.lastName);
      await storage.saveBirthDate(widget.birthDate);
      await storage.saveGender(widget.gender);
      await storage.saveRegionCodes([_selectedRegion!.code]);

      if (!mounted) return;

      // Navigate to Liveness
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => LivenessScreen(
            policy: widget.policy,
            enrollmentSessionId: widget.enrollmentSessionId,
            firstName: widget.firstName,
            lastName: widget.lastName,
            docPortraitBase64: widget.docPortraitBase64 ?? '',
            livenessNonce: widget.livenessNonce,
          ),
        ),
      );
    } catch (e) {
      if (mounted) {
        DTGErrorDialog.show(
          context,
          title: loc.translate('error'),
          message: e.toString().replaceAll('Exception:', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<LocalizationService>(
      builder: (context, loc, child) {
        return Scaffold(
          appBar: AppBar(title: Text(loc.translate('profile_details'))),
          body: SafeArea(
            child: Column(
              children: [
                EnrollmentStepHeader(
                  step: 2,
                  total: 2,
                  title: loc.translate('confirm_profile'),
                  subtitle: loc.translate('verify_details_region'),
                ),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(24),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Lock Info Alert
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.blue.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: Colors.blue.withValues(alpha: 0.3),
                              ),
                            ),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.verified_user_outlined,
                                  color: Colors.blue,
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    loc.translate('verified_from_id'),
                                    style: const TextStyle(
                                      color: Colors.blue,
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 24),

                          // Read-only fields
                          _buildReadOnlyField(loc.translate('first_name'), _nameController),
                          const SizedBox(height: 16),
                          _buildReadOnlyField(loc.translate('last_name'), _surnameController),
                          const SizedBox(height: 16),
                          _buildReadOnlyField(loc.translate('birth_date'), _dobController),
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              Expanded(
                                child: _buildReadOnlyField(
                                  loc.translate('gender'),
                                  _genderController,
                                ),
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: _buildReadOnlyField(loc.translate('age'), _ageController),
                              ),
                            ],
                          ),
                          const SizedBox(height: 24),

                          const Divider(),
                          const SizedBox(height: 24),

                          // Region Selection
                          Text(
                            loc.translate('origin_region'),
                            style: Theme.of(context).textTheme.titleMedium
                                ?.copyWith(fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 8),
                          InkWell(
                            onTap: _selectRegion,
                            borderRadius: BorderRadius.circular(12),
                            child: IgnorePointer(
                              child: TextFormField(
                                controller: _regionController,
                                decoration: InputDecoration(
                                  hintText: loc.translate('select_region'),
                                  suffixIcon: const Icon(
                                    Icons.keyboard_arrow_down_rounded,
                                  ),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  filled: true,
                                ),
                                validator: (v) =>
                                    v == null || v.isEmpty ? loc.translate('required') : null,
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            loc.translate('select_region_help'),
                            style: const TextStyle(fontSize: 12, color: Colors.grey),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

                // Footer Action
                Padding(
                  padding: const EdgeInsets.all(24),
                  child: ElevatedButton(
                    onPressed: _isSubmitting ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size(double.infinity, 56),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: _isSubmitting
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : Text(loc.translate('continue_btn')),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildReadOnlyField(String label, TextEditingController controller) {
    return TextFormField(
      controller: controller,
      readOnly: true,
      enabled: false,
      style: const TextStyle(
        color: Colors.grey,
      ), // Visual indication of disabled
      decoration: InputDecoration(
        labelText: label,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        filled: true,
        fillColor: Theme.of(context).brightness == Brightness.dark
            ? Colors.grey[900]
            : Colors.grey[200],
      ),
    );
  }
}
