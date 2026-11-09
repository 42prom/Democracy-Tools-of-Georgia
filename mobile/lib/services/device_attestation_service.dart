import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class DeviceAttestationEvidence {
  const DeviceAttestationEvidence({
    required this.token,
    required this.platform,
    required this.provider,
  });

  final String token;
  final String platform;
  final String provider;
}

/// Hardware-backed integrity evidence obtained from native platform APIs.
///
/// This service deliberately has no fingerprint, emulator, or debug-token
/// fallback. If the platform cannot produce genuine evidence, voting fails
/// closed and the user can retry after correcting the device/app state.
class DeviceAttestationService {
  static const MethodChannel _channel = MethodChannel(
    'messaging.dtg/device_attestation',
  );
  static final DeviceInfoPlugin _deviceInfo = DeviceInfoPlugin();

  @visibleForTesting
  static String? debugPlatformOverride;

  static String get platform {
    if (!kReleaseMode && debugPlatformOverride != null) {
      return debugPlatformOverride!;
    }
    if (Platform.isAndroid) return 'android';
    if (Platform.isIOS) return 'ios';
    return 'unsupported';
  }

  static Future<DeviceAttestationEvidence> getAttestationEvidence(
    String nonce,
  ) {
    return getAttestationEvidenceForPlatform(nonce, platform);
  }

  /// Hashes the security-relevant request fields before giving them to the
  /// platform provider. Google/Apple receive only this digest, not the choice.
  static String buildVoteBinding({
    required String nonce,
    required String pollId,
    required String optionId,
    required int timestampBucket,
  }) {
    final canonical = 'dtg-vote-v1|$nonce|$pollId|$optionId|$timestampBucket';
    return sha256.convert(utf8.encode(canonical)).toString();
  }

  /// Builds the cross-platform canonical digest that binds every survey answer
  /// to the native device-integrity proof without sending answers to Google or Apple.
  static String buildSurveyResponseDigest(
    List<Map<String, dynamic>> responses,
  ) {
    if (responses.length > 100) {
      throw ArgumentError('Survey responses must contain at most 100 answers');
    }
    const allowedKeys = {
      'questionId',
      'selectedOptionId',
      'selectedOptionIds',
      'textResponse',
      'ratingValue',
      'rankedOptionIds',
    };
    const answerKeys = [
      'selectedOptionId',
      'selectedOptionIds',
      'textResponse',
      'ratingValue',
      'rankedOptionIds',
    ];
    final canonical = <List<dynamic>>[];
    final questionIds = <String>{};

    for (final response in responses) {
      if (response.keys.any((key) => !allowedKeys.contains(key))) {
        throw ArgumentError('Survey response contains unsupported fields');
      }
      final questionId = response['questionId'];
      if (questionId is! String ||
          questionId.isEmpty ||
          !questionIds.add(questionId)) {
        throw ArgumentError('Survey question IDs must be present and unique');
      }
      final populated = answerKeys
          .where((key) => response.containsKey(key) && response[key] != null)
          .toList();
      if (populated.length != 1) {
        throw ArgumentError(
          'Each survey response must contain exactly one answer',
        );
      }

      final field = populated.single;
      final value = response[field];
      dynamic canonicalValue;
      switch (field) {
        case 'selectedOptionId':
          if (value is! String || value.isEmpty) {
            throw ArgumentError('Invalid selectedOptionId');
          }
          canonicalValue = value;
          break;
        case 'selectedOptionIds':
        case 'rankedOptionIds':
          if (value is! List || value.isEmpty || value.length > 100) {
            throw ArgumentError('Invalid survey option list');
          }
          final values = value.map((item) {
            if (item is! String || item.isEmpty) {
              throw ArgumentError('Invalid survey option ID');
            }
            return item;
          }).toList();
          if (values.toSet().length != values.length) {
            throw ArgumentError('Duplicate survey option ID');
          }
          if (field == 'selectedOptionIds') values.sort();
          canonicalValue = values;
          break;
        case 'textResponse':
          if (value is! String) throw ArgumentError('Invalid text response');
          canonicalValue = value;
          break;
        case 'ratingValue':
          if (value is! int) throw ArgumentError('Invalid rating value');
          canonicalValue = value;
          break;
      }
      canonical.add([questionId, field, canonicalValue]);
    }

    canonical.sort(
      (left, right) => (left.first as String).compareTo(right.first as String),
    );
    return sha256.convert(utf8.encode(jsonEncode(canonical))).toString();
  }

  static String buildSurveyAttestationOption(
    List<Map<String, dynamic>> responses,
  ) => 'survey:${buildSurveyResponseDigest(responses)}';

  static String buildSurveyIdempotencyKey(String pollId, String nonce) {
    final canonical = 'dtg-survey-idempotency-v1|$pollId|$nonce';
    final digest = sha256.convert(utf8.encode(canonical)).toString();
    return 'survey-$pollId-$digest';
  }

  static String buildVoteIdempotencyKey(String pollId, String nonce) {
    final canonical = 'dtg-vote-idempotency-v1|$pollId|$nonce';
    final digest = sha256.convert(utf8.encode(canonical)).toString();
    return 'vote-$pollId-$digest';
  }

  @visibleForTesting
  static Future<DeviceAttestationEvidence> getAttestationEvidenceForPlatform(
    String nonce,
    String targetPlatform,
  ) async {
    if (nonce.trim().isEmpty) {
      throw ArgumentError.value(nonce, 'nonce', 'must not be empty');
    }

    final String method;
    final String provider;
    switch (targetPlatform) {
      case 'android':
        method = 'playIntegrityToken';
        provider = 'play_integrity_standard';
        break;
      case 'ios':
        method = 'appAttestEvidence';
        provider = 'app_attest';
        break;
      default:
        throw UnsupportedError(
          'Device attestation is unavailable on this platform',
        );
    }

    try {
      final token = await _channel.invokeMethod<String>(method, {
        'nonce': nonce,
      });
      if (token == null || token.trim().isEmpty) {
        throw StateError('The platform returned empty attestation evidence');
      }
      return DeviceAttestationEvidence(
        token: token,
        platform: targetPlatform,
        provider: provider,
      );
    } on PlatformException catch (error) {
      throw StateError(
        'Device integrity verification is unavailable (${error.code}).',
      );
    } on MissingPluginException {
      throw StateError('Device integrity verification is not installed.');
    }
  }

  /// Deletes the one-time attestation object only after the backend has
  /// accepted a request that registered the App Attest key.
  static Future<void> confirmAppAttestRegistration() async {
    if (platform != 'ios') return;
    try {
      await _channel.invokeMethod<void>('confirmAppAttestRegistration');
    } on PlatformException catch (error) {
      throw StateError(
        'Could not finalize App Attest registration (${error.code}).',
      );
    }
  }

  static Future<bool> isPhysicalDevice() async {
    try {
      if (Platform.isAndroid) {
        return (await _deviceInfo.androidInfo).isPhysicalDevice;
      }
      if (Platform.isIOS) return (await _deviceInfo.iosInfo).isPhysicalDevice;
    } catch (_) {
      return false;
    }
    return false;
  }
}
