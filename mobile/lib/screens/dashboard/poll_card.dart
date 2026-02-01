import 'package:flutter/material.dart';
import '../../models/poll.dart';
import '../voting/poll_details_screen.dart';
import '../voting/survey_screen.dart';
import '../voting/referendum_screen.dart';

class PollCard extends StatelessWidget {
  final Poll poll;

  const PollCard({super.key, required this.poll});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Type Badge + Title
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: poll.type == 'referendum'
                        ? Colors.purple.withValues(alpha: 0.15)
                        : poll.isSurvey
                            ? Colors.blue.withValues(alpha: 0.15)
                            : Colors.green.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    poll.type[0].toUpperCase() + poll.type.substring(1),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: poll.type == 'referendum'
                          ? Colors.purple
                          : poll.isSurvey
                              ? Colors.blue
                              : Colors.green,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              poll.title,
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),

            // Tags
            Wrap(
              spacing: 8,
              children: poll.tags.map((tag) {
                return Chip(
                  label: Text(tag, style: const TextStyle(fontSize: 12)),
                  backgroundColor: Theme.of(
                    context,
                  ).primaryColor.withValues(alpha: 0.2),
                  side: BorderSide.none,
                );
              }).toList(),
            ),
            const SizedBox(height: 16),

            // Vote Now Button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  Widget screen;
                  if (poll.isSurvey) {
                    screen = SurveyScreen(poll: poll);
                  } else if (poll.type == 'referendum') {
                    screen = ReferendumScreen(poll: poll);
                  } else {
                    screen = PollDetailsScreen(poll: poll);
                  }
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (context) => screen),
                  );
                },
                child: Text(
                  poll.isSurvey
                      ? 'Take Survey'
                      : poll.type == 'referendum'
                          ? 'Vote on Referendum'
                          : 'Vote Now',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
