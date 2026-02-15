// Helper functions for parsing

bool _readBool(
  Map<String, dynamic> json,
  String key, {
  String? altKey,
  bool defaultValue = false,
}) {
  final dynamic v = json[key] ?? (altKey != null ? json[altKey] : null);
  if (v == null) {
    return defaultValue;
  }
  if (v is bool) {
    return v;
  }
  if (v is num) {
    return v != 0;
  }
  if (v is String) {
    final s = v.toLowerCase().trim();
    if (s == 'true' || s == '1' || s == 'yes') {
      return true;
    }
    if (s == 'false' || s == '0' || s == 'no') {
      return false;
    }
  }
  return defaultValue;
}

double _readDouble(
  Map<String, dynamic> json,
  String key, {
  double defaultValue = 0,
}) {
  final dynamic v = json[key];
  if (v == null) {
    return defaultValue;
  }
  if (v is num) {
    return v.toDouble();
  }
  if (v is String) {
    return double.tryParse(v) ?? defaultValue;
  }
  return defaultValue;
}

int _readInt(Map<String, dynamic> json, String key, {int defaultValue = 0}) {
  final dynamic v = json[key];
  if (v == null) {
    return defaultValue;
  }
  if (v is int) {
    return v;
  }
  if (v is num) {
    return v.toInt();
  }
  if (v is String) {
    return int.tryParse(v) ?? defaultValue;
  }
  return defaultValue;
}

String _requireString(Map<String, dynamic> json, String key, {String? altKey}) {
  final dynamic v = json[key] ?? (altKey != null ? json[altKey] : null);
  if (v is String && v.isNotEmpty) {
    return v;
  }
  throw Exception('Missing required field: $key');
}

String? _readString(Map<String, dynamic> json, String key, {String? altKey}) {
  final dynamic v = json[key] ?? (altKey != null ? json[altKey] : null);
  if (v == null) {
    return null;
  }
  return v.toString();
}

Map<String, dynamic> _asMap(dynamic v) {
  if (v is Map<String, dynamic>) {
    return v;
  }
  if (v is Map) {
    return v.map((k, val) => MapEntry(k.toString(), val));
  }
  return <String, dynamic>{};
}

class VerificationPolicy {
  final NfcPolicy nfc;
  final DocumentScannerPolicy documentScanner;
  final LivenessPolicy liveness;
  final FaceMatchPolicy faceMatch;
  final bool allowMocks;

  VerificationPolicy({
    required this.nfc,
    required this.documentScanner,
    required this.liveness,
    required this.faceMatch,
    required this.allowMocks,
  });

  factory VerificationPolicy.fromJson(Map<String, dynamic> json) {
    final nfc = _asMap(json['nfc']);
    final doc = _asMap(json['documentScanner']);
    final liv = _asMap(json['liveness']);
    final fm = _asMap(json['faceMatch']);
    final env = _asMap(json['env']);

    return VerificationPolicy(
      nfc: NfcPolicy.fromJson(nfc),
      documentScanner: DocumentScannerPolicy.fromJson(doc),
      liveness: LivenessPolicy.fromJson(liv),
      faceMatch: FaceMatchPolicy.fromJson(fm),
      allowMocks: _readBool(env, 'allowMocks', defaultValue: false),
    );
  }
}

class NfcPolicy {
  final String provider; // mock | on_device_georgia
  final bool requireNfc;
  final bool requireGeorgianCitizen;
  final bool requirePersonalNumber;
  final bool allowSkipDocumentWhenNfcHasPortrait;

  NfcPolicy({
    required this.provider,
    required this.requireNfc,
    required this.requireGeorgianCitizen,
    required this.requirePersonalNumber,
    required this.allowSkipDocumentWhenNfcHasPortrait,
  });

  factory NfcPolicy.fromJson(Map<String, dynamic> json) {
    return NfcPolicy(
      provider: _readString(json, 'provider') ?? 'mock',
      requireNfc: _readBool(json, 'requireNfc', defaultValue: true),
      requireGeorgianCitizen: _readBool(
        json,
        'requireGeorgianCitizen',
        defaultValue: true,
      ),
      requirePersonalNumber: _readBool(
        json,
        'requirePersonalNumber',
        defaultValue: true,
      ),
      allowSkipDocumentWhenNfcHasPortrait: _readBool(
        json,
        'allowSkipDocument',
        defaultValue: true,
      ),
    );
  }
}

class DocumentScannerPolicy {
  final String provider; // manual | on_device_ocr_mrz
  final bool requireDocumentPhotoScan;
  final String strictness; // strict | lenient

  DocumentScannerPolicy({
    required this.provider,
    required this.requireDocumentPhotoScan,
    required this.strictness,
  });

  factory DocumentScannerPolicy.fromJson(Map<String, dynamic> json) {
    return DocumentScannerPolicy(
      provider: _readString(json, 'provider') ?? 'manual',
      requireDocumentPhotoScan: _readBool(
        json,
        'requireDocumentPhotoScan',
        defaultValue: true,
      ),
      strictness: _readString(json, 'strictness') ?? 'strict',
    );
  }
}

class LivenessPolicy {
  final String provider; // mock | provider | in_house
  final double minThreshold;
  final int retryLimit;

  LivenessPolicy({
    required this.provider,
    required this.minThreshold,
    required this.retryLimit,
  });

  factory LivenessPolicy.fromJson(Map<String, dynamic> json) {
    return LivenessPolicy(
      provider: _readString(json, 'provider') ?? 'mock',
      minThreshold: _readDouble(json, 'minThreshold', defaultValue: 0.7),
      retryLimit: _readInt(json, 'retryLimit', defaultValue: 3),
    );
  }
}

class FaceMatchPolicy {
  final String provider; // mock | provider | in_house
  final double minThreshold;

  FaceMatchPolicy({required this.provider, required this.minThreshold});

  factory FaceMatchPolicy.fromJson(Map<String, dynamic> json) {
    return FaceMatchPolicy(
      provider: _readString(json, 'provider') ?? 'mock',
      minThreshold: _readDouble(json, 'minThreshold', defaultValue: 0.75),
    );
  }
}

class EnrollmentNfcResponse {
  final String enrollmentSessionId;
  final String next;
  final String mode;
  final String? livenessNonce;

  EnrollmentNfcResponse({
    required this.enrollmentSessionId,
    required this.next,
    required this.mode,
    this.livenessNonce,
  });

  factory EnrollmentNfcResponse.fromJson(Map<String, dynamic> json) {
    return EnrollmentNfcResponse(
      enrollmentSessionId: _requireString(json, 'enrollmentSessionId'),
      next: _readString(json, 'next') ?? 'document',
      mode: _readString(json, 'mode') ?? 'register',
      livenessNonce: _readString(json, 'livenessNonce'),
    );
  }
}

class EnrollmentContinueResponse {
  final String enrollmentSessionId;
  final String next;
  final String? livenessNonce;

  EnrollmentContinueResponse({
    required this.enrollmentSessionId,
    required this.next,
    this.livenessNonce,
  });

  factory EnrollmentContinueResponse.fromJson(Map<String, dynamic> json) {
    return EnrollmentContinueResponse(
      enrollmentSessionId: _requireString(json, 'enrollmentSessionId'),
      next: _readString(json, 'next') ?? 'liveness',
      livenessNonce: _readString(json, 'livenessNonce'),
    );
  }
}

class EnrollmentFinalizeResponse {
  final String credentialToken;
  final String userId;
  final bool isNewUser;
  final Map<String, dynamic>? demographics;

  EnrollmentFinalizeResponse({
    required this.credentialToken,
    required this.userId,
    required this.isNewUser,
    this.demographics,
  });

  factory EnrollmentFinalizeResponse.fromJson(Map<String, dynamic> json) {
    return EnrollmentFinalizeResponse(
      credentialToken: _requireString(json, 'credentialToken'),
      userId: _requireString(json, 'userId', altKey: 'user_id'),
      isNewUser: _readBool(json, 'isNewUser', defaultValue: false),
      demographics: json['demographics'] as Map<String, dynamic>?,
    );
  }
}

class MrzData {
  final String documentNumber;
  final DateTime birthDate;
  final DateTime expiryDate;
  final String personalNumber;
  final String nationality;
  final String sex;

  MrzData({
    required this.documentNumber,
    required this.birthDate,
    required this.expiryDate,
    required this.personalNumber,
    required this.nationality,
    required this.sex,
  });

  /// Calculates age based on [birthDate].
  int get age {
    final today = DateTime.now();
    int age = today.year - birthDate.year;
    if (today.month < birthDate.month ||
        (today.month == birthDate.month && today.day < birthDate.day)) {
      age--;
    }
    return age;
  }

  @override
  String toString() {
    return 'MrzData(doc: $documentNumber, dob: $birthDate, exp: $expiryDate, pn: $personalNumber, nat: $nationality)';
  }
}

class Region {
  final String id;
  final String code;
  final String nameEn;
  final String nameKa;

  Region({
    required this.id,
    required this.code,
    required this.nameEn,
    required this.nameKa,
  });

  factory Region.fromJson(Map<String, dynamic> json) {
    return Region(
      id: _requireString(json, 'id'),
      code: _requireString(json, 'code'),
      nameEn: _requireString(json, 'name_en'),
      nameKa: _requireString(json, 'name_ka'),
    );
  }
}

class EnrollmentProfile {
  String personalNumber;
  String firstName;
  String lastName;
  String gender;
  int age;
  String? regionCode;

  EnrollmentProfile({
    required this.personalNumber,
    required this.firstName,
    required this.lastName,
    required this.gender,
    required this.age,
    this.regionCode,
  });

  // To/From JSON if needed for storage
}

class PassiveLivenessSignals {
  final double? textureScore;
  final double? microMovementScore;
  final bool? naturalBlinkDetected;
  final int? consistentFrames;
  final double? facePresenceScore;
  final double? confidence;

  PassiveLivenessSignals({
    this.textureScore,
    this.microMovementScore,
    this.naturalBlinkDetected,
    this.consistentFrames,
    this.facePresenceScore,
    this.confidence,
  });

  Map<String, dynamic> toJson() {
    return {
      'textureScore': textureScore,
      'microMovementScore': microMovementScore,
      'naturalBlinkDetected': naturalBlinkDetected,
      'consistentFrames': consistentFrames,
      'facePresenceScore': facePresenceScore,
      'confidence': confidence,
    };
  }
}

class LivenessData {
  final String tier;
  final PassiveLivenessSignals? passiveSignals;
  final double? clientConfidenceScore;

  LivenessData({
    required this.tier,
    this.passiveSignals,
    this.clientConfidenceScore,
  });

  Map<String, dynamic> toJson() {
    return {
      'tier': tier,
      'passiveSignals': passiveSignals?.toJson(),
      'clientConfidenceScore': clientConfidenceScore,
    };
  }
}
