import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../models/poll.dart';
import '../models/ticket.dart';
import '../config/app_config.dart';
import 'device_attestation_service.dart';
import 'storage_service.dart';

class ApiService {
  static String get baseUrl => AppConfig.apiBaseUrl;

  String? _credential;
  String? _lastVoteNonce;
  String? _lastVotePollId;
  DeviceAttestationEvidence? _lastAttestationEvidence;
  int? _lastAttestationTimestampBucket;
  String? _lastAttestationOptionId;
  final StorageService _storage = StorageService();

  void setCredential(String credential) {
    _credential = credential;
  }

  Future<List<Poll>> getPolls() async {
    if (_credential == null) {
      debugPrint('[ApiService] ❌ Error: Not authenticated (no credential)');
      throw Exception('Not authenticated');
    }

    final url = '$baseUrl/polls';
    debugPrint('[ApiService] ===== FETCHING POLLS =====');
    debugPrint('[ApiService] URL: $url');
    final credPreview = _credential!.length > 20
        ? '${_credential!.substring(0, 20)}...'
        : _credential!;
    debugPrint('[ApiService] Credential: $credPreview');

    final response = await http.get(
      Uri.parse(url),
      headers: {'Authorization': 'Bearer $_credential'},
    );

    debugPrint('[ApiService] Response status: ${response.statusCode}');
    debugPrint('[ApiService] Response body length: ${response.body.length}');

    if (response.statusCode == 200) {
      final Map<String, dynamic> data = json.decode(response.body);
      final List<dynamic> pollsData = data['polls'] ?? [];
      debugPrint('[ApiService] Parsed ${pollsData.length} polls from response');
      final polls = pollsData.map((poll) => Poll.fromJson(poll)).toList();
      debugPrint('[ApiService] ✅ Converted to ${polls.length} Poll objects');
      return polls;
    } else {
      debugPrint('[ApiService] ❌ Failed with status ${response.statusCode}');
      debugPrint('[ApiService] Response: ${response.body}');
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
      Uri.parse('$baseUrl/auth/challenge'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_credential',
      },
      body: json.encode({
        'deviceId': await _storage.getOrCreateInstallationId(),
        'purpose': 'vote',
      }),
    );

    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('Failed to request challenge');
    }
  }

  /// Step 3: Issue session attestation
  /// POST /api/v1/attestations/issue
  /// Step 3: Issue session attestation (Phase 0: local placeholder)
  Future<Map<String, dynamic>> issueAttestation({
    required String pollId,
    required String optionId,
    required int timestampBucket,
    required String nonce,
  }) async {
    if (nonce.trim().isEmpty) throw ArgumentError('Nonce must not be empty');
    if (pollId.trim().isEmpty || optionId.trim().isEmpty) {
      throw ArgumentError('Poll and option must not be empty');
    }
    final binding = DeviceAttestationService.buildVoteBinding(
      nonce: nonce,
      pollId: pollId,
      optionId: optionId,
      timestampBucket: timestampBucket,
    );
    final evidence = await DeviceAttestationService.getAttestationEvidence(
      binding,
    );
    _lastVoteNonce = nonce;
    _lastVotePollId = pollId;
    _lastAttestationEvidence = evidence;
    _lastAttestationTimestampBucket = timestampBucket;
    _lastAttestationOptionId = optionId;
    return {
      'attestation': evidence.token,
      'platform': evidence.platform,
      'provider': evidence.provider,
      'nonce': nonce,
    };
  }

  /// Step 5: Submit a vote with payload-bound hardware attestation.
  /// POST /api/v1/polls/:id/vote
  Future<Map<String, dynamic>> submitVote({
    required String pollId,
    required String optionId,
    required String attestation,
    required int timestampBucket,
  }) async {
    if (_credential == null) {
      throw Exception('Not authenticated');
    }
    final nonce = _lastVoteNonce;
    final evidence = _lastAttestationEvidence;
    if (nonce == null || _lastVotePollId != pollId) {
      throw Exception('Missing poll-bound vote nonce');
    }
    if (evidence == null || evidence.token != attestation) {
      throw Exception('Missing or mismatched hardware attestation');
    }
    if (_lastAttestationTimestampBucket != timestampBucket ||
        _lastAttestationOptionId != optionId) {
      throw Exception('Attestation is not bound to this vote payload');
    }

    final response = await http.post(
      Uri.parse('$baseUrl/polls/$pollId/vote'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_credential',
        'X-Idempotency-Key': DeviceAttestationService.buildVoteIdempotencyKey(
          pollId,
          nonce,
        ),
      },
      body: json.encode({
        'pollId': pollId,
        'optionId': optionId,
        'nonce': nonce,
        'timestampBucket': timestampBucket,
        'signature': attestation,
        'device': {
          'id': await _storage.getOrCreateInstallationId(),
          'platform': evidence.platform,
          'provider': evidence.provider,
        },
        'attestation': {'token': evidence.token},
      }),
    );

    _lastVoteNonce = null;
    _lastVotePollId = null;
    _lastAttestationEvidence = null;
    _lastAttestationTimestampBucket = null;
    _lastAttestationOptionId = null;

    if (response.statusCode == 200) {
      if (evidence.platform == 'ios') {
        await DeviceAttestationService.confirmAppAttestRegistration();
      }
      return json.decode(response.body);
    } else {
      throw Exception('Failed to submit vote: ${response.body}');
    }
  }

  /// Submit authenticated survey responses; the backend derives its nullifier.
  /// POST /api/v1/polls/:id/survey-submit
  Future<Map<String, dynamic>> submitSurvey({
    required String pollId,
    required String attestation,
    required int timestampBucket,
    required List<Map<String, dynamic>> responses,
  }) async {
    if (_credential == null) throw Exception('Not authenticated');
    final nonce = _lastVoteNonce;
    final evidence = _lastAttestationEvidence;
    if (nonce == null || _lastVotePollId != pollId) {
      throw Exception('Missing poll-bound survey nonce');
    }
    final expectedAttestationOption =
        DeviceAttestationService.buildSurveyAttestationOption(responses);
    if (evidence == null ||
        evidence.token != attestation ||
        _lastAttestationOptionId != expectedAttestationOption ||
        _lastAttestationTimestampBucket != timestampBucket) {
      throw Exception('Missing or mismatched survey attestation');
    }
    final response = await http.post(
      Uri.parse('$baseUrl/polls/$pollId/survey-submit'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_credential',
        'X-Idempotency-Key': DeviceAttestationService.buildSurveyIdempotencyKey(
          pollId,
          nonce,
        ),
      },
      body: json.encode({
        'responses': responses,
        'nonce': nonce,
        'timestampBucket': timestampBucket,
        'signature': attestation,
        'device': {
          'id': await _storage.getOrCreateInstallationId(),
          'platform': evidence.platform,
          'provider': evidence.provider,
        },
        'attestation': {'token': evidence.token},
      }),
    );

    _lastVoteNonce = null;
    _lastVotePollId = null;
    _lastAttestationEvidence = null;
    _lastAttestationTimestampBucket = null;
    _lastAttestationOptionId = null;

    if (response.statusCode == 200) {
      if (evidence.platform == 'ios') {
        await DeviceAttestationService.confirmAppAttestRegistration();
      }
      return json.decode(response.body);
    } else {
      throw Exception('Failed to submit survey: ${response.body}');
    }
  }

  // ==================== TICKET/HELP SYSTEM ====================

  /// Create a new support ticket
  Future<Map<String, dynamic>> createTicket({
    required String subject,
    required String message,
    String category = 'general',
    String priority = 'medium',
    Map<String, dynamic>? deviceInfo,
  }) async {
    if (_credential == null) {
      throw Exception('Not authenticated');
    }

    final response = await http.post(
      Uri.parse('$baseUrl/tickets'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_credential',
      },
      body: json.encode({
        'subject': subject,
        'message': message,
        'category': category,
        'priority': priority,
        'deviceInfo': deviceInfo,
      }),
    );

    if (response.statusCode == 201) {
      return json.decode(response.body);
    } else {
      final error = _parseError(response.body);
      throw Exception(error);
    }
  }

  /// Get list of user's tickets
  Future<List<Ticket>> getTickets({int page = 1, int pageSize = 20}) async {
    if (_credential == null) {
      throw Exception('Not authenticated');
    }

    final response = await http.get(
      Uri.parse('$baseUrl/tickets?page=$page&pageSize=$pageSize'),
      headers: {'Authorization': 'Bearer $_credential'},
    );

    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      final List<dynamic> ticketsData = data['tickets'] ?? [];
      return ticketsData.map((t) => Ticket.fromJson(t)).toList();
    } else {
      throw Exception('Failed to load tickets');
    }
  }

  /// Get ticket details with responses
  Future<TicketDetail> getTicketDetail(String ticketId) async {
    if (_credential == null) {
      throw Exception('Not authenticated');
    }

    final response = await http.get(
      Uri.parse('$baseUrl/tickets/$ticketId'),
      headers: {'Authorization': 'Bearer $_credential'},
    );

    if (response.statusCode == 200) {
      return TicketDetail.fromJson(json.decode(response.body));
    } else {
      throw Exception('Failed to load ticket details');
    }
  }

  /// Add response to a ticket
  Future<Map<String, dynamic>> respondToTicket(
    String ticketId,
    String message,
  ) async {
    if (_credential == null) {
      throw Exception('Not authenticated');
    }

    final response = await http.post(
      Uri.parse('$baseUrl/tickets/$ticketId/respond'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_credential',
      },
      body: json.encode({'message': message}),
    );

    if (response.statusCode == 201) {
      return json.decode(response.body);
    } else {
      final error = _parseError(response.body);
      throw Exception(error);
    }
  }

  String _parseError(String body) {
    try {
      final data = json.decode(body);
      if (data is Map) {
        if (data['error'] is Map) {
          return data['error']['message'] ?? 'Unknown error';
        } else if (data['error'] is String) {
          return data['error'];
        }
      }
      return 'Request failed';
    } catch (e) {
      return 'Request failed';
    }
  }
}
