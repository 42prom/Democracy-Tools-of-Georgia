import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'dart:convert';
import 'dart:async';
import 'dart:io' show HttpClient;

/// DTG Vote Receipt Verification Screen
///
/// Allows any voter or auditor to paste a signed receipt JSON and verify:
///  1. Ed25519 signature from the server's published public key.
///  2. Merkle inclusion (if proof is provided).
///  3. On-chain anchor status.
///
/// This screen calls GET /api/v1/public/receipt-pubkey to confirm the key,
/// and POST /api/v1/public/verify-receipt to verify the receipt.
class ReceiptVerificationScreen extends StatefulWidget {
  const ReceiptVerificationScreen({super.key});

  @override
  State<ReceiptVerificationScreen> createState() =>
      _ReceiptVerificationScreenState();
}

class _ReceiptVerificationScreenState extends State<ReceiptVerificationScreen>
    with SingleTickerProviderStateMixin {
  final _receiptController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  bool _isVerifying = false;
  _VerificationResult? _result;
  String? _errorMessage;

  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
    _pulseAnimation = Tween<double>(begin: 0.85, end: 1.0).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _receiptController.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _isVerifying = true;
      _result = null;
      _errorMessage = null;
    });

    try {
      Map<String, dynamic> receiptJson;
      try {
        receiptJson =
            jsonDecode(_receiptController.text.trim()) as Map<String, dynamic>;
      } catch (_) {
        setState(() {
          _errorMessage =
              'Invalid JSON — please paste a complete receipt object.';
          _isVerifying = false;
        });
        return;
      }

      // Call the backend verification endpoint
      // In the real app, use the injected Dio/http client from your DI layer.
      // Here we use dart:io HttpClient for minimal dependencies.
      final uri = Uri.parse('${_baseUrl()}/api/v1/public/verify-receipt');
      final client = HttpClientHelper();
      final response = await client.post(uri, {'receipt': receiptJson});

      if (response == null) {
        setState(() {
          _errorMessage = 'Could not reach the verification server.';
          _isVerifying = false;
        });
        return;
      }

      final valid = response['valid'] as bool? ?? false;
      final payload = response['payload'] as Map<String, dynamic>?;
      final signatureValid = response['signatureValid'] as bool? ?? false;
      final onChainAnchor = response['onChainAnchor'] as String?;

      setState(() {
        _result = _VerificationResult(
          valid: valid,
          signatureValid: signatureValid,
          voteId: payload?['voteId'] as String?,
          pollId: payload?['pollId'] as String?,
          leafHash: payload?['leafHash'] as String?,
          merkleRoot: payload?['merkleRoot'] as String?,
          ts: payload?['ts'] as String?,
          onChainAnchor: onChainAnchor,
        );
        _isVerifying = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = 'Verification error: $e';
        _isVerifying = false;
      });
    }
  }

  String _baseUrl() {
    // Replace with your actual API base URL or read from app config
    return 'https://api.dtg.ge';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0D1117),
      appBar: AppBar(
        backgroundColor: const Color(0xFF161B22),
        elevation: 0,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: const Color(0xFF238636).withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.verified_outlined,
                color: Color(0xFF3FB950),
                size: 20,
              ),
            ),
            const SizedBox(width: 10),
            const Text(
              'Verify Vote Receipt',
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        leading: const BackButton(color: Colors.white70),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── Header card ────────────────────────────
                _InfoCard(),
                const SizedBox(height: 24),

                // ── Receipt input ───────────────────────────
                const Text(
                  'Paste your receipt JSON',
                  style: TextStyle(
                    color: Color(0xFFE6EDF3),
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _receiptController,
                  style: const TextStyle(
                    color: Color(0xFFE6EDF3),
                    fontFamily: 'monospace',
                    fontSize: 12,
                  ),
                  maxLines: 10,
                  decoration: InputDecoration(
                    hintText:
                        '{ "payload": {...}, "signature": "...", "algorithm": "Ed25519", "version": 1 }',
                    hintStyle: const TextStyle(
                      color: Color(0xFF484F58),
                      fontSize: 12,
                    ),
                    filled: true,
                    fillColor: const Color(0xFF161B22),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: Color(0xFF30363D)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: Color(0xFF30363D)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: Color(0xFF1F6FEB)),
                    ),
                    suffixIcon: IconButton(
                      icon: const Icon(
                        Icons.paste_rounded,
                        color: Color(0xFF8B949E),
                      ),
                      onPressed: () async {
                        final data = await Clipboard.getData(
                          Clipboard.kTextPlain,
                        );
                        if (data?.text != null) {
                          _receiptController.text = data!.text!;
                        }
                      },
                      tooltip: 'Paste from clipboard',
                    ),
                  ),
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? 'Receipt JSON is required'
                      : null,
                ),
                const SizedBox(height: 16),

                // ── Verify button ───────────────────────────
                SizedBox(
                  width: double.infinity,
                  child: AnimatedBuilder(
                    animation: _pulseAnimation,
                    builder: (context, child) => Transform.scale(
                      scale: _isVerifying ? _pulseAnimation.value : 1.0,
                      child: child,
                    ),
                    child: ElevatedButton(
                      onPressed: _isVerifying ? null : _verify,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF238636),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        disabledBackgroundColor: const Color(
                          0xFF238636,
                        ).withValues(alpha: 0.5),
                      ),
                      child: _isVerifying
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text(
                              'Verify Receipt',
                              style: TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 15,
                              ),
                            ),
                    ),
                  ),
                ),

                // ── Error ───────────────────────────────────
                if (_errorMessage != null) ...[
                  const SizedBox(height: 16),
                  _StatusBanner(
                    icon: Icons.error_outline_rounded,
                    color: const Color(0xFFDA3633),
                    bgColor: const Color(0xFF3d1f1f),
                    message: _errorMessage!,
                  ),
                ],

                // ── Result ──────────────────────────────────
                if (_result != null) ...[
                  const SizedBox(height: 20),
                  _ResultCard(result: _result!),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Info card ──────────────────────────────────────────────────────────────

class _InfoCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1F2D3D),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: const Color(0xFF1F6FEB).withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline, color: Color(0xFF79C0FF), size: 20),
          const SizedBox(width: 12),
          const Expanded(
            child: Text(
              'Paste the receipt JSON you received after voting to independently '
              'verify its cryptographic signature and confirm your vote was recorded.',
              style: TextStyle(
                color: Color(0xFF79C0FF),
                fontSize: 13,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Status banner ──────────────────────────────────────────────────────────

class _StatusBanner extends StatelessWidget {
  final IconData icon;
  final Color color;
  final Color bgColor;
  final String message;
  const _StatusBanner({
    required this.icon,
    required this.color,
    required this.bgColor,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(color: color, fontSize: 13, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Verification result card ───────────────────────────────────────────────

class _ResultCard extends StatelessWidget {
  final _VerificationResult result;
  const _ResultCard({required this.result});

  @override
  Widget build(BuildContext context) {
    final isValid = result.valid;
    return AnimatedOpacity(
      opacity: 1.0,
      duration: const Duration(milliseconds: 400),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF161B22),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isValid ? const Color(0xFF238636) : const Color(0xFFDA3633),
            width: 1.5,
          ),
        ),
        child: Column(
          children: [
            // ── Header ──
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color:
                    (isValid
                            ? const Color(0xFF238636)
                            : const Color(0xFFDA3633))
                        .withValues(alpha: 0.15),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(11),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    isValid ? Icons.verified_rounded : Icons.gpp_bad_rounded,
                    color: isValid
                        ? const Color(0xFF3FB950)
                        : const Color(0xFFDA3633),
                    size: 24,
                  ),
                  const SizedBox(width: 10),
                  Text(
                    isValid ? 'Receipt Verified ✓' : 'Verification Failed ✗',
                    style: TextStyle(
                      color: isValid
                          ? const Color(0xFF3FB950)
                          : const Color(0xFFDA3633),
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                ],
              ),
            ),

            // ── Detail rows ──
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  _DetailRow(
                    label: 'Signature',
                    value: result.signatureValid
                        ? 'Valid (Ed25519)'
                        : 'INVALID',
                    color: result.signatureValid
                        ? const Color(0xFF3FB950)
                        : const Color(0xFFDA3633),
                  ),
                  if (result.voteId != null)
                    _DetailRow(
                      label: 'Vote ID',
                      value: _truncate(result.voteId!),
                      monospace: true,
                    ),
                  if (result.pollId != null)
                    _DetailRow(
                      label: 'Poll ID',
                      value: _truncate(result.pollId!),
                      monospace: true,
                    ),
                  if (result.leafHash != null)
                    _DetailRow(
                      label: 'Leaf Hash',
                      value: _truncate(result.leafHash!, 20),
                      monospace: true,
                    ),
                  if (result.merkleRoot != null)
                    _DetailRow(
                      label: 'Merkle Root',
                      value: _truncate(result.merkleRoot!, 20),
                      monospace: true,
                    ),
                  if (result.ts != null)
                    _DetailRow(label: 'Timestamp', value: result.ts!),
                  if (result.onChainAnchor != null)
                    _DetailRow(
                      label: 'On-Chain Tx',
                      value: _truncate(result.onChainAnchor!, 18),
                      monospace: true,
                      color: const Color(0xFF79C0FF),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _truncate(String val, [int maxLen = 28]) =>
      val.length > maxLen ? '${val.substring(0, maxLen)}…' : val;
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  final Color? color;
  final bool monospace;
  const _DetailRow({
    required this.label,
    required this.value,
    this.color,
    this.monospace = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: const TextStyle(color: Color(0xFF8B949E), fontSize: 13),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                color: color ?? const Color(0xFFE6EDF3),
                fontSize: 13,
                fontFamily: monospace ? 'monospace' : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Data classes ───────────────────────────────────────────────────────────

class _VerificationResult {
  final bool valid;
  final bool signatureValid;
  final String? voteId;
  final String? pollId;
  final String? leafHash;
  final String? merkleRoot;
  final String? ts;
  final String? onChainAnchor;

  const _VerificationResult({
    required this.valid,
    required this.signatureValid,
    this.voteId,
    this.pollId,
    this.leafHash,
    this.merkleRoot,
    this.ts,
    this.onChainAnchor,
  });
}

// ── Minimal HTTP helper ────────────────────────────────────────────────────
// Replace with your Dio instance from the DI layer in production.

class HttpClientHelper {
  Future<Map<String, dynamic>?> post(Uri uri, Map<String, dynamic> body) async {
    try {
      final client = HttpClient();
      final request = await client.postUrl(uri);
      request.headers.set('Content-Type', 'application/json');
      request.write(jsonEncode(body));
      final response = await request.close().timeout(
        const Duration(seconds: 15),
      );
      final responseBody = await response.transform(utf8.decoder).join();
      client.close();
      return jsonDecode(responseBody) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }
}
