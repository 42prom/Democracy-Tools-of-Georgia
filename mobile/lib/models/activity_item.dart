import 'dart:convert';

class ActivityItem {
  final String pollId;
  final String title;
  final String type; // election, referendum, survey
  final DateTime votedAt;
  final String? endsAt; // ISO8601 string from poll.endAt
  final String? status; // e.g. 'ENDED'

  final String? rewardAmount;
  final String? rewardToken;
  final String? referendumQuestion;
  final String? electionQuestion;
  final String? votedOptionId;
  final String? votedOptionText;
  final Map<String, dynamic>? receipt;

  ActivityItem({
    required this.pollId,
    required this.title,
    required this.type,
    required this.votedAt,
    this.endsAt,
    this.status,
    this.rewardAmount,
    this.rewardToken,
    this.referendumQuestion,
    this.electionQuestion,
    this.votedOptionId,
    this.votedOptionText,
    this.receipt,
  });

  bool get hasEnded {
    if (status != null && status!.toUpperCase() == 'ENDED') return true;
    if (endsAt != null) {
      final end = DateTime.tryParse(endsAt!);
      if (end != null) return DateTime.now().isAfter(end);
    }
    return false;
  }

  Map<String, dynamic> toJson() => {
    'pollId': pollId,
    'title': title,
    'type': type,
    'votedAt': votedAt.toIso8601String(),
    'endsAt': endsAt,
    'status': status,
    'rewardAmount': rewardAmount,
    'rewardToken': rewardToken,
    'referendumQuestion': referendumQuestion,
    'electionQuestion': electionQuestion,
    'votedOptionId': votedOptionId,
    'votedOptionText': votedOptionText,
    'receipt': receipt,
  };

  factory ActivityItem.fromJson(Map<String, dynamic> json) => ActivityItem(
    pollId: json['pollId'],
    title: json['title'],
    type: json['type'],
    votedAt: DateTime.parse(json['votedAt']),
    endsAt: json['endsAt'],
    status: json['status'],
    rewardAmount:
        json['rewardAmount']?.toString() ??
        json['reward']?['amount']?.toString(),
    rewardToken: json['rewardToken'] ?? json['reward']?['token'],
    referendumQuestion: json['referendumQuestion'],
    electionQuestion: json['electionQuestion'],
    votedOptionId: json['votedOptionId'],
    votedOptionText: json['votedOptionText'],
    receipt: json['receipt'],
  );

  static List<ActivityItem> listFromJsonString(String jsonString) {
    if (jsonString.isEmpty) return [];
    final List<dynamic> list = json.decode(jsonString);
    return list
        .map((e) => ActivityItem.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static String listToJsonString(List<ActivityItem> items) {
    return json.encode(items.map((e) => e.toJson()).toList());
  }
}
