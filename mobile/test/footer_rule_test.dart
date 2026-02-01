import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/screens/enrollment/intro_screen.dart';
import 'package:mobile/screens/enrollment/nfc_scan_screen.dart';
import 'package:mobile/screens/enrollment/liveness_screen.dart';
import 'package:mobile/screens/dashboard/dashboard_screen.dart';
import 'package:mobile/widgets/bottom_nav.dart';

/// Footer Rule Tests
///
/// Requirements:
/// 1. Step 1 (Intro) has NO footer
/// 2. Step 2 (NFC/Liveness) has NO footer
/// 3. Footer appears ONLY after successful enrollment (Dashboard)
/// 4. Footer tabs: Wallet | Voting (center) | Settings
void main() {
  group('Footer Rule Tests', () {
    testWidgets('Step 1 (Intro) has NO footer', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: IntroScreen(),
        ),
      );

      // Find the Scaffold
      final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));

      // Verify NO bottomNavigationBar
      expect(scaffold.bottomNavigationBar, isNull,
          reason: 'Intro screen (Step 1) must NOT have footer');

      // Verify the screen content exists (not just empty)
      expect(find.text('Verify Identity'), findsOneWidget);
      expect(find.text('Start Verification'), findsOneWidget);
    });

    testWidgets('Step 2 (NFC Scan) has NO footer', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: NfcScanScreen(),
        ),
      );

      // Pump to build the widget
      await tester.pump();

      // Find the Scaffold
      final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));

      // Verify NO bottomNavigationBar
      expect(scaffold.bottomNavigationBar, isNull,
          reason: 'NFC Scan screen (Step 2) must NOT have footer');

      // Verify the screen has AppBar (but no footer)
      expect(find.byType(AppBar), findsOneWidget);

      // Clean up pending timers (NFC auto-starts and navigates after 4 seconds)
      await tester.pumpAndSettle(const Duration(seconds: 10));
    });

    testWidgets('Step 2 (Liveness) has NO footer', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: LivenessScreen(),
        ),
      );

      // Pump to build the widget
      await tester.pump();

      // Find the Scaffold
      final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));

      // Verify NO bottomNavigationBar
      expect(scaffold.bottomNavigationBar, isNull,
          reason: 'Liveness screen (Step 2) must NOT have footer');

      // Verify the screen has AppBar (but no footer)
      expect(find.byType(AppBar), findsOneWidget);

      // Clean up pending timers (liveness has auto-start)
      await tester.pumpAndSettle(const Duration(seconds: 10));
    });

    testWidgets('Dashboard (after success) HAS footer', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: DashboardScreen(),
        ),
      );

      // Wait for initial load
      await tester.pump();

      // Find the Scaffold
      final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));

      // Verify bottomNavigationBar EXISTS
      expect(scaffold.bottomNavigationBar, isNotNull,
          reason: 'Dashboard (after enrollment) MUST have footer');

      // Verify it's a BottomNav widget
      expect(scaffold.bottomNavigationBar, isA<BottomNav>());
    });

    testWidgets('Footer has correct tabs: Wallet | Voting | Settings',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: BottomNav(
            currentIndex: 1,
            onTap: (_) {},
          ),
        ),
      );

      // Find BottomNavigationBar
      final bottomNavBar = tester.widget<BottomNavigationBar>(
        find.byType(BottomNavigationBar),
      );

      // Verify 3 tabs
      expect(bottomNavBar.items.length, 3,
          reason: 'Footer must have exactly 3 tabs');

      // Verify tab order: Wallet | Voting | Settings
      expect(bottomNavBar.items[0].label, 'Wallet',
          reason: 'First tab must be Wallet');
      expect(bottomNavBar.items[1].label, 'Voting',
          reason: 'Second tab (center) must be Voting');
      expect(bottomNavBar.items[2].label, 'Settings',
          reason: 'Third tab must be Settings');

      // Verify icons
      expect(
        (bottomNavBar.items[0].icon as Icon).icon,
        Icons.account_balance_wallet,
        reason: 'Wallet tab must have wallet icon',
      );
      expect(
        (bottomNavBar.items[1].icon as Icon).icon,
        Icons.how_to_vote,
        reason: 'Voting tab must have voting icon',
      );
      expect(
        (bottomNavBar.items[2].icon as Icon).icon,
        Icons.settings,
        reason: 'Settings tab must have settings icon',
      );
    });

    testWidgets('Footer defaults to Voting tab (center)',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: DashboardScreen(),
        ),
      );

      await tester.pump();

      // Find BottomNav widget
      final bottomNav = tester.widget<BottomNav>(find.byType(BottomNav));

      // Verify currentIndex is 1 (Voting tab - center)
      expect(bottomNav.currentIndex, 1,
          reason: 'Dashboard should start on Voting tab (center)');
    });

    testWidgets('Footer tab switching works', (WidgetTester tester) async {
      int selectedIndex = 1; // Start on Voting

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

      // Tap Settings tab (index 2)
      await tester.tap(find.text('Settings'));
      await tester.pump();

      expect(selectedIndex, 2, reason: 'Should switch to Settings tab');
    });

    testWidgets('Dashboard shows Voting content by default',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: DashboardScreen(),
        ),
      );

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
        MaterialApp(
          home: BottomNav(
            currentIndex: 1,
            onTap: (_) {},
          ),
        ),
      );

      final bottomNavBar = tester.widget<BottomNavigationBar>(
        find.byType(BottomNavigationBar),
      );

      // Verify dark background
      expect(bottomNavBar.backgroundColor, const Color(0xFF1E1E1E),
          reason: 'Footer should have dark background');

      // Verify fixed type (no shifting)
      expect(bottomNavBar.type, BottomNavigationBarType.fixed,
          reason: 'Footer should be fixed type');

      // Verify unselected color is grey
      expect(bottomNavBar.unselectedItemColor, Colors.grey,
          reason: 'Unselected items should be grey');
    });
  });

}
