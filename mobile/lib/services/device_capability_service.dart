import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';

/// Camera quality classification
enum CameraQuality { low, medium, high, ultra }

/// Processing power classification
enum ProcessingPower { low, medium, high }

/// Device capability profile for adaptive liveness
class DeviceCapabilityProfile {
  final CameraQuality cameraQuality;
  final ProcessingPower processingPower;
  final bool hasNeuralEngine;
  final String platform;
  final String osVersion;
  final String deviceModel;
  final int estimatedMaxFps;

  const DeviceCapabilityProfile({
    required this.cameraQuality,
    required this.processingPower,
    required this.hasNeuralEngine,
    required this.platform,
    required this.osVersion,
    required this.deviceModel,
    this.estimatedMaxFps = 30,
  });

  /// Recommended liveness tier based on device capabilities
  bool get canUsePassiveLiveness =>
      cameraQuality != CameraQuality.low && processingPower != ProcessingPower.low;

  /// Should use simplified challenges for low-end devices
  bool get useSimplifiedChallenges =>
      processingPower == ProcessingPower.low || cameraQuality == CameraQuality.low;

  Map<String, dynamic> toJson() => {
        'cameraQuality': cameraQuality.name,
        'processingPower': processingPower.name,
        'hasNeuralEngine': hasNeuralEngine,
        'platform': platform,
        'osVersion': osVersion,
        'deviceModel': deviceModel,
        'estimatedMaxFps': estimatedMaxFps,
      };

  static const DeviceCapabilityProfile defaultProfile = DeviceCapabilityProfile(
    cameraQuality: CameraQuality.medium,
    processingPower: ProcessingPower.medium,
    hasNeuralEngine: false,
    platform: 'unknown',
    osVersion: 'unknown',
    deviceModel: 'unknown',
  );
}

/// Service to detect device capabilities for adaptive liveness behavior
class DeviceCapabilityService {
  static final DeviceInfoPlugin _deviceInfo = DeviceInfoPlugin();
  static DeviceCapabilityProfile? _cachedProfile;

  /// Detect device capabilities (cached after first call)
  static Future<DeviceCapabilityProfile> detect() async {
    if (_cachedProfile != null) return _cachedProfile!;

    try {
      if (Platform.isAndroid) {
        _cachedProfile = await _detectAndroid();
      } else if (Platform.isIOS) {
        _cachedProfile = await _detectIOS();
      } else {
        _cachedProfile = DeviceCapabilityProfile.defaultProfile;
      }
    } catch (e) {
      debugPrint('[DeviceCapability] Detection failed: $e');
      _cachedProfile = DeviceCapabilityProfile.defaultProfile;
    }

    return _cachedProfile!;
  }

  /// Detect Android device capabilities
  static Future<DeviceCapabilityProfile> _detectAndroid() async {
    final info = await _deviceInfo.androidInfo;

    // Estimate processing power based on SDK version and device characteristics
    final sdkInt = info.version.sdkInt;
    final processingPower = _estimateAndroidProcessingPower(sdkInt, info.model);

    // Estimate camera quality based on device tier
    final cameraQuality = _estimateAndroidCameraQuality(info.model, info.manufacturer);

    // Check for neural engine (NNAPI support)
    final hasNeuralEngine = sdkInt >= 27; // NNAPI available from Android 8.1+

    return DeviceCapabilityProfile(
      cameraQuality: cameraQuality,
      processingPower: processingPower,
      hasNeuralEngine: hasNeuralEngine,
      platform: 'android',
      osVersion: info.version.release,
      deviceModel: '${info.manufacturer} ${info.model}',
      estimatedMaxFps: processingPower == ProcessingPower.high ? 60 : 30,
    );
  }

  /// Detect iOS device capabilities
  static Future<DeviceCapabilityProfile> _detectIOS() async {
    final info = await _deviceInfo.iosInfo;

    // Parse device identifier to determine capabilities
    final identifier = info.utsname.machine;
    final processingPower = _estimateIOSProcessingPower(identifier);
    final cameraQuality = _estimateIOSCameraQuality(identifier);

    // Neural Engine available on A11+ (iPhone X and later)
    final hasNeuralEngine = _hasIOSNeuralEngine(identifier);

    return DeviceCapabilityProfile(
      cameraQuality: cameraQuality,
      processingPower: processingPower,
      hasNeuralEngine: hasNeuralEngine,
      platform: 'ios',
      osVersion: info.systemVersion,
      deviceModel: info.model,
      estimatedMaxFps: processingPower == ProcessingPower.high ? 60 : 30,
    );
  }

  static ProcessingPower _estimateAndroidProcessingPower(int sdkInt, String model) {
    // High-end indicators
    final highEndKeywords = ['pixel', 'galaxy s2', 'galaxy s3', 'oneplus', 'mi 1'];
    final modelLower = model.toLowerCase();

    if (sdkInt >= 33 && highEndKeywords.any((k) => modelLower.contains(k))) {
      return ProcessingPower.high;
    } else if (sdkInt >= 28) {
      return ProcessingPower.medium;
    } else {
      return ProcessingPower.low;
    }
  }

  static CameraQuality _estimateAndroidCameraQuality(String model, String manufacturer) {
    final combined = '$manufacturer $model'.toLowerCase();

    // Flagship devices
    if (combined.contains('pixel') ||
        combined.contains('galaxy s2') ||
        combined.contains('galaxy s3') ||
        combined.contains('oneplus')) {
      return CameraQuality.ultra;
    }

    // Mid-range
    if (combined.contains('galaxy a') ||
        combined.contains('redmi') ||
        combined.contains('poco')) {
      return CameraQuality.medium;
    }

    return CameraQuality.medium; // Default assumption
  }

  static ProcessingPower _estimateIOSProcessingPower(String identifier) {
    // iPhone identifiers: iPhone14,2 = iPhone 13 Pro, etc.
    final match = RegExp(r'iPhone(\d+),').firstMatch(identifier);
    if (match != null) {
      final generation = int.tryParse(match.group(1) ?? '0') ?? 0;
      if (generation >= 14) return ProcessingPower.high; // iPhone 13+
      if (generation >= 11) return ProcessingPower.medium; // iPhone X+
      return ProcessingPower.low;
    }

    // iPad identifiers
    if (identifier.startsWith('iPad')) {
      return ProcessingPower.medium; // Most iPads are reasonably capable
    }

    return ProcessingPower.medium;
  }

  static CameraQuality _estimateIOSCameraQuality(String identifier) {
    final match = RegExp(r'iPhone(\d+),').firstMatch(identifier);
    if (match != null) {
      final generation = int.tryParse(match.group(1) ?? '0') ?? 0;
      if (generation >= 15) return CameraQuality.ultra; // iPhone 14+
      if (generation >= 13) return CameraQuality.high; // iPhone 12+
      if (generation >= 11) return CameraQuality.medium; // iPhone X+
      return CameraQuality.low;
    }

    return CameraQuality.medium;
  }

  static bool _hasIOSNeuralEngine(String identifier) {
    // Neural Engine: A11 Bionic and later (iPhone X = iPhone10,x)
    final match = RegExp(r'iPhone(\d+),').firstMatch(identifier);
    if (match != null) {
      final generation = int.tryParse(match.group(1) ?? '0') ?? 0;
      return generation >= 10; // iPhone X and later
    }
    return false;
  }

  /// Clear cached profile (for testing)
  static void clearCache() {
    _cachedProfile = null;
  }
}
