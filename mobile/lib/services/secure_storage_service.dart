import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Wrapper around flutter_secure_storage for sensitive data.
///
/// Stores credentials, secrets, and tokens in the platform keychain/keystore:
///   - Android: EncryptedSharedPreferences (AES + RSA)
///   - iOS: Keychain Services
///
/// Non-sensitive preferences (e.g. is_enrolled, display name, mock_mode)
/// should continue to use SharedPreferences via StorageService.
class SecureStorageService {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );

  // Keys
  static const _credentialKey = 'credential';
  static const _legacyCredentialSecretKey = 'credential_secret';
  static const _userIdKey = 'user_id';
  static const _installationIdKey = 'installation_id';

  // --- Credential (session JWT / attestation token) ---

  Future<String?> getCredential() async {
    return await _storage.read(key: _credentialKey);
  }

  Future<void> saveCredential(String credential) async {
    await _storage.write(key: _credentialKey, value: credential);
  }

  Future<void> deleteCredential() async {
    await _storage.delete(key: _credentialKey);
  }

  /// Removes the obsolete client-nullifier secret from upgraded installs.
  Future<void> deleteLegacyCredentialSecret() async {
    await _storage.delete(key: _legacyCredentialSecretKey);
  }

  // --- User ID ---

  Future<String?> getUserId() async {
    return await _storage.read(key: _userIdKey);
  }

  Future<void> saveUserId(String userId) async {
    await _storage.write(key: _userIdKey, value: userId);
  }

  Future<void> deleteUserId() async {
    await _storage.delete(key: _userIdKey);
  }

  // --- Random installation ID (never derived from PII or wallet data) ---

  Future<String?> getInstallationId() async {
    return await _storage.read(key: _installationIdKey);
  }

  Future<void> saveInstallationId(String installationId) async {
    await _storage.write(key: _installationIdKey, value: installationId);
  }

  // --- Bulk operations ---

  Future<void> deleteAll() async {
    await _storage.deleteAll();
  }
}
