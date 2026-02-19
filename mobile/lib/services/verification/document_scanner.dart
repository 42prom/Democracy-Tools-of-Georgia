import 'verification_models.dart';

/// Abstract interface for document scanning
/// Implementations can use NFC, OCR, or manual entry
abstract class DocumentScanner {
  /// Scan a document and extract personal number
  ///
  /// Input can be:
  /// - Camera capture (OCR scanning)
  /// - NFC chip reading
  /// - Manual entry
  ///
  /// Returns [DocumentScanResult] with extracted data
  /// Throws [VerificationException] on failure
  Future<DocumentScanResult> scanDocument(DocumentScanInput input);

  /// Validate personal number format
  /// Georgian personal numbers are 11 digits
  bool validatePersonalNumber(String pnDigits);

  /// Get scanner capabilities
  DocumentScannerCapabilities getCapabilities();
}

/// Capabilities supported by a document scanner
class DocumentScannerCapabilities {
  final bool supportsNFC;
  final bool supportsOCR;
  final bool supportsManualEntry;
  final bool supportsCamera;

  DocumentScannerCapabilities({
    this.supportsNFC = false,
    this.supportsOCR = false,
    this.supportsManualEntry = true,
    this.supportsCamera = false,
  });
}

/// Mock implementation for Phase 0 development
/// Supports manual entry only, no real NFC/OCR
class ManualPnEntryScanner implements DocumentScanner {
  @override
  Future<DocumentScanResult> scanDocument(DocumentScanInput input) async {
    // Simulate processing delay
    await Future.delayed(const Duration(milliseconds: 500));

    // For manual entry, expect pnDigits to be passed via a workaround
    // In real implementation, this would come from UI input
    // For now, we'll simulate by accepting image bytes as empty for manual mode
    if (input.manualEntry) {
      throw VerificationException(
        type: VerificationErrorType.unknownError,
        message:
            'Manual entry requires pnDigits to be provided via separate method',
      );
    }

    throw VerificationException(
      type: VerificationErrorType.invalidDocument,
      message: 'Camera scanning not implemented in MVP',
    );
  }

  /// Helper method for manual entry flow
  /// Call this instead of scanDocument for manual entry
  Future<DocumentScanResult> scanManualEntry(String pnDigits) async {
    // Simulate processing
    await Future.delayed(const Duration(milliseconds: 300));

    // Validate format
    if (!validatePersonalNumber(pnDigits)) {
      return DocumentScanResult(
        pnDigits: pnDigits,
        confidence: 0.0,
        isValid: false,
        errorMessage: 'Personal number must be exactly 11 digits',
      );
    }

    // Return successful result
    return DocumentScanResult(
      pnDigits: pnDigits,
      confidence: 1.0, // Manual entry has 100% confidence
      isValid: true,
    );
  }

  @override
  bool validatePersonalNumber(String pnDigits) {
    // Must be exactly 11 digits
    if (pnDigits.length != 11) return false;

    // Must contain only digits
    if (!RegExp(r'^\d{11}$').hasMatch(pnDigits)) return false;

    // Checksum validation skipped for MVP (algorithm not public/standard)
    // Basic format check (11 digits) is sufficient for Phase 0
    return true;
  }

  @override
  DocumentScannerCapabilities getCapabilities() {
    return DocumentScannerCapabilities(
      supportsNFC: false,
      supportsOCR: false,
      supportsManualEntry: true,
      supportsCamera: false,
    );
  }
}

/// Placeholder for future NFC scanner implementation
/// Will integrate with actual NFC SDK in Phase 1
class NFCDocumentScanner implements DocumentScanner {
  @override
  Future<DocumentScanResult> scanDocument(DocumentScanInput input) async {
    throw VerificationException(
      type: VerificationErrorType.unknownError,
      message:
          'NFC scanning not yet implemented - use ManualPnEntryScanner for MVP',
    );
  }

  @override
  bool validatePersonalNumber(String pnDigits) {
    return ManualPnEntryScanner().validatePersonalNumber(pnDigits);
  }

  @override
  DocumentScannerCapabilities getCapabilities() {
    return DocumentScannerCapabilities(
      supportsNFC: true,
      supportsOCR: false,
      supportsManualEntry: false,
      supportsCamera: false,
    );
  }
}

/// Placeholder for future OCR scanner implementation
/// Will integrate with ML Kit or similar in Phase 1
class OCRDocumentScanner implements DocumentScanner {
  @override
  Future<DocumentScanResult> scanDocument(DocumentScanInput input) async {
    throw VerificationException(
      type: VerificationErrorType.unknownError,
      message:
          'OCR scanning not yet implemented - use ManualPnEntryScanner for MVP',
    );
  }

  @override
  bool validatePersonalNumber(String pnDigits) {
    return ManualPnEntryScanner().validatePersonalNumber(pnDigits);
  }

  @override
  DocumentScannerCapabilities getCapabilities() {
    return DocumentScannerCapabilities(
      supportsNFC: false,
      supportsOCR: true,
      supportsManualEntry: false,
      supportsCamera: true,
    );
  }
}
