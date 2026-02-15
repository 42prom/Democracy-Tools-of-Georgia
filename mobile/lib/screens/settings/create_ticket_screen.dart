import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'dart:io';
import '../../config/theme.dart';
import '../../models/ticket.dart';
import '../../services/api_service.dart';
import '../../services/storage_service.dart';
import '../../services/localization_service.dart';

class CreateTicketScreen extends StatefulWidget {
  const CreateTicketScreen({super.key});

  @override
  State<CreateTicketScreen> createState() => _CreateTicketScreenState();
}

class _CreateTicketScreenState extends State<CreateTicketScreen> {
  final _formKey = GlobalKey<FormState>();
  final _subjectController = TextEditingController();
  final _messageController = TextEditingController();

  TicketCategory _selectedCategory = TicketCategory.general;
  TicketPriority _selectedPriority = TicketPriority.medium;
  bool _isSubmitting = false;

  @override
  void dispose() {
    _subjectController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _submitTicket() async {
    if (!_formKey.currentState!.validate()) return;

    final loc = Provider.of<LocalizationService>(context, listen: false);
    setState(() => _isSubmitting = true);

    try {
      // Load credential from storage and set it on ApiService
      final storage = StorageService();
      final credential = await storage.getCredential();

      if (credential == null) {
        throw Exception('Not authenticated. Please log in again.');
      }

      final apiService = ApiService();
      apiService.setCredential(credential);

      // Get device info for debugging
      final deviceInfo = {
        'platform': Platform.operatingSystem,
        'version': Platform.operatingSystemVersion,
      };

      final result = await apiService.createTicket(
        subject: _subjectController.text.trim(),
        message: _messageController.text.trim(),
        category: _selectedCategory.apiValue,
        priority: _selectedPriority.name,
        deviceInfo: deviceInfo,
      );

      if (!mounted) return;

      // Show success dialog
      await showDialog(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => Consumer<LocalizationService>(
          builder: (context, loc, child) {
            return AlertDialog(
              backgroundColor: AppTheme.darkCard,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              title: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.green.withValues(alpha: 0.2),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.check, color: Colors.green),
                  ),
                  const SizedBox(width: 12),
                  Text(loc.translate('ticket_created')),
                ],
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    loc.translate('ticket_submitted_success'),
                    style: TextStyle(color: Colors.grey.shade300),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppTheme.darkSurface,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.confirmation_number,
                          color: AppTheme.facebookBlue,
                          size: 20,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'Ticket #${result['ticket']['ticketNumber']}',
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: AppTheme.facebookBlue,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    loc.translate('support_response'),
                    style: TextStyle(color: Colors.grey.shade400, fontSize: 13),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.of(dialogContext).pop(); // Close dialog
                    Navigator.of(context).pop(); // Go back to help screen
                  },
                  child: Text(loc.translate('done')),
                ),
              ],
            );
          },
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content:
              Text('${loc.translate('failed_create_ticket')}: ${e.toString()}'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<LocalizationService>(
      builder: (context, loc, child) {
        return Scaffold(
          appBar: AppBar(
            title: Text(loc.translate('create_ticket')),
            backgroundColor: AppTheme.darkBackground,
          ),
          body: Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Category Selection
                Text(
                  loc.translate('category'),
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(color: Colors.grey.shade400),
                ),
                const SizedBox(height: 8),
                Container(
                  decoration: BoxDecoration(
                    color: AppTheme.darkSurface,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: DropdownButtonFormField<TicketCategory>(
                    initialValue: _selectedCategory,
                    decoration: const InputDecoration(
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.symmetric(horizontal: 16),
                    ),
                    dropdownColor: AppTheme.darkCard,
                    items: TicketCategory.values.map((category) {
                      return DropdownMenuItem(
                        value: category,
                        child: Row(
                          children: [
                            Icon(
                              _getCategoryIcon(category),
                              size: 20,
                              color: AppTheme.facebookBlue,
                            ),
                            const SizedBox(width: 12),
                            Text(category.displayName),
                          ],
                        ),
                      );
                    }).toList(),
                    onChanged: (value) {
                      if (value != null) {
                        setState(() => _selectedCategory = value);
                      }
                    },
                  ),
                ),

                const SizedBox(height: 20),

                // Priority Selection
                Text(
                  loc.translate('priority'),
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(color: Colors.grey.shade400),
                ),
                const SizedBox(height: 8),
                Row(
                  children: TicketPriority.values.map((priority) {
                    final isSelected = _selectedPriority == priority;
                    return Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(
                          right: priority != TicketPriority.urgent ? 8 : 0,
                        ),
                        child: InkWell(
                          onTap: () =>
                              setState(() => _selectedPriority = priority),
                          borderRadius: BorderRadius.circular(8),
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? _getPriorityColor(priority)
                                      .withValues(alpha: 0.2)
                                  : AppTheme.darkSurface,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: isSelected
                                    ? _getPriorityColor(priority)
                                    : Colors.transparent,
                                width: 2,
                              ),
                            ),
                            child: Column(
                              children: [
                                Icon(
                                  _getPriorityIcon(priority),
                                  color: isSelected
                                      ? _getPriorityColor(priority)
                                      : Colors.grey,
                                  size: 20,
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  priority.displayName,
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: isSelected
                                        ? FontWeight.bold
                                        : FontWeight.normal,
                                    color: isSelected
                                        ? _getPriorityColor(priority)
                                        : Colors.grey,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),

                const SizedBox(height: 20),

                // Subject Field
                Text(
                  loc.translate('subject'),
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(color: Colors.grey.shade400),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _subjectController,
                  decoration: InputDecoration(
                    hintText: loc.translate('subject_hint'),
                    hintStyle: TextStyle(color: Colors.grey.shade600),
                    filled: true,
                    fillColor: AppTheme.darkSurface,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                    counterText: '',
                  ),
                  maxLength: 200,
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return loc.translate('enter_subject');
                    }
                    if (value.trim().length < 5) {
                      return loc.translate('subject_min_chars');
                    }
                    return null;
                  },
                ),

                const SizedBox(height: 20),

                // Message Field
                Text(
                  loc.translate('message_label'),
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(color: Colors.grey.shade400),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _messageController,
                  decoration: InputDecoration(
                    hintText: loc.translate('message_hint'),
                    hintStyle: TextStyle(color: Colors.grey.shade600),
                    filled: true,
                    fillColor: AppTheme.darkSurface,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                    counterText: '',
                  ),
                  maxLines: 6,
                  maxLength: 5000,
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return loc.translate('describe_issue');
                    }
                    if (value.trim().length < 20) {
                      return loc.translate('provide_more_details');
                    }
                    return null;
                  },
                ),

                const SizedBox(height: 16),

                // Tips
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppTheme.facebookBlue.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: AppTheme.facebookBlue.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(
                        Icons.lightbulb_outline,
                        color: AppTheme.facebookBlue,
                        size: 20,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          loc.translate('tip_include_steps'),
                          style: TextStyle(
                            color: Colors.grey.shade300,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                // Submit Button
                SizedBox(
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _isSubmitting ? null : _submitTicket,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.facebookBlue,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
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
                        : Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.send),
                              const SizedBox(width: 8),
                              Text(
                                loc.translate('submit_ticket'),
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                  ),
                ),

                const SizedBox(height: 32),
              ],
            ),
          ),
        );
      },
    );
  }

  IconData _getCategoryIcon(TicketCategory category) {
    switch (category) {
      case TicketCategory.general:
        return Icons.help_outline;
      case TicketCategory.account:
        return Icons.person_outline;
      case TicketCategory.voting:
        return Icons.how_to_vote;
      case TicketCategory.technical:
        return Icons.settings;
      case TicketCategory.verification:
        return Icons.verified_user;
      case TicketCategory.rewards:
        return Icons.card_giftcard;
      case TicketCategory.other:
        return Icons.more_horiz;
    }
  }

  IconData _getPriorityIcon(TicketPriority priority) {
    switch (priority) {
      case TicketPriority.low:
        return Icons.arrow_downward;
      case TicketPriority.medium:
        return Icons.remove;
      case TicketPriority.high:
        return Icons.arrow_upward;
      case TicketPriority.urgent:
        return Icons.priority_high;
    }
  }

  Color _getPriorityColor(TicketPriority priority) {
    switch (priority) {
      case TicketPriority.low:
        return Colors.grey;
      case TicketPriority.medium:
        return Colors.blue;
      case TicketPriority.high:
        return Colors.orange;
      case TicketPriority.urgent:
        return Colors.red;
    }
  }
}
