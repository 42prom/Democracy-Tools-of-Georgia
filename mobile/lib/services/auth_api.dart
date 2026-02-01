import 'dart:convert';
import 'package:http/http.dart' as http;

/// Authentication API client for identity verification
class AuthApi {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://192.168.0.239:3000/api/v1',
  );

  Future<LoginOrEnrollResponse> loginOrEnroll({
    required String pnDigits,
    required Map<String, dynamic> liveness,
    required Map<String, dynamic> faceMatch,
    String? gender,
    int? birthYear,
    List<String>? regionCodes,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/login-or-enroll'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'pnDigits': pnDigits,
        'liveness': liveness,
        'faceMatch': faceMatch,
        'gender': ?gender,
        'birthYear': ?birthYear,
        'regionCodes': ?regionCodes,
      }),
    );

    Map<String, dynamic> data;
    try {
      data = json.decode(response.body) as Map<String, dynamic>;
    } catch (_) {
      throw AuthException(message: 'Backend returned invalid JSON');
    }

    if (response.statusCode == 200) {
      return LoginOrEnrollResponse.fromJson(data);
    }

    // Error shape can vary; be defensive
    throw AuthException(
      message: (data['error'] ?? data['message'] ?? 'Authentication failed')
          .toString(),
      reasonCode: data['reasonCode']?.toString(),
    );
  }

  Future<SessionVerifyResponse> verifySession({
    required String sessionAttestation,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/session/verify'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({'sessionAttestation': sessionAttestation}),
    );

    Map<String, dynamic> data;
    try {
      data = json.decode(response.body) as Map<String, dynamic>;
    } catch (_) {
      throw AuthException(message: 'Backend returned invalid JSON');
    }

    if (response.statusCode == 200) {
      return SessionVerifyResponse.fromJson(data);
    }

    throw AuthException(
      message:
          (data['error'] ?? data['message'] ?? 'Session verification failed')
              .toString(),
      reasonCode: data['reasonCode']?.toString(),
    );
  }
}

/// ---------- Safe JSON helpers ----------
bool _readBool(
  Map<String, dynamic> json,
  String key, {
  String? altKey,
  bool defaultValue = false,
}) {
  final dynamic v = json[key] ?? (altKey != null ? json[altKey] : null);
  if (v == null) return defaultValue;
  if (v is bool) return v;
  if (v is num) return v != 0;
  if (v is String) {
    final s = v.toLowerCase().trim();
    if (s == 'true' || s == '1' || s == 'yes') return true;
    if (s == 'false' || s == '0' || s == 'no') return false;
  }
  return defaultValue;
}

String _requireString(Map<String, dynamic> json, String key, {String? altKey}) {
  final dynamic v = json[key] ?? (altKey != null ? json[altKey] : null);
  if (v is String && v.isNotEmpty) return v;
  throw AuthException(message: 'Missing required field: $key');
}

/// Response from login-or-enroll endpoint
class LoginOrEnrollResponse {
  final bool success;
  final String userId;
  final String sessionAttestation;
  final bool isNewUser;

  LoginOrEnrollResponse({
    required this.success,
    required this.userId,
    required this.sessionAttestation,
    required this.isNewUser,
  });

  factory LoginOrEnrollResponse.fromJson(Map<String, dynamic> json) {
    return LoginOrEnrollResponse(
      success: _readBool(json, 'success', altKey: 'ok', defaultValue: true),
      userId: _requireString(json, 'userId', altKey: 'user_id'),
      sessionAttestation: _requireString(
        json,
        'sessionAttestation',
        altKey: 'session_attestation',
      ),
      isNewUser: _readBool(
        json,
        'isNewUser',
        altKey: 'is_new_user',
        defaultValue: false,
      ),
    );
  }
}

/// Response from session verify endpoint
class SessionVerifyResponse {
  final bool valid;
  final String userId;
  final String pnHash;

  SessionVerifyResponse({
    required this.valid,
    required this.userId,
    required this.pnHash,
  });

  factory SessionVerifyResponse.fromJson(Map<String, dynamic> json) {
    return SessionVerifyResponse(
      valid: _readBool(json, 'valid', altKey: 'isValid', defaultValue: false),
      userId: _requireString(json, 'userId', altKey: 'user_id'),
      pnHash: _requireString(json, 'pnHash', altKey: 'pn_hash'),
    );
  }
}

/// Authentication exception
class AuthException implements Exception {
  final String message;
  final String? reasonCode;
  final DateTime? lockedUntil;

  AuthException({required this.message, this.reasonCode, this.lockedUntil});

  @override
  String toString() {
    if (reasonCode != null) {
      return 'AuthException: $message ($reasonCode)';
    }
    return 'AuthException: $message';
  }
}
