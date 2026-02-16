import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/localization_service.dart';
import '../../models/poll.dart';

class VoteReceiptScreen extends StatelessWidget {
  final Poll poll;
  final PollOption selectedOption;
  final String txHash;

  const VoteReceiptScreen({
    super.key,
    required this.poll,
    required this.selectedOption,
    required this.txHash,
  });

  @override
  Widget build(BuildContext context) {
    final loc = Provider.of<LocalizationService>(context);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),

              // Success Icon
              Icon(Icons.check_circle, size: 100, color: Colors.green),
              const SizedBox(height: 24),

              // Success Message
              Text(
                loc.translate('vote_submitted'),
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),

              // Receipt Details
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildReceiptRow(
                        loc.translate('poll'),
                        poll.title,
                        context,
                      ),
                      const Divider(height: 24),
                      _buildReceiptRow(
                        loc.translate('your_vote'),
                        selectedOption.text,
                        context,
                      ),
                      const Divider(height: 24),
                      _buildReceiptRow(
                        loc.translate('transaction_hash'),
                        txHash,
                        context,
                        mono: true,
                      ),
                    ],
                  ),
                ),
              ),

              const Spacer(),

              // Back to Home Button
              ElevatedButton(
                onPressed: () {
                  Navigator.of(context).popUntil((route) => route.isFirst);
                },
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size(double.infinity, 56),
                ),
                child: Text(loc.translate('back_to_home')),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildReceiptRow(
    String label,
    String value,
    BuildContext context, {
    bool mono = false,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: Colors.grey),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
            fontWeight: FontWeight.w500,
            fontFamily: mono ? 'monospace' : null,
          ),
        ),
      ],
    );
  }
}
