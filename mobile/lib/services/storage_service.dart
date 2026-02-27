import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/activity_item.dart';
import 'secure_storage_service.dart';

class StorageService {
  // Non-sensitive keys (SharedPreferences)
  static const String _enrolledKey = 'is_enrolled';
  static const String _firstNameKey = 'first_name';
  static const String _lastNameKey = 'last_name';
  static const String _birthDateKey = 'birth_date';
  static const String _genderKey = 'gender';
  static const String _regionsKey = 'region_codes';
  // Activity key is now user-specific - see _getActivityKey()
  static const String _activityKeyPrefix = 'activity_items_';

  // Secure storage for sensitive data
  final SecureStorageService _secure = SecureStorageService();

  /// Get user-specific activity cache key
  /// This ensures different users on the same device don't see each other's activity
  Future<String> _getActivityKey() async {
    final userId = await getUserId();
    if (userId == null || userId.isEmpty) {
      // Fallback for unauthenticated state (should not happen in practice)
      return '${_activityKeyPrefix}anonymous';
    }
    return '$_activityKeyPrefix$userId';
  }

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

  Future<DateTime?> getBirthDate() async {
    final prefs = await SharedPreferences.getInstance();
    final iso = prefs.getString(_birthDateKey);
    return iso != null ? DateTime.tryParse(iso) : null;
  }

  Future<void> saveName(String firstName, String lastName) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_firstNameKey, firstName);
    await prefs.setString(_lastNameKey, lastName);
  }

  Future<void> saveBirthDate(DateTime birthDate) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_birthDateKey, birthDate.toIso8601String());
  }

  Future<String?> getGender() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_genderKey);
  }

  Future<void> saveGender(String gender) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_genderKey, gender);
  }

  Future<List<String>> getRegionCodes() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getStringList(_regionsKey) ?? [];
  }

  Future<void> saveRegionCodes(List<String> regionCodes) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_regionsKey, regionCodes);
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
  // SECURITY: Activity cache is user-specific to prevent data leakage
  // between different users on the same device

  Future<List<ActivityItem>> getActivityItems() async {
    final prefs = await SharedPreferences.getInstance();
    final activityKey = await _getActivityKey();
    final jsonString = prefs.getString(activityKey);
    if (jsonString == null || jsonString.isEmpty) return [];
    return ActivityItem.listFromJsonString(jsonString);
  }

  Future<void> saveActivityItem(ActivityItem item) async {
    final prefs = await SharedPreferences.getInstance();
    final activityKey = await _getActivityKey();
    final items = await getActivityItems();
    // Prevent duplicates by pollId
    items.removeWhere((e) => e.pollId == item.pollId);
    items.insert(0, item); // newest first
    await prefs.setString(activityKey, ActivityItem.listToJsonString(items));
  }

  /// Get only the activity items that contain a cryptographic receipt.
  Future<List<ActivityItem>> getVoteHistory() async {
    final items = await getActivityItems();
    return items.where((item) => item.receipt != null).toList();
  }

  /// Clear all activity items for current user (used when syncing from API)
  Future<void> clearActivityItems() async {
    final prefs = await SharedPreferences.getInstance();
    final activityKey = await _getActivityKey();
    await prefs.remove(activityKey);
  }

  /// Clear activity cache for ALL users on this device
  /// Call this on logout or when switching accounts
  Future<void> clearAllActivityCaches() async {
    final prefs = await SharedPreferences.getInstance();
    final keys = prefs.getKeys();
    for (final key in keys) {
      if (key.startsWith(_activityKeyPrefix)) {
        await prefs.remove(key);
      }
    }
    debugPrint('[Storage] Cleared all activity caches');
  }

  /// Clear all stored data (both secure and preferences).
  /// This is a full logout - clears all user data including activity caches.
  Future<void> clearAll() async {
    final prefs = await SharedPreferences.getInstance();
    // Clear all preferences (includes activity caches for all users)
    await prefs.clear();
    // Clear secure storage (credentials, userId, secrets)
    await _secure.deleteAll();
    debugPrint('[Storage] Cleared all user data (full logout)');
  }

  /// Decodes demographics from the JWT credential token and saves them locally.
  /// Used for synchronizing filtering data after login or on a new device.
  Future<void> syncDemographicsFromToken() async {
    final token = await getCredential();
    if (token == null || token.isEmpty) return;

    try {
      final parts = token.split('.');
      if (parts.length != 3) return;

      // Base64Url decode the payload (middle part)
      String normalized = base64Url.normalize(parts[1]);
      final payload = utf8.decode(base64Url.decode(normalized));
      final json = jsonDecode(payload);
      final data = json['data'] as Map<String, dynamic>?;

      if (data != null) {
        // Gender
        final gender = data['gender'] as String?;
        if (gender != null) {
          await saveGender(gender);
        }

        // Region Codes (UUIDs)
        final regions = data['region_codes'] as List<dynamic>?;
        if (regions != null) {
          await saveRegionCodes(regions.map((e) => e.toString()).toList());
        }

        // Note: birth_date is not in the JWT, only age_bucket.
        // We rely on the app already having birth_date from enrollment
        // or a manual refresh if we add a profile API later.
      }
    } catch (e) {
      // Non-critical, just log
      debugPrint('StorageService: Demographic sync failed: $e');
    }
  }
}
