import 'package:flutter/material.dart';
import '../../models/activity_item.dart';

class ActivityDetailScreen extends StatelessWidget {
  final ActivityItem item;

  const ActivityDetailScreen({super.key, required this.item});

  @override
  Widget build(BuildContext context) {
    final ended = item.hasEnded;
    final typeLabel = item.type[0].toUpperCase() + item.type.substring(1);

    return Scaffold(
      appBar: AppBar(title: const Text('Activity Detail')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header icon
              Icon(
                item.type == 'survey' ? Icons.assignment : Icons.how_to_vote,
                size: 64,
                color: Theme.of(context).primaryColor,
              ),
              const SizedBox(height: 16),

              // Title
              Text(
                item.title,
                style: Theme.of(context)
                    .textTheme
                    .headlineSmall
                    ?.copyWith(fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),

              // Info card
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    children: [
                      _infoRow(context, 'Type', typeLabel),
                      const Divider(height: 24),
                      _infoRow(context, 'Voted on', _formatDateTime(item.votedAt)),
                      if (item.endsAt != null) ...[
                        const Divider(height: 24),
                        _infoRow(context, 'Ends at', _formatEndsAt(item.endsAt!)),
                      ],
                      const Divider(height: 24),
                      _infoRow(context, 'Status', ended ? 'Ended' : 'Live'),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // Results section
              if (ended) _buildResultsPlaceholder(context) else _buildLockedMessage(context),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLockedMessage(BuildContext context) {
    return Card(
      color: Colors.orange.shade900.withValues(alpha: 0.15),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Icon(Icons.lock_outline, size: 48, color: Colors.orange.shade300),
            const SizedBox(height: 16),
            Text(
              'Results available after poll ends.',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: Colors.orange.shade300,
                    fontWeight: FontWeight.w600,
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Check back once the voting period is over to see the outcome.',
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: Colors.grey),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResultsPlaceholder(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Icon(Icons.bar_chart, size: 48, color: Theme.of(context).primaryColor),
            const SizedBox(height: 16),
            Text(
              'Results',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            // Placeholder bars
            _placeholderBar(context, 0.72, 'Option A', '72%'),
            const SizedBox(height: 12),
            _placeholderBar(context, 0.28, 'Option B', '28%'),
            const SizedBox(height: 16),
            Text(
              'Placeholder results — real data will come from the API.',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: Colors.grey, fontStyle: FontStyle.italic),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _placeholderBar(BuildContext context, double fraction, String label, String pct) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: Theme.of(context).textTheme.bodyMedium),
            Text(pct, style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w600,
            )),
          ],
        ),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: fraction,
            minHeight: 8,
            backgroundColor: Colors.grey.shade800,
          ),
        ),
      ],
    );
  }

  Widget _infoRow(BuildContext context, String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label,
            style: Theme.of(context)
                .textTheme
                .bodyMedium
                ?.copyWith(color: Colors.grey)),
        Text(value,
            style: Theme.of(context)
                .textTheme
                .bodyMedium
                ?.copyWith(fontWeight: FontWeight.w600)),
      ],
    );
  }

  String _formatDateTime(DateTime dt) {
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')} '
        '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }

  String _formatEndsAt(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    return _formatDateTime(dt);
  }
}
