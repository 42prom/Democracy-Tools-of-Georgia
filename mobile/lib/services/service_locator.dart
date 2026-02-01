import 'package:flutter/foundation.dart';
import '../config/app_config.dart';
import 'interfaces/i_auth_api.dart';
import 'interfaces/i_api_service.dart';
import 'real/real_auth_api.dart';
import 'real/real_api_service.dart';
import 'mock/mock_auth_api.dart';
import 'mock/mock_api_service.dart';

/// Lightweight service locator that selects mock or real implementations.
///
/// Mock mode is enabled when ALL of the following are true:
///   1. The build is NOT a release build (kReleaseMode == false)
///   2. MOCK_MODE compile-time flag is true
///
/// In release builds, real services are ALWAYS used regardless of flags.
class ServiceLocator {
  ServiceLocator._();

  static bool get _useMock => AppConfig.mockMode;

  /// Singleton instances (lazy-initialized).
  static IAuthApi? _authApi;
  static IApiService? _apiService;

  static IAuthApi get authApi {
    _authApi ??= _useMock ? MockAuthApi() : RealAuthApi();
    return _authApi!;
  }

  static IApiService get apiService {
    _apiService ??= _useMock ? MockApiService() : RealApiService();
    return _apiService!;
  }

  /// Reset all services (useful for testing or toggling mock mode at runtime).
  static void reset() {
    _authApi = null;
    _apiService = null;
  }

  /// Debug info for development.
  static void printConfig() {
    if (kDebugMode) {
      print('[ServiceLocator] mockMode=${AppConfig.mockMode}, '
          'flavor=${AppConfig.flavor}, '
          'isRelease=${AppConfig.isRelease}');
    }
  }
}
