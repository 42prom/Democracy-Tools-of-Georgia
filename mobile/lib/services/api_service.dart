import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../models/poll.dart';
import '../models/ticket.dart';
import '../config/app_config.dart';

class ApiService {
  static String get baseUrl => AppConfig.apiBaseUrl;

  String? _credential;

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
      body: json.encode({'deviceId': 'mobile', 'purpose': 'vote'}),
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
    // Backend no longer issues vote attestations in Phase 0.
    // Keep for compatibility.
    return {
      'attestation': 'mvp_attestation_${DateTime.now().millisecondsSinceEpoch}',
      'nonce': nonce,
    };
  }

  /// Step 5: Submit vote with attestation and nullifier
  /// POST /api/v1/votes
  /// Step 5: Submit vote
  /// POST /api/v1/polls/:id/vote
  Future<Map<String, dynamic>> submitVote({
    required String pollId,
    required String optionId,
    required String nullifier,
    required String attestation,
    required int timestampBucket,
  }) async {
    if (_credential == null) {
      throw Exception('Not authenticated');
    }

    final response = await http.post(
      Uri.parse('$baseUrl/polls/$pollId/vote'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_credential',
      },
      body: json.encode({
        'pollId': pollId,
        'optionId': optionId,
        'nullifier': nullifier,
        'nonce': 'vote_nonce_not_set',
        'signature': attestation,
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
      headers: {
        'Content-Type': 'application/json',
        if (_credential != null) 'Authorization': 'Bearer $_credential',
      },
      body: json.encode({'nullifier': nullifier, 'responses': responses}),
    );

    if (response.statusCode == 200) {
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
      String ticketId, String message) async {
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
