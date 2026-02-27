import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../services/localization_service.dart';
import '../../models/poll.dart';
import '../../config/theme.dart';

class VoteReceiptScreen extends StatefulWidget {
  final Poll poll;
  final PollOption selectedOption;
  final String txHash;
  final Map<String, dynamic>? receipt;
  final String? merkleRoot;

  const VoteReceiptScreen({
    super.key,
    required this.poll,
    required this.selectedOption,
    required this.txHash,
    this.receipt,
    this.merkleRoot,
  });

  @override
  State<VoteReceiptScreen> createState() => _VoteReceiptScreenState();
}

class _VoteReceiptScreenState extends State<VoteReceiptScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _checkController;
  late final Animation<double> _checkScale;
  String? _copiedKey;

  @override
  void initState() {
    super.initState();
    _checkController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    )..forward();
    _checkScale = CurvedAnimation(
      parent: _checkController,
      curve: Curves.elasticOut,
    );
  }

  @override
  void dispose() {
    _checkController.dispose();
    super.dispose();
  }

  Future<void> _copyToClipboard(String key, String value, String loc) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (!mounted) return;
    setState(() => _copiedKey = key);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(loc),
        duration: const Duration(seconds: 1),
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppTheme.facebookBlue,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    );
    await Future.delayed(const Duration(seconds: 2));
    if (mounted) setState(() => _copiedKey = null);
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<LocalizationService>(
      builder: (context, loc, _) {
        final cs = Theme.of(context).colorScheme;
        final receiptPayload =
            widget.receipt?['payload'] as Map<String, dynamic>?;
        final signature = widget.receipt?['signature'] as String?;
        final algorithm = widget.receipt?['algorithm'] as String? ?? 'Ed25519';
        final leafHash = receiptPayload?['leafHash'] as String?;
        final merkleRoot =
            widget.merkleRoot ?? receiptPayload?['merkleRoot'] as String?;
        final voteId = receiptPayload?['voteId'] as String?;
        final hasCryptoProof = leafHash != null || merkleRoot != null;

        return Scaffold(
          body: SafeArea(
            child: CustomScrollView(
              slivers: [
                SliverPadding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 16,
                  ),
                  sliver: SliverList(
                    delegate: SliverChildListDelegate([
                      const SizedBox(height: 24),

                      // ── Animated check icon ──────────────────────────────
                      Center(
                        child: ScaleTransition(
                          scale: _checkScale,
                          child: Container(
                            width: 96,
                            height: 96,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.green.withValues(alpha: 0.15),
                              border: Border.all(color: Colors.green, width: 2),
                            ),
                            child: const Icon(
                              Icons.check_rounded,
                              size: 56,
                              color: Colors.green,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 20),

                      // ── Title ─────────────────────────────────────────────
                      Text(
                        loc.translate('vote_submitted'),
                        style: Theme.of(context).textTheme.headlineMedium
                            ?.copyWith(fontWeight: FontWeight.bold),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        loc.translate('cryptographic_proof_subtitle'),
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: cs.onSurface.withValues(alpha: 0.6),
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 28),

                      // ── Basic receipt card ────────────────────────────────
                      _SectionCard(
                        children: [
                          _ReceiptRow(
                            label: loc.translate('poll'),
                            value: widget.poll.title,
                          ),
                          if (widget.poll.endAt != null) ...[
                            const _Divider(),
                            _ReceiptRow(
                              label: loc.translate('poll_ends'),
                              value: DateFormat.yMMMd().format(
                                DateTime.parse(widget.poll.endAt!),
                              ),
                            ),
                          ],
                          const _Divider(),
                          _ReceiptRow(
                            label: loc.translate('your_vote'),
                            value: widget.selectedOption.text,
                            highlight: true,
                          ),
                          const _Divider(),
                          _CopyableRow(
                            label: loc.translate('transaction_hash'),
                            value: widget.txHash,
                            isCopied: _copiedKey == 'txHash',
                            copyLabel: loc.translate('copy_to_clipboard'),
                            copiedLabel: loc.translate('copied'),
                            onCopy: () => _copyToClipboard(
                              'txHash',
                              widget.txHash,
                              loc.translate('copied'),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // ── Cryptographic proof expansion ─────────────────────
                      if (hasCryptoProof)
                        _CryptoProofCard(
                          leafHash: leafHash,
                          merkleRoot: merkleRoot,
                          signature: signature,
                          algorithm: algorithm,
                          voteId: voteId,
                          copiedKey: _copiedKey,
                          onCopy: _copyToClipboard,
                          sectionTitle: loc.translate('cryptographic_proof'),
                          labelLeaf: loc.translate('leaf_hash'),
                          labelMerkle: loc.translate('merkle_root'),
                          labelSig: loc.translate('ed25519_signature'),
                          labelAlgo: loc.translate('algorithm'),
                          labelVoteId: loc.translate('vote_id'),
                          copyLabel: loc.translate('copy_to_clipboard'),
                          copiedLabel: loc.translate('copied'),
                          tipText: loc.translate('verify_independently_tip'),
                        ),

                      const SizedBox(height: 32),

                      // ── Return to home button ─────────────────────────────
                      ElevatedButton(
                        onPressed: () =>
                            Navigator.of(context).popUntil((r) => r.isFirst),
                        style: ElevatedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 56),
                        ),
                        child: Text(loc.translate('back_to_home')),
                      ),
                      const SizedBox(height: 24),
                    ]),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper widgets — all use AppTheme tokens, no custom colours
// ─────────────────────────────────────────────────────────────────────────────

class _SectionCard extends StatelessWidget {
  final List<Widget> children;
  const _SectionCard({required this.children});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: children,
        ),
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();
  @override
  Widget build(BuildContext context) => const Divider(height: 24);
}

class _ReceiptRow extends StatelessWidget {
  final String label;
  final String value;
  final bool highlight;

  const _ReceiptRow({
    required this.label,
    required this.value,
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: cs.onSurface.withValues(alpha: 0.55),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
            fontWeight: FontWeight.w600,
            color: highlight ? AppTheme.facebookBlue : null,
          ),
        ),
      ],
    );
  }
}

class _CopyableRow extends StatelessWidget {
  final String label;
  final String value;
  final bool isCopied;
  final String copyLabel;
  final String copiedLabel;
  final VoidCallback onCopy;

  const _CopyableRow({
    required this.label,
    required this.value,
    required this.isCopied,
    required this.copyLabel,
    required this.copiedLabel,
    required this.onCopy,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final display = value.length > 20
        ? '${value.substring(0, 10)}…${value.substring(value.length - 8)}'
        : value;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: cs.onSurface.withValues(alpha: 0.55),
          ),
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            Expanded(
              child: Text(
                display,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontFamily: 'monospace',
                  color: cs.onSurface.withValues(alpha: 0.85),
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            _CopyButton(
              isCopied: isCopied,
              copyLabel: copyLabel,
              copiedLabel: copiedLabel,
              onCopy: onCopy,
            ),
          ],
        ),
      ],
    );
  }
}

class _CopyButton extends StatelessWidget {
  final bool isCopied;
  final String copyLabel;
  final String copiedLabel;
  final VoidCallback onCopy;

  const _CopyButton({
    required this.isCopied,
    required this.copyLabel,
    required this.copiedLabel,
    required this.onCopy,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 200),
      child: isCopied
          ? const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8),
              child: Icon(Icons.check, size: 18, color: Colors.green),
            )
          : TextButton.icon(
              key: const ValueKey('copy'),
              onPressed: onCopy,
              icon: const Icon(Icons.copy, size: 14),
              label: Text(copyLabel, style: const TextStyle(fontSize: 12)),
              style: TextButton.styleFrom(
                foregroundColor: AppTheme.facebookBlue,
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                minimumSize: const Size(48, 32),
              ),
            ),
    );
  }
}

/// Expandable card showing the full cryptographic proof:
/// leaf hash, Merkle root, Ed25519 signature, algorithm, vote ID.
class _CryptoProofCard extends StatefulWidget {
  final String? leafHash;
  final String? merkleRoot;
  final String? signature;
  final String algorithm;
  final String? voteId;
  final String? copiedKey;
  final Future<void> Function(String key, String value, String loc) onCopy;
  final String sectionTitle;
  final String labelLeaf;
  final String labelMerkle;
  final String labelSig;
  final String labelAlgo;
  final String labelVoteId;
  final String copyLabel;
  final String copiedLabel;
  final String tipText;

  const _CryptoProofCard({
    required this.leafHash,
    required this.merkleRoot,
    required this.signature,
    required this.algorithm,
    required this.voteId,
    required this.copiedKey,
    required this.onCopy,
    required this.sectionTitle,
    required this.labelLeaf,
    required this.labelMerkle,
    required this.labelSig,
    required this.labelAlgo,
    required this.labelVoteId,
    required this.copyLabel,
    required this.copiedLabel,
    required this.tipText,
  });

  @override
  State<_CryptoProofCard> createState() => _CryptoProofCardState();
}

class _CryptoProofCardState extends State<_CryptoProofCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          // ── Header (always visible) ───────────────────────────
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppTheme.facebookBlue.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.verified_user_rounded,
                      color: AppTheme.facebookBlue,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.sectionTitle,
                          style: Theme.of(context).textTheme.titleSmall
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          widget.tipText,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: cs.onSurface.withValues(alpha: 0.5),
                              ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  AnimatedRotation(
                    turns: _expanded ? 0.5 : 0,
                    duration: const Duration(milliseconds: 250),
                    child: Icon(
                      Icons.expand_more,
                      color: cs.onSurface.withValues(alpha: 0.5),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── Expandable content ────────────────────────────────
          AnimatedCrossFade(
            firstChild: const SizedBox.shrink(),
            secondChild: Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: Column(
                children: [
                  const Divider(height: 0),
                  const SizedBox(height: 16),
                  if (widget.leafHash != null) ...[
                    _HashRow(
                      label: widget.labelLeaf,
                      value: widget.leafHash!,
                      rowKey: 'leafHash',
                      isCopied: widget.copiedKey == 'leafHash',
                      copyLabel: widget.copyLabel,
                      copiedLabel: widget.copiedLabel,
                      onCopy: widget.onCopy,
                    ),
                    const SizedBox(height: 12),
                  ],
                  if (widget.merkleRoot != null) ...[
                    _HashRow(
                      label: widget.labelMerkle,
                      value: widget.merkleRoot!,
                      rowKey: 'merkleRoot',
                      isCopied: widget.copiedKey == 'merkleRoot',
                      copyLabel: widget.copyLabel,
                      copiedLabel: widget.copiedLabel,
                      onCopy: widget.onCopy,
                    ),
                    const SizedBox(height: 12),
                  ],
                  if (widget.signature != null &&
                      widget.signature != 'SIGNING_KEY_NOT_CONFIGURED') ...[
                    _HashRow(
                      label: widget.labelSig,
                      value: widget.signature!,
                      rowKey: 'signature',
                      isCopied: widget.copiedKey == 'signature',
                      copyLabel: widget.copyLabel,
                      copiedLabel: widget.copiedLabel,
                      onCopy: widget.onCopy,
                    ),
                    const SizedBox(height: 12),
                  ],
                  // Algorithm badge
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          widget.labelAlgo,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: cs.onSurface.withValues(alpha: 0.55),
                              ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.green.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: Colors.green.withValues(alpha: 0.4),
                          ),
                        ),
                        child: Text(
                          widget.algorithm,
                          style: const TextStyle(
                            fontSize: 11,
                            color: Colors.green,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            crossFadeState: _expanded
                ? CrossFadeState.showSecond
                : CrossFadeState.showFirst,
            duration: const Duration(milliseconds: 300),
          ),
        ],
      ),
    );
  }
}

class _HashRow extends StatelessWidget {
  final String label;
  final String value;
  final String rowKey;
  final bool isCopied;
  final String copyLabel;
  final String copiedLabel;
  final Future<void> Function(String key, String value, String loc) onCopy;

  const _HashRow({
    required this.label,
    required this.value,
    required this.rowKey,
    required this.isCopied,
    required this.copyLabel,
    required this.copiedLabel,
    required this.onCopy,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final truncated = value.length > 24
        ? '${value.substring(0, 14)}…${value.substring(value.length - 8)}'
        : value;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.darkBackground,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: cs.outlineVariant.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: cs.onSurface.withValues(alpha: 0.5),
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: Text(
                  truncated,
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 12,
                    letterSpacing: 0.5,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              _CopyButton(
                isCopied: isCopied,
                copyLabel: copyLabel,
                copiedLabel: copiedLabel,
                onCopy: () => onCopy(rowKey, value, copiedLabel),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
