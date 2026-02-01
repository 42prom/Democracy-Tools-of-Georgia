import 'package:flutter/material.dart';
import '../../services/wallet_service.dart';
import 'wallet_screen.dart';

/// Wallet unlock screen (biometrics removed).
///
/// This screen exists for backward compatibility with older navigation code.
/// It immediately marks the wallet as unlocked for the session and shows the
/// normal wallet UI.
class UnlockWalletScreen extends StatefulWidget {
  const UnlockWalletScreen({super.key});

  @override
  State<UnlockWalletScreen> createState() => _UnlockWalletScreenState();
}

class _UnlockWalletScreenState extends State<UnlockWalletScreen> {
  final WalletService _walletService = WalletService();

  @override
  void initState() {
    super.initState();
    // Wallet is no longer gated by biometrics or PIN.
    _walletService.unlock();
  }

  @override
  Widget build(BuildContext context) {
    return const WalletScreen();
  }
}
