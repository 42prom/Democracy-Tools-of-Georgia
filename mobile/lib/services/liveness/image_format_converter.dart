import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';

/// Android image format constants
class AndroidImageFormat {
  static const int nv21 = 17;
  static const int yuv420_888 = 35;
  static const int yv12 = 842094169;
  // JPEG format (some devices may return this)
  static const int jpeg = 256;
  // Raw sensor format
  static const int raw10 = 37;
  static const int raw12 = 38;
}

/// Utility class for camera image format conversion
/// Handles YUV420_888 to NV21 conversion for ML Kit compatibility
///
/// Fixes for InputImageConverterError:
/// - Supports NV21, YUV420_888, YV12 formats
/// - Graceful fallback for unsupported formats
/// - Throttled error logging to prevent spam
/// - Automatic backoff after consecutive failures
class ImageFormatConverter {
  /// Last log timestamp to throttle diagnostic output
  static DateTime? _lastLogTime;
  static const _logThrottleMs = 1000;

  /// Last error log timestamp (separate from diagnostics)
  static DateTime? _lastErrorLogTime;
  static const _errorLogThrottleMs = 5000; // Only log errors every 5 seconds

  /// Track unsupported format warnings (only warn once per format)
  static final Set<int> _warnedFormats = {};

  /// Consecutive null frame counter for backoff
  static int _consecutiveNullFrames = 0;
  static const _maxConsecutiveNulls = 5;
  static DateTime? _backoffUntil;
  static const _backoffDurationMs = 500;

  /// Check if we should skip processing due to backoff
  static bool shouldSkipFrame() {
    if (_backoffUntil != null && DateTime.now().isBefore(_backoffUntil!)) {
      return true;
    }
    _backoffUntil = null;
    return false;
  }

  /// Record a successful frame (resets backoff)
  static void recordSuccess() {
    _consecutiveNullFrames = 0;
    _backoffUntil = null;
  }

  /// Record a failed/null frame (may trigger backoff)
  static void recordFailure() {
    _consecutiveNullFrames++;
    if (_consecutiveNullFrames >= _maxConsecutiveNulls) {
      _backoffUntil = DateTime.now().add(
        const Duration(milliseconds: _backoffDurationMs),
      );
      debugPrint('[ImageFormat] Backoff triggered after $_consecutiveNullFrames failures');
      _consecutiveNullFrames = 0;
    }
  }

  /// Log diagnostic info (throttled to 1/second)
  static void logDiagnostics(CameraImage image, {String? conversionPath}) {
    final now = DateTime.now();
    if (_lastLogTime != null &&
        now.difference(_lastLogTime!).inMilliseconds < _logThrottleMs) {
      return;
    }
    _lastLogTime = now;

    final buffer = StringBuffer();
    buffer.writeln('[ImageFormat] Diagnostics:');
    buffer.writeln('  format.raw: ${image.format.raw}');
    buffer.writeln('  planes: ${image.planes.length}');
    buffer.writeln('  size: ${image.width}x${image.height}');

    for (int i = 0; i < image.planes.length; i++) {
      final plane = image.planes[i];
      buffer.writeln('  plane[$i]: bytesPerRow=${plane.bytesPerRow}, '
          'bytesPerPixel=${plane.bytesPerPixel ?? "null"}, '
          'bytes=${plane.bytes.length}');
    }

    if (conversionPath != null) {
      buffer.writeln('  path: $conversionPath');
    }

    debugPrint(buffer.toString());
  }

  /// Check if the format is NV21
  static bool isNv21(CameraImage image) {
    return image.format.raw == AndroidImageFormat.nv21;
  }

  /// Check if the format is YUV420_888
  static bool isYuv420_888(CameraImage image) {
    return image.format.raw == AndroidImageFormat.yuv420_888;
  }

  /// Get NV21 bytes from a CameraImage
  /// Returns null if conversion fails or format is unsupported
  ///
  /// Handles InputImageConverterError by:
  /// - Supporting multiple Android image formats
  /// - Throttling error logs to prevent spam
  /// - Only warning once per unsupported format type
  static Uint8List? toNv21Bytes(CameraImage image) {
    final rawFormat = image.format.raw;

    // NV21 format - use directly
    if (rawFormat == AndroidImageFormat.nv21) {
      logDiagnostics(image, conversionPath: 'NV21 direct');
      return _concatenatePlanes(image);
    }

    // YUV420_888 format - convert to NV21 (most common on modern Android)
    if (rawFormat == AndroidImageFormat.yuv420_888) {
      logDiagnostics(image, conversionPath: 'YUV420_888 -> NV21');
      return _yuv420ToNv21(image);
    }

    // YV12 format - similar to YUV420 but different plane order
    if (rawFormat == AndroidImageFormat.yv12) {
      logDiagnostics(image, conversionPath: 'YV12 -> NV21');
      return _yv12ToNv21(image);
    }

    // Unknown/unsupported format - log only once per format type to prevent spam
    _logUnsupportedFormat(rawFormat, image);
    return null;
  }

  /// Log unsupported format warning (throttled, once per format)
  static void _logUnsupportedFormat(int rawFormat, CameraImage image) {
    // Only warn once per format type
    if (_warnedFormats.contains(rawFormat)) {
      return;
    }

    // Throttle error logs
    final now = DateTime.now();
    if (_lastErrorLogTime != null &&
        now.difference(_lastErrorLogTime!).inMilliseconds < _errorLogThrottleMs) {
      return;
    }
    _lastErrorLogTime = now;
    _warnedFormats.add(rawFormat);

    debugPrint('[ImageFormat] Unsupported format: $rawFormat '
        '(${_formatName(rawFormat)}), size: ${image.width}x${image.height}, '
        'planes: ${image.planes.length}');
  }

  /// Get human-readable format name
  static String _formatName(int rawFormat) {
    switch (rawFormat) {
      case AndroidImageFormat.nv21:
        return 'NV21';
      case AndroidImageFormat.yuv420_888:
        return 'YUV420_888';
      case AndroidImageFormat.yv12:
        return 'YV12';
      case AndroidImageFormat.jpeg:
        return 'JPEG';
      case AndroidImageFormat.raw10:
        return 'RAW10';
      case AndroidImageFormat.raw12:
        return 'RAW12';
      default:
        return 'UNKNOWN';
    }
  }

  /// Simple plane concatenation for NV21 format
  static Uint8List _concatenatePlanes(CameraImage image) {
    final WriteBuffer buffer = WriteBuffer();
    for (final plane in image.planes) {
      buffer.putUint8List(plane.bytes);
    }
    return buffer.done().buffer.asUint8List();
  }

  /// Convert YUV420_888 to NV21
  ///
  /// YUV420_888 has 3 planes: Y, U, V
  /// NV21 has 2 planes: Y, VU (interleaved)
  ///
  /// NV21 layout: YYYYYYYY VUVUVU
  /// YUV420_888 may have padding in each plane
  static Uint8List? _yuv420ToNv21(CameraImage image) {
    try {
      final int width = image.width;
      final int height = image.height;

      // NV21 total size: Y (width*height) + VU interleaved (width*height/2)
      final int ySize = width * height;
      final int uvSize = width * height ~/ 2;
      final Uint8List nv21 = Uint8List(ySize + uvSize);

      final Plane yPlane = image.planes[0];
      final Plane uPlane = image.planes[1];
      final Plane vPlane = image.planes[2];

      // Copy Y plane (handle row stride/padding)
      int yIndex = 0;
      for (int row = 0; row < height; row++) {
        final int srcOffset = row * yPlane.bytesPerRow;
        for (int col = 0; col < width; col++) {
          nv21[yIndex++] = yPlane.bytes[srcOffset + col];
        }
      }

      // Copy UV planes interleaved as VU (NV21 format)
      // UV planes are half resolution (width/2, height/2)
      final int uvWidth = width ~/ 2;
      final int uvHeight = height ~/ 2;
      final int? uPixelStride = uPlane.bytesPerPixel;
      final int? vPixelStride = vPlane.bytesPerPixel;

      // Default pixel stride is 1 for planar, 2 for semi-planar
      final int uStride = uPixelStride ?? 1;
      final int vStride = vPixelStride ?? 1;

      int uvIndex = ySize;
      for (int row = 0; row < uvHeight; row++) {
        final int uRowOffset = row * uPlane.bytesPerRow;
        final int vRowOffset = row * vPlane.bytesPerRow;

        for (int col = 0; col < uvWidth; col++) {
          // NV21 is VU order
          nv21[uvIndex++] = vPlane.bytes[vRowOffset + col * vStride];
          nv21[uvIndex++] = uPlane.bytes[uRowOffset + col * uStride];
        }
      }

      return nv21;
    } catch (e) {
      debugPrint('[ImageFormat] YUV420->NV21 conversion error: $e');
      return null;
    }
  }

  /// Convert YV12 to NV21
  /// YV12: YYYYYYYY VV UU (planar, V before U)
  /// NV21: YYYYYYYY VUVU (semi-planar)
  static Uint8List? _yv12ToNv21(CameraImage image) {
    try {
      final int width = image.width;
      final int height = image.height;
      final int ySize = width * height;
      final int uvSize = width * height ~/ 2;
      final Uint8List nv21 = Uint8List(ySize + uvSize);

      final Plane yPlane = image.planes[0];
      final Plane vPlane = image.planes[1]; // V comes before U in YV12
      final Plane uPlane = image.planes[2];

      // Copy Y plane
      int yIndex = 0;
      for (int row = 0; row < height; row++) {
        final int srcOffset = row * yPlane.bytesPerRow;
        for (int col = 0; col < width; col++) {
          nv21[yIndex++] = yPlane.bytes[srcOffset + col];
        }
      }

      // Interleave V and U for NV21
      final int uvWidth = width ~/ 2;
      final int uvHeight = height ~/ 2;

      int uvIndex = ySize;
      for (int row = 0; row < uvHeight; row++) {
        final int vOffset = row * vPlane.bytesPerRow;
        final int uOffset = row * uPlane.bytesPerRow;

        for (int col = 0; col < uvWidth; col++) {
          nv21[uvIndex++] = vPlane.bytes[vOffset + col];
          nv21[uvIndex++] = uPlane.bytes[uOffset + col];
        }
      }

      return nv21;
    } catch (e) {
      debugPrint('[ImageFormat] YV12->NV21 conversion error: $e');
      return null;
    }
  }
}
