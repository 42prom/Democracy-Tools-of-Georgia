class Message {
  final String id;
  final String title;
  final String body;
  final String type;
  final DateTime? publishedAt;
  final String status;
  final Map<String, dynamic>? audienceRules;

  Message({
    required this.id,
    required this.title,
    required this.body,
    required this.type,
    this.publishedAt,
    required this.status,
    this.audienceRules,
  });

  factory Message.fromJson(Map<String, dynamic> json) {
    return Message(
      id: json['id'] as String,
      title: json['title'] as String,
      body: json['body'] as String,
      type: json['type'] as String,
      publishedAt: json['published_at'] != null
          ? DateTime.tryParse(json['published_at'] as String)
          : null,
      status: json['status'] as String,
      audienceRules: json['audience_rules'] as Map<String, dynamic>?,
    );
  }
}
