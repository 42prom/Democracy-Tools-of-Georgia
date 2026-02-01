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
                ),
              ),
              const SizedBox(height: 8),

              // Description
              if (widget.poll.description != null) ...[
                Text(
                  widget.poll.description!,
                  style: Theme.of(
                    context,
                  ).textTheme.bodyLarge?.copyWith(color: Colors.grey),
                ),
                const SizedBox(height: 24),
              ],

              // Options (Radio Buttons)
              Expanded(
                child: ListView.builder(
                  itemCount: widget.poll.options.length,
                  itemBuilder: (context, index) {
                    final option = widget.poll.options[index];
                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      child: RadioListTile<String>(
                        // ignore: deprecated_member_use
                        value: option.id,
                        // ignore: deprecated_member_use
                        groupValue: _selectedOptionId,
                        // ignore: deprecated_member_use
                        onChanged: (value) {
                          setState(() => _selectedOptionId = value);
                        },
                        title: Text(
                          option.text,
                          style: const TextStyle(fontWeight: FontWeight.w500),
                        ),
                        activeColor: Theme.of(context).primaryColor,
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
