import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile/main.dart' as app;
import 'package:mobile/services/device_attestation_service.dart';
import 'package:mobile/services/storage_service.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('cold start reaches localized enrollment on a real host', (
    tester,
  ) async {
    await StorageService().clearAll();
    await app.main();
    await tester.pump();

    expect(find.text('DTG'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    await tester.pump(const Duration(seconds: 2));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Verify your identity'), findsOneWidget);
    expect(find.text('Secure enrollment'), findsOneWidget);
    expect(find.text('Start verification'), findsOneWidget);

    await tester.tap(find.text('EN'));
    // The enrollment illustration is intentionally a repeating Lottie
    // animation, so pumpAndSettle would never complete on a real device.
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('KA'), findsOneWidget);
    expect(find.text('Verify your identity'), findsNothing);
  });

  testWidgets(
    'emulator cannot mint production integrity evidence',
    (tester) async {
      expect(await DeviceAttestationService.isPhysicalDevice(), isFalse);

      await expectLater(
        DeviceAttestationService.getAttestationEvidenceForPlatform(
          'a' * 64,
          'android',
        ),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            contains('PLAY_INTEGRITY_NOT_CONFIGURED'),
          ),
        ),
      );
    },
    skip: !Platform.isAndroid,
  );
}
