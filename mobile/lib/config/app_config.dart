import 'package:flutter/foundation.dart';

/// Centralized app configuration.
///
/// All values are compile-time constants set via --dart-define flags:
///
///   flutter run \
///     --dart-define=API_BASE_URL=http://192.168.0.239:3000/api/v1 \
///     --dart-define=FLAVOR=dev \
///     --dart-define=MOCK_MODE=true
///
/// Emulator tips:
///   - Android emulator host machine: http://10.0.2.2:3000/api/v1
///   - iOS simulator uses localhost normally
class AppConfig {
  AppConfig._();

  /// Backend API base URL (no trailing slash).
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://api.esme.ge/api/v1',
  );

  /// Build flavor: dev | staging | prod
  static const String flavor = String.fromEnvironment(
    'FLAVOR',
    defaultValue: 'dev',
  );

  /// Whether the app is running in release mode.
  static bool get isRelease => kReleaseMode;

  /// Whether this is a development build.

  /// Whether this is a staging build.
  static bool get isStaging => flavor == 'staging';

  /// Whether this is a production build.
  static bool get isProd => flavor == 'prod';

  // --- Feature Flags & Limits ---

  /// Maximum face detection processing rate (ms per frame) for Liveness
  /// 66ms ~= 15 FPS. Reduces thermal load on older devices.
  static const int livenessMinFrameIntervalMs = 66;

  /// Timeout for each liveness challenge (seconds or ms)
  static const int livenessChallengeTimeoutMs = 7000;

  /// Enable detailed debug logging even in release builds (for dogfooding)
  static const bool enableDetailedLogging = bool.fromEnvironment(
    'ENABLE_DETAILED_LOGGING',
    defaultValue: false,
  );
}
