import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/transaction.dart';

class WalletService {
  static const String _walletAddressKey = 'wallet_address';
  static const String _transactionsKey = 'transactions';
  static const String _balanceKey = 'balance';

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
  /// Generates a random 20-byte address and persists it.
  Future<String> getWalletAddress() async {
    final prefs = await SharedPreferences.getInstance();
    String? address = prefs.getString(_walletAddressKey);

    if (address == null || address.isEmpty) {
      address = '0x${_randomHex(20)}';
      await prefs.setString(_walletAddressKey, address);
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

  /// Get balance
  Future<String> getBalance() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_balanceKey) ?? '0.00';
  }

  /// Update balance (mock)
  Future<void> updateBalance(String balance) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_balanceKey, balance);
  }

  /// Get transaction history
  Future<List<Transaction>> getTransactions() async {
    final prefs = await SharedPreferences.getInstance();
    final String? transactionsJson = prefs.getString(_transactionsKey);

    if (transactionsJson == null) {
      return [];
    }

    final List<dynamic> jsonList = json.decode(transactionsJson);
    return jsonList.map((json) => Transaction.fromJson(json)).toList();
  }

  /// Add transaction
  Future<void> addTransaction(Transaction transaction) async {
    final transactions = await getTransactions();
    transactions.insert(0, transaction);
    await _saveTransactions(transactions);
  }

  Future<void> _saveTransactions(List<Transaction> transactions) async {
    final prefs = await SharedPreferences.getInstance();
    final jsonList = transactions.map((t) => t.toJson()).toList();
    await prefs.setString(_transactionsKey, json.encode(jsonList));
  }

  /// Send tokens (Phase 0 - mock tx)
  Future<String> sendTokens({
    required String toAddress,
    required String amount,
    required String token,
  }) async {
    final txHash = 'mock_tx_${_randomHex(12)}';

    final transaction = Transaction(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      type: TransactionType.send,
      status: TransactionStatus.confirmed,
      amount: amount,
      token: token,
      address: toAddress,
      timestamp: DateTime.now(),
      txHash: txHash,
    );

    await addTransaction(transaction);

    // Update balance (mock)
    final currentBalance = double.tryParse(await getBalance()) ?? 0.0;
    final amountDouble = double.tryParse(amount) ?? 0.0;
    final newBalance = currentBalance - amountDouble;
    await updateBalance(newBalance.toStringAsFixed(2));

    return txHash;
  }

  /// Clear all wallet data
  Future<void> clearAll() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_walletAddressKey);
    await prefs.remove(_transactionsKey);
    await prefs.remove(_balanceKey);
    _isUnlocked = true;
  }
}
