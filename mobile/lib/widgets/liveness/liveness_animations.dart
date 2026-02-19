import 'dart:math';
import 'package:flutter/material.dart';
import '../../services/liveness/liveness_controller.dart';

class LivenessChallengeAnimation extends StatefulWidget {
  final LivenessChallenge challenge;
  final double size;

  const LivenessChallengeAnimation({
    super.key,
    required this.challenge,
    this.size = 80.0,
  });

  @override
  State<LivenessChallengeAnimation> createState() =>
      _LivenessChallengeAnimationState();
}

class _LivenessChallengeAnimationState extends State<LivenessChallengeAnimation>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    // Loop animation for guidance
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);
  }

  @override
  void didUpdateWidget(LivenessChallengeAnimation oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.challenge != oldWidget.challenge) {
      _controller.reset();
      _controller.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 400),
      transitionBuilder: (child, animation) {
        return ScaleTransition(scale: animation, child: child);
      },
      child: _buildAnimation(widget.challenge),
    );
  }

  Widget _buildAnimation(LivenessChallenge challenge) {
    // Key is crucial for AnimatedSwitcher to detect change
    switch (challenge) {
      case LivenessChallenge.blink:
        return _buildBlinkAnimation(key: ValueKey(challenge));
      case LivenessChallenge.turnHeadLeft:
        return _buildHeadTurnAnimation(isLeft: true, key: ValueKey(challenge));
      case LivenessChallenge.turnHeadRight:
        return _buildHeadTurnAnimation(isLeft: false, key: ValueKey(challenge));
    }
  }

  Widget _buildBlinkAnimation({required Key key}) {
    return AnimatedBuilder(
      key: key,
      animation: _controller,
      builder: (context, child) {
        // Quick blink logic
        // 0.0 -> 0.8 (Open)
        // 0.8 -> 1.0 (Closed)
        final value = _controller.value;
        final isClosed = value > 0.85;

        return Icon(
          isClosed ? Icons.visibility_off_rounded : Icons.visibility_rounded,
          size: widget.size,
          color: Colors.white,
        );
      },
    );
  }

  Widget _buildHeadTurnAnimation({required bool isLeft, required Key key}) {
    return AnimatedBuilder(
      key: key,
      animation: _controller,
      builder: (context, child) {
        // Simulate 3D turn using Y-axis rotation
        // value 0..1..0
        // Left turn: Rotate negative Y (0 to -45 deg)
        // Right turn: Rotate positive Y (0 to 45 deg)
        final double maxAngle = 45 * (pi / 180); // 45 degrees in radians
        final double angle = isLeft
            ? -maxAngle * _controller.value
            : maxAngle * _controller.value;

        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Transform(
              transform: Matrix4.identity()
                ..setEntry(3, 2, 0.001) // Perspective
                ..rotateY(angle),
              alignment: Alignment.center,
              child: Icon(
                Icons.account_circle_rounded,
                size: widget.size,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 8),
            // Moving arrow guidance
            Transform.translate(
              offset: Offset((isLeft ? -20.0 : 20.0) * _controller.value, 0),
              child: Icon(
                isLeft
                    ? Icons.keyboard_double_arrow_left_rounded
                    : Icons.keyboard_double_arrow_right_rounded,
                size: 32,
                color: Colors.cyanAccent,
              ),
            ),
          ],
        );
      },
    );
  }
}
