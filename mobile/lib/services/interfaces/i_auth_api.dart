import '../auth_api.dart';

/// Interface for authentication API operations.
abstract class IAuthApi {
  Future<LoginOrEnrollResponse> loginOrEnroll({
    required String pnDigits,
    required Map<String, dynamic> liveness,
    required Map<String, dynamic> faceMatch,
    String? gender,
    int? birthYear,
    List<String>? regionCodes,
  });

  Future<SessionVerifyResponse> verifySession({
    required String sessionAttestation,
  });
}
