import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/theme.dart';
import '../../models/ticket.dart';
import '../../services/api_service.dart';
import '../../services/storage_service.dart';
import '../../services/localization_service.dart';

class TicketDetailScreen extends StatefulWidget {
  final String ticketId;

  const TicketDetailScreen({super.key, required this.ticketId});

  @override
  State<TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends State<TicketDetailScreen> {
  final ApiService _apiService = ApiService();
  final StorageService _storage = StorageService();
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  TicketDetail? _ticketDetail;
  bool _isLoading = true;
  bool _isSending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadTicketDetail();
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _ensureAuthenticated() async {
    final credential = await _storage.getCredential();
    if (credential == null) {
      throw Exception('Not authenticated. Please log in again.');
    }
    _apiService.setCredential(credential);
  }

  Future<void> _loadTicketDetail() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      await _ensureAuthenticated();
      final detail = await _apiService.getTicketDetail(widget.ticketId);
      if (mounted) {
        setState(() {
          _ticketDetail = detail;
          _isLoading = false;
        });
        // Scroll to bottom after loading
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (_scrollController.hasClients) {
            _scrollController.animateTo(
              _scrollController.position.maxScrollExtent,
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOut,
            );
          }
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _sendResponse() async {
    final message = _messageController.text.trim();
    if (message.isEmpty) return;

    setState(() => _isSending = true);

    try {
      await _ensureAuthenticated();
      await _apiService.respondToTicket(widget.ticketId, message);
      _messageController.clear();
      await _loadTicketDetail();

      if (mounted) {
        final loc = Provider.of<LocalizationService>(context, listen: false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(loc.translate('response_sent')),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        final loc = Provider.of<LocalizationService>(context, listen: false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '${loc.translate('failed_send_status')}: ${e.toString()}',
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSending = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<LocalizationService>(
      builder: (context, loc, child) {
        return Scaffold(
          appBar: AppBar(
            title: Text(
              _ticketDetail != null
                  ? '${loc.translate('ticket_number')}${_ticketDetail!.ticket.ticketNumber}'
                  : loc.translate('ticket_details'),
            ),
            backgroundColor: AppTheme.darkBackground,
            actions: [
              IconButton(
                icon: const Icon(Icons.refresh),
                onPressed: _loadTicketDetail,
              ),
            ],
          ),
          body: _buildBody(loc),
        );
      },
    );
  }

  Widget _buildBody(LocalizationService loc) {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: AppTheme.facebookBlue),
      );
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.error_outline, size: 64, color: Colors.red.shade300),
              const SizedBox(height: 16),
              const Text('Failed to load ticket'),
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: _loadTicketDetail,
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    final ticket = _ticketDetail!.ticket;
    final responses = _ticketDetail!.responses;
    final isClosed = ticket.status == TicketStatus.closed;

    return Column(
      children: [
        // Ticket Info Header
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          color: AppTheme.darkSurface,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      ticket.subject,
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 18,
                      ),
                    ),
                  ),
                  _StatusBadge(status: ticket.status),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  _InfoChip(
                    icon: Icons.category,
                    label: loc.translate(
                      'ticket_category_${ticket.category.name}',
                    ),
                  ),
                  const SizedBox(width: 8),
                  _InfoChip(
                    icon: Icons.flag,
                    label: loc.translate(
                      'ticket_priority_${ticket.priority.name}',
                    ),
                    color: _getPriorityColor(ticket.priority),
                  ),
                ],
              ),
            ],
          ),
        ),

        // Messages List
        Expanded(
          child: ListView(
            controller: _scrollController,
            padding: const EdgeInsets.all(16),
            children: [
              // Original message
              _MessageBubble(
                message: ticket.message ?? '',
                isStaff: false,
                senderName: loc.translate('you'),
                timestamp: ticket.createdAt,
                isOriginal: true,
                loc: loc,
              ),

              // Responses
              ...responses.map(
                (response) => _MessageBubble(
                  message: response.message,
                  isStaff: response.isStaff,
                  senderName: response.isStaff
                      ? loc.translate('support')
                      : loc.translate('you'),
                  timestamp: response.createdAt,
                  loc: loc,
                ),
              ),

              // Closed notice
              if (isClosed)
                Container(
                  margin: const EdgeInsets.only(top: 16),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.grey.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: Colors.grey.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.check_circle, color: Colors.grey.shade400),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          loc.translate('ticket_closed_notice'),
                          style: TextStyle(color: Colors.grey.shade400),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),

        // Reply Input (only if not closed)
        if (!isClosed)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.darkSurface,
              border: Border(top: BorderSide(color: Colors.grey.shade800)),
            ),
            child: SafeArea(
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _messageController,
                      decoration: InputDecoration(
                        hintText: loc.translate('reply_hint'),
                        hintStyle: TextStyle(color: Colors.grey.shade600),
                        filled: true,
                        fillColor: AppTheme.darkCard,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                      ),
                      maxLines: 3,
                      minLines: 1,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _sendResponse(),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Container(
                    decoration: BoxDecoration(
                      color: AppTheme.facebookBlue,
                      shape: BoxShape.circle,
                    ),
                    child: IconButton(
                      onPressed: _isSending ? null : _sendResponse,
                      icon: _isSending
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : const Icon(Icons.send, color: Colors.white),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
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

class _MessageBubble extends StatelessWidget {
  final String message;
  final bool isStaff;
  final String senderName;
  final DateTime timestamp;
  final bool isOriginal;
  final LocalizationService loc;

  const _MessageBubble({
    required this.message,
    required this.isStaff,
    required this.senderName,
    required this.timestamp,
    required this.loc,
    this.isOriginal = false,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      margin: EdgeInsets.only(
        top: isOriginal ? 0 : 12,
        left: isStaff ? 0 : 32,
        right: isStaff ? 32 : 0,
        bottom: 8,
      ),
      child: Column(
        crossAxisAlignment: isStaff
            ? CrossAxisAlignment.start
            : CrossAxisAlignment.end,
        children: [
          Row(
            mainAxisAlignment: isStaff
                ? MainAxisAlignment.start
                : MainAxisAlignment.end,
            children: [
              if (isStaff) ...[
                const CircleAvatar(
                  radius: 12,
                  child: Icon(Icons.support_agent, size: 14),
                ),
                const SizedBox(width: 8),
              ],
              Text(
                senderName,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: isStaff ? cs.primary : Colors.grey,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                _formatTime(timestamp, loc),
                style: TextStyle(color: Colors.grey.shade600, fontSize: 11),
              ),
            ],
          ),
          const SizedBox(height: 4),

          // Message bubble
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: isStaff
                  ? cs.surfaceContainerHigh
                  : cs.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(16),
                topRight: const Radius.circular(16),
                bottomLeft: isStaff
                    ? const Radius.circular(4)
                    : const Radius.circular(16),
                bottomRight: !isStaff
                    ? const Radius.circular(4)
                    : const Radius.circular(16),
              ),
              border: isStaff
                  ? Border.all(color: cs.outlineVariant)
                  : Border.all(color: cs.primary.withValues(alpha: 0.3)),
            ),
            child: Text(
              message,
              style: const TextStyle(fontSize: 14, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }

  String _formatTime(DateTime date, LocalizationService loc) {
    final now = DateTime.now();
    final isToday =
        date.day == now.day && date.month == now.month && date.year == now.year;

    if (isToday) {
      return '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
    } else {
      return '${date.day}/${date.month} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
    }
  }
}

class _StatusBadge extends StatelessWidget {
  final TicketStatus status;

  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    final loc = Provider.of<LocalizationService>(context);
    Color color;
    switch (status) {
      case TicketStatus.open:
        color = Colors.blue;
        break;
      case TicketStatus.inProgress:
        color = Colors.orange;
        break;
      case TicketStatus.waitingUser:
        color = Colors.purple;
        break;
      case TicketStatus.resolved:
        color = Colors.green;
        break;
      case TicketStatus.closed:
        color = Colors.grey;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        loc.translate('ticket_status_${status.name}'),
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _InfoChip({
    required this.icon,
    required this.label,
    this.color = Colors.grey,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(color: color, fontSize: 12)),
        ],
      ),
    );
  }
}
