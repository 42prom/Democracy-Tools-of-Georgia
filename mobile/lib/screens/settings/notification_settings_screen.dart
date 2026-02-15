import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'dart:convert';

import '../../config/app_config.dart';
import '../../services/storage_service.dart';
import '../../services/localization_service.dart';

class NotificationSettingsScreen extends StatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  State<NotificationSettingsScreen> createState() =>
      _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState
    extends State<NotificationSettingsScreen> {
  final StorageService _storageService = StorageService();
  bool _loading = true;
  bool _saving = false;

  bool _notificationsEnabled = true;
  bool _pollsEnabled = true;
  bool _messagesEnabled = true;

  @override
  void initState() {
    super.initState();
    _loadPreferences();
  }

  Future<void> _loadPreferences() async {
    setState(() => _loading = true);
    try {
      final credential = await _storageService.getCredential();
      final response = await http.get(
        Uri.parse('${AppConfig.apiBaseUrl}/profile/me'),
        headers: {'Authorization': 'Bearer $credential'},
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        setState(() {
          _notificationsEnabled = data['notifications_enabled'] ?? true;
          _pollsEnabled = data['polls_enabled'] ?? true;
          _messagesEnabled = data['messages_enabled'] ?? true;
        });
      }
    } catch (e) {
      debugPrint('Error loading preferences: $e');
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _savePreference(String key, bool value) async {
    final loc = Provider.of<LocalizationService>(context, listen: false);
    setState(() => _saving = true);

    // Optimistic update
    final oldState = {
      'notifications_enabled': _notificationsEnabled,
      'polls_enabled': _pollsEnabled,
      'messages_enabled': _messagesEnabled,
    };

    setState(() {
      if (key == 'notifications_enabled') _notificationsEnabled = value;
      if (key == 'polls_enabled') _pollsEnabled = value;
      if (key == 'messages_enabled') _messagesEnabled = value;
    });

    try {
      final credential = await _storageService.getCredential();
      final response = await http.patch(
        Uri.parse('${AppConfig.apiBaseUrl}/profile/me'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $credential',
        },
        body: jsonEncode({key: value}),
      );

      if (response.statusCode != 200) {
        throw Exception('Failed to update preference');
      }
    } catch (e) {
      debugPrint('Error saving preference: $e');
      // Rollback on error
      setState(() {
        _notificationsEnabled = oldState['notifications_enabled']!;
        _pollsEnabled = oldState['polls_enabled']!;
        _messagesEnabled = oldState['messages_enabled']!;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(loc.translate('failed_save_setting'))),
        );
      }
    } finally {
      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<LocalizationService>(
      builder: (context, loc, child) {
        return Scaffold(
          appBar: AppBar(title: Text(loc.translate('notifications'))),
          body: _loading
              ? const Center(child: CircularProgressIndicator())
              : ListView(
                  children: [
                    _buildSectionHeader(loc.translate('master_switch')),
                    SwitchListTile(
                      title: Text(loc.translate('enable_notifications')),
                      subtitle: Text(loc.translate('allow_push_notifications')),
                      value: _notificationsEnabled,
                      onChanged: _saving
                          ? null
                          : (val) =>
                              _savePreference('notifications_enabled', val),
                      secondary: const Icon(Icons.notifications_active),
                    ),
                    const Divider(),
                    _buildSectionHeader(loc.translate('categories')),
                    SwitchListTile(
                      title: Text(loc.translate('new_polls')),
                      subtitle: Text(loc.translate('new_polls_subtitle')),
                      value: _pollsEnabled,
                      onChanged: _saving || !_notificationsEnabled
                          ? null
                          : (val) => _savePreference('polls_enabled', val),
                      secondary: const Icon(Icons.how_to_vote),
                    ),
                    SwitchListTile(
                      title: Text(loc.translate('announcements')),
                      subtitle: Text(loc.translate('announcements_subtitle')),
                      value: _messagesEnabled,
                      onChanged: _saving || !_notificationsEnabled
                          ? null
                          : (val) => _savePreference('messages_enabled', val),
                      secondary: const Icon(Icons.announcement),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Text(
                        loc.translate('notification_system_note'),
                        style:
                            const TextStyle(color: Colors.grey, fontSize: 12),
                      ),
                    ),
                  ],
                ),
        );
      },
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.bold,
          color: Theme.of(context).primaryColor,
        ),
      ),
    );
  }
}
