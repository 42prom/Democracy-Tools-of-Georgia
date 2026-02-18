import 'package:flutter/foundation.dart';
import '../config/app_config.dart';
import 'interfaces/i_api_service.dart';
import 'real/real_api_service.dart';

/// Lightweight service locator that selects mock or real implementations.
///
/// Mock mode is enabled when ALL of the following are true:
///   1. The build is NOT a release build (kReleaseMode == false)
///   2. MOCK_MODE compile-time flag is true
///
/// In release builds, real services are ALWAYS used regardless of flags.
class ServiceLocator {
  ServiceLocator._();

  static IApiService? _mockApiService;

  /// Visible for testing
  static set mockApiService(IApiService? mock) {
    _mockApiService = mock;
  }

  static IApiService get apiService {
    if (_mockApiService != null) {
      return _mockApiService!;
    }
    return RealApiService();
  }

  /// Reset all services (useful for testing or toggling mock mode at runtime).
  static void reset() {
    // No-op - caching removed for dynamic switching.
  }

  /// Debug info for development.
  static void printConfig() {
    if (kDebugMode) {
      print(
        '[ServiceLocator] '
        'flavor=${AppConfig.flavor}, '
        'isRelease=${AppConfig.isRelease}',
      );
    }
  }
}
