import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../models/message.dart';
import '../config/app_config.dart';
import 'storage_service.dart';

class MessageService {
  final String _baseUrl = AppConfig.apiBaseUrl;
  final StorageService _storageService = StorageService();

  Future<List<Message>> getMessages() async {
    try {
      final url = '$_baseUrl/messages';
      if (kDebugMode) {
        print('[MessageService] ===== FETCHING MESSAGES =====');
        print('[MessageService] URL: $url');
      }

      // Get credential token from secure storage for audience filtering
      final credential = await _storageService.getCredential();

      final headers = <String, String>{'Content-Type': 'application/json'};

      // Include Authorization header if user is authenticated
      if (credential != null && credential.isNotEmpty) {
        headers['Authorization'] = 'Bearer $credential';
        if (kDebugMode) {
          print(
            '[MessageService] Sending authenticated request with credential',
          );
        }
      } else {
        if (kDebugMode) {
          print(
            '[MessageService] No credential available, sending anonymous request',
          );
        }
      }

      final response = await http.get(Uri.parse(url), headers: headers);

      if (kDebugMode) {
        print('[MessageService] Response status: ${response.statusCode}');
        print('[MessageService] Response headers: ${response.headers}');
        print('[MessageService] Response body length: ${response.body.length}');
        final preview = response.body.length > 200
            ? response.body.substring(0, 200)
            : response.body;
        print('[MessageService] Response body preview: $preview...');
      }

      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        if (kDebugMode) {
          print('[MessageService] Parsed ${data.length} messages from JSON');
        }
        final messages = data.map((json) => Message.fromJson(json)).toList();
        if (kDebugMode) {
          print(
            '[MessageService] Successfully created ${messages.length} Message objects',
          );
          if (messages.isNotEmpty) {
            print(
              '[MessageService] First message: "${messages[0].title}" (${messages[0].type})',
            );
          }
        }
        return messages;
      } else {
        throw Exception('Failed to load messages: ${response.statusCode}');
      }
    } catch (e, stackTrace) {
      if (kDebugMode) {
        print('[MessageService] ===== ERROR FETCHING MESSAGES =====');
        print('[MessageService] Error: $e');
        print('[MessageService] Stack trace: $stackTrace');
      }
      rethrow;
    }
  }
}
