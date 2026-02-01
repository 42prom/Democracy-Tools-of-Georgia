import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/poll.dart';
import '../config/app_config.dart';

class ApiService {
  static String get baseUrl => AppConfig.apiBaseUrl;

  String? _credential;

  void setCredential(String credential) {
    _credential = credential;
  }

  Future<List<Poll>> getPolls() async {
    if (_credential == null) {
      throw Exception('Not authenticated');
    }

    final response = await http.get(
      Uri.parse('$baseUrl/polls'),
      headers: {'Authorization': 'Bearer $_credential'},
    );

    if (response.statusCode == 200) {
      final List<dynamic> data = json.decode(response.body);
      return data.map((poll) => Poll.fromJson(poll)).toList();
    } else {
      throw Exception('Failed to load polls');
    }
  }

  /// Step 1: Request challenge nonce
  /// POST /api/v1/attestations/challenge
  Future<Map<String, dynamic>> requestChallenge() async {
    if (_credential == null) {
      throw Exception('Not authenticated');
    }

    final response = await http.post(
      Uri.parse('$baseUrl/attestations/challenge'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_credential',
      },
    );

    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('Failed to request challenge');
    }
  }

  /// Step 3: Issue session attestation
  /// POST /api/v1/attestations/issue
  Future<Map<String, dynamic>> issueAttestation({
    required String pollId,
    required String optionId,
    required int timestampBucket,
    required String nonce,
  }) async {
    if (_credential == null) {
      throw Exception('Not authenticated');
    }

    final response = await http.post(
      Uri.parse('$baseUrl/attestations/issue'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_credential',
      },
      body: json.encode({
        'pollId': pollId,
        'optionId': optionId,
        'timestampBucket': timestampBucket,
        'nonce': nonce,
      }),
    );

    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('Failed to issue attestation');
    }
  }

  /// Step 5: Submit vote with attestation and nullifier
  /// POST /api/v1/votes
  Future<Map<String, dynamic>> submitVote({
    required String pollId,
    required String optionId,
    required String nullifier,
    required String attestation,
    required int timestampBucket,
  }) async {
    // NO credential sent - vote is anonymous
    final response = await http.post(
      Uri.parse('$baseUrl/votes'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'pollId': pollId,
        'optionId': optionId,
        'nullifier': nullifier,
        'attestation': attestation,
        'timestampBucket': timestampBucket,
      }),
    );

    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('Failed to submit vote: ${response.body}');
    }
  }

  /// Submit survey responses anonymously
  /// POST /api/v1/polls/:id/survey-submit
  Future<Map<String, dynamic>> submitSurvey({
    required String pollId,
    required String nullifier,
    required String attestation,
    required int timestampBucket,
    required List<Map<String, dynamic>> responses,
  }) async {
    // NO credential sent - survey submission is anonymous
    final response = await http.post(
      Uri.parse('$baseUrl/polls/$pollId/survey-submit'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'pollId': pollId,
        'nullifier': nullifier,
        'attestation': attestation,
        'timestampBucket': timestampBucket,
        'responses': responses,
      }),
    );

    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('Failed to submit survey: ${response.body}');
    }
  }

  // Mock enrollment for Phase 0
  Future<String> mockEnrollment() async {
    // Simulate API call delay
    await Future.delayed(const Duration(seconds: 2));

    // Return mock JWT credential
    return 'mock_credential_phase0_${DateTime.now().millisecondsSinceEpoch}';
  }
}
