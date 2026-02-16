import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/poll.dart';
import '../../services/localization_service.dart';
import 'confirm_vote_screen.dart';

class ReferendumScreen extends StatefulWidget {
  final Poll poll;

  const ReferendumScreen({super.key, required this.poll});

  @override
  State<ReferendumScreen> createState() => _ReferendumScreenState();
}

class _ReferendumScreenState extends State<ReferendumScreen> {
  String? _selectedOptionId;

  Color _getOptionColor(String text, int index) {
    final lower = text.toLowerCase();
    if (lower == 'yes' || lower == 'for' || lower == 'approve') {
      return Colors.green;
    }
    if (lower == 'no' || lower == 'against' || lower == 'reject') {
      return Colors.red;
    }
    return Colors.grey;
  }

  IconData _getOptionIcon(String text) {
    final lower = text.toLowerCase();
    if (lower == 'yes' || lower == 'for' || lower == 'approve') {
      return Icons.check_circle;
    }
    if (lower == 'no' || lower == 'against' || lower == 'reject') {
      return Icons.cancel;
    }
    return Icons.remove_circle;
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<LocalizationService>(
      builder: (context, loc, child) {
        return Scaffold(
          appBar: AppBar(
            title: Text(loc.translate('referendum')),
            backgroundColor: Colors.transparent,
            elevation: 0,
          ),
          body: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Poll Title
                  Text(
                    widget.poll.title,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Referendum Question
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: Theme.of(
                        context,
                      ).primaryColor.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: Theme.of(
                          context,
                        ).primaryColor.withValues(alpha: 0.2),
                      ),
                    ),
                    child: Column(
                      children: [
                        Icon(
                          Icons.how_to_vote,
                          size: 36,
                          color: Theme.of(context).primaryColor,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          widget.poll.description ?? widget.poll.title,
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.w600),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 32),

                  // Voting Options
                  Expanded(
                    child: ListView.builder(
                      itemCount: widget.poll.options.length,
                      itemBuilder: (context, index) {
                        final option = widget.poll.options[index];
                        final isSelected = _selectedOptionId == option.id;
                        final color = _getOptionColor(option.text, index);
                        final icon = _getOptionIcon(option.text);

                        return Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Material(
                            color: Colors.transparent,
                            child: InkWell(
                              onTap: () {
                                setState(() => _selectedOptionId = option.id);
                              },
                              borderRadius: BorderRadius.circular(16),
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 200),
                                padding: const EdgeInsets.all(20),
                                decoration: BoxDecoration(
                                  color: isSelected
                                      ? color.withValues(alpha: 0.12)
                                      : Colors.grey.withValues(alpha: 0.05),
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(
                                    color: isSelected
                                        ? color
                                        : Colors.grey.shade300,
                                    width: isSelected ? 2.5 : 1,
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    Icon(
                                      isSelected
                                          ? icon
                                          : Icons.radio_button_off,
                                      color: isSelected ? color : Colors.grey,
                                      size: 32,
                                    ),
                                    const SizedBox(width: 16),
                                    Expanded(
                                      child: Text(
                                        option.text,
                                        style: TextStyle(
                                          fontSize: 18,
                                          fontWeight: isSelected
                                              ? FontWeight.bold
                                              : FontWeight.w500,
                                          color: isSelected
                                              ? color
                                              : Colors.grey.shade800,
                                        ),
                                      ),
                                    ),
                                    if (isSelected)
                                      Icon(Icons.check, color: color, size: 24),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),

                  // Submit Button
                  ElevatedButton(
                    onPressed: _selectedOptionId == null
                        ? null
                        : () {
                            final selectedOption = widget.poll.options
                                .firstWhere(
                                  (opt) => opt.id == _selectedOptionId,
                                );

                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (context) => ConfirmVoteScreen(
                                  poll: widget.poll,
                                  selectedOption: selectedOption,
                                ),
                              ),
                            );
                          },
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size(double.infinity, 56),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: Text(
                      loc.translate('submit_vote'),
                      style: const TextStyle(fontSize: 16),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Info
                  Text(
                    loc.translate('vote_anonymous_warning'),
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: Colors.grey),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
