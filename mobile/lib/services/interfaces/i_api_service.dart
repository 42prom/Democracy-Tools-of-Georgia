import '../../models/poll.dart';

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

  Future<String> mockEnrollment();
}
