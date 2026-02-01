class Poll {
  final String id;
  final String title;
  final String? description;
  final String type; // election, referendum, survey
  final List<PollOption> options;
  final List<SurveyQuestion>? questions; // For survey type
  final List<String> tags;
  final String? endAt;

  Poll({
    required this.id,
    required this.title,
    this.description,
    required this.type,
    required this.options,
    this.questions,
    required this.tags,
    this.endAt,
  });

  bool get isSurvey => type == 'survey' && questions != null && questions!.isNotEmpty;

  factory Poll.fromJson(Map<String, dynamic> json) {
    List<SurveyQuestion>? questions;
    if (json['questions'] != null) {
      questions = (json['questions'] as List)
          .map((q) => SurveyQuestion.fromJson(q))
          .toList();
    }

    return Poll(
      id: json['id'],
      title: json['title'],
      description: json['description'],
      type: json['type'],
      options: (json['options'] as List? ?? [])
          .map((opt) => PollOption.fromJson(opt))
          .toList(),
      questions: questions,
      tags: List<String>.from(json['tags'] ?? []),
      endAt: json['end_at'],
    );
  }
}

class PollOption {
  final String id;
  final String text;
  final int displayOrder;

  PollOption({
    required this.id,
    required this.text,
    required this.displayOrder,
  });

  factory PollOption.fromJson(Map<String, dynamic> json) {
    return PollOption(
      id: json['id'],
      text: json['text'],
      displayOrder: json['display_order'] ?? 0,
    );
  }
}

class SurveyQuestion {
  final String id;
  final String questionText;
  final String questionType; // single_choice, multiple_choice, text, rating_scale, ranked_choice
  final bool required;
  final int displayOrder;
  final Map<String, dynamic> config;
  final List<QuestionOption> options;

  SurveyQuestion({
    required this.id,
    required this.questionText,
    required this.questionType,
    required this.required,
    required this.displayOrder,
    required this.config,
    required this.options,
  });

  factory SurveyQuestion.fromJson(Map<String, dynamic> json) {
    return SurveyQuestion(
      id: json['id'],
      questionText: json['questionText'] ?? json['question_text'],
      questionType: json['questionType'] ?? json['question_type'],
      required: json['required'] ?? true,
      displayOrder: json['displayOrder'] ?? json['display_order'] ?? 0,
      config: Map<String, dynamic>.from(json['config'] ?? {}),
      options: (json['options'] as List? ?? [])
          .map((opt) => QuestionOption.fromJson(opt))
          .toList(),
    );
  }
}

class QuestionOption {
  final String id;
  final String optionText;
  final int displayOrder;

  QuestionOption({
    required this.id,
    required this.optionText,
    required this.displayOrder,
  });

  factory QuestionOption.fromJson(Map<String, dynamic> json) {
    return QuestionOption(
      id: json['id'],
      optionText: json['optionText'] ?? json['option_text'],
      displayOrder: json['displayOrder'] ?? json['display_order'] ?? 0,
    );
  }
}

/// Holds all responses for a survey submission
class SurveyResponsePayload {
  final String pollId;
  final List<QuestionResponseData> responses;

  SurveyResponsePayload({
    required this.pollId,
    required this.responses,
  });

  Map<String, dynamic> toJson() {
    return {
      'pollId': pollId,
      'responses': responses.map((r) => r.toJson()).toList(),
    };
  }
}

class QuestionResponseData {
  final String questionId;
  final String? selectedOptionId;
  final List<String>? selectedOptionIds;
  final String? textResponse;
  final int? ratingValue;
  final List<String>? rankedOptionIds;

  QuestionResponseData({
    required this.questionId,
    this.selectedOptionId,
    this.selectedOptionIds,
    this.textResponse,
    this.ratingValue,
    this.rankedOptionIds,
  });

  Map<String, dynamic> toJson() {
    final map = <String, dynamic>{'questionId': questionId};
    if (selectedOptionId != null) map['selectedOptionId'] = selectedOptionId;
    if (selectedOptionIds != null) map['selectedOptionIds'] = selectedOptionIds;
    if (textResponse != null) map['textResponse'] = textResponse;
    if (ratingValue != null) map['ratingValue'] = ratingValue;
    if (rankedOptionIds != null) map['rankedOptionIds'] = rankedOptionIds;
    return map;
  }
}
