import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/activity_item.dart';
import 'secure_storage_service.dart';

class StorageService {
  // Non-sensitive keys (SharedPreferences)
  static const String _enrolledKey = 'is_enrolled';
  static const String _firstNameKey = 'first_name';
  static const String _lastNameKey = 'last_name';
  static const String _activityKey = 'activity_items';

  // Secure storage for sensitive data
  final SecureStorageService _secure = SecureStorageService();

  // --- Non-sensitive: enrollment status (SharedPreferences) ---

  Future<bool> isEnrolled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_enrolledKey) ?? false;
  }

  Future<void> setEnrolled(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_enrolledKey, value);
  }

  // --- Sensitive: credential (Secure Storage) ---

  Future<String?> getCredential() async {
    return await _secure.getCredential();
  }

  Future<void> saveCredential(String credential) async {
    await _secure.saveCredential(credential);
  }

  // --- Sensitive: user ID (Secure Storage) ---

  Future<String?> getUserId() async {
    return await _secure.getUserId();
  }

  Future<void> saveUserId(String userId) async {
    await _secure.saveUserId(userId);
  }

  // --- Non-sensitive: display name (SharedPreferences) ---

  Future<String?> getFirstName() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_firstNameKey);
  }

  Future<String?> getLastName() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_lastNameKey);
  }

  Future<void> saveName(String firstName, String lastName) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_firstNameKey, firstName);
    await prefs.setString(_lastNameKey, lastName);
  }

  Future<String> getDisplayName() async {
    final firstName = await getFirstName();
    final lastName = await getLastName();
    if (firstName != null && lastName != null) {
      return '$firstName $lastName';
    }
    return 'Citizen';
  }

  // --- Sensitive: credential secret (Secure Storage) ---

  /// Get or generate credential secret for nullifier computation.
  /// This secret NEVER leaves the device.
  Future<String> getCredentialSecret() async {
    String? secret = await _secure.getCredentialSecret();

    if (secret == null || secret.isEmpty) {
      // Generate cryptographically strong random secret
      final rnd = Random.secure();
      final bytes = Uint8List(32);
      for (int i = 0; i < bytes.length; i++) {
        bytes[i] = rnd.nextInt(256);
      }
      secret = base64UrlEncode(bytes);
      await _secure.saveCredentialSecret(secret);
    }

    return secret;
  }

  /// Compute nullifier locally (NEVER sent to server)
  /// nullifier = SHA256(pollId + credentialSecret)
  Future<String> computeNullifier(String pollId) async {
    final secret = await getCredentialSecret();
    final input = '$pollId:$secret';
    final bytes = utf8.encode(input);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }

  // --- Non-sensitive: activity history (SharedPreferences) ---

  Future<List<ActivityItem>> getActivityItems() async {
    final prefs = await SharedPreferences.getInstance();
    final jsonString = prefs.getString(_activityKey);
    if (jsonString == null || jsonString.isEmpty) return [];
    return ActivityItem.listFromJsonString(jsonString);
  }

  Future<void> saveActivityItem(ActivityItem item) async {
    final prefs = await SharedPreferences.getInstance();
    final items = await getActivityItems();
    // Prevent duplicates by pollId
    items.removeWhere((e) => e.pollId == item.pollId);
    items.insert(0, item); // newest first
    await prefs.setString(_activityKey, ActivityItem.listToJsonString(items));
  }

  /// Clear all stored data (both secure and preferences).
  Future<void> clearAll() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
    await _secure.deleteAll();
  }
}
