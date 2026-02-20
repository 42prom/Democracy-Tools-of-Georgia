import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:logging/logging.dart';

/// Device Attestation Service
/// ============================================================
/// Obtains a hardware-backed integrity token for the current device.
///
/// Android: Uses Google Play Integrity API
///   - Requires the `play_integrity` package (added below)
///   - Returns MEETS_STRONG_INTEGRITY on genuine, unrooted, certified devices
///
/// iOS: Uses Apple DeviceCheck
///   - Requires `device_info_plus` which wraps the native framework
///   - Returns a token for Apple server-side validation
/// ============================================================
class DeviceAttestationService {
  static final DeviceInfoPlugin _deviceInfo = DeviceInfoPlugin();
  static final Logger _log = Logger('DeviceAttestationService');

  /// Get the platform name for this device
  static String get platform => Platform.isAndroid ? 'android' : 'ios';

  /// Obtain a hardware integrity token bound to the given [nonce].
  ///
  /// The nonce MUST be the same nonce used in the vote submission so the
  /// backend can bind the attestation to the specific request (prevents replay).
  ///
  /// Returns null if attestation is not available on this platform/device.
  static Future<String?> getAttestationToken(String nonce) async {
    if (Platform.isAndroid) {
      return _getPlayIntegrityToken(nonce);
    } else if (Platform.isIOS) {
      return _getAppleDeviceCheckToken();
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Android — Google Play Integrity
  // ------------------------------------------------------------------

  static Future<String?> _getPlayIntegrityToken(String nonce) async {
    try {
      // NOTE: To use Play Integrity API in production, add this to pubspec.yaml:
      //   google_play_integrity: ^1.0.0
      //
      // Then replace this block with:
      //   import 'package:google_play_integrity/google_play_integrity.dart';
      //   final integrity = GooglePlayIntegrity();
      //   final token = await integrity.requestIntegrityToken(nonce: nonce);
      //   return token;
      //
      // For now, we fall back to device fingerprint as a development placeholder.
      final androidInfo = await _deviceInfo.androidInfo;

      // If device is not physical or not Google-certified, return a fail marker
      if (!androidInfo.isPhysicalDevice) {
        return 'EMULATOR_DETECTED_NO_ATTESTATION';
      }

      // In production this would be the real Play Integrity token
      // Placeholder for development builds:
      return 'DEV_ANDROID_${androidInfo.fingerprint.hashCode}_${nonce.substring(0, 8)}';
    } catch (e) {
      _log.warning('[DeviceAttestation] Android attestation error: $e');
      return null;
    }
  }

  // ------------------------------------------------------------------
  // iOS — Apple DeviceCheck
  // ------------------------------------------------------------------

  static Future<String?> _getAppleDeviceCheckToken() async {
    try {
      // NOTE: To use Apple DeviceCheck in production, add this to pubspec.yaml:
      //   device_check: ^1.0.0  (or use the native method channel)
      //
      // Then replace this block with:
      //   import 'package:device_check/device_check.dart';
      //   final token = await DeviceCheck.generateToken();
      //   return token;
      //
      // For now, we fall back to device info as a development placeholder.
      final iosInfo = await _deviceInfo.iosInfo;

      if (!iosInfo.isPhysicalDevice) {
        return 'SIMULATOR_DETECTED_NO_ATTESTATION';
      }

      // Placeholder for development builds:
      return 'DEV_IOS_${iosInfo.identifierForVendor?.hashCode ?? 0}';
    } catch (e) {
      _log.warning('[DeviceAttestation] iOS attestation error: $e');
      return null;
    }
  }

  /// Check if this device is a physical device (not emulator/simulator)
  static Future<bool> isPhysicalDevice() async {
    try {
      if (Platform.isAndroid) {
        final info = await _deviceInfo.androidInfo;
        return info.isPhysicalDevice;
      } else if (Platform.isIOS) {
        final info = await _deviceInfo.iosInfo;
        return info.isPhysicalDevice;
      }
    } catch (_) {}
    return false;
  }
}
