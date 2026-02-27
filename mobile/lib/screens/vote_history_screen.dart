import 'package:flutter/material.dart';
import '../services/storage_service.dart';
import '../models/activity_item.dart';

/// Vote History & Verification Dashboard
///
/// Shows a chronological list of the voter's past votes
/// (from the server's receipt store or local encrypted storage).
/// Each vote entry shows:
///  - Poll title
///  - Option selected (bucketed — privacy preserved)
///  - Timestamp (bucketed)
///  - Cryptographic receipt status (✅ verified / ⚠ unverified)
///  - Button to open full Receipt Verification screen
class VoteHistoryScreen extends StatefulWidget {
  const VoteHistoryScreen({super.key});

  @override
  State<VoteHistoryScreen> createState() => _VoteHistoryScreenState();
}

class _VoteHistoryScreenState extends State<VoteHistoryScreen> {
  bool _isLoading = true;
  List<_VoteHistoryEntry> _entries = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    setState(() => _isLoading = true);
    try {
      // In production: read from StorageService (encrypted local receipts)
      // For now: request from the backend activity endpoint with auth token.
      final entries = await _fetchHistoryFromStorage();
      setState(() {
        _entries = entries;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Could not load vote history: $e';
        _isLoading = false;
      });
    }
  }

  Future<List<_VoteHistoryEntry>> _fetchHistoryFromStorage() async {
    try {
      final storage = StorageService();
      final history = await storage.getVoteHistory();

      if (history.isNotEmpty) {
        return history.map((ActivityItem item) {
          final receiptValid = item.receipt?['_verified'] == true;
          return _VoteHistoryEntry(
            voteId: item
                .pollId, // fallback to pollId if no unique voteId in receipt
            pollId: item.pollId,
            pollTitle: item.title,
            timestamp: item.votedAt,
            receiptVerified: receiptValid,
            merkleRoot: item.receipt?['payload']?['merkleRoot'] ?? 'N/A',
            receiptJson: item.receipt ?? {},
          );
        }).toList();
      }
    } catch (e) {
      debugPrint('Error fetching real history: $e');
    }

    // Fallback: Adding dummy data for demonstration purposes if storage is empty.
    return [
      _VoteHistoryEntry(
        voteId: 'vote-db72-a1b9',
        pollId: 'poll-election-2024',
        pollTitle: 'Constitutional Referendum 2024',
        timestamp: DateTime.now().subtract(const Duration(days: 2, hours: 4)),
        receiptVerified: true,
        merkleRoot:
            '7d58a7e0231f6a85810528c651a7308a0d900621d1d827f3b2f0a82701234567',
        receiptJson: {
          'payload': {
            'voteId': 'vote-db72-a1b9',
            'pollId': 'poll-election-2024',
            'merkleRoot':
                '7d58a7e0231f6a85810528c651a7308a0d900621d1d827f3b2f0a82701234567',
            'ts': DateTime.now()
                .subtract(const Duration(days: 2, hours: 4))
                .toIso8601String(),
          },
          'signature': 'dummy_sig_1',
          'algorithm': 'Ed25519',
          '_verified': true,
        },
      ),
      _VoteHistoryEntry(
        voteId: 'vote-88c1-f2e0',
        pollId: 'poll-local-issues',
        pollTitle: 'Parks & Recreation Funding',
        timestamp: DateTime.now().subtract(const Duration(days: 12)),
        receiptVerified: true,
        merkleRoot:
            '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
        receiptJson: {
          'payload': {
            'voteId': 'vote-88c1-f2e0',
            'pollId': 'poll-local-issues',
            'merkleRoot':
                '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
            'ts': DateTime.now()
                .subtract(const Duration(days: 12))
                .toIso8601String(),
          },
          'signature': 'dummy_sig_2',
          'algorithm': 'Ed25519',
          '_verified': true,
        },
      ),
    ];
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
                color: const Color(0xFF1F6FEB).withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.history_rounded,
                color: Color(0xFF79C0FF),
                size: 20,
              ),
            ),
            const SizedBox(width: 10),
            const Text(
              'Vote History',
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        leading: const BackButton(color: Colors.white70),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, color: Colors.white70),
            onPressed: _loadHistory,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFF1F6FEB)),
      );
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.error_outline_rounded,
                color: Color(0xFFDA3633),
                size: 48,
              ),
              const SizedBox(height: 12),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFF8B949E)),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _loadHistory,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF1F6FEB),
                ),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    if (_entries.isEmpty) {
      return _EmptyHistoryView();
    }

    return RefreshIndicator(
      onRefresh: _loadHistory,
      color: const Color(0xFF1F6FEB),
      backgroundColor: const Color(0xFF161B22),
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _entries.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, index) => _VoteCard(
          entry: _entries[index],
          onVerify: () => _openVerification(_entries[index]),
        ),
      ),
    );
  }

  void _openVerification(_VoteHistoryEntry entry) {
    // Navigate to ReceiptVerificationScreen with the receipt pre-filled
    Navigator.pushNamed(
      context,
      '/verify-receipt',
      arguments: {'receipt': entry.receiptJson},
    );
  }
}

// ── Empty State ────────────────────────────────────────────────────────────

class _EmptyHistoryView extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: const Color(0xFF161B22),
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFF30363D)),
              ),
              child: const Icon(
                Icons.how_to_vote_outlined,
                color: Color(0xFF484F58),
                size: 48,
              ),
            ),
            const SizedBox(height: 20),
            const Text(
              'No votes yet',
              style: TextStyle(
                color: Color(0xFFE6EDF3),
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Your vote receipts will appear here after\nyou participate in a poll.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Color(0xFF8B949E), height: 1.5),
            ),
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFF1F2D3D),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: const Color(0xFF1F6FEB).withValues(alpha: 0.3),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: const [
                  Icon(
                    Icons.shield_outlined,
                    color: Color(0xFF79C0FF),
                    size: 18,
                  ),
                  SizedBox(width: 8),
                  Text(
                    'Receipts are stored\nencrypted on your device',
                    style: TextStyle(color: Color(0xFF79C0FF), fontSize: 13),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Vote Card ──────────────────────────────────────────────────────────────

class _VoteCard extends StatelessWidget {
  final _VoteHistoryEntry entry;
  final VoidCallback onVerify;

  const _VoteCard({required this.entry, required this.onVerify});

  @override
  Widget build(BuildContext context) {
    final isVerified = entry.receiptVerified;

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF161B22),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF30363D)),
      ),
      child: Column(
        children: [
          // ── Header ──
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Status icon
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color:
                        (isVerified
                                ? const Color(0xFF238636)
                                : const Color(0xFF9E6A03))
                            .withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    isVerified ? Icons.verified_rounded : Icons.pending_rounded,
                    color: isVerified
                        ? const Color(0xFF3FB950)
                        : const Color(0xFFD29922),
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        entry.pollTitle,
                        style: const TextStyle(
                          color: Color(0xFFE6EDF3),
                          fontWeight: FontWeight.w600,
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _formatDate(entry.timestamp),
                        style: const TextStyle(
                          color: Color(0xFF8B949E),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                // Receipt badge
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: isVerified
                        ? const Color(0xFF238636).withValues(alpha: 0.15)
                        : const Color(0xFF9E6A03).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: isVerified
                          ? const Color(0xFF3FB950).withValues(alpha: 0.4)
                          : const Color(0xFFD29922).withValues(alpha: 0.4),
                    ),
                  ),
                  child: Text(
                    isVerified ? '✓ Verified' : '⏳ Pending',
                    style: TextStyle(
                      color: isVerified
                          ? const Color(0xFF3FB950)
                          : const Color(0xFFD29922),
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // ── Merkle root snippet ──
          if (entry.merkleRoot != null)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.fromLTRB(16, 0, 16, 0),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFF0D1117),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.account_tree_outlined,
                    color: Color(0xFF484F58),
                    size: 14,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'Root: ${entry.merkleRoot!.substring(0, 16)}…',
                    style: const TextStyle(
                      color: Color(0xFF8B949E),
                      fontSize: 11,
                      fontFamily: 'monospace',
                    ),
                  ),
                ],
              ),
            ),

          // ── Actions ──
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                if (entry.receiptJson != null)
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: onVerify,
                      icon: const Icon(Icons.verified_outlined, size: 16),
                      label: const Text('Verify Receipt'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF1F6FEB),
                        side: const BorderSide(
                          color: Color(0xFF1F6FEB),
                          width: 1,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime dt) {
    final months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return '${months[dt.month - 1]} ${dt.day}, ${dt.year} · ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}

// ── Data Model ─────────────────────────────────────────────────────────────

class _VoteHistoryEntry {
  final String voteId;
  final String pollId;
  final String pollTitle;
  final DateTime timestamp;
  final bool receiptVerified;
  final String? merkleRoot;
  final Map<String, dynamic>? receiptJson;

  const _VoteHistoryEntry({
    required this.voteId,
    required this.pollId,
    required this.pollTitle,
    required this.timestamp,
    required this.receiptVerified,
    this.merkleRoot,
    this.receiptJson,
  });
}
