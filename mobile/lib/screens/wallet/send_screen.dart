import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../services/wallet_service.dart';
import '../../services/localization_service.dart';
import 'qr_scan_screen.dart';

class SendScreen extends StatefulWidget {
  final String? recipientAddress;

  const SendScreen({super.key, this.recipientAddress});

  @override
  State<SendScreen> createState() => _SendScreenState();
}

class _SendScreenState extends State<SendScreen> {
  final WalletService _walletService = WalletService();
  final TextEditingController _addressController = TextEditingController();
  final TextEditingController _amountController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  String _selectedToken = 'DTG';
  final List<String> _availableTokens = ['DTG'];
  bool _isSending = false;

  @override
  void initState() {
    super.initState();
    if (widget.recipientAddress != null) {
      _addressController.text = widget.recipientAddress!;
    }
  }

  @override
  void dispose() {
    _addressController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _pasteAddress() async {
    final ClipboardData? data = await Clipboard.getData('text/plain');
    if (data != null && data.text != null) {
      setState(() {
        _addressController.text = data.text!;
      });
    }
  }

  Future<void> _scanQrCode() async {
    final scannedAddress = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (context) => const QrScanScreen()),
    );
    if (scannedAddress != null && scannedAddress.isNotEmpty) {
      setState(() {
        _addressController.text = scannedAddress;
      });
    }
  }

  Future<void> _showConfirmDialog() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    final loc = Provider.of<LocalizationService>(context, listen: false);

    // Check if user has enough balance
    final currentBalance =
        double.tryParse(await _walletService.getBalance()) ?? 0.0;
    final sendAmount = double.tryParse(_amountController.text) ?? 0.0;

    if (sendAmount > currentBalance) {
      if (!mounted) return;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                '${loc.translate('insufficient_balance')}. $currentBalance DTG'),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            duration: const Duration(seconds: 4),
          ),
        );
      }
      return;
    }

    if (!mounted) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => Consumer<LocalizationService>(
        builder: (context, loc, child) {
          return AlertDialog(
            backgroundColor: const Color(0xFF2C2C2C),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: Text(loc.translate('confirm_transaction')),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildConfirmRow(loc.translate('to'), _addressController.text),
                const SizedBox(height: 12),
                _buildConfirmRow(
                  loc.translate('amount'),
                  '${_amountController.text} $_selectedToken',
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.orange.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                    border:
                        Border.all(color: Colors.orange.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.info_outline,
                          color: Colors.orange, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          loc.translate('action_cannot_undone'),
                          style: const TextStyle(
                              color: Colors.orange, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(false),
                child: Text(
                  loc.translate('cancel'),
                  style: TextStyle(color: Colors.grey.shade400),
                ),
              ),
              ElevatedButton(
                onPressed: () => Navigator.of(dialogContext).pop(true),
                child: Text(loc.translate('confirm_send')),
              ),
            ],
          );
        },
      ),
    );

    if (confirmed == true) {
      await _sendTransaction();
    }
  }

  Widget _buildConfirmRow(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(color: Colors.grey.shade500, fontSize: 12),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
        ),
      ],
    );
  }

  Future<void> _sendTransaction() async {
    final loc = Provider.of<LocalizationService>(context, listen: false);
    setState(() => _isSending = true);

    try {
      final txHash = await _walletService.sendTokens(
        toAddress: _addressController.text,
        amount: _amountController.text,
        token: _selectedToken,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${loc.translate('transaction_sent')} Tx: $txHash'),
            backgroundColor: Colors.green,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            duration: const Duration(seconds: 3),
          ),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${loc.translate('failed_send')}: $e'),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSending = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<LocalizationService>(
      builder: (context, loc, child) {
        return Scaffold(
          appBar: AppBar(
            title: Text(loc.translate('send')),
            backgroundColor: Colors.transparent,
            elevation: 0,
          ),
          body: SafeArea(
            child: Form(
              key: _formKey,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Scan QR Button
                    Card(
                      child: InkWell(
                        onTap: _scanQrCode,
                        borderRadius: BorderRadius.circular(16),
                        child: Padding(
                          padding: const EdgeInsets.all(20.0),
                          child: Column(
                            children: [
                              Container(
                                width: 64,
                                height: 64,
                                decoration: BoxDecoration(
                                  color: Theme.of(context)
                                      .primaryColor
                                      .withValues(alpha: 0.15),
                                  shape: BoxShape.circle,
                                ),
                                child: Icon(
                                  Icons.qr_code_scanner_rounded,
                                  size: 32,
                                  color: Theme.of(context).primaryColor,
                                ),
                              ),
                              const SizedBox(height: 12),
                              Text(
                                loc.translate('scan_qr_code'),
                                style: Theme.of(context)
                                    .textTheme
                                    .titleMedium
                                    ?.copyWith(fontWeight: FontWeight.w600),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                loc.translate('scan_recipient_qr'),
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(color: Colors.grey),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Divider with "or"
                    Row(
                      children: [
                        Expanded(child: Divider(color: Colors.grey.shade700)),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          child: Text(
                            loc.translate('or_enter_manually'),
                            style: TextStyle(
                              color: Colors.grey.shade500,
                              fontSize: 13,
                            ),
                          ),
                        ),
                        Expanded(child: Divider(color: Colors.grey.shade700)),
                      ],
                    ),
                    const SizedBox(height: 20),

                    // Wallet Address Field
                    TextFormField(
                      controller: _addressController,
                      decoration: InputDecoration(
                        labelText: loc.translate('wallet_address'),
                        hintText: '0x...',
                        suffixIcon: IconButton(
                          icon: const Icon(Icons.content_paste_rounded),
                          onPressed: _pasteAddress,
                          tooltip: loc.translate('paste_clipboard'),
                          color: Theme.of(context).primaryColor,
                        ),
                      ),
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return loc.translate('enter_recipient_address');
                        }
                        if (!value.startsWith('0x') || value.length < 10) {
                          return loc.translate('invalid_address');
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),

                    // Token Selector
                    DropdownButtonFormField<String>(
                      initialValue: _selectedToken,
                      decoration:
                          InputDecoration(labelText: loc.translate('token')),
                      dropdownColor: const Color(0xFF2C2C2C),
                      items: _availableTokens.map((token) {
                        return DropdownMenuItem(
                            value: token, child: Text(token));
                      }).toList(),
                      onChanged: (value) {
                        setState(() {
                          _selectedToken = value!;
                        });
                      },
                    ),
                    const SizedBox(height: 16),

                    // Amount Field
                    TextFormField(
                      controller: _amountController,
                      decoration: InputDecoration(
                        labelText: loc.translate('amount'),
                        suffixText: _selectedToken,
                        suffixStyle: TextStyle(
                          color: Theme.of(context).primaryColor,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return loc.translate('enter_amount');
                        }
                        final amount = double.tryParse(value);
                        if (amount == null || amount <= 0) {
                          return loc.translate('invalid_amount');
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 32),

                    // Send Button
                    ElevatedButton(
                      onPressed: _isSending ? null : _showConfirmDialog,
                      style: ElevatedButton.styleFrom(
                        minimumSize: const Size(double.infinity, 56),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: _isSending
                          ? const SizedBox(
                              width: 24,
                              height: 24,
                              child:
                                  CircularProgressIndicator(color: Colors.white),
                            )
                          : Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(Icons.send_rounded),
                                const SizedBox(width: 8),
                                Text(loc.translate('send'),
                                    style: const TextStyle(fontSize: 16)),
                              ],
                            ),
                    ),
                    const SizedBox(height: 16),

                    // Warning
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.orange.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: Colors.orange.withValues(alpha: 0.2),
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.warning_amber_rounded,
                            color: Colors.orange,
                            size: 20,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              loc.translate('double_check_address'),
                              style: const TextStyle(
                                  fontSize: 12, color: Colors.orange),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
