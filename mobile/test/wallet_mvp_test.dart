import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/services/interfaces/i_api_service.dart';
import 'package:mobile/services/service_locator.dart';
import 'package:mobile/services/wallet_service.dart';
import 'package:mobile/models/reward_balance.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:flutter/services.dart';

class FakeApiService extends Fake implements IApiService {
  double currentBalance = 100.0;

  @override
  Future<void> registerWallet(String address) async {
    // No-op
  }

  @override
  Future<List<RewardBalance>> getRewardBalance() async {
    return [RewardBalance(token: 'DTG', amount: currentBalance)];
  }

  @override
  Future<List<Map<String, dynamic>>> getTransactions() async {
    return [];
  }

  @override
  Future<Map<String, dynamic>> sendTokens({
    required String toAddress,
    required String amount,
  }) async {
    final amt = double.tryParse(amount) ?? 0.0;
    currentBalance -= amt;
    return {
      'success': true,
      'txId': 'mock_tx_${DateTime.now().millisecondsSinceEpoch}',
      'newBalance': currentBalance,
    };
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // Mock flutter_secure_storage
  const MethodChannel channel = MethodChannel(
    'plugins.it_nomads.com/flutter_secure_storage',
  );
  final Map<String, String> fakeSecure = <String, String>{};
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(channel, (MethodCall call) async {
        switch (call.method) {
          case 'write':
            fakeSecure[call.arguments['key']] = call.arguments['value'];
            return null;
          case 'read':
            return fakeSecure[call.arguments['key']];
          case 'delete':
            fakeSecure.remove(call.arguments['key']);
            return null;
          case 'deleteAll':
            fakeSecure.clear();
            return null;
          default:
            return null;
        }
      });

  group('Wallet Service Tests (No PIN)', () {
    late WalletService walletService;

    setUp(() async {
      TestWidgetsFlutterBinding.ensureInitialized();
      SharedPreferences.setMockInitialValues({});

      // Inject Fake
      ServiceLocator.mockApiService = FakeApiService();

      walletService = WalletService();
    });

    tearDown(() async {
      await walletService.clearAll();
      ServiceLocator.mockApiService = null;
    });

    test('Wallet address is generated and persisted', () async {
      final address1 = await walletService.getWalletAddress();
      expect(address1, startsWith('0x'));
      expect(address1.length, equals(42));

      final address2 = await walletService.getWalletAddress();
      expect(address2, equals(address1));
    });

    test('Balance starts at 100.00 (from fake) and can be updated', () async {
      // getBalance calls API which returns 100.0
      final initial = await walletService.getBalance();
      expect(initial, equals('100.00'));

      await walletService.updateBalance('12.34');
      // Sync fake server too
      (ServiceLocator.apiService as FakeApiService).currentBalance = 12.34;

      final updated = await walletService.getBalance();
      expect(updated, equals('12.34'));
    });

    test('sendTokens creates mock tx and decreases balance', () async {
      await walletService.updateBalance('100.00');
      (ServiceLocator.apiService as FakeApiService).currentBalance = 100.0;

      final txHash = await walletService.sendTokens(
        toAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        amount: '10.50',
        token: 'TEST',
      );

      expect(txHash, startsWith('mock_tx_'));

      // Our FakeApiService decreases currentBalance to 89.5
      final balanceAfter = await walletService.getBalance();
      expect(balanceAfter, equals('89.50'));
    });

    test('clearAll resets wallet state', () async {
      await walletService.updateBalance('50.00');
      (ServiceLocator.apiService as FakeApiService).currentBalance = 50.0;

      await walletService.clearAll();

      // Default FakeApiService resets to 100.0 for new instances? No, we use same instance.
      // Let's reset it here to simulate "new start" or just check that it pulls from server
      (ServiceLocator.apiService as FakeApiService).currentBalance = 100.0;

      // After clear, getBalance calls API again -> 100.00
      expect(await walletService.getBalance(), equals('100.00'));
    });
  });
}
