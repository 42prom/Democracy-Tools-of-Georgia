import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/screens/enrollment/intro_screen.dart';
import 'package:mobile/screens/enrollment/liveness_screen.dart';
import 'package:mobile/screens/dashboard/dashboard_screen.dart';
import 'package:mobile/widgets/bottom_nav.dart';
import 'package:mobile/models/verification_models.dart';

/// Footer Rule Tests
///
/// Requirements:
/// 1. Step 1 (Intro) has NO footer
/// 2. Step 2 (NFC/Liveness) has NO footer
/// 3. Footer appears ONLY after successful enrollment (Dashboard)
/// 4. Footer tabs: Wallet | Voting (center) | Settings
void main() {
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

  group('Footer Rule Tests', () {
    testWidgets('Step 1 (Intro) has NO footer', (WidgetTester tester) async {
      await tester.pumpWidget(const MaterialApp(home: IntroScreen()));

      // Find the Scaffold
      final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));

      // Verify NO bottomNavigationBar
      expect(
        scaffold.bottomNavigationBar,
        isNull,
        reason: 'Intro screen (Step 1) must NOT have footer',
      );

      // Verify the screen content exists (not just empty)
      expect(find.text('Verify your identity'), findsOneWidget);
      expect(find.text('Start verification'), findsOneWidget);
    });

    // testWidgets('Step 2 (NFC Scan) has NO footer', (WidgetTester tester) async {
    //   await tester.pumpWidget(
    //     MaterialApp(
    //       home: NfcScanScreen(
    //         policy: mockPolicy,
    //         enrollmentSessionId: 'test_session',
    //         // mrzData: ... // Missing in test
    //       ),
    //     ),
    //   );

    //   // Pump to build the widget
    //   await tester.pump();

    //   // Find the Scaffold
    //   final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));

    //   // Verify NO bottomNavigationBar
    //   expect(
    //     scaffold.bottomNavigationBar,
    //     isNull,
    //     reason: 'NFC Scan screen (Step 2) must NOT have footer',
    //   );

    //   // Verify the screen has AppBar (but no footer)
    //   expect(find.byType(AppBar), findsOneWidget);

    //   // Clean up pending timers (NFC auto-starts and navigates after 4 seconds)
    //   await tester.pumpAndSettle(const Duration(seconds: 10));
    // });

    testWidgets('Step 2 (Liveness) has NO footer', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: LivenessScreen(
            policy: mockPolicy,
            enrollmentSessionId: 'test-session',
            docPortraitBase64: 'test-portrait',
          ),
        ),
      );

      // Pump to build the widget
      await tester.pump();

      // Find the Scaffold
      final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));

      // Verify NO bottomNavigationBar
      expect(
        scaffold.bottomNavigationBar,
        isNull,
        reason: 'Liveness screen (Step 2) must NOT have footer',
      );

      // Verify the screen content exists (scaffold body is not null)
      expect(scaffold.body, isNotNull);

      // Clean up pending timers (liveness has auto-start)
      await tester.pump(const Duration(seconds: 1));
    });

    testWidgets('Dashboard (after success) HAS footer', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(const MaterialApp(home: DashboardScreen()));

      // Wait for initial load
      await tester.pump();

      // Find the Scaffold
      final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));

      // Verify bottomNavigationBar EXISTS
      expect(
        scaffold.bottomNavigationBar,
        isNotNull,
        reason: 'Dashboard (after enrollment) MUST have footer',
      );

      // Verify it's a BottomNav widget
      expect(scaffold.bottomNavigationBar, isA<BottomNav>());
    });

    testWidgets('Footer has correct tabs: Wallet | Voting | Settings', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(home: BottomNav(currentIndex: 1, onTap: (_) {})),
      );

      // Find BottomNavigationBar
      final bottomNavBar = tester.widget<BottomNavigationBar>(
        find.byType(BottomNavigationBar),
      );

      // Verify 5 tabs
      expect(
        bottomNavBar.items.length,
        5,
        reason: 'Footer must have exactly 5 tabs',
      );

      // Verify tab order: Wallet | Messages | Voting | My Activity | Settings
      expect(
        bottomNavBar.items[0].label,
        'Wallet',
        reason: 'First tab must be Wallet',
      );
      expect(
        bottomNavBar.items[1].label,
        'Messages',
        reason: 'Second tab must be Messages',
      );
      expect(
        bottomNavBar.items[2].label,
        'Voting',
        reason: 'Third tab (center) must be Voting',
      );
      expect(
        bottomNavBar.items[3].label,
        'My Activity',
        reason: 'Fourth tab must be My Activity',
      );
      expect(
        bottomNavBar.items[4].label,
        'Settings',
        reason: 'Fifth tab must be Settings',
      );

      // Verify icons
      expect(
        (bottomNavBar.items[0].icon as Icon).icon,
        Icons.account_balance_wallet,
        reason: 'Wallet tab must have wallet icon',
      );
      expect(
        (bottomNavBar.items[1].icon as Icon).icon,
        Icons.message,
        reason: 'Messages tab must have message icon',
      );
      expect(
        (bottomNavBar.items[2].icon as Icon).icon,
        Icons.how_to_vote,
        reason: 'Voting tab must have voting icon',
      );
      expect(
        (bottomNavBar.items[3].icon as Icon).icon,
        Icons.history,
        reason: 'My Activity tab must have history icon',
      );
      expect(
        (bottomNavBar.items[4].icon as Icon).icon,
        Icons.settings,
        reason: 'Settings tab must have settings icon',
      );
    });

    testWidgets('Footer defaults to Voting tab (center)', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(const MaterialApp(home: DashboardScreen()));

      await tester.pump();

      // Find BottomNav widget
      final bottomNav = tester.widget<BottomNav>(find.byType(BottomNav));

      // Verify currentIndex is 2 (Voting tab - center of 5)
      expect(
        bottomNav.currentIndex,
        2,
        reason: 'Dashboard should start on Voting tab (center of 5)',
      );
    });

    testWidgets('Footer tab switching works', (WidgetTester tester) async {
      int selectedIndex = 2; // Start on Voting

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: const Center(child: Text('Test')),
            bottomNavigationBar: BottomNav(
              currentIndex: selectedIndex,
              onTap: (index) {
                selectedIndex = index;
              },
            ),
          ),
        ),
      );

      // Tap Wallet tab (index 0)
      await tester.tap(find.text('Wallet'));
      await tester.pump();

      expect(selectedIndex, 0, reason: 'Should switch to Wallet tab');

      // Tap Settings tab (index 4)
      await tester.tap(find.text('Settings'));
      await tester.pump();

      expect(selectedIndex, 4, reason: 'Should switch to Settings tab');
    });

    testWidgets('Dashboard shows Voting content by default', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(const MaterialApp(home: DashboardScreen()));

      await tester.pump();

      // Should show voting content (empty state or polls)
      expect(
        find.byIcon(Icons.how_to_vote).first,
        findsOneWidget,
        reason: 'Should show voting icon in empty state by default',
      );
    });
  });

  group('Footer Visual Tests', () {
    testWidgets('Footer has correct styling', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(home: BottomNav(currentIndex: 1, onTap: (_) {})),
      );

      final bottomNavBar = tester.widget<BottomNavigationBar>(
        find.byType(BottomNavigationBar),
      );

      // Verify dark background
      expect(
        bottomNavBar.backgroundColor,
        const Color(0xFF1E1E1E),
        reason: 'Footer should have dark background',
      );

      // Verify fixed type (no shifting)
      expect(
        bottomNavBar.type,
        BottomNavigationBarType.fixed,
        reason: 'Footer should be fixed type',
      );

      // Verify unselected color is grey
      expect(
        bottomNavBar.unselectedItemColor,
        Colors.grey,
        reason: 'Unselected items should be grey',
      );
    });
  });
}
