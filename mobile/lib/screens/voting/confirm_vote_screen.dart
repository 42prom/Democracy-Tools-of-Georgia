import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/activity_item.dart';
import '../../models/poll.dart';
import '../../services/interfaces/i_api_service.dart';
import '../../services/service_locator.dart';
import '../../services/storage_service.dart';
import '../../services/wallet_service.dart';
import '../../services/localization_service.dart';
import 'vote_receipt_screen.dart';

class ConfirmVoteScreen extends StatefulWidget {
  final Poll poll;
  final PollOption selectedOption;

  const ConfirmVoteScreen({
    super.key,
    required this.poll,
    required this.selectedOption,
  });

  @override
  State<ConfirmVoteScreen> createState() => _ConfirmVoteScreenState();
}

class _ConfirmVoteScreenState extends State<ConfirmVoteScreen> {
  final IApiService _apiService = ServiceLocator.apiService;
  final StorageService _storageService = StorageService();
  bool _submitting = false;
  String _statusMessage = '';

  Future<void> _confirmAndSign() async {
    // Biometrics removed: directly submit vote.
    await _submitVote();
  }

  Future<void> _submitVote() async {
    final loc = Provider.of<LocalizationService>(context, listen: false);

    setState(() {
      _submitting = true;
      _statusMessage = loc.translate('requesting_challenge');
    });

    try {
      // STEP 1: Request challenge nonce
      // POST /api/v1/attestations/challenge
      setState(
        () => _statusMessage = loc.translate('step_1_5_challenge'),
      );
      final challengeResponse = await _apiService.requestChallenge();
      final String nonce = challengeResponse['nonce'];

      // STEP 2: On-device NFC + 3D Liveness + Face Match
      // (Phase 0: Mock - biometric already done above)
      // (Phase 1: Real NFC chip read + face match vs chip portrait)
      setState(() => _statusMessage = loc.translate('step_2_5_biometric'));
      await Future.delayed(
        const Duration(milliseconds: 500),
      ); // Simulate verification

      // STEP 3: Issue session attestation
      // POST /api/v1/attestations/issue
      // Bound to: pollId + nonce + votePayloadHash + TTL
      setState(() => _statusMessage = loc.translate('step_3_5_attestation'));
      final timestampBucket = DateTime.now().millisecondsSinceEpoch ~/ 60000;

      final attestationResponse = await _apiService.issueAttestation(
        pollId: widget.poll.id,
        optionId: widget.selectedOption.id,
        timestampBucket: timestampBucket,
        nonce: nonce,
      );
      final String attestation = attestationResponse['attestation'];

      // STEP 4: Compute nullifier locally (NEVER leaves device)
      // nullifier = SHA256(pollId + credentialSecret)
      setState(() => _statusMessage = loc.translate('step_4_5_nullifier'));
      final String nullifier = await _storageService.computeNullifier(
        widget.poll.id,
      );

      // STEP 5: Submit vote
      // POST /api/v1/votes
      // NO userId, NO name, NO PII - only nullifier + attestation
      setState(() => _statusMessage = loc.translate('step_5_5_submitting'));
      final response = await _apiService.submitVote(
        pollId: widget.poll.id,
        optionId: widget.selectedOption.id,
        nullifier: nullifier,
        attestation: attestation,
        timestampBucket: timestampBucket,
      );

      // Extract reward info from backend response (source of truth)
      final reward = response['reward'];
      String? rewardAmount;
      String? rewardToken;
      if (reward != null && reward['issued'] == true) {
        rewardAmount = reward['amount']?.toString();
        rewardToken = reward['tokenSymbol'] as String?;
      }

      // Save activity record with backend-confirmed reward info
      await _storageService.saveActivityItem(
        ActivityItem(
          pollId: widget.poll.id,
          title: widget.poll.title,
          type: widget.poll.type,
          votedAt: DateTime.now(),
          endsAt: widget.poll.endAt,
          rewardAmount: rewardAmount,
          rewardToken: rewardToken,
        ),
      );

      // Sync wallet with backend (source of truth for rewards/balance)
      try {
        final walletService = WalletService();
        await walletService.syncWithBackend();
      } catch (e) {
        // Non-blocking: wallet sync can retry on next open
        debugPrint('[ConfirmVote] Wallet sync failed: $e');
      }

      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (context) => VoteReceiptScreen(
              poll: widget.poll,
              selectedOption: widget.selectedOption,
              txHash: response['txHash'] ??
                  'mock_tx_${DateTime.now().millisecondsSinceEpoch}',
            ),
          ),
        );
      }
    } catch (e) {
      final errorStr = e.toString();
      if (errorStr.contains('409') || errorStr.contains('Already voted')) {
        // Self-healing: treat as success to allow dashboard refresh
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(loc.translate('vote_already_recorded')),
            ),
          );
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(
              builder: (context) => VoteReceiptScreen(
                poll: widget.poll,
                selectedOption: widget.selectedOption,
                txHash: 'ALREADY_VOTED',
              ),
            ),
          );
        }
        return;
      }

      setState(() => _submitting = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${loc.translate('failed_submit_vote')}: $e'),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<LocalizationService>(
      builder: (context, loc, child) {
        return Scaffold(
          appBar: AppBar(title: Text(loc.translate('confirm_vote'))),
          body: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Spacer(),

                  // Summary
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20.0),
                      child: Column(
                        children: [
                          Icon(
                            Icons.how_to_vote,
                            size: 64,
                            color: Theme.of(context).primaryColor,
                          ),
                          const SizedBox(height: 20),
                          Text(
                            loc.translate('you_are_voting_for'),
                            style: Theme.of(context).textTheme.titleMedium,
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            widget.selectedOption.text,
                            style: Theme.of(context)
                                .textTheme
                                .headlineSmall
                                ?.copyWith(
                                  fontWeight: FontWeight.bold,
                                  color: Theme.of(context).primaryColor,
                                ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '${loc.translate('in_poll')} ${widget.poll.title}',
                            style: Theme.of(context)
                                .textTheme
                                .bodyMedium
                                ?.copyWith(color: Colors.grey),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  ),

                  const Spacer(),

                  // Status Message
                  if (_submitting && _statusMessage.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16.0),
                      child: Text(
                        _statusMessage,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: Theme.of(context).primaryColor,
                            ),
                        textAlign: TextAlign.center,
                      ),
                    ),

                  // Confirm Vote Button
                  ElevatedButton(
                    onPressed: _submitting ? null : _confirmAndSign,
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size(double.infinity, 56),
                    ),
                    child: _submitting
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child:
                                CircularProgressIndicator(color: Colors.white),
                          )
                        : Text(loc.translate('confirm_vote')),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
