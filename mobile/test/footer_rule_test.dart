import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/screens/enrollment/intro_screen.dart';
import 'package:mobile/screens/enrollment/liveness_screen.dart';
import 'package:mobile/screens/dashboard/dashboard_screen.dart';
import 'package:mobile/widgets/bottom_nav.dart';
import 'package:mobile/models/verification_models.dart';
import 'package:mobile/services/localization_service.dart';
import 'package:mobile/services/service_locator.dart';
import 'package:mobile/services/interfaces/i_api_service.dart';
import 'package:mobile/models/poll.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class FakeApiService implements IApiService {
  @override
  Future<List<Poll>> getPolls() async => [];
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  setUpAll(() {
    ServiceLocator.mockApiService = FakeApiService();
  });

  final mockPolicy = VerificationPolicy(
    nfc: NfcPolicy(
      provider: 'mock',
      requireNfc: true,
      requireGeorgianCitizen: true,
      requirePersonalNumber: true,
      allowSkipDocumentWhenNfcHasPortrait: true,
    ),
    documentScanner: DocumentScannerPolicy(
      provider: 'manual',
      requireDocumentPhotoScan: true,
      strictness: 'strict',
    ),
    liveness: LivenessPolicy(
      provider: 'mock',
      minThreshold: 0.7,
      retryLimit: 3,
    ),
    faceMatch: FaceMatchPolicy(provider: 'mock', minThreshold: 0.75),
    allowMocks: true,
  );

  Widget createTestWidget(Widget child) {
    return ChangeNotifierProvider(
      create: (_) => LocalizationService(),
      child: MaterialApp(home: Scaffold(body: child)),
    );
  }

  group('Footer Rule Tests', () {
    testWidgets('Step 1 (Intro) has NO footer', (WidgetTester tester) async {
      await tester.pumpWidget(createTestWidget(const IntroScreen()));
      expect(find.byType(BottomNav), findsNothing);
    });

    testWidgets('Step 2 (Liveness) has NO footer', (WidgetTester tester) async {
      await tester.pumpWidget(
        createTestWidget(
          LivenessScreen(
            policy: mockPolicy,
            enrollmentSessionId: 'test-session',
            docPortraitBase64: 'test-portrait',
          ),
        ),
      );
      expect(find.byType(BottomNav), findsNothing);
    });

    testWidgets('Dashboard HAS footer', (WidgetTester tester) async {
      await tester.pumpWidget(createTestWidget(const DashboardScreen()));
      await tester.pumpAndSettle();
      expect(find.byType(BottomNav), findsOneWidget);
    });

    testWidgets('Footer has correct tabs: Wallet | Voting | Settings', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        createTestWidget(BottomNav(currentIndex: 2, onTap: (_) {})),
      );
      expect(find.text('Wallet'), findsOneWidget);
      expect(find.text('Voting'), findsOneWidget);
      expect(find.text('Settings'), findsOneWidget);
      final navBar = tester.widget<BottomNavigationBar>(
        find.byType(BottomNavigationBar),
      );
      expect(navBar.items.length, 5);
    });

    testWidgets('Footer defaults to Voting tab (index 2)', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(createTestWidget(const DashboardScreen()));
      await tester.pumpAndSettle();
      final bottomNav = tester.widget<BottomNav>(find.byType(BottomNav));
      expect(bottomNav.currentIndex, 2);
    });

    testWidgets('Footer tab switching works', (WidgetTester tester) async {
      int selectedIndex = 2;
      await tester.pumpWidget(
        ChangeNotifierProvider(
          create: (_) => LocalizationService(),
          child: MaterialApp(
            home: Scaffold(
              bottomNavigationBar: BottomNav(
                currentIndex: selectedIndex,
                onTap: (index) => selectedIndex = index,
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Wallet'));
      expect(selectedIndex, 0);
    });

    testWidgets('Dashboard shows Voting content default', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(createTestWidget(const DashboardScreen()));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.how_to_vote), findsAtLeastNWidgets(1));
    });

    testWidgets('Footer has correct BottomNavigationBar type (fixed)', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        createTestWidget(BottomNav(currentIndex: 1, onTap: (_) {})),
      );
      final navBar = tester.widget<BottomNavigationBar>(
        find.byType(BottomNavigationBar),
      );
      expect(navBar.type, BottomNavigationBarType.fixed);
    });
  });
}
