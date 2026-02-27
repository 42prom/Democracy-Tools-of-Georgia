import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:mobile/screens/voting/vote_receipt_screen.dart';
import 'package:mobile/models/poll.dart';
import 'package:mobile/services/localization_service.dart';

// Minimal localization for tests
class _TestLocalizationService extends LocalizationService {
  @override
  String translate(String key) {
    const keys = {
      'vote_submitted': 'Vote Submitted!',
      'back_to_home': 'Back to Home',
      'poll': 'Poll',
      'your_vote': 'Your Vote',
      'transaction_hash': 'Transaction Hash',
      'cryptographic_proof': 'Cryptographic Proof',
      'cryptographic_proof_subtitle':
          'Independently verify your vote is included',
      'leaf_hash': 'Leaf Hash',
      'merkle_root': 'Merkle Root',
      'ed25519_signature': 'Server Signature',
      'algorithm': 'Algorithm',
      'vote_id': 'Vote ID',
      'copy_to_clipboard': 'Copy',
      'copied': 'Copied!',
      'verify_independently': 'Verify Independently',
      'verify_independently_tip': 'Verify your vote at any time',
      'poll_ends': 'Ends',
      'req_participation': 'Required',
    };
    return keys[key] ?? key;
  }
}

Widget _withLoc(Widget child) {
  return MaterialApp(
    home: ChangeNotifierProvider<LocalizationService>(
      create: (_) => _TestLocalizationService(),
      child: child,
    ),
  );
}

final _testPoll = Poll(
  id: 'poll-001',
  title: 'Test Poll',
  type: 'survey',
  options: [PollOption(id: 'opt-1', text: 'Option A', displayOrder: 0)],
  tags: ['test'],
);

final _testOption = PollOption(id: 'opt-1', text: 'Option A', displayOrder: 0);

const _testReceipt = {
  'payload': {
    'voteId': '550e8400-e29b-41d4-a716-446655440000',
    'pollId': 'poll-001',
    'leafHash':
        'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
    'merkleRoot':
        'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    'ts': '2026-02-27T12:00:00.000Z',
  },
  'signature': 'sig_ed25519_placeholder_abcdef123456',
  'algorithm': 'Ed25519',
  'version': 1,
};

void main() {
  group('VoteReceiptScreen — WCAG 2.1 AA Accessibility', () {
    testWidgets('receipt screen has back-to-home button with semantic label', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();

      await tester.pumpWidget(
        _withLoc(
          VoteReceiptScreen(
            poll: _testPoll,
            selectedOption: _testOption,
            txHash: 'tx-123',
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 700));

      // Must have a button reachable by screen reader
      final backButton = find.widgetWithText(ElevatedButton, 'Back to Home');
      expect(backButton, findsOneWidget);

      final semantics = tester.getSemantics(backButton);
      expect(semantics.getSemanticsData().flagsCollection.isButton, isTrue);

      handle.dispose();
    });

    testWidgets('success icon is present and screen renders without overflow', (
      tester,
    ) async {
      await tester.pumpWidget(
        _withLoc(
          VoteReceiptScreen(
            poll: _testPoll,
            selectedOption: _testOption,
            txHash: 'tx-123',
            receipt: _testReceipt,
            merkleRoot: 'deadbeefdeadbeef',
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 700));

      expect(find.byIcon(Icons.check_rounded), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('cryptographic proof section renders when receipt provided', (
      tester,
    ) async {
      await tester.pumpWidget(
        _withLoc(
          VoteReceiptScreen(
            poll: _testPoll,
            selectedOption: _testOption,
            txHash: 'tx-123',
            receipt: _testReceipt,
            merkleRoot: 'deadbeefdeadbeef',
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 700));

      expect(find.text('Cryptographic Proof'), findsOneWidget);
    });

    testWidgets('proof section expands when tapped', (tester) async {
      await tester.pumpWidget(
        _withLoc(
          VoteReceiptScreen(
            poll: _testPoll,
            selectedOption: _testOption,
            txHash: 'tx-123',
            receipt: _testReceipt,
            merkleRoot: 'deadbeefdeadbeef',
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 700));

      // Tap the crypto proof header to expand
      await tester.tap(find.text('Cryptographic Proof'));
      await tester.pumpAndSettle();

      // Leaf hash label should now be visible
      expect(find.text('Leaf Hash'), findsOneWidget);
    });

    testWidgets('receipt screen without crypto proof shows no proof card', (
      tester,
    ) async {
      await tester.pumpWidget(
        _withLoc(
          VoteReceiptScreen(
            poll: _testPoll,
            selectedOption: _testOption,
            txHash: 'tx-123',
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 700));

      expect(find.text('Cryptographic Proof'), findsNothing);
    });

    testWidgets('all interactive elements meet 48dp minimum tap target', (
      tester,
    ) async {
      await tester.pumpWidget(
        _withLoc(
          VoteReceiptScreen(
            poll: _testPoll,
            selectedOption: _testOption,
            txHash: 'tx-123',
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 700));

      // ElevatedButton height is set to 56 (> 48dp minimum)
      final buttonRect = tester.getRect(
        find.widgetWithText(ElevatedButton, 'Back to Home'),
      );
      expect(buttonRect.height, greaterThanOrEqualTo(48.0));
    });
  });
}
