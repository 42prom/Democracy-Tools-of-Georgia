import 'dart:math';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'package:flutter/foundation.dart';

/// Wraps ML Kit Face Detection with stabilization logic.
class FaceMeshService {
  final FaceDetector _faceDetector = FaceDetector(
    options: FaceDetectorOptions(
      enableContours: true,
      enableClassification: true, // For smile/blink
      enableLandmarks: true,
      performanceMode: FaceDetectorMode.accurate, // Critical for liveness
      minFaceSize: 0.10, // More tolerant across devices
      // NOTE: liveness controller still enforces 'move closer' thresholds.
      // Detect faces reasonably far away
    ),
  );

  bool _isBusy = false;
  bool get isBusy => _isBusy;

  Face? _lastFace;
  Point<double>? _lastCenter;

  /// Process camera image and return detected Face with raw data.
  Future<Face?> processImage(InputImage inputImage) async {
    // If a frame is already being processed, return the last known face to keep UI guidance stable.
    if (_isBusy) return _lastFace;
    _isBusy = true;

    try {
      final faces = await _faceDetector.processImage(inputImage);
      if (faces.isEmpty) return null;

      // Prefer a stable face across frames:
      // 1) If we had a previous face center, pick the face closest to it (reduces jumps when multiple faces appear).
      // 2) Otherwise fall back to largest face.
      Face selected;
      if (_lastCenter != null && faces.length > 1) {
        double best = double.infinity;
        Face bestFace = faces.first;
        for (final f in faces) {
          final c = Point<double>(
            f.boundingBox.left + f.boundingBox.width / 2.0,
            f.boundingBox.top + f.boundingBox.height / 2.0,
          );
          final d =
              (c.x - _lastCenter!.x) * (c.x - _lastCenter!.x) +
              (c.y - _lastCenter!.y) * (c.y - _lastCenter!.y);
          if (d < best) {
            best = d;
            bestFace = f;
          }
        }
        selected = bestFace;
      } else {
        faces.sort(
          (a, b) => (b.boundingBox.width * b.boundingBox.height).compareTo(
            a.boundingBox.width * a.boundingBox.height,
          ),
        );
        selected = faces.first;
      }

      _lastFace = selected;
      _lastCenter = Point<double>(
        selected.boundingBox.left + selected.boundingBox.width / 2.0,
        selected.boundingBox.top + selected.boundingBox.height / 2.0,
      );

      return selected;
    } catch (e) {
      debugPrint('FaceMeshService Error: $e');
      return _lastFace;
    } finally {
      _isBusy = false;
    }
  }

  void dispose() {
    _faceDetector.close();
  }
}

/// EMA Smoother for face landmarks.
/// Alpha 0.5 = balance between lag and jitter.
class FaceLandmarkSmoother {
  final double alpha;
  final Map<FaceContourType, List<Point<double>>> _smoothedPoints = {};

  FaceLandmarkSmoother({this.alpha = 0.5});

  void add(Face face) {
    for (final contour in face.contours.entries) {
      final rawPoints = contour.value?.points;
      if (rawPoints == null) continue;

      if (!_smoothedPoints.containsKey(contour.key)) {
        // First frame: initialize with raw points
        _smoothedPoints[contour.key] = rawPoints
            .map((p) => Point<double>(p.x.toDouble(), p.y.toDouble()))
            .toList();
      } else {
        // Apply EMA
        final currentSmoothed = _smoothedPoints[contour.key]!;
        // Ensure lengths match (ML Kit contours are usually stable in count)
        if (currentSmoothed.length != rawPoints.length) {
          // Topology changed (rare), reset
          _smoothedPoints[contour.key] = rawPoints
              .map((p) => Point<double>(p.x.toDouble(), p.y.toDouble()))
              .toList();
          continue;
        }

        for (int i = 0; i < rawPoints.length; i++) {
          final oldP = currentSmoothed[i];
          final newP = rawPoints[i];

          // St = alpha * Yt + (1 - alpha) * St-1
          final newX = alpha * newP.x + (1 - alpha) * oldP.x;
          final newY = alpha * newP.y + (1 - alpha) * oldP.y;

          currentSmoothed[i] = Point<double>(newX, newY);
        }
      }
    }
  }

  /// Returns smoothed points for a specific contour type.
  List<Point<int>>? getSmoothedPoints(FaceContourType type) {
    final points = _smoothedPoints[type];
    if (points == null) return null;
    return points.map((p) => Point<int>(p.x.round(), p.y.round())).toList();
  }

  void clear() {
    _smoothedPoints.clear();
  }
}
