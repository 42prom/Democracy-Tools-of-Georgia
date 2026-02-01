import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../config/app_config.dart';
import '../auth_api.dart';
import '../interfaces/i_auth_api.dart';

/// Real implementation of [IAuthApi] that calls the backend.
class RealAuthApi implements IAuthApi {
  static String get baseUrl => AppConfig.apiBaseUrl;

  @override
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

    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      return LoginOrEnrollResponse.fromJson(data);
    } else {
      final error = json.decode(response.body);
      throw AuthException(
        message: error['error'] ?? 'Authentication failed',
        reasonCode: error['reasonCode'],
      );
    }
  }

  @override
  Future<SessionVerifyResponse> verifySession({
    required String sessionAttestation,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/session/verify'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({'sessionAttestation': sessionAttestation}),
    );

    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      return SessionVerifyResponse.fromJson(data);
    } else {
      throw AuthException(message: 'Session verification failed');
    }
  }
}
