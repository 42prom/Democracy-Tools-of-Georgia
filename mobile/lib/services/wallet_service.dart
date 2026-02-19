import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/transaction.dart';
import 'service_locator.dart';
import 'storage_service.dart';

class WalletService {
  static const String _walletAddressKey = 'wallet_address';
  static const String _transactionsKey = 'transactions';
  static const String _balanceKey = 'balance';

  /// Get user-specific storage key
  Future<String> _getUserKey(String baseKey) async {
    final storageService = StorageService();
    final userId = await storageService.getUserId();
    if (userId != null && userId.isNotEmpty) {
      return '${baseKey}_$userId';
    }
    return baseKey; // Fallback to global key if no user ID
  }

  /// Check if wallet is unlocked (for current session).
  /// (Kept for compatibility; no biometric gating required.)
  bool _isUnlocked = true;

  bool get isUnlocked => _isUnlocked;

  String _randomHex(int byteLength) {
    final rnd = Random.secure();
    final bytes = Uint8List(byteLength);
    for (int i = 0; i < bytes.length; i++) {
      bytes[i] = rnd.nextInt(256);
    }
    final sb = StringBuffer();
    for (final b in bytes) {
      sb.write(b.toRadixString(16).padLeft(2, '0'));
    }
    return sb.toString();
  }

  /// Get wallet address (mock wallet for Phase 0).
  /// Generates a random 20-byte address and persists it per user.
  Future<String> getWalletAddress() async {
    final prefs = await SharedPreferences.getInstance();
    final key = await _getUserKey(_walletAddressKey);
    String? address = prefs.getString(key);

    if (address == null || address.isEmpty) {
      address = '0x${_randomHex(20)}';
      await prefs.setString(key, address);

      // Register new wallet with backend
      try {
        final apiService = ServiceLocator.apiService;
        await apiService.registerWallet(address);
      } catch (e) {
        debugPrint('[WalletService] Failed to register new wallet: $e');
      }
    }

    return address;
  }

  /// Unlock wallet (kept for compatibility).
  void unlock() {
    _isUnlocked = true;
  }

  /// Lock wallet (kept for compatibility).
  void lock() {
    _isUnlocked = false;
  }

  /// Get balance from backend (Phase 1+)
  /// Falls back to cached value on error (offline mode)
  /// Single token only: DTG
  Future<String> getBalance() async {
    try {
      // Fetch from backend API
      final apiService = ServiceLocator.apiService;
      final balances = await apiService.getRewardBalance();

      // Get DTG balance (single token system)
      // Multi-token support disabled - only DTG tokens used
      final dtgBalance = balances
          .where((b) => b.token == 'DTG')
          .fold(0.0, (sum, b) => sum + b.amount);

      final balanceStr = dtgBalance.toStringAsFixed(2);

      // Cache locally for offline access (user-specific)
      final prefs = await SharedPreferences.getInstance();
      final key = await _getUserKey(_balanceKey);
      await prefs.setString(key, balanceStr);

      return balanceStr;
    } catch (e) {
      // Fallback to cached value on error (offline mode)
      final prefs = await SharedPreferences.getInstance();
      final key = await _getUserKey(_balanceKey);
      final cached = prefs.getString(key) ?? '0.00';
      debugPrint(
        '[WalletService] Failed to fetch balance from backend, using cached: $cached. Error: $e',
      );
      return cached;
    }
  }

  /// Update balance (user-specific)
  Future<void> updateBalance(String balance) async {
    final prefs = await SharedPreferences.getInstance();
    final key = await _getUserKey(_balanceKey);
    await prefs.setString(key, balance);
  }

  /// Get transaction history (user-specific)
  Future<List<Transaction>> getTransactions() async {
    final prefs = await SharedPreferences.getInstance();
    final key = await _getUserKey(_transactionsKey);
    final String? transactionsJson = prefs.getString(key);

    if (transactionsJson == null) {
      return [];
    }

    final List<dynamic> jsonList = json.decode(transactionsJson);
    final transactions = jsonList
        .map((json) => Transaction.fromJson(json))
        .toList();

    // Filter out zero-amount transactions (hides existing local entries)
    return transactions.where((tx) {
      final amount = double.tryParse(tx.amount) ?? 0.0;
      return amount > 0;
    }).toList();
  }

  /// Add transaction
  Future<void> addTransaction(Transaction transaction) async {
    final transactions = await getTransactions();
    // Prevent duplicates by checking ID
    if (transactions.any((tx) => tx.id == transaction.id)) {
      return;
    }
    transactions.insert(0, transaction);
    await _saveTransactions(transactions);
  }

  /// Sync transactions from backend API (both rewards and transfers)
  Future<void> syncWithBackend() async {
    try {
      final apiService = ServiceLocator.apiService;

      // Fetch all transactions from backend
      final backendTxList = await apiService.getTransactions();
      final localTransactions = await getTransactions();

      // Ensure current wallet is registered
      final currentAddress = await getWalletAddress();
      await apiService.registerWallet(currentAddress);

      bool changed = false;

      for (final txData in backendTxList) {
        final txId = txData['id']?.toString() ?? '';
        final amount =
            double.tryParse(txData['amount']?.toString() ?? '0') ?? 0.0;

        if (amount > 0 && txId.isNotEmpty) {
          // Check if already in local
          if (!localTransactions.any((tx) => tx.id == txId)) {
            final type = txData['type'] == 'send'
                ? TransactionType.send
                : TransactionType.receive;

            localTransactions.insert(
              0,
              Transaction(
                id: txId,
                type: type,
                status: TransactionStatus.confirmed,
                amount: txData['amount']?.toString() ?? '0',
                token: txData['token']?.toString() ?? 'DTG',
                address: txData['address']?.toString() ?? '',
                timestamp:
                    DateTime.tryParse(txData['timestamp']?.toString() ?? '') ??
                    DateTime.now(),
                txHash: txId,
              ),
            );
            changed = true;
          }
        }
      }

      if (changed) {
        // Sort by date newest first
        localTransactions.sort((a, b) => b.timestamp.compareTo(a.timestamp));
        await _saveTransactions(localTransactions);
      }
    } catch (e) {
      debugPrint('[WalletService] Sync with backend failed: $e');
    }
  }

  /// Add reward transaction (when user earns reward from voting)
  Future<void> addRewardTransaction({
    required String pollId,
    required String pollTitle,
    required String amount,
    required String token,
  }) async {
    final transaction = Transaction(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      type: TransactionType.receive,
      status: TransactionStatus.confirmed,
      amount: amount,
      token: token,
      address: pollTitle, // Use poll title as "address" for display
      timestamp: DateTime.now(),
      txHash: 'reward_$pollId',
    );

    await addTransaction(transaction);

    // Update balance (add reward amount)
    final currentBalance = double.tryParse(await getBalance()) ?? 0.0;
    final rewardAmount = double.tryParse(amount) ?? 0.0;
    final newBalance = currentBalance + rewardAmount;
    await updateBalance(newBalance.toStringAsFixed(2));
  }

  Future<void> _saveTransactions(List<Transaction> transactions) async {
    final prefs = await SharedPreferences.getInstance();
    final key = await _getUserKey(_transactionsKey);
    final jsonList = transactions.map((t) => t.toJson()).toList();
    await prefs.setString(key, json.encode(jsonList));
  }

  /// Send tokens via backend API
  /// Returns the transaction ID on success
  Future<String> sendTokens({
    required String toAddress,
    required String amount,
    required String token,
  }) async {
    // Call the real backend API
    final apiService = ServiceLocator.apiService;
    final result = await apiService.sendTokens(
      toAddress: toAddress,
      amount: amount,
    );

    if (result['success'] != true) {
      throw Exception(result['error'] ?? 'Transfer failed');
    }

    final txId =
        result['txId'] as String? ??
        'tx_${DateTime.now().millisecondsSinceEpoch}';
    final newBalance = result['newBalance'] as num?;

    // Create local transaction record for display
    final transaction = Transaction(
      id: txId,
      type: TransactionType.send,
      status: TransactionStatus.confirmed,
      amount: amount,
      token: token,
      address: toAddress,
      timestamp: DateTime.now(),
      txHash: txId,
    );

    await addTransaction(transaction);

    // Update cached balance with the new balance from server
    if (newBalance != null) {
      await updateBalance(newBalance.toStringAsFixed(2));
    } else {
      // Fallback: refresh balance from server
      await getBalance();
    }

    return txId;
  }

  /// Clear all wallet data for current user
  Future<void> clearAll() async {
    final prefs = await SharedPreferences.getInstance();
    final transactionsKey = await _getUserKey(_transactionsKey);
    final balanceKey = await _getUserKey(_balanceKey);
    final addressKey = await _getUserKey(_walletAddressKey);

    await prefs.remove(addressKey);
    await prefs.remove(transactionsKey);
    await prefs.remove(balanceKey);
    _isUnlocked = true;
  }
}
