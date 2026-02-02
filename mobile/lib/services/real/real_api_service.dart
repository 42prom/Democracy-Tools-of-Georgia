import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../config/app_config.dart';
import '../../models/poll.dart';
import '../interfaces/i_api_service.dart';
import '../wallet_service.dart';
import '../storage_service.dart';

/// Real implementation of [IApiService] that calls the backend.
class RealApiService implements IApiService {
  static String get baseUrl => AppConfig.apiBaseUrl;

  String? _credential;
  String? _lastVoteNonce;
  final StorageService _storage = StorageService();

  Future<void> _ensureAuthenticated() async {
    if (_credential == null) {
      _credential = await _storage.getCredential();
    }
    if (_credential == null) {
      throw Exception('Not authenticated');
    }
  }

  @override
  void setCredential(String credential) {
    _credential = credential;
  }

  @override
  Future<List<Poll>> getPolls() async {
    await _ensureAuthenticated();

    final response = await http.get(
      Uri.parse('$baseUrl/polls'),
      headers: {'Authorization': 'Bearer $_credential'},
    );

    if (response.statusCode == 200) {
      final Map<String, dynamic> data = json.decode(response.body);
      final List<dynamic> pollsData = data['polls'] ?? [];
      return pollsData.map((poll) => Poll.fromJson(poll)).toList();
    } else {
      throw Exception('Failed to load polls');
    }
  }

  @override
  Future<Map<String, dynamic>> requestChallenge() async {
    await _ensureAuthenticated();

    final walletService = WalletService();
    final deviceId = await walletService.getWalletAddress();

    final response = await http.post(
      Uri.parse('$baseUrl/auth/challenge'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_credential',
            },
      body: json.encode({'deviceId': deviceId, 'purpose': 'vote'}),
    );

    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('Failed to request challenge');
    }
  }

  @override
  Future<Map<String, dynamic>> issueAttestation({
    required String pollId,
    required String optionId,
    required int timestampBucket,
    required String nonce,
  }) async {
    // Backend no longer issues vote attestations in Phase 0.
    // We keep this method for UI compatibility and bind the last vote nonce here.
    _lastVoteNonce = nonce;

    return {
      'attestation': 'mvp_attestation_${DateTime.now().millisecondsSinceEpoch}',
      'pollId': pollId,
      'optionId': optionId,
      'timestampBucket': timestampBucket,
      'nonce': nonce,
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
    await _ensureAuthenticated();

    final nonce = _lastVoteNonce;
    if (nonce == null) {
      throw Exception('Missing vote nonce. Please retry.');
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
        'nonce': nonce,
        'signature': attestation, // MVP placeholder (not validated server-side yet)
      }),
    );

    // Clear once used
    _lastVoteNonce = null;

    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('Failed to submit vote: ${response.body}');
    }
  }


  @override
  Future<Map<String, dynamic>> submitSurvey({
    required String pollId,
    required String nullifier,
    required String attestation,
    required int timestampBucket,
    required List<Map<String, dynamic>> responses,
  }) async {
    await _ensureAuthenticated();

    final response = await http.post(
      Uri.parse('$baseUrl/polls/$pollId/survey-submit'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_credential',
      },
      body: json.encode({
        'nullifier': nullifier,
        'responses': responses,
      }),
    );

    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('Failed to submit survey: ${response.body}');
    }
  }


  @override
  Future<String> mockEnrollment() async {
    // Phase 0: Use wallet address as device key for enrollment
    final walletService = WalletService();
    final address = await walletService.getWalletAddress();

    final response = await http.post(
      Uri.parse('$baseUrl/auth/enroll'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({'proof': 'mock_nfc_proof', 'deviceKey': address}),
    );

    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      return data['credential'];
    } else {
      throw Exception('Enrollment failed: ${response.body}');
    }
  }
}
