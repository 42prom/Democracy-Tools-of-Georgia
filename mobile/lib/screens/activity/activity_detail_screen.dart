import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../models/activity_item.dart';
import '../../services/service_locator.dart';

class ActivityDetailScreen extends StatefulWidget {
  final ActivityItem item;

  const ActivityDetailScreen({super.key, required this.item});

  @override
  State<ActivityDetailScreen> createState() => _ActivityDetailScreenState();
}

class _ActivityDetailScreenState extends State<ActivityDetailScreen> {
  bool _isLoading = false;
  String? _error;
  Map<String, dynamic>? _results;

  // Chart colors for results
  static const List<Color> _chartColors = [
    Color(0xFF2196F3), // Blue
    Color(0xFF4CAF50), // Green
    Color(0xFFFF9800), // Orange
    Color(0xFFE91E63), // Pink
    Color(0xFF9C27B0), // Purple
    Color(0xFF00BCD4), // Cyan
    Color(0xFFFFEB3B), // Yellow
    Color(0xFF795548), // Brown
  ];

  bool get _isSurvey => widget.item.type.toLowerCase() == 'survey';

  @override
  void initState() {
    super.initState();
    // Only load results for election/referendum, not survey
    if (widget.item.hasEnded && !_isSurvey) {
      _loadResults();
    }
  }

  Future<void> _loadResults() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final api = ServiceLocator.apiService;
      final results = await api.getPollResults(widget.item.pollId);
      setState(() {
        _results = results;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load results';
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final ended = widget.item.hasEnded;
    final typeLabel = widget.item.type.isEmpty
        ? ''
        : widget.item.type[0].toUpperCase() + widget.item.type.substring(1);

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
                _isSurvey ? Icons.assignment : Icons.how_to_vote,
                size: 64,
                color: Theme.of(context).primaryColor,
              ),
              const SizedBox(height: 16),

              // Title
              Text(
                widget.item.title,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
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
                      _infoRow(
                        context,
                        'Voted on',
                        _formatDateTime(widget.item.votedAt),
                      ),
                      if (widget.item.endsAt != null) ...[
                        const Divider(height: 24),
                        _infoRow(
                          context,
                          'Ends at',
                          _formatEndsAt(widget.item.endsAt!),
                        ),
                      ],
                      const Divider(height: 24),
                      _infoRow(context, 'Status', ended ? 'Ended' : 'Live'),
                      if (widget.item.rewardAmount != null) ...[
                        const Divider(height: 24),
                        _infoRow(
                          context,
                          'Reward',
                          '+${widget.item.rewardAmount} ${widget.item.rewardToken}',
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // Results section - only for election/referendum
              if (_isSurvey)
                _buildSurveyCompletedMessage(context)
              else if (ended)
                _buildResultsSection(context)
              else
                _buildLockedMessage(context),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSurveyCompletedMessage(BuildContext context) {
    return Card(
      color: Colors.green.shade900.withValues(alpha: 0.15),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Icon(Icons.check_circle, size: 48, color: Colors.green.shade400),
            const SizedBox(height: 16),
            Text(
              'Survey Submitted',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: Colors.green.shade400,
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Thank you for your participation.\nSurvey results are analyzed by administrators.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Colors.grey,
              ),
              textAlign: TextAlign.center,
            ),
          ],
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
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Colors.grey,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResultsSection(BuildContext context) {
    if (_isLoading) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(40),
          child: CircularProgressIndicator(),
        ),
      );
    }

    if (_error != null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Icon(Icons.error_outline, size: 48, color: Colors.red),
              const SizedBox(height: 16),
              Text(_error!, style: const TextStyle(color: Colors.red)),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: _loadResults,
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    final List<dynamic> resultsList = _results?['results'] ?? [];
    final int totalVotes = _results?['totalVotes'] ?? 0;
    final bool suppressed = _results?['suppressed'] == true;

    // Handle suppressed results (k-anonymity protection for live polls)
    if (suppressed && resultsList.isEmpty) {
      return Card(
        color: Colors.blue.shade900.withValues(alpha: 0.15),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              Icon(Icons.shield_outlined, size: 48, color: Colors.blue.shade300),
              const SizedBox(height: 16),
              Text(
                'Results Protected',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Colors.blue.shade300,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Results are hidden until more people vote to protect voter privacy.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Colors.grey,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                '$totalVotes votes so far',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Colors.grey.shade500,
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (resultsList.isEmpty || totalVotes == 0) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              Icon(Icons.how_to_vote_outlined, size: 48, color: Colors.grey.shade600),
              const SizedBox(height: 16),
              Text(
                'No votes recorded',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Colors.grey,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Results will appear once votes are counted.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Colors.grey,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    // Parse results for chart
    final List<_ChartData> chartData = [];
    for (int i = 0; i < resultsList.length; i++) {
      final res = resultsList[i];
      final String label = res['optionText'] ?? 'Option ${i + 1}';
      final int count = res['count'] ?? 0;
      final double percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
      chartData.add(_ChartData(
        label: label,
        count: count,
        percentage: percentage,
        color: _chartColors[i % _chartColors.length],
      ));
    }

    // Sort by count descending
    chartData.sort((a, b) => b.count.compareTo(a.count));

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            // Header
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.pie_chart, size: 24, color: Theme.of(context).primaryColor),
                const SizedBox(width: 8),
                Text(
                  'Results',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '$totalVotes Total Votes',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Colors.grey,
              ),
            ),
            const SizedBox(height: 24),

            // Donut Chart
            SizedBox(
              height: 200,
              child: CustomPaint(
                size: const Size(200, 200),
                painter: _DonutChartPainter(chartData),
              ),
            ),
            const SizedBox(height: 24),

            // Legend with bars
            ...chartData.map((data) => _buildResultItem(context, data)),
          ],
        ),
      ),
    );
  }

  Widget _buildResultItem(BuildContext context, _ChartData data) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Label and percentage
          Row(
            children: [
              // Color indicator
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: data.color,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              // Label
              Expanded(
                child: Text(
                  data.label,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              // Vote count and percentage
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${data.percentage.toStringAsFixed(1)}%',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: data.color,
                    ),
                  ),
                  Text(
                    '${data.count} votes',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Colors.grey,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Progress bar
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: data.percentage / 100,
              minHeight: 8,
              backgroundColor: Colors.grey.shade800,
              valueColor: AlwaysStoppedAnimation<Color>(data.color),
            ),
          ),
        ],
      ),
    );
  }

  Widget _infoRow(BuildContext context, String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: Colors.grey,
          ),
        ),
        Text(
          value,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
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

// Data class for chart
class _ChartData {
  final String label;
  final int count;
  final double percentage;
  final Color color;

  _ChartData({
    required this.label,
    required this.count,
    required this.percentage,
    required this.color,
  });
}

// Custom painter for donut chart
class _DonutChartPainter extends CustomPainter {
  final List<_ChartData> data;

  _DonutChartPainter(this.data);

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = math.min(size.width, size.height) / 2;
    final strokeWidth = radius * 0.35;
    final rect = Rect.fromCircle(center: center, radius: radius - strokeWidth / 2);

    double startAngle = -math.pi / 2; // Start from top

    for (final item in data) {
      final sweepAngle = (item.percentage / 100) * 2 * math.pi;

      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..color = item.color
        ..strokeCap = StrokeCap.butt;

      canvas.drawArc(rect, startAngle, sweepAngle, false, paint);
      startAngle += sweepAngle;
    }

    // Draw center circle (hole)
    final centerPaint = Paint()
      ..style = PaintingStyle.fill
      ..color = const Color(0xFF1E1E1E); // Dark background

    canvas.drawCircle(center, radius - strokeWidth, centerPaint);

    // Draw total in center
    final textPainter = TextPainter(
      text: TextSpan(
        text: '${data.fold(0, (sum, d) => sum + d.count)}',
        style: const TextStyle(
          color: Colors.white,
          fontSize: 24,
          fontWeight: FontWeight.bold,
        ),
      ),
      textDirection: TextDirection.ltr,
    );
    textPainter.layout();
    textPainter.paint(
      canvas,
      Offset(center.dx - textPainter.width / 2, center.dy - textPainter.height / 2 - 8),
    );

    final labelPainter = TextPainter(
      text: const TextSpan(
        text: 'votes',
        style: TextStyle(
          color: Colors.grey,
          fontSize: 12,
        ),
      ),
      textDirection: TextDirection.ltr,
    );
    labelPainter.layout();
    labelPainter.paint(
      canvas,
      Offset(center.dx - labelPainter.width / 2, center.dy + 8),
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
