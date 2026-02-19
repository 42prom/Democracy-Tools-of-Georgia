import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/localization_service.dart';

class LanguageSettingsScreen extends StatelessWidget {
  const LanguageSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<LocalizationService>(
      builder: (context, locService, child) {
        final isGeorgian = locService.currentLanguage == AppLanguage.georgian;

        return Scaffold(
          appBar: AppBar(
            title: Text(locService.translate('language')),
          ),
          body: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header
                Text(
                  locService.translate('select_language'),
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const SizedBox(height: 24),

                // Language Toggle Card
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Row(
                      children: [
                        // English
                        Expanded(
                          child: _LanguageOption(
                            language: AppLanguage.english,
                            isSelected: !isGeorgian,
                            onTap: () =>
                                locService.setLanguage(AppLanguage.english),
                          ),
                        ),
                        const SizedBox(width: 12),
                        // Georgian
                        Expanded(
                          child: _LanguageOption(
                            language: AppLanguage.georgian,
                            isSelected: isGeorgian,
                            onTap: () =>
                                locService.setLanguage(AppLanguage.georgian),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),

                // Toggle Switch Alternative
                Card(
                  child: SwitchListTile(
                    title: const Text('ქართული / Georgian'),
                    subtitle: Text(
                      isGeorgian
                          ? 'ინტერფეისი ქართულ ენაზე'
                          : 'Switch to Georgian language',
                      style: TextStyle(color: Colors.grey.shade400),
                    ),
                    value: isGeorgian,
                    onChanged: (value) {
                      locService.setLanguage(
                        value ? AppLanguage.georgian : AppLanguage.english,
                      );
                    },
                    secondary: Icon(
                      Icons.language,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                ),
                const SizedBox(height: 32),

                // Info Text
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.blue.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: Colors.blue.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.info_outline, color: Colors.blue),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          isGeorgian
                              ? 'ენის შეცვლა დაუყოვნებლივ აისახება ინტერფეისზე'
                              : 'Language change will be applied immediately to the interface',
                          style: const TextStyle(color: Colors.blue),
                        ),
                      ),
                    ],
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

class _LanguageOption extends StatelessWidget {
  final AppLanguage language;
  final bool isSelected;
  final VoidCallback onTap;

  const _LanguageOption({
    required this.language,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final primaryColor = Theme.of(context).colorScheme.primary;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
        decoration: BoxDecoration(
          color: isSelected
              ? primaryColor.withValues(alpha: 0.15)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? primaryColor : Colors.grey.shade600,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Column(
          children: [
            // Flag/Icon
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isSelected
                    ? primaryColor.withValues(alpha: 0.2)
                    : Colors.grey.shade800,
              ),
              child: Center(
                child: Text(
                  language == AppLanguage.english ? '🇬🇧' : '🇬🇪',
                  style: const TextStyle(fontSize: 24),
                ),
              ),
            ),
            const SizedBox(height: 12),
            // Language name
            Text(
              language.displayName,
              style: TextStyle(
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                color: isSelected ? primaryColor : Colors.white,
                fontSize: 16,
              ),
            ),
            const SizedBox(height: 4),
            // Language code
            Text(
              language.code.toUpperCase(),
              style: TextStyle(
                color: Colors.grey.shade500,
                fontSize: 12,
              ),
            ),
            // Checkmark
            if (isSelected) ...[
              const SizedBox(height: 8),
              Icon(Icons.check_circle, color: primaryColor, size: 20),
            ],
          ],
        ),
      ),
    );
  }
}
