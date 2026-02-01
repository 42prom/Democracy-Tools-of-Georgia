import '../auth_api.dart';
import '../interfaces/i_auth_api.dart';

/// Mock implementation of [IAuthApi] for offline development.
/// Returns fake success responses without hitting any backend.
class MockAuthApi implements IAuthApi {
  @override
  Future<LoginOrEnrollResponse> loginOrEnroll({
    required String pnDigits,
    required Map<String, dynamic> liveness,
    required Map<String, dynamic> faceMatch,
    String? gender,
    int? birthYear,
    List<String>? regionCodes,
  }) async {
    await Future.delayed(const Duration(milliseconds: 800));

    return LoginOrEnrollResponse(
      success: true,
      userId: 'mock-user-${pnDigits.hashCode.abs().toRadixString(16)}',
      sessionAttestation: 'mock-jwt-${DateTime.now().millisecondsSinceEpoch}',
      isNewUser: false,
    );
  }

  @override
  Future<SessionVerifyResponse> verifySession({
    required String sessionAttestation,
  }) async {
    await Future.delayed(const Duration(milliseconds: 200));

    return SessionVerifyResponse(
      valid: true,
      userId: 'mock-user-001',
      pnHash: 'mock-pn-hash-abc123',
    );
  }
}
