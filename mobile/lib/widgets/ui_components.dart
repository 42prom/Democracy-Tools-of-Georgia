import 'package:flutter/material.dart';

class DTGErrorDialog extends StatelessWidget {
  final String title;
  final String message;
  final IconData icon;
  final String buttonText;
  final VoidCallback? onConfirm;
  final String? secondaryButtonText;
  final VoidCallback? onSecondary;

  const DTGErrorDialog({
    super.key,
    required this.title,
    required this.message,
    this.icon = Icons.error_outline_rounded,
    this.buttonText = 'Try Again',
    this.onConfirm,
    this.secondaryButtonText,
    this.onSecondary,
  });

  static void show(
    BuildContext context, {
    required String title,
    required String message,
    IconData icon = Icons.error_outline_rounded,
    String buttonText = 'Try Again',
    VoidCallback? onConfirm,
    String? secondaryButtonText,
    VoidCallback? onSecondary,
  }) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => DTGErrorDialog(
        title: title,
        message: message,
        icon: icon,
        buttonText: buttonText,
        onConfirm: onConfirm,
        secondaryButtonText: secondaryButtonText,
        onSecondary: onSecondary,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
      backgroundColor: cs.surface.withValues(alpha: 0.95),
      surfaceTintColor: Colors.transparent,
      title: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.red.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: Colors.redAccent, size: 48),
          ),
          const SizedBox(height: 16),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 22),
          ),
        ],
      ),
      content: Text(
        message,
        textAlign: TextAlign.center,
        style: TextStyle(
          color: cs.onSurface.withValues(alpha: 0.8),
          fontSize: 15,
        ),
      ),
      actions: [
        Column(
          children: [
            // Primary button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  elevation: 0,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 48,
                    vertical: 14,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                onPressed: () {
                  Navigator.pop(context);
                  onConfirm?.call();
                },
                child: Text(buttonText),
              ),
            ),
            // Secondary button (e.g., "Go Back")
            if (secondaryButtonText != null) ...[
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: TextButton(
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 48,
                      vertical: 14,
                    ),
                  ),
                  onPressed: () {
                    Navigator.pop(context);
                    onSecondary?.call();
                  },
                  child: Text(
                    secondaryButtonText!,
                    style: TextStyle(color: Colors.grey.shade400),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 8),
          ],
        ),
      ],
    );
  }
}
