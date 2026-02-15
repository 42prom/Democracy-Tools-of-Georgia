import 'package:flutter/material.dart';
import '../../models/poll.dart';
import 'confirm_vote_screen.dart';
import 'survey_screen.dart';
import 'referendum_screen.dart';

class PollDetailsScreen extends StatefulWidget {
  final Poll poll;

  const PollDetailsScreen({super.key, required this.poll});

  @override
  State<PollDetailsScreen> createState() => _PollDetailsScreenState();
}

class _PollDetailsScreenState extends State<PollDetailsScreen> {
  String? _selectedOptionId;

  @override
  void initState() {
    super.initState();
    // If this is a survey poll, redirect to SurveyScreen
    if (widget.poll.isSurvey) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (context) => SurveyScreen(poll: widget.poll),
          ),
        );
      });
    }
    // If this is a referendum, redirect to ReferendumScreen
    if (widget.poll.type == 'referendum') {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (context) => ReferendumScreen(poll: widget.poll),
          ),
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Poll Details')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Poll Title
              Text(
                widget.poll.title,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  height: 1.25,
                ),
              ),
              const SizedBox(height: 8),

              // Description
              if (widget.poll.description != null) ...[
                Text(
                  widget.poll.description!,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: Colors.grey,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 24),
              ],

              // Options (Radio Buttons)
              Expanded(
                child: ListView.builder(
                  itemCount: widget.poll.options.length,
                  itemBuilder: (context, index) {
                    final option = widget.poll.options[index];
                    final isSelected = _selectedOptionId == option.id;

                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12),
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
                                ? Theme.of(
                                    context,
                                  ).primaryColor.withValues(alpha: 0.1)
                                : Colors.grey.withValues(alpha: 0.05),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: isSelected
                                  ? Theme.of(context).primaryColor
                                  : Colors.grey.shade300,
                              width: isSelected ? 2 : 1,
                            ),
                          ),
                          child: Row(
                            children: [
                              Icon(
                                isSelected
                                    ? Icons.radio_button_checked
                                    : Icons.radio_button_off,
                                color: isSelected
                                    ? Theme.of(context).primaryColor
                                    : Colors.grey,
                                size: 28,
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: Text(
                                  option.text,
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: isSelected
                                        ? FontWeight.bold
                                        : FontWeight.w500,
                                    height: 1.4,
                                    color: isSelected
                                        ? Theme.of(context).primaryColor
                                        : Theme.of(
                                            context,
                                          ).textTheme.bodyLarge?.color,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),

              // Review Vote Button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _selectedOptionId == null
                      ? null
                      : () {
                          final selectedOption = widget.poll.options.firstWhere(
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
                  child: const Text('Review Vote'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
