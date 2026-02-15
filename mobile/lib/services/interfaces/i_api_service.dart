import '../../models/activity_item.dart';
import '../../models/poll.dart';
import '../../models/reward_balance.dart';
import '../../models/verification_models.dart';

/// Interface for the main API service (polls, voting, surveys).
abstract class IApiService {
  void setCredential(String credential);

  Future<List<Poll>> getPolls();

  Future<Map<String, dynamic>> requestChallenge();

  Future<Map<String, dynamic>> issueAttestation({
    required String pollId,
    required String optionId,
    required int timestampBucket,
    required String nonce,
  });

  Future<Map<String, dynamic>> submitVote({
    required String pollId,
    required String optionId,
    required String nullifier,
    required String attestation,
    required int timestampBucket,
  });

  Future<Map<String, dynamic>> submitSurvey({
    required String pollId,
    required String nullifier,
    required String attestation,
    required int timestampBucket,
    required List<Map<String, dynamic>> responses,
  });

  Future<EnrollmentNfcResponse> submitNfc(Map<String, dynamic> payload);
  Future<EnrollmentContinueResponse> submitDocument(
    Map<String, dynamic> payload,
  );
  Future<EnrollmentFinalizeResponse> submitLiveness(
    Map<String, dynamic> payload,
  );
  Future<VerificationPolicy> fetchVerificationPolicy();

  Future<List<Region>> getRegions();
  Future<bool> checkUserExists(String personalNumber);
  Future<void> updateProfile({
    required String enrollmentSessionId,
    List<String>? regionCodes,
    String? firstName,
    String? lastName,
  });

  Future<List<ActivityItem>> getRewardHistory();
  Future<List<RewardBalance>> getRewardBalance();

  /// Get user's full activity history (all participations, with or without rewards)
  Future<List<ActivityItem>> getMyActivity();
  Future<Poll> getPollDetails(String id);
  Future<Map<String, dynamic>> getPollResults(String id);

  // Device registration (for push notifications)
  Future<void> registerDevice(String token, String platform);
  Future<void> unregisterDevice(String token);

  // Wallet operations
  Future<Map<String, dynamic>> sendTokens({
    required String toAddress,
    required String amount,
  });
  Future<List<Map<String, dynamic>>> getTransactions();
  Future<void> registerWallet(String address);
}
