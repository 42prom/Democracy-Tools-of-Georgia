import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

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

  static const String _mockModeKey = 'mock_mode';

  /// Backend API base URL (no trailing slash).
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://192.168.0.239:3000/api/v1',
  );

  /// Build flavor: dev | staging | prod
  static const String flavor = String.fromEnvironment(
    'FLAVOR',
    defaultValue: 'dev',
  );

  /// Compile-time mock mode flag.
  static const bool _compileMockMode = bool.fromEnvironment(
    'MOCK_MODE',
    defaultValue: false,
  );

  /// Runtime override for mock mode (set via Settings toggle).
  /// null = no override, use compile-time value.
  static bool? _runtimeMockOverride;

  /// Whether the app is running in release mode.
  static bool get isRelease => kReleaseMode;

  /// Effective mock mode:
  /// - Release builds: ALWAYS false
  /// - Debug builds: runtime override if set, else compile-time flag
  static bool get mockMode {
    if (isRelease) return false;
    return _runtimeMockOverride ?? _compileMockMode;
  }

  /// Set mock mode at runtime (debug only). Persists to SharedPreferences.
  static Future<void> setMockMode(bool enabled) async {
    if (isRelease) return;
    _runtimeMockOverride = enabled;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_mockModeKey, enabled);
  }

  /// Load saved mock mode preference from SharedPreferences.
  /// Call this once at app startup.
  static Future<void> loadSavedMockMode() async {
    if (isRelease) return;
    final prefs = await SharedPreferences.getInstance();
    if (prefs.containsKey(_mockModeKey)) {
      _runtimeMockOverride = prefs.getBool(_mockModeKey);
    }
  }

  /// Whether this is a development build.
  static bool get isDev => flavor == 'dev';

  /// Whether this is a staging build.
  static bool get isStaging => flavor == 'staging';

  /// Whether this is a production build.
  static bool get isProd => flavor == 'prod';
}
