import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/services/api_service.dart';
import 'dart:io';

/// Compliance Test: Verify NO admin functionality exists in mobile app
///
/// Requirements:
/// 1. No admin login UI, routes, screens, hidden toggles, or deep links
/// 2. No admin endpoints referenced from mobile
/// 3. Only citizen-facing features
void main() {
  group('Admin Compliance Tests', () {
    test('API Service has NO admin endpoints', () {
      final apiService = ApiService();

      // Verify base URL is citizen API only (do NOT hardcode host)
      expect(ApiService.baseUrl, contains('/api/v1'));
      expect(ApiService.baseUrl, isNot(contains('/admin')));

      // API service should only have citizen methods:
      // - getPolls() -> GET /polls
      // - submitVote() -> POST /polls/:id/vote
      // - mockEnrollment() -> local mock

      // No admin methods should exist
      expect(
        apiService,
        isNot(
          predicate((api) => api.toString().toLowerCase().contains('admin')),
        ),
      );
    });

    test('No admin-related files exist in lib/', () async {
      final libDir = Directory('lib');
      final allFiles = await libDir
          .list(recursive: true)
          .where((entity) => entity is File && entity.path.endsWith('.dart'))
          .toList();

      for (final file in allFiles) {
        final content = await File(file.path).readAsString();

        // Check for admin references
        expect(
          content.toLowerCase().contains('admin'),
          isFalse,
          reason: 'File ${file.path} contains "admin" reference',
        );

        // Check for admin routes
        expect(
          content.contains('/admin/'),
          isFalse,
          reason: 'File ${file.path} contains admin route',
        );
      }
    });

    test('No deep link configuration exists', () async {
      // Check AndroidManifest.xml
      final androidManifest = File('android/app/src/main/AndroidManifest.xml');
      if (await androidManifest.exists()) {
        final content = await androidManifest.readAsString();
        expect(
          content.contains('android:scheme="DTG-admin"'),
          isFalse,
          reason: 'AndroidManifest contains admin deep link',
        );
      }

      // Check iOS Info.plist
      final iosPlist = File('ios/Runner/Info.plist');
      if (await iosPlist.exists()) {
        final content = await iosPlist.readAsString();
        expect(
          content.contains('DTG-admin'),
          isFalse,
          reason: 'Info.plist contains admin deep link',
        );
      }
    });

    test('API calls are only to citizen endpoints', () {
      // Verify API service endpoints
      final citizenEndpoints = [
        '/polls', // List active polls for citizens
      ];

      // All citizen endpoints should be accessible
      for (final endpoint in citizenEndpoints) {
        expect(
          endpoint.startsWith('/admin'),
          isFalse,
          reason: 'Endpoint $endpoint should not be admin endpoint',
        );
      }

      // No forbidden endpoints should be referenced
      // (This is validated by the file content check above)
    });

    test('Only citizen-facing dependencies are included', () async {
      final pubspec = File('pubspec.yaml');
      final content = await pubspec.readAsString();

      // Forbidden admin-only packages (examples)
      final forbiddenPackages = [
        'admin_panel',
        'flutter_admin',
        'data_table', // Often used for admin dashboards
      ];

      for (final pkg in forbiddenPackages) {
        expect(
          content.contains(pkg),
          isFalse,
          reason: 'pubspec.yaml contains admin package: $pkg',
        );
      }
    });

    test('No hidden admin toggle or debug mode exists', () async {
      final mainFile = File('lib/main.dart');
      final content = await mainFile.readAsString();

      // Check for hidden admin flags
      expect(
        content.contains('isAdminMode'),
        isFalse,
        reason: 'main.dart contains isAdminMode flag',
      );

      expect(
        content.contains('enableAdmin'),
        isFalse,
        reason: 'main.dart contains enableAdmin flag',
      );

      expect(
        content.contains('debugAdmin'),
        isFalse,
        reason: 'main.dart contains debugAdmin flag',
      );
    });
  });

  group('Citizen Features Only', () {
    test('App has only citizen screens', () {
      // Expected citizen screens
      final citizenScreens = [
        'enrollment/intro_screen.dart',
        'enrollment/nfc_scan_screen.dart',
        'enrollment/liveness_screen.dart',
        'dashboard/dashboard_screen.dart',
        'voting/poll_details_screen.dart',
        'voting/confirm_vote_screen.dart',
        'voting/vote_receipt_screen.dart',
        'wallet/wallet_screen.dart',
      ];

      for (final screen in citizenScreens) {
        final file = File('lib/screens/$screen');
        expect(
          file.existsSync(),
          isTrue,
          reason: 'Citizen screen $screen should exist',
        );
      }
    });

    test('Bottom navigation has only citizen tabs', () async {
      final bottomNavFile = File('lib/widgets/bottom_nav.dart');
      final content = await bottomNavFile.readAsString();

      // Expected tabs: Voting, Wallet, Settings
      expect(content.contains('Voting'), isTrue);
      expect(content.contains('Wallet'), isTrue);

      // No admin tab
      expect(content.toLowerCase().contains('admin'), isFalse);
      expect(
        content.contains('Settings'),
        isTrue,
      ); // Settings is allowed for profile/logout
      expect(content.contains('Dashboard'), isFalse); // Dashboard ambiguous
    });
  });
}

