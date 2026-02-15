import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';
import 'package:provider/provider.dart';

import '../../services/interfaces/i_api_service.dart';
import '../../services/localization_service.dart';
import '../../services/service_locator.dart';
import '../../widgets/ui_components.dart';
import 'document_entry_screen.dart';
import 'mrz_scanner_screen.dart';

class IntroScreen extends StatefulWidget {
  const IntroScreen({super.key});

  @override
  State<IntroScreen> createState() => _IntroScreenState();
}

class _IntroScreenState extends State<IntroScreen> {
  final IApiService _api = ServiceLocator.apiService;

  bool _loading = false;

  Future<void> _start() async {
    setState(() {
      _loading = true;
    });

    try {
      final policy = await _api.fetchVerificationPolicy();

      if (!mounted) return;

      if (policy.documentScanner.provider == 'manual') {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) =>
                DocumentEntryScreen(policy: policy, enrollmentSessionId: null),
          ),
        );
      } else {
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => MrzScannerScreen(policy: policy)),
        );
      }
    } catch (_) {
      if (!mounted) return;
      final loc = Provider.of<LocalizationService>(context, listen: false);
      DTGErrorDialog.show(
        context,
        title: loc.translate('connection_error'),
        message: loc.translate('connection_error_msg'),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Consumer<LocalizationService>(
      builder: (context, loc, child) {
        return Scaffold(
          appBar: AppBar(
            title: Text(loc.translate('verify_identity')),
            backgroundColor: Colors.transparent,
            elevation: 0,
            actions: [
              // Language Switcher
              _LanguageSwitcher(locService: loc),
              const SizedBox(width: 8),
            ],
          ),
          body: SafeArea(
            child: Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.all(24),
                    children: [
                      const SizedBox(height: 12),
                      Text(
                        loc.translate('secure_enrollment'),
                        style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        loc.translate('secure_enrollment_desc'),
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          color: cs.onSurface.withValues(alpha: 0.70),
                        ),
                      ),
                      const SizedBox(height: 18),

                      _InfoCard(
                        title: loc.translate('identity_verification_card'),
                        description: loc.translate('identity_verification_card_desc'),
                      ),
                    ],
                  ),
                ),

                Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: ElevatedButton(
                    onPressed: _loading ? null : _start,
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size(double.infinity, 56),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: _loading
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
                            loc.translate('start_verification'),
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({
    required this.title,
    required this.description,
  });

  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: cs.outlineVariant.withValues(alpha: 0.6)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          // Animated ID verification icon
          Container(
            height: 60,
            width: 60,
            decoration: BoxDecoration(
              color: cs.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
            ),
            child: LottieBuilder.asset(
              'assets/lottie/id_verification.json',
              fit: BoxFit.contain,
              repeat: true,
              frameBuilder: (context, child, composition) {
                // Show placeholder icon while loading
                if (composition == null) {
                  return Icon(
                    Icons.document_scanner_outlined,
                    color: cs.primary,
                    size: 30,
                  );
                }
                return child;
              },
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 4),
                Text(
                  description,
                  style: TextStyle(color: cs.onSurface.withValues(alpha: 0.70)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Compact language switcher for the enrollment flow
class _LanguageSwitcher extends StatelessWidget {
  final LocalizationService locService;

  const _LanguageSwitcher({required this.locService});

  @override
  Widget build(BuildContext context) {
    final isGeorgian = locService.currentLanguage == AppLanguage.georgian;
    final cs = Theme.of(context).colorScheme;

    return GestureDetector(
      onTap: () => locService.toggleLanguage(),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: cs.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: cs.outlineVariant),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              isGeorgian ? '🇬🇪' : '🇬🇧',
              style: const TextStyle(fontSize: 18),
            ),
            const SizedBox(width: 6),
            Text(
              isGeorgian ? 'KA' : 'EN',
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: cs.onSurface,
                fontSize: 13,
              ),
            ),
            const SizedBox(width: 4),
            Icon(
              Icons.unfold_more,
              size: 16,
              color: cs.onSurface.withValues(alpha: 0.6),
            ),
          ],
        ),
      ),
    );
  }
}
