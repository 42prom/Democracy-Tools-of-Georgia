import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../../config/app_config.dart';
import '../../models/activity_item.dart';
import '../../models/poll.dart';
import '../../models/reward_balance.dart';
import '../../models/verification_models.dart';
import '../interfaces/i_api_service.dart';
import '../storage_service.dart';
import '../device_attestation_service.dart';

/// Real implementation of [IApiService] that calls the backend.
/// All HTTP calls are unified here with consistent timeout, retry, and auth handling.
class RealApiService implements IApiService {
  static String get baseUrl => AppConfig.apiBaseUrl;

  // HTTP timeout: 15 seconds for all requests
  static const Duration _httpTimeout = Duration(seconds: 15);

  // Retry configuration for safe GET requests only
  static const int _maxGetRetries = 1;
  static const Duration _baseRetryDelay = Duration(milliseconds: 500);
  static final Random _random = Random();

  String? _credential;
  String? _lastVoteNonce;
  String? _lastVotePollId;
  DeviceAttestationEvidence? _lastAttestationEvidence;
  int? _lastAttestationTimestampBucket;
  String? _lastAttestationOptionId;
  final StorageService _storage = StorageService();

  Future<void> _ensureAuthenticated() async {
    _credential ??= await _storage.getCredential();
    if (_credential == null) {
      throw Exception('Not authenticated');
    }
  }

  /// Unified GET request with optional retry (1 attempt with backoff + jitter)
  Future<http.Response> _getWithRetry(
    Uri uri, {
    Map<String, String>? headers,
    bool retry = true,
  }) async {
    int attempts = 0;
    // Always disable gzip: Flutter's http package does not auto-decompress
    final mergedHeaders = {'Accept-Encoding': 'identity', ...?headers};
    while (true) {
      try {
        final response = await http
            .get(uri, headers: mergedHeaders)
            .timeout(_httpTimeout);
        return response;
      } catch (e) {
        attempts++;
        if (!retry || attempts > _maxGetRetries) {
          rethrow;
        }
        // Exponential backoff with jitter
        final delay =
            _baseRetryDelay.inMilliseconds * attempts + _random.nextInt(300);
        debugPrint('[API] GET retry attempt $attempts after ${delay}ms');
        await Future.delayed(Duration(milliseconds: delay));
      }
    }
  }

  /// Unified POST request (no retry for data mutations)
  Future<http.Response> _post(
    Uri uri, {
    Map<String, String>? headers,
    Object? body,
  }) async {
    // Always disable gzip: Flutter's http package does not auto-decompress
    final mergedHeaders = {'Accept-Encoding': 'identity', ...?headers};
    return await http
        .post(uri, headers: mergedHeaders, body: body)
        .timeout(_httpTimeout);
  }

  @override
  void setCredential(String credential) {
    _credential = credential;
  }

  @override
  Future<List<Poll>> getPolls() async {
    await _ensureAuthenticated();

    final response = await http
        .get(
          Uri.parse('$baseUrl/polls'),
          headers: {
            'Authorization': 'Bearer $_credential',
            // Disable compression: Flutter's http package does not auto-decompress
            // gzip, causing FormatException: Missing extension byte
            'Accept-Encoding': 'identity',
          },
        )
        .timeout(_httpTimeout);

    if (response.statusCode == 200) {
      final Map<String, dynamic> data = json.decode(response.body);
      final List<dynamic> pollsData = data['polls'] ?? [];
      return pollsData.map((poll) => Poll.fromJson(poll)).toList();
    } else {
      throw Exception(_parseError(response.body));
    }
  }

  @override
  Future<Map<String, dynamic>> requestChallenge() async {
    await _ensureAuthenticated();

    final deviceId = await _storage.getOrCreateInstallationId();

    final response = await http
        .post(
          Uri.parse('$baseUrl/auth/challenge'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $_credential',
          },
          body: json.encode({'deviceId': deviceId, 'purpose': 'vote'}),
        )
        .timeout(_httpTimeout);

    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception(_parseError(response.body));
    }
  }

  @override
  Future<Map<String, dynamic>> issueAttestation({
    required String pollId,
    required String optionId,
    required int timestampBucket,
    required String nonce,
  }) async {
    await _ensureAuthenticated();

    if (nonce.trim().isEmpty) {
      throw Exception('Missing nonce');
    }
    if (pollId.trim().isEmpty || optionId.trim().isEmpty) {
      throw Exception('Invalid poll/option');
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
      'pollId': pollId,
      'optionId': optionId,
      'timestampBucket': timestampBucket,
      'nonce': nonce,
    };
  }

  // Retry configuration for a nonce-scoped idempotent vote submission.
  static const int _maxVoteRetries = 2;
  static const Duration _voteRetryDelay = Duration(milliseconds: 800);

  @override
  Future<Map<String, dynamic>> submitVote({
    required String pollId,
    required String optionId,
    required String attestation,
    required int timestampBucket,
  }) async {
    await _ensureAuthenticated();

    final nonce = _lastVoteNonce;
    if (nonce == null) {
      throw Exception('Missing vote nonce. Please retry.');
    }

    if (_lastVotePollId != pollId) {
      throw Exception('Attestation is not bound to this poll');
    }
    final evidence = _lastAttestationEvidence;
    if (evidence == null || evidence.token != attestation) {
      throw Exception('Missing or mismatched hardware attestation');
    }
    if (_lastAttestationTimestampBucket != timestampBucket ||
        _lastAttestationOptionId != optionId) {
      throw Exception('Attestation is not bound to this vote payload');
    }
    final deviceId = await _storage.getOrCreateInstallationId();

    final idempotencyKey = DeviceAttestationService.buildVoteIdempotencyKey(
      pollId,
      nonce,
    );

    int attempts = 0;
    Exception? lastError;

    while (attempts <= _maxVoteRetries) {
      try {
        final response = await http
            .post(
              Uri.parse('$baseUrl/polls/$pollId/vote'),
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer $_credential',
                'X-Idempotency-Key': idempotencyKey,
              },
              body: json.encode({
                'pollId': pollId,
                'optionId': optionId,
                'nonce': nonce,
                'timestampBucket': timestampBucket,
                // Stored only as a one-way audit hash on the server.
                'signature': attestation,
                'device': {
                  'id': deviceId,
                  'platform': evidence.platform,
                  'provider': evidence.provider,
                },
                'attestation': {'token': evidence.token},
              }),
            )
            .timeout(const Duration(seconds: 30));

        debugPrint('[API] Vote submission response: ${response.statusCode}');

        // Clear once used (successful or duplicate)
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
        } else if (response.statusCode == 409) {
          // 409 Conflict = duplicate vote (idempotent success)
          debugPrint('[API] Vote already recorded (idempotent)');
          if (evidence.platform == 'ios') {
            await DeviceAttestationService.confirmAppAttestRegistration();
          }
          return {'success': true, 'duplicate': true};
        } else {
          throw Exception(_parseError(response.body));
        }
      } catch (e) {
        attempts++;
        lastError = e is Exception ? e : Exception(e.toString());

        // Don't retry on non-network errors (auth, validation)
        final errorStr = e.toString().toLowerCase();
        if (errorStr.contains('unauthorized') ||
            errorStr.contains('forbidden') ||
            errorStr.contains('invalid') ||
            errorStr.contains('not found')) {
          _lastVoteNonce = null;
          _lastVotePollId = null;
          _lastAttestationEvidence = null;
          _lastAttestationTimestampBucket = null;
          _lastAttestationOptionId = null;
          rethrow;
        }

        if (attempts > _maxVoteRetries) {
          debugPrint('[API] Vote submission failed after $attempts attempts');
          _lastVoteNonce = null;
          _lastVotePollId = null;
          _lastAttestationEvidence = null;
          _lastAttestationTimestampBucket = null;
          _lastAttestationOptionId = null;
          rethrow;
        }

        // Exponential backoff with jitter for network errors
        final delay =
            _voteRetryDelay.inMilliseconds * attempts + _random.nextInt(400);
        debugPrint('[API] Vote retry attempt $attempts after ${delay}ms');
        await Future.delayed(Duration(milliseconds: delay));
      }
    }

    // Should never reach here, but just in case
    _lastVoteNonce = null;
    _lastVotePollId = null;
    _lastAttestationEvidence = null;
    _lastAttestationTimestampBucket = null;
    _lastAttestationOptionId = null;
    throw lastError ?? Exception('Vote submission failed');
  }

  @override
  Future<Map<String, dynamic>> submitSurvey({
    required String pollId,
    required String attestation,
    required int timestampBucket,
    required List<Map<String, dynamic>> responses,
  }) async {
    await _ensureAuthenticated();

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
    final deviceId = await _storage.getOrCreateInstallationId();

    final response = await http
        .post(
          Uri.parse('$baseUrl/polls/$pollId/survey-submit'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $_credential',
            'X-Idempotency-Key':
                DeviceAttestationService.buildSurveyIdempotencyKey(
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
              'id': deviceId,
              'platform': evidence.platform,
              'provider': evidence.provider,
            },
            'attestation': {'token': evidence.token},
          }),
        )
        .timeout(_httpTimeout);

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
      throw Exception(_parseError(response.body));
    }
  }

  @override
  Future<VerificationPolicy> fetchVerificationPolicy() async {
    final response = await http
        .get(
          Uri.parse('$baseUrl/settings/verification'),
          headers: {'Accept': 'application/json'},
        )
        .timeout(const Duration(seconds: 10));

    if (response.statusCode == 200) {
      return VerificationPolicy.fromJson(json.decode(response.body));
    } else {
      throw Exception(_parseError(response.body));
    }
  }

  @override
  Future<EnrollmentNfcResponse> submitNfc(Map<String, dynamic> payload) async {
    final url = '$baseUrl/enrollment/nfc';
    final response = await http
        .post(
          Uri.parse(url),
          headers: {'Content-Type': 'application/json'},
          body: json.encode(payload),
        )
        .timeout(_httpTimeout);

    if (response.statusCode == 200) {
      return EnrollmentNfcResponse.fromJson(json.decode(response.body));
    } else {
      throw Exception(_parseError(response.body));
    }
  }

  @override
  Future<EnrollmentContinueResponse> submitDocument(
    Map<String, dynamic> payload,
  ) async {
    final url = '$baseUrl/enrollment/document';
    final response = await http
        .post(
          Uri.parse(url),
          headers: {'Content-Type': 'application/json'},
          body: json.encode(payload),
        )
        .timeout(_httpTimeout);

    if (response.statusCode == 200) {
      return EnrollmentContinueResponse.fromJson(json.decode(response.body));
    } else {
      throw Exception(_parseError(response.body));
    }
  }

  @override
  Future<EnrollmentFinalizeResponse> submitLiveness(
    Map<String, dynamic> payload,
  ) async {
    final url = '$baseUrl/enrollment/verify-biometrics';
    final response = await http
        .post(
          Uri.parse(url),
          headers: {'Content-Type': 'application/json'},
          body: json.encode(payload),
        )
        .timeout(_httpTimeout);

    if (response.statusCode == 200) {
      return EnrollmentFinalizeResponse.fromJson(json.decode(response.body));
    } else {
      throw Exception(_parseError(response.body));
    }
  }

  @override
  Future<List<Region>> getRegions() async {
    final url = '$baseUrl/enrollment/regions';
    try {
      final response = await http.get(Uri.parse(url)).timeout(_httpTimeout);
      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        return data.map((e) => Region.fromJson(e)).toList();
      } else {
        throw Exception(_parseError(response.body));
      }
    } catch (e) {
      debugPrint('[API] getRegions failed: $e');
      rethrow;
    }
  }

  @override
  Future<bool> checkUserExists(String personalNumber) async {
    final response = await http
        .post(
          Uri.parse('$baseUrl/enrollment/status'),
          headers: {'Content-Type': 'application/json'},
          body: json.encode({'personalNumber': personalNumber}),
        )
        .timeout(_httpTimeout);

    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      return data['exists'] == true;
    } else {
      throw Exception(_parseError(response.body));
    }
  }

  @override
  Future<void> updateProfile({
    required String enrollmentSessionId,
    List<String>? regionCodes,
    String? firstName,
    String? lastName,
  }) async {
    final response = await http
        .post(
          Uri.parse('$baseUrl/enrollment/profile'),
          headers: {'Content-Type': 'application/json'},
          body: json.encode({
            'enrollmentSessionId': enrollmentSessionId,
            // Backend expects singular regionCode (UUID), not array
            'regionCode': regionCodes?.isNotEmpty == true
                ? regionCodes!.first
                : null,
            'firstName': firstName,
            'lastName': lastName,
          }),
        )
        .timeout(_httpTimeout);

    if (response.statusCode != 200) {
      throw Exception(_parseError(response.body));
    }
  }

  @override
  Future<List<ActivityItem>> getRewardHistory() async {
    await _ensureAuthenticated();

    final response = await http
        .get(
          Uri.parse('$baseUrl/rewards/history'),
          headers: {'Authorization': 'Bearer $_credential'},
        )
        .timeout(_httpTimeout);

    if (response.statusCode == 200) {
      final Map<String, dynamic> data = json.decode(response.body);
      final List<dynamic> historyData = data['history'] ?? [];
      return historyData.map((item) => ActivityItem.fromJson(item)).toList();
    } else {
      throw Exception(_parseError(response.body));
    }
  }

  @override
  Future<List<RewardBalance>> getRewardBalance() async {
    await _ensureAuthenticated();

    final response = await http
        .get(
          Uri.parse('$baseUrl/rewards/balance'),
          headers: {'Authorization': 'Bearer $_credential'},
        )
        .timeout(_httpTimeout);

    if (response.statusCode == 200) {
      final Map<String, dynamic> data = json.decode(response.body);
      final List<dynamic> balancesData = data['balances'] ?? [];
      return balancesData.map((b) => RewardBalance.fromJson(b)).toList();
    } else {
      throw Exception(_parseError(response.body));
    }
  }

  @override
  Future<List<ActivityItem>> getMyActivity() async {
    await _ensureAuthenticated();

    final response = await _getWithRetry(
      Uri.parse('$baseUrl/activity/me'),
      headers: {'Authorization': 'Bearer $_credential'},
    );

    if (response.statusCode == 200) {
      final Map<String, dynamic> data = json.decode(response.body);
      final List<dynamic> activitiesData = data['activities'] ?? [];
      return activitiesData.map((item) => ActivityItem.fromJson(item)).toList();
    } else {
      throw Exception(_parseError(response.body));
    }
  }

  @override
  Future<Poll> getPollDetails(String id) async {
    await _ensureAuthenticated();

    final response = await http
        .get(
          Uri.parse('$baseUrl/polls/$id'),
          headers: {'Authorization': 'Bearer $_credential'},
        )
        .timeout(_httpTimeout);

    if (response.statusCode == 200) {
      return Poll.fromJson(json.decode(response.body));
    } else {
      throw Exception(_parseError(response.body));
    }
  }

  @override
  Future<Map<String, dynamic>> getPollResults(String id) async {
    await _ensureAuthenticated();

    final response = await http
        .get(
          Uri.parse('$baseUrl/stats/polls/$id/results'),
          headers: {'Authorization': 'Bearer $_credential'},
        )
        .timeout(_httpTimeout);

    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception(_parseError(response.body));
    }
  }

  @override
  Future<void> registerDevice(String token, String platform) async {
    await _ensureAuthenticated();

    final response = await _post(
      Uri.parse('$baseUrl/devices/register'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_credential',
      },
      body: json.encode({'token': token, 'platform': platform}),
    );

    if (response.statusCode != 200 && response.statusCode != 201) {
      debugPrint('[API] Device registration failed: ${response.body}');
      throw Exception('Failed to register device');
    }
    debugPrint('[API] Device registered successfully');
  }

  @override
  Future<void> unregisterDevice(String token) async {
    await _ensureAuthenticated();

    final response = await http
        .delete(
          Uri.parse('$baseUrl/devices/unregister'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $_credential',
          },
          body: json.encode({'token': token}),
        )
        .timeout(_httpTimeout);

    if (response.statusCode != 200) {
      debugPrint('[API] Device unregistration failed: ${response.body}');
    }
  }

  @override
  Future<Map<String, dynamic>> sendTokens({
    required String toAddress,
    required String amount,
  }) async {
    await _ensureAuthenticated();

    final response = await _post(
      Uri.parse('$baseUrl/rewards/send'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_credential',
      },
      body: json.encode({'toAddress': toAddress, 'amount': amount}),
    );

    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception(_parseError(response.body));
    }
  }

  @override
  Future<List<Map<String, dynamic>>> getTransactions() async {
    await _ensureAuthenticated();

    final response = await _getWithRetry(
      Uri.parse('$baseUrl/rewards/transactions'),
      headers: {'Authorization': 'Bearer $_credential'},
    );

    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      final List<dynamic> txList = data['transactions'] ?? [];
      return txList.cast<Map<String, dynamic>>();
    } else {
      throw Exception(_parseError(response.body));
    }
  }

  @override
  Future<void> registerWallet(String address) async {
    await _ensureAuthenticated();

    final response = await _post(
      Uri.parse('$baseUrl/profile/wallet'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_credential',
      },
      body: json.encode({'walletAddress': address}),
    );

    if (response.statusCode != 200) {
      throw Exception(_parseError(response.body));
    }
  }

  String _parseError(dynamic responseBody) {
    try {
      final body = json.decode(responseBody);
      if (body is Map) {
        if (body['error'] is Map) {
          // Backend format: { error: { message: "...", code: "..." } }
          return body['error']['message'] ?? 'Unknown error';
        } else if (body['error'] is String) {
          // Legacy/Simple format: { error: "..." }
          return body['error'];
        }
      }
      return 'Request failed: $responseBody';
    } catch (e) {
      return 'Request failed (parse error): $responseBody';
    }
  }
}
