import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/message.dart';

class MessageCard extends StatelessWidget {
  final Message message;

  const MessageCard({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isCritical = message.type == 'critical';

    // Choose icon and color based on type
    IconData iconData;
    Color accentColor;

    switch (message.type) {
      case 'critical':
        iconData = Icons.warning_rounded;
        accentColor = Colors.redAccent;
        break;
      case 'announcement':
        iconData = Icons.campaign_rounded;
        accentColor = Colors.blueAccent;
        break;
      default:
        iconData = Icons.info_outline_rounded;
        accentColor = Colors.greenAccent;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: theme.cardColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: accentColor.withValues(alpha: isCritical ? 0.3 : 0.1),
          width: 1.5,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.2),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          // Decorative background element
          Positioned(
            right: -20,
            top: -20,
            child: Icon(
              iconData,
              size: 100,
              color: accentColor.withValues(alpha: 0.05),
            ),
          ),

          Padding(
            padding: const EdgeInsets.all(20.0),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Activity/Type Icon
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: accentColor.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(iconData, color: accentColor, size: 24),
                ),
                const SizedBox(width: 16),

                // Content
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Text(
                              message.title,
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                                color: isCritical
                                    ? Colors.redAccent
                                    : Colors.white,
                              ),
                            ),
                          ),
                          if (message.publishedAt != null)
                            Text(
                              DateFormat('h:mm a').format(message.publishedAt!),
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: Colors.grey.shade500,
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        message.body,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: Colors.white.withValues(alpha: 0.8),
                          height: 1.5,
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Bottom metadata
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          if (message.publishedAt != null)
                            Text(
                              DateFormat(
                                'MMM d, yyyy',
                              ).format(message.publishedAt!),
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: Colors.grey.shade600,
                                fontSize: 10,
                              ),
                            ),
                          if (message.publishedAt == null)
                            Text(
                              'Just now',
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: Colors.grey.shade600,
                                fontSize: 10,
                              ),
                            ),

                          // Tag for type if not critical (critical is obvious from icon/color)
                          if (!isCritical)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: accentColor.withValues(alpha: 0.05),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                message.type.toUpperCase(),
                                style: TextStyle(
                                  color: accentColor.withValues(alpha: 0.8),
                                  fontSize: 9,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
