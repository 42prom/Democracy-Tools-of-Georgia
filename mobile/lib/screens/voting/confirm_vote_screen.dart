import 'package:flutter/material.dart';
import '../../models/activity_item.dart';
import '../../models/poll.dart';
import '../../services/interfaces/i_api_service.dart';
import '../../services/service_locator.dart';
import '../../services/storage_service.dart';
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
    setState(() {
      _submitting = true;
      _statusMessage = 'Requesting challenge...';
    });

    try {
      // STEP 1: Request challenge nonce
      // POST /api/v1/attestations/challenge
      setState(
        () => _statusMessage = 'Step 1/5: Requesting challenge nonce...',
      );
      final challengeResponse = await _apiService.requestChallenge();
      final String nonce = challengeResponse['nonce'];

      // STEP 2: On-device NFC + 3D Liveness + Face Match
      // (Phase 0: Mock - biometric already done above)
      // (Phase 1: Real NFC chip read + face match vs chip portrait)
      setState(() => _statusMessage = 'Step 2/5: Biometric verification...');
      await Future.delayed(
        const Duration(milliseconds: 500),
      ); // Simulate verification

      // STEP 3: Issue session attestation
      // POST /api/v1/attestations/issue
      // Bound to: pollId + nonce + votePayloadHash + TTL
      setState(() => _statusMessage = 'Step 3/5: Issuing attestation...');
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
      setState(() => _statusMessage = 'Step 4/5: Computing nullifier...');
      final String nullifier = await _storageService.computeNullifier(
        widget.poll.id,
      );

      // STEP 5: Submit vote
      // POST /api/v1/votes
      // NO userId, NO name, NO PII - only nullifier + attestation
      setState(() => _statusMessage = 'Step 5/5: Submitting vote...');
      final response = await _apiService.submitVote(
        pollId: widget.poll.id,
        optionId: widget.selectedOption.id,
        nullifier: nullifier,
        attestation: attestation,
        timestampBucket: timestampBucket,
      );

      // Save activity record (no vote choice stored)
      await _storageService.saveActivityItem(ActivityItem(
        pollId: widget.poll.id,
        title: widget.poll.title,
        type: widget.poll.type,
        votedAt: DateTime.now(),
        endsAt: widget.poll.endAt,
      ));

      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (context) => VoteReceiptScreen(
              poll: widget.poll,
              selectedOption: widget.selectedOption,
              txHash:
                  response['txHash'] ??
                  'mock_tx_${DateTime.now().millisecondsSinceEpoch}',
            ),
          ),
        );
      }
    } catch (e) {
      setState(() => _submitting = false);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to submit vote: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Confirm Vote')),
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
                        'You are voting for:',
                        style: Theme.of(context).textTheme.titleMedium,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        widget.selectedOption.text,
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: Theme.of(context).primaryColor,
                            ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'in poll: ${widget.poll.title}',
                        style: Theme.of(
                          context,
                        ).textTheme.bodyMedium?.copyWith(color: Colors.grey),
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
                        child: CircularProgressIndicator(color: Colors.white),
                      )
                    : const Text('Confirm Vote'),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
