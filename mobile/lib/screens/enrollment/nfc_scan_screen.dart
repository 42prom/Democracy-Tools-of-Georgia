import 'package:flutter/material.dart';
import 'dart:async';
import 'liveness_screen.dart';

class NfcScanScreen extends StatefulWidget {
  const NfcScanScreen({super.key});

  @override
  State<NfcScanScreen> createState() => _NfcScanScreenState();
}

class _NfcScanScreenState extends State<NfcScanScreen>
    with SingleTickerProviderStateMixin {
  ScanStatus _status = ScanStatus.ready;
  late AnimationController _animationController;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat();

    // Auto-start scan after 1 second
    Future.delayed(const Duration(seconds: 1), () {
      if (mounted) _startScan();
    });
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  void _startScan() async {
    setState(() => _status = ScanStatus.scanning);

    // Simulate NFC scan (Phase 0 - mock)
    await Future.delayed(const Duration(seconds: 3));

    if (mounted) {
      setState(() => _status = ScanStatus.success);

      await Future.delayed(const Duration(seconds: 1));

      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (context) => const LivenessScreen(),
          ),
        );
      }
    }
  }

  void _retry() {
    _startScan();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('NFC Scan'),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              // Animation: Phone holding card
              AnimatedBuilder(
                animation: _animationController,
                builder: (context, child) {
                  return Transform.scale(
                    scale: 1.0 +
                        (_status == ScanStatus.scanning
                            ? _animationController.value * 0.1
                            : 0),
                    child: Icon(
                      _status == ScanStatus.success
                          ? Icons.check_circle
                          : _status == ScanStatus.error
                              ? Icons.error
                              : Icons.nfc,
                      size: 120,
                      color: _status == ScanStatus.success
                          ? Colors.green
                          : _status == ScanStatus.error
                              ? Colors.red
                              : Theme.of(context).primaryColor,
                    ),
                  );
                },
              ),
              const SizedBox(height: 40),
              // Status Text
              Text(
                _getStatusText(),
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              if (_status == ScanStatus.error) ...[
                Text(
                  'Scan failed. Ensure NFC is on.',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: Colors.red,
                      ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _retry,
                  child: const Text('Retry'),
                ),
              ],
              const Spacer(),
            ],
          ),
        ),
      ),
    );
  }

  String _getStatusText() {
    switch (_status) {
      case ScanStatus.ready:
        return 'Ready to Scan';
      case ScanStatus.scanning:
        return 'Reading Chip...';
      case ScanStatus.success:
        return 'Success!';
      case ScanStatus.error:
        return 'Scan Failed';
    }
  }
}

enum ScanStatus { ready, scanning, success, error }
