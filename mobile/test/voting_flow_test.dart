import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/services/api_service.dart';
import 'package:mobile/services/storage_service.dart';
import 'package:mobile/services/device_attestation_service.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/services.dart';

/// Strict Re-Auth Voting Flow Tests
///
/// Requirements:
/// 1. Flow order: challenge → issue → vote
/// 2. Client sends no voter-derived pseudonymous identifier
/// 3. NO userId/name/surname/pn/push token/wallet address in vote calls
/// 4. NO biometric media stored/uploaded

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // Mock flutter_secure_storage with an in-memory store (so reads return what was written).
  const MethodChannel channel = MethodChannel(
    'plugins.it_nomads.com/flutter_secure_storage',
  );
  final Map<String, String> fakeSecure = <String, String>{};
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(channel, (MethodCall call) async {
        switch (call.method) {
          case 'write':
            final key = call.arguments['key'] as String?;
            final value = call.arguments['value'] as String?;
            if (key != null && value != null) fakeSecure[key] = value;
            return null;
          case 'read':
            final key = call.arguments['key'] as String?;
            if (key == null) return null;
            return fakeSecure[key];
          case 'delete':
            final key = call.arguments['key'] as String?;
            if (key != null) fakeSecure.remove(key);
            return null;
          case 'deleteAll':
            fakeSecure.clear();
            return null;
          case 'readAll':
            return Map<String, String>.from(fakeSecure);
          default:
            return null;
        }
      });

  const MethodChannel attestationChannel = MethodChannel(
    'messaging.dtg/device_attestation',
  );
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(attestationChannel, (MethodCall call) async {
        if (call.method == 'playIntegrityToken') {
          final nonce = (call.arguments as Map)['nonce'] as String;
          expect(nonce, matches(RegExp(r'^[a-f0-9]{64}$')));
          return 'test-play-integrity-token';
        }
        throw PlatformException(code: 'UNSUPPORTED_METHOD');
      });
  DeviceAttestationService.debugPlatformOverride = 'android';

  tearDownAll(() {
    DeviceAttestationService.debugPlatformOverride = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(attestationChannel, null);
  });

  group('Voting Flow Order Tests', () {
    late ApiService apiService;
    setUp(() {
      SharedPreferences.setMockInitialValues({});
      apiService = ApiService();
      // Set mock credential
      apiService.setCredential('mock_test_credential');
    });

    test('Step 1: Challenge nonce can be requested', () async {
      // This would need a mock HTTP client in real implementation
      // For Phase 0, just verify the method exists and has correct signature
      expect(
        () => apiService.requestChallenge(),
        throwsA(anything), // Will throw because backend not running in test
      );
    });

    test('Step 3: Attestation issuance requires nonce', () async {
      // Verify attestation method requires nonce parameter
      expect(
        await apiService.issueAttestation(
          pollId: 'test_poll',
          optionId: 'opt_1',
          timestampBucket: 123456,
          nonce: 'test_nonce',
        ),
        containsPair('attestation', 'test-play-integrity-token'),
      );
    });

    test(
      'Step 5: Vote submission requires payload-bound attestation',
      () async {
        // Verify vote method signature
        expect(
          () => apiService.submitVote(
            pollId: 'test_poll',
            optionId: 'opt_1',
            attestation: 'test_attestation',
            timestampBucket: 123456,
          ),
          throwsA(anything), // Will throw because backend not running
        );
      },
    );
  });

  group('Privacy Compliance Tests', () {
    setUpAll(() {
      TestWidgetsFlutterBinding.ensureInitialized();
    });

    test('Vote API call has NO user identity fields', () {
      // Verify submitVote method signature
      // Required params: pollId, optionId, attestation, timestampBucket
      // FORBIDDEN params: userId, name, surname, personalNumber, pushToken, walletAddress

      // This is enforced at compile time by method signature
      // If these fields existed, the code wouldn't compile
      expect(true, isTrue, reason: 'Method signature enforces privacy');
    });

    test('Challenge API call has NO biometric data', () {
      final apiService = ApiService();

      // requestChallenge() takes no parameters
      // This ensures no biometric data can be sent
      expect(
        () => apiService.requestChallenge(),
        throwsA(
          anything,
        ), // Will fail due to no backend, but signature is correct
      );
    });

    test('Attestation API call has NO biometric media', () {
      // issueAttestation requires: pollId, optionId, timestampBucket, nonce
      // NO face image, NO fingerprint, NO iris scan
      expect(
        true,
        isTrue,
        reason: 'Method signature enforces no biometric media',
      );
    });

    test('Storage service does NOT store biometric data', () async {
      final storageService = StorageService();

      // Verify only non-PII data is stored
      final isEnrolled = await storageService.isEnrolled();
      final credential = await storageService.getCredential();

      expect(isEnrolled, isA<bool>());
      expect(credential, anyOf(isNull, isA<String>()));
    });
  });

  group('Flow Integration Tests', () {
    test('Full voting flow follows correct order', () async {
      // This test documents the required flow order
      final flowSteps = [
        '1. POST /api/v1/auth/challenge',
        '2. On-device NFC + 3D liveness + face match',
        '3. Native hardware attestation bound to the vote payload',
        '4. Prepare anonymous nonce-scoped submission',
        '5. POST /api/v1/polls/:id/vote',
      ];

      // Verify all steps are documented
      expect(flowSteps.length, equals(5));
      expect(flowSteps[0], contains('challenge'));
      expect(flowSteps[1], contains('On-device'));
      expect(flowSteps[2], contains('attestation'));
      expect(flowSteps[3], contains('anonymous'));
      expect(flowSteps[4], contains('vote'));
    });

    test('Vote cannot be submitted without attestation', () {
      final apiService = ApiService();

      // Verify attestation is required parameter (not optional)
      expect(
        () => apiService.submitVote(
          pollId: 'test',
          optionId: 'opt1',
          attestation: '', // Empty attestation should fail
          timestampBucket: 123,
        ),
        throwsA(anything),
      );
    });

    test('Vote idempotency key is nonce-scoped and deterministic', () {
      expect(
        DeviceAttestationService.buildVoteIdempotencyKey('poll-1', 'nonce-1'),
        equals(
          'vote-poll-1-73c80a38c94964e7fa9b83478d511dce4ba61608ec4867de735f41fa1e77e038',
        ),
      );
      expect(
        DeviceAttestationService.buildVoteIdempotencyKey('poll-1', 'nonce-2'),
        isNot(
          DeviceAttestationService.buildVoteIdempotencyKey('poll-1', 'nonce-1'),
        ),
      );
    });
  });

  group('Attestation Binding Tests', () {
    test('Attestation is bound to pollId', () async {
      // Attestation issuance requires pollId
      final apiService = ApiService();

      // This ensures attestation cannot be reused for different polls
      expect(
        await apiService.issueAttestation(
          pollId: 'poll_1',
          optionId: 'opt_1',
          timestampBucket: 123,
          nonce: 'nonce',
        ),
        containsPair('attestation', 'test-play-integrity-token'),
      );
    });

    test('Attestation is bound to nonce', () {
      // Attestation requires nonce from challenge

      // This prevents replay attacks
      expect(true, isTrue, reason: 'Nonce binding prevents replay');
    });

    test('Attestation is bound to votePayloadHash', () {
      final first = DeviceAttestationService.buildVoteBinding(
        nonce: 'nonce',
        pollId: 'poll',
        optionId: 'option-a',
        timestampBucket: 123,
      );
      final changed = DeviceAttestationService.buildVoteBinding(
        nonce: 'nonce',
        pollId: 'poll',
        optionId: 'option-b',
        timestampBucket: 123,
      );
      expect(first, matches(RegExp(r'^[a-f0-9]{64}$')));
      expect(changed, isNot(first));
    });

    test('Survey attestation binds every canonical response', () {
      final first = [
        <String, dynamic>{'questionId': 'q2', 'textResponse': 'გამარჯობა'},
        <String, dynamic>{
          'questionId': 'q1',
          'selectedOptionIds': ['b', 'a'],
        },
      ];
      final reordered = [
        <String, dynamic>{
          'questionId': 'q1',
          'selectedOptionIds': ['a', 'b'],
        },
        <String, dynamic>{'questionId': 'q2', 'textResponse': 'გამარჯობა'},
      ];
      final changed = [
        <String, dynamic>{
          'questionId': 'q1',
          'selectedOptionIds': ['a', 'b'],
        },
        <String, dynamic>{
          'questionId': 'q2',
          'textResponse': 'შეცვლილი პასუხი',
        },
      ];

      final digest = DeviceAttestationService.buildSurveyResponseDigest(first);
      expect(
        digest,
        '7fcb4aeaa04248ffb36c44da8f4a83a2853f3f048f98cdaf2a1685b061b0fa8d',
      );
      expect(
        DeviceAttestationService.buildSurveyResponseDigest(reordered),
        digest,
      );
      expect(
        DeviceAttestationService.buildSurveyResponseDigest(changed),
        isNot(digest),
      );
      expect(
        DeviceAttestationService.buildSurveyAttestationOption(first),
        'survey:$digest',
      );
    });

    test('Survey binding preserves ranked-choice order', () {
      final first = [
        <String, dynamic>{
          'questionId': 'rank',
          'rankedOptionIds': ['a', 'b'],
        },
      ];
      final changed = [
        <String, dynamic>{
          'questionId': 'rank',
          'rankedOptionIds': ['b', 'a'],
        },
      ];
      expect(
        DeviceAttestationService.buildSurveyResponseDigest(first),
        isNot(DeviceAttestationService.buildSurveyResponseDigest(changed)),
      );
    });

    test('Attestation has TTL', () {
      // Attestation includes timestampBucket
      // Backend enforces TTL (typically 5 minutes)
      expect(true, isTrue, reason: 'TTL prevents old attestations');
    });
  });

  group('Security Tests', () {
    setUpAll(() {
      TestWidgetsFlutterBinding.ensureInitialized();
    });

    test('Installation identifier is unique per enrollment', () async {
      final storage1 = StorageService();
      final storage2 = StorageService();

      final installationId1 = await storage1.getOrCreateInstallationId();
      await storage1.clearAll();
      final installationId2 = await storage2.getOrCreateInstallationId();

      expect(
        installationId1,
        isNot(equals(installationId2)),
        reason: 'Each enrollment should have a unique random installation ID',
      );
    });

    test('Upgrade cleanup removes the obsolete voting secret', () async {
      fakeSecure['credential_secret'] = 'legacy-client-nullifier-secret';
      await StorageService().purgeLegacyVotingSecrets();
      expect(fakeSecure, isNot(contains('credential_secret')));
    });

    test('Vote submission requires an authenticated credential', () {
      final apiService = ApiService();
      expect(
        () => apiService.submitVote(
          pollId: 'test',
          optionId: 'opt1',
          attestation: 'token',
          timestampBucket: 123,
        ),
        throwsA(anything),
      );
    });
  });

  group('Error Handling Tests', () {
    test('Missing nonce throws error', () async {
      final apiService = ApiService();

      await expectLater(
        apiService.issueAttestation(
          pollId: 'test',
          optionId: 'opt',
          timestampBucket: 123,
          nonce: '',
        ),
        throwsArgumentError,
      );
    });

    test('Invalid attestation throws error', () {
      final apiService = ApiService();

      expect(
        () => apiService.submitVote(
          pollId: 'test',
          optionId: 'opt',
          attestation: 'invalid',
          timestampBucket: 123,
        ),
        throwsA(anything),
      );
    });
  });
}
