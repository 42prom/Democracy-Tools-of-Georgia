// Ticket model for the help/support system

enum TicketStatus {
  open,
  inProgress,
  waitingUser,
  resolved,
  closed;

  String get displayName {
    switch (this) {
      case TicketStatus.open:
        return 'Open';
      case TicketStatus.inProgress:
        return 'In Progress';
      case TicketStatus.waitingUser:
        return 'Waiting for Response';
      case TicketStatus.resolved:
        return 'Resolved';
      case TicketStatus.closed:
        return 'Closed';
    }
  }

  static TicketStatus fromString(String value) {
    switch (value) {
      case 'open':
        return TicketStatus.open;
      case 'in_progress':
        return TicketStatus.inProgress;
      case 'waiting_user':
        return TicketStatus.waitingUser;
      case 'resolved':
        return TicketStatus.resolved;
      case 'closed':
        return TicketStatus.closed;
      default:
        return TicketStatus.open;
    }
  }
}

enum TicketPriority {
  low,
  medium,
  high,
  urgent;

  String get displayName {
    switch (this) {
      case TicketPriority.low:
        return 'Low';
      case TicketPriority.medium:
        return 'Medium';
      case TicketPriority.high:
        return 'High';
      case TicketPriority.urgent:
        return 'Urgent';
    }
  }

  static TicketPriority fromString(String value) {
    switch (value) {
      case 'low':
        return TicketPriority.low;
      case 'medium':
        return TicketPriority.medium;
      case 'high':
        return TicketPriority.high;
      case 'urgent':
        return TicketPriority.urgent;
      default:
        return TicketPriority.medium;
    }
  }
}

enum TicketCategory {
  general,
  account,
  voting,
  technical,
  verification,
  rewards,
  other;

  String get displayName {
    switch (this) {
      case TicketCategory.general:
        return 'General';
      case TicketCategory.account:
        return 'Account';
      case TicketCategory.voting:
        return 'Voting';
      case TicketCategory.technical:
        return 'Technical Issue';
      case TicketCategory.verification:
        return 'Verification';
      case TicketCategory.rewards:
        return 'Rewards';
      case TicketCategory.other:
        return 'Other';
    }
  }

  String get apiValue => name;

  static TicketCategory fromString(String value) {
    return TicketCategory.values.firstWhere(
      (e) => e.name == value,
      orElse: () => TicketCategory.general,
    );
  }
}

class Ticket {
  final String id;
  final String ticketNumber;
  final String subject;
  final String? message;
  final TicketCategory category;
  final TicketPriority priority;
  final TicketStatus status;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? resolvedAt;

  Ticket({
    required this.id,
    required this.ticketNumber,
    required this.subject,
    this.message,
    required this.category,
    required this.priority,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.resolvedAt,
  });

  factory Ticket.fromJson(Map<String, dynamic> json) {
    return Ticket(
      id: json['id'],
      ticketNumber: json['ticketNumber'],
      subject: json['subject'],
      message: json['message'],
      category: TicketCategory.fromString(json['category'] ?? 'general'),
      priority: TicketPriority.fromString(json['priority'] ?? 'medium'),
      status: TicketStatus.fromString(json['status'] ?? 'open'),
      createdAt: DateTime.parse(json['createdAt']),
      updatedAt: DateTime.parse(json['updatedAt']),
      resolvedAt: json['resolvedAt'] != null
          ? DateTime.parse(json['resolvedAt'])
          : null,
    );
  }

  bool get isOpen =>
      status == TicketStatus.open || status == TicketStatus.inProgress;
}

class TicketResponse {
  final String id;
  final String message;
  final bool isStaff;
  final String senderName;
  final DateTime createdAt;

  TicketResponse({
    required this.id,
    required this.message,
    required this.isStaff,
    required this.senderName,
    required this.createdAt,
  });

  factory TicketResponse.fromJson(Map<String, dynamic> json) {
    return TicketResponse(
      id: json['id'],
      message: json['message'],
      isStaff: json['isAdmin'] ?? false,
      senderName: json['senderName'] ?? (json['isAdmin'] ? 'Support' : 'You'),
      createdAt: DateTime.parse(json['createdAt']),
    );
  }
}

class TicketDetail {
  final Ticket ticket;
  final List<TicketResponse> responses;

  TicketDetail({required this.ticket, required this.responses});

  factory TicketDetail.fromJson(Map<String, dynamic> json) {
    return TicketDetail(
      ticket: Ticket.fromJson(json['ticket']),
      responses:
          (json['responses'] as List<dynamic>?)
              ?.map((r) => TicketResponse.fromJson(r))
              .toList() ??
          [],
    );
  }
}
