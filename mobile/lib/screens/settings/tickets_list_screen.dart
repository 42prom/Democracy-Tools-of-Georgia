import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/theme.dart';
import '../../models/ticket.dart';
import '../../services/api_service.dart';
import '../../services/storage_service.dart';
import '../../services/localization_service.dart';
import 'ticket_detail_screen.dart';

class TicketsListScreen extends StatefulWidget {
  const TicketsListScreen({super.key});

  @override
  State<TicketsListScreen> createState() => _TicketsListScreenState();
}

class _TicketsListScreenState extends State<TicketsListScreen> {
  final ApiService _apiService = ApiService();
  final StorageService _storage = StorageService();
  List<Ticket> _tickets = [];
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadTickets();
  }

  Future<void> _loadTickets() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      // Load credential from storage and set it on ApiService
      final credential = await _storage.getCredential();
      if (credential == null) {
        throw Exception('Not authenticated. Please log in again.');
      }
      _apiService.setCredential(credential);

      final tickets = await _apiService.getTickets();
      if (mounted) {
        setState(() {
          _tickets = tickets;
          _isLoading = false;
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

  @override
  Widget build(BuildContext context) {
    return Consumer<LocalizationService>(
      builder: (context, loc, child) {
        return Scaffold(
          appBar: AppBar(
            title: Text(loc.translate('my_tickets')),
            backgroundColor: AppTheme.darkBackground,
            actions: [
              IconButton(
                icon: const Icon(Icons.refresh),
                onPressed: _loadTickets,
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
              Text(
                loc.translate('failed_load_tickets'),
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey.shade400),
              ),
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: _loadTickets,
                icon: const Icon(Icons.refresh),
                label: Text(loc.translate('retry')),
              ),
            ],
          ),
        ),
      );
    }

    if (_tickets.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.inbox_outlined,
                size: 80,
                color: Colors.grey.shade600,
              ),
              const SizedBox(height: 16),
              Text(
                loc.translate('no_tickets_yet'),
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                loc.translate('tickets_appear_here'),
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey.shade400),
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadTickets,
      color: AppTheme.facebookBlue,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _tickets.length,
        itemBuilder: (context, index) {
          final ticket = _tickets[index];
          return _TicketCard(
            ticket: ticket,
            loc: loc,
            onTap: () async {
              await Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => TicketDetailScreen(ticketId: ticket.id),
                ),
              );
              // Refresh list when returning
              _loadTickets();
            },
          );
        },
      ),
    );
  }
}

class _TicketCard extends StatelessWidget {
  final Ticket ticket;
  final LocalizationService loc;
  final VoidCallback onTap;

  const _TicketCard({
    required this.ticket,
    required this.loc,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      color: AppTheme.darkCard,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header: Ticket number and status
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '#${ticket.ticketNumber}',
                    style: TextStyle(
                      color: Colors.grey.shade400,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  _StatusBadge(status: ticket.status),
                ],
              ),
              const SizedBox(height: 8),

              // Subject
              Text(
                ticket.subject,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 12),

              // Footer: Category, Priority, Date
              Row(
                children: [
                  _InfoChip(
                    icon: _getCategoryIcon(ticket.category),
                    label: ticket.category.displayName,
                    color: AppTheme.facebookBlue,
                  ),
                  const SizedBox(width: 8),
                  _InfoChip(
                    icon: _getPriorityIcon(ticket.priority),
                    label: ticket.priority.displayName,
                    color: _getPriorityColor(ticket.priority),
                  ),
                  const Spacer(),
                  Text(
                    _formatDate(ticket.createdAt),
                    style: TextStyle(
                      color: Colors.grey.shade500,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
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

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);

    if (diff.inDays == 0) {
      if (diff.inHours == 0) {
        return '${diff.inMinutes}m ago';
      }
      return '${diff.inHours}h ago';
    } else if (diff.inDays == 1) {
      return loc.translate('yesterday');
    } else if (diff.inDays < 7) {
      return '${diff.inDays}d ago';
    } else {
      return '${date.day}/${date.month}/${date.year}';
    }
  }
}

class _StatusBadge extends StatelessWidget {
  final TicketStatus status;

  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
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
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(
        status.displayName,
        style: TextStyle(
          color: color,
          fontSize: 11,
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
    required this.color,
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
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
