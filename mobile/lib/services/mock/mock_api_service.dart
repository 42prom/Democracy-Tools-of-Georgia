import '../../models/poll.dart';
import '../interfaces/i_api_service.dart';

/// Mock implementation of [IApiService] for offline development.
/// Returns fake polls, accepts votes/surveys locally.
class MockApiService implements IApiService {
  final List<Map<String, dynamic>> _submittedVotes = [];
  final List<Map<String, dynamic>> _submittedSurveys = [];

  @override
  void setCredential(String credential) {
    // No-op in mock mode — no real credential needed.
  }

  @override
  Future<List<Poll>> getPolls() async {
    await Future.delayed(const Duration(milliseconds: 500));

    return [
      Poll(
        id: 'mock-poll-001',
        title: 'Community Park Renovation',
        description:
            'Should the city invest in renovating Central Park with new facilities?',
        type: 'election',
        options: [
          PollOption(id: 'opt-001a', text: 'Yes, full renovation', displayOrder: 0),
          PollOption(id: 'opt-001b', text: 'Partial renovation only', displayOrder: 1),
          PollOption(id: 'opt-001c', text: 'No renovation needed', displayOrder: 2),
        ],
        tags: ['community', 'infrastructure'],
        endAt: DateTime.now().add(const Duration(days: 7)).toIso8601String(),
      ),
      Poll(
        id: 'mock-poll-002',
        title: 'Public Transport Improvement',
        description: 'Vote on the preferred public transport improvement plan.',
        type: 'referendum',
        options: [
          PollOption(id: 'opt-002a', text: 'Expand metro lines', displayOrder: 0),
          PollOption(id: 'opt-002b', text: 'More bus routes', displayOrder: 1),
        ],
        tags: ['transport', 'city'],
        endAt: DateTime.now().add(const Duration(days: 14)).toIso8601String(),
      ),
      Poll(
        id: 'mock-survey-001',
        title: 'Citizen Satisfaction Survey',
        description: 'Help us improve city services by sharing your feedback.',
        type: 'survey',
        options: [],
        questions: [
          SurveyQuestion(
            id: 'sq-001',
            questionText: 'How satisfied are you with city services?',
            questionType: 'rating_scale',
            required: true,
            displayOrder: 0,
            config: {'min': 1, 'max': 10, 'minLabel': 'Very poor', 'maxLabel': 'Excellent'},
            options: [],
          ),
          SurveyQuestion(
            id: 'sq-002',
            questionText: 'Which area needs the most improvement?',
            questionType: 'single_choice',
            required: true,
            displayOrder: 1,
            config: {},
            options: [
              QuestionOption(id: 'qo-001', optionText: 'Roads & Infrastructure', displayOrder: 0),
              QuestionOption(id: 'qo-002', optionText: 'Public Safety', displayOrder: 1),
              QuestionOption(id: 'qo-003', optionText: 'Education', displayOrder: 2),
              QuestionOption(id: 'qo-004', optionText: 'Healthcare', displayOrder: 3),
            ],
          ),
        ],
        tags: ['survey', 'feedback'],
        endAt: DateTime.now().add(const Duration(days: 30)).toIso8601String(),
      ),
    ];
  }

  @override
  Future<Map<String, dynamic>> requestChallenge() async {
    await Future.delayed(const Duration(milliseconds: 300));
    return {
      'nonce': 'mock-nonce-${DateTime.now().millisecondsSinceEpoch}',
      'expiresAt': DateTime.now().add(const Duration(seconds: 60)).toIso8601String(),
    };
  }

  @override
  Future<Map<String, dynamic>> issueAttestation({
    required String pollId,
    required String optionId,
    required int timestampBucket,
    required String nonce,
  }) async {
    await Future.delayed(const Duration(milliseconds: 300));
    return {
      'attestation': 'mock-attestation-${DateTime.now().millisecondsSinceEpoch}',
    };
  }

  @override
  Future<Map<String, dynamic>> submitVote({
    required String pollId,
    required String optionId,
    required String nullifier,
    required String attestation,
    required int timestampBucket,
  }) async {
    await Future.delayed(const Duration(milliseconds: 500));

    _submittedVotes.add({
      'pollId': pollId,
      'optionId': optionId,
      'timestamp': DateTime.now().toIso8601String(),
    });

    return {
      'success': true,
      'message': 'Vote recorded (mock)',
      'txHash': 'mock-tx-${DateTime.now().millisecondsSinceEpoch.toRadixString(16)}',
    };
  }

  @override
  Future<Map<String, dynamic>> submitSurvey({
    required String pollId,
    required String nullifier,
    required String attestation,
    required int timestampBucket,
    required List<Map<String, dynamic>> responses,
  }) async {
    await Future.delayed(const Duration(milliseconds: 500));

    _submittedSurveys.add({
      'pollId': pollId,
      'responses': responses,
      'timestamp': DateTime.now().toIso8601String(),
    });

    return {
      'success': true,
      'message': 'Survey submitted (mock)',
    };
  }

  @override
  Future<String> mockEnrollment() async {
    await Future.delayed(const Duration(seconds: 1));
    return 'mock_credential_phase0_${DateTime.now().millisecondsSinceEpoch}';
  }
}
