import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../services/wallet_service.dart';
import '../../models/transaction.dart';
import 'send_screen.dart';
import 'receive_screen.dart';
import 'transaction_detail_screen.dart';

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  final WalletService _walletService = WalletService();
  String _balance = '0.00';
  String _walletAddress = '';
  List<Transaction> _transactions = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadWalletData();
  }

  Future<void> _loadWalletData() async {
    setState(() => _isLoading = true);

    try {
      final address = await _walletService.getWalletAddress();
      final balance = await _walletService.getBalance();
      final transactions = await _walletService.getTransactions();

      setState(() {
        _walletAddress = address;
        _balance = balance;
        _transactions = transactions;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _handleSend() async {
    await Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (context) => const SendScreen()));
    // Reload data after returning from send screen
    await _loadWalletData();
  }

  void _handleReceive() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => ReceiveScreen(walletAddress: _walletAddress),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _loadWalletData,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Balance Card
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: Column(
                    children: [
                      Text(
                        'Balance',
                        style: Theme.of(
                          context,
                        ).textTheme.titleMedium?.copyWith(color: Colors.grey),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '$_balance DTFG',
                        style: Theme.of(context).textTheme.headlineLarge
                            ?.copyWith(fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '≈ \$0.00 USD',
                        style: Theme.of(
                          context,
                        ).textTheme.bodyMedium?.copyWith(color: Colors.grey),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // Actions
              Row(
                children: [
                  Expanded(
                    child: _buildActionButton(
                      icon: Icons.arrow_upward,
                      label: 'Send',
                      onPressed: _handleSend,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildActionButton(
                      icon: Icons.arrow_downward,
                      label: 'Receive',
                      onPressed: _handleReceive,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 32),

              // History Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Transaction History',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  if (_transactions.isNotEmpty)
                    Text(
                      '${_transactions.length} total',
                      style: Theme.of(
                        context,
                      ).textTheme.bodySmall?.copyWith(color: Colors.grey),
                    ),
                ],
              ),
              const SizedBox(height: 16),

              // Transaction List or Empty State
              if (_transactions.isEmpty)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(32.0),
                    child: Column(
                      children: [
                        Icon(
                          Icons.receipt_long,
                          size: 64,
                          color: Colors.grey.shade600,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'No transactions yet',
                          style: Theme.of(
                            context,
                          ).textTheme.titleMedium?.copyWith(color: Colors.grey),
                        ),
                      ],
                    ),
                  ),
                )
              else
                ..._transactions.map((tx) => _buildTransactionTile(tx)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActionButton({
    required IconData icon,
    required String label,
    required VoidCallback onPressed,
  }) {
    return ElevatedButton(
      onPressed: onPressed,
      style: ElevatedButton.styleFrom(
        padding: const EdgeInsets.symmetric(vertical: 16),
      ),
      child: Column(
        children: [Icon(icon), const SizedBox(height: 4), Text(label)],
      ),
    );
  }

  Widget _buildTransactionTile(Transaction tx) {
    final dateFormat = DateFormat('MMM dd, HH:mm');

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: (tx.type == TransactionType.send ? Colors.red : Colors.green)
                .withValues(alpha: 0.1),
            shape: BoxShape.circle,
          ),
          child: Icon(
            tx.type == TransactionType.send
                ? Icons.arrow_upward
                : Icons.arrow_downward,
            color: tx.type == TransactionType.send ? Colors.red : Colors.green,
          ),
        ),
        title: Text(
          '${tx.type == TransactionType.send ? '-' : '+'} ${tx.amount} ${tx.token}',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: tx.type == TransactionType.send ? Colors.red : Colors.green,
          ),
        ),
        subtitle: Text(
          '${tx.type == TransactionType.send ? 'To' : 'From'}: ${tx.address.substring(0, 10)}...\n${dateFormat.format(tx.timestamp)}',
        ),
        trailing: _buildStatusBadge(tx.status),
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (context) => TransactionDetailScreen(transaction: tx),
            ),
          );
        },
      ),
    );
  }

  Widget _buildStatusBadge(TransactionStatus status) {
    Color color;
    String text;

    switch (status) {
      case TransactionStatus.confirmed:
        color = Colors.green;
        text = 'Confirmed';
        break;
      case TransactionStatus.pending:
        color = Colors.orange;
        text = 'Pending';
        break;
      case TransactionStatus.failed:
        color = Colors.red;
        text = 'Failed';
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}
