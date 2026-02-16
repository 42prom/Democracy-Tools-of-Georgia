import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models/poll.dart';
import '../../models/message.dart';
import '../../services/message_service.dart';
import '../../services/interfaces/i_api_service.dart';
import '../../services/service_locator.dart';
import '../../services/storage_service.dart';
import '../../services/wallet_service.dart';
import '../../widgets/bottom_nav.dart';
import 'poll_card.dart';
import '../activity/my_activity_screen.dart';
import '../wallet/wallet_screen.dart';
import '../wallet/unlock_wallet_screen.dart';
import '../enrollment/intro_screen.dart';
import '../settings/settings_detail_screen.dart';
import '../settings/notification_settings_screen.dart';
import '../settings/language_settings_screen.dart';
import 'package:provider/provider.dart';
import '../../services/localization_service.dart';
import '../../widgets/message_card.dart';
import '../../widgets/message_shimmer.dart';
import '../settings/help_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final IApiService _apiService = ServiceLocator.apiService;
  final StorageService _storageService = StorageService();
  final WalletService _walletService = WalletService();
  final MessageService _messageService = MessageService();
  List<Poll> _polls = [];
  bool _loading = true;
  int _currentIndex = 2; // Start on Voting tab (center)
  String _displayName = '';
  int? _age;
  String? _gender;
  List<String> _regionCodes = [];
  String? _birthDate;
  List<Message> _messages = [];
  bool _messagesLoading = false;

  @override
  void initState() {
    super.initState();
    _loadUserName();
    _loadUserDemographics();
    _loadPolls();
    _loadMessages();
  }

  @override
  void dispose() {
    super.dispose();
  }

  Future<void> _loadMessages() async {
    if (_messages.isEmpty) {
      if (mounted) setState(() => _messagesLoading = true);
    }

    try {
      final messages = await _messageService.getMessages();
      if (mounted) {
        setState(() {
          _messages = messages;
          _messagesLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _messagesLoading = false);
        // Silently fail if not the first load to avoid annoying snackbars on background refresh
        if (_messages.isEmpty) {
          final loc = Provider.of<LocalizationService>(context, listen: false);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('${loc.translate('failed_load_messages')}: $e'),
            ),
          );
        }
      }
    }
  }

  Future<void> _loadUserDemographics() async {
    // Attempt to sync from stored token if demographics are missing or outdated
    await _storageService.syncDemographicsFromToken();

    final dob = await _storageService.getBirthDate();
    final gender = await _storageService.getGender();
    final regions = await _storageService.getRegionCodes();

    if (mounted) {
      setState(() {
        _gender = gender;
        _regionCodes = regions;

        if (dob != null) {
          _birthDate = DateFormat('dd-MM-yyyy').format(dob);
          final today = DateTime.now();
          int age = today.year - dob.year;
          if (today.month < dob.month ||
              (today.month == dob.month && today.day < dob.day)) {
            age--;
          }
          _age = age;
        }
      });
    }
  }

  Future<void> _loadUserName() async {
    final name = await _storageService.getDisplayName();
    if (mounted) {
      setState(() => _displayName = name);
    }
  }

  Future<void> _loadPolls() async {
    debugPrint('[Dashboard] ===== LOADING POLLS =====');
    setState(() => _loading = true);

    try {
      debugPrint('[Dashboard] Calling _apiService.getPolls()...');
      final polls = await _apiService.getPolls();
      debugPrint(
        '[Dashboard] ✅ Successfully received ${polls.length} polls from API',
      );

      if (polls.isNotEmpty) {
        debugPrint(
          '[Dashboard] First poll: "${polls[0].title}" (type: ${polls[0].type})',
        );
      } else {
        debugPrint('[Dashboard] ⚠️ No polls returned from API');
      }

      setState(() {
        _polls = polls;
        _loading = false;
      });
      debugPrint('[Dashboard] State updated with ${_polls.length} polls');
    } catch (e, stackTrace) {
      debugPrint('[Dashboard] ===== ERROR LOADING POLLS =====');
      debugPrint('[Dashboard] Error: $e');
      debugPrint('[Dashboard] Stack trace: $stackTrace');
      setState(() => _loading = false);
      if (mounted) {
        final loc = Provider.of<LocalizationService>(context, listen: false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${loc.translate('failed_load_polls')}: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_displayName.isNotEmpty ? _displayName : 'DTG'),
        actions: [
          IconButton(
            icon: const Icon(Icons.account_circle),
            onPressed: () {
              // Profile action
            },
          ),
        ],
      ),
      body: Column(children: [Expanded(child: _buildBody())]),
      bottomNavigationBar: BottomNav(
        currentIndex: _currentIndex,
        onTap: (index) {
          if (_currentIndex != index) {
            setState(() => _currentIndex = index);
            // Auto-refresh data when switching to specific tabs
            if (index == 1) {
              _loadMessages();
            } else if (index == 2) {
              _loadPolls();
            }
          }
        },
      ),
    );
  }

  Widget _buildBody() {
    switch (_currentIndex) {
      case 0:
        return _buildWalletTab();
      case 1:
        return _buildMessagesTab();
      case 2:
        return _buildVotingTab();
      case 3:
        return const MyActivityScreen();
      case 4:
        return _buildSettingsTab();
      default:
        return _buildVotingTab();
    }
  }

  Widget _buildMessagesTab() {
    if (_messagesLoading && _messages.isEmpty) {
      return const MessagesListShimmer();
    }

    return RefreshIndicator(
      onRefresh: _loadMessages,
      child: _messages.isEmpty ? _buildEmptyMessages() : _buildMessagesList(),
    );
  }

  Widget _buildEmptyMessages() {
    final loc = Provider.of<LocalizationService>(context, listen: false);
    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      child: SizedBox(
        height: MediaQuery.of(context).size.height - 200,
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              ShaderMask(
                shaderCallback: (bounds) => LinearGradient(
                  colors: [Colors.grey.shade600, Colors.grey.shade800],
                ).createShader(bounds),
                child: const Icon(
                  Icons.message_rounded,
                  size: 80,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 24),
              Text(
                loc.translate('no_messages_yet'),
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: Colors.white.withValues(alpha: 0.6),
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 40),
                child: Text(
                  loc.translate('announcements_here'),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Colors.white.withValues(alpha: 0.4),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMessagesList() {
    final loc = Provider.of<LocalizationService>(context, listen: false);
    // Filter messages based on audience rules (Client-side filtering)
    final filteredMessages = _messages.where((msg) {
      final rules = msg.audienceRules;
      if (rules == null || rules.isEmpty) return true;

      // Check Age
      if (_age != null) {
        final minAge = rules['min_age'] as int?;
        final maxAge = rules['max_age'] as int?;
        if (minAge != null && _age! < minAge) return false;
        if (maxAge != null && _age! > maxAge) return false;
      }

      // Check Gender
      if (_gender != null) {
        final genderRule = rules['gender'] as String?;
        if (genderRule != null &&
            genderRule != 'all' &&
            _gender != genderRule) {
          return false;
        }
      }

      // Check Regions
      final regionRules = rules['regions'] as List<dynamic>?;
      if (regionRules != null && regionRules.isNotEmpty) {
        final hasMatchingRegion = _regionCodes.any(
          (r) => regionRules.contains(r),
        );
        if (!hasMatchingRegion) {
          return false;
        }
      }

      return true;
    }).toList();

    if (filteredMessages.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.message_outlined, size: 80, color: Colors.grey),
            const SizedBox(height: 24),
            Text(
              loc.translate('no_recent_updates'),
              style: const TextStyle(color: Colors.grey),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
      itemCount: filteredMessages.length,
      itemBuilder: (context, index) {
        return MessageCard(message: filteredMessages[index]);
      },
    );
  }

  Widget _buildVotingTab() {
    final loc = Provider.of<LocalizationService>(context, listen: false);
    // Voting tab - shows polls that require re-auth based on priority/risk
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_polls.isEmpty) {
      return RefreshIndicator(
        onRefresh: _loadPolls,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          child: SizedBox(
            height: MediaQuery.of(context).size.height - 200,
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.how_to_vote,
                    size: 80,
                    color: Colors.grey.shade600,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    loc.translate('no_polls_available'),
                    style: Theme.of(
                      context,
                    ).textTheme.titleMedium?.copyWith(color: Colors.grey),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    loc.translate('pull_to_refresh'),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Colors.grey.shade500,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadPolls,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: _polls.length,
        itemBuilder: (context, index) {
          return PollCard(poll: _polls[index], onVoteComplete: _loadPolls);
        },
      ),
    );
  }

  Widget _buildWalletTab() {
    final loc = Provider.of<LocalizationService>(context, listen: false);
    if (!_walletService.isUnlocked) {
      // Prompt biometric unlock before showing wallet contents.
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.lock_outline, size: 64, color: Colors.grey.shade600),
            const SizedBox(height: 16),
            Text(
              loc.translate('wallet_locked'),
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(color: Colors.grey),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _unlockWallet,
              icon: const Icon(Icons.fingerprint),
              label: Text(loc.translate('unlock_wallet')),
              style: ElevatedButton.styleFrom(minimumSize: const Size(200, 48)),
            ),
          ],
        ),
      );
    }
    return const WalletScreen();
  }

  Future<void> _unlockWallet() async {
    final unlocked = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (context) => const UnlockWalletScreen()),
    );
    if (unlocked == true && mounted) {
      setState(() {});
    }
  }

  Widget _buildSettingsTab() {
    return Consumer<LocalizationService>(
      builder: (context, loc, child) {
        return SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Profile Section
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      children: [
                        const CircleAvatar(
                          radius: 40,
                          child: Icon(Icons.person, size: 40),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          _displayName.isNotEmpty
                              ? _displayName
                              : loc.translate('citizen_user'),
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 4),
                        if (_age != null)
                          Text(
                            '${loc.translate('age')}: $_age ${_birthDate != null ? "($_birthDate)" : ""}',
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                        const SizedBox(height: 4),
                        Text(
                          loc.translate('enrolled'),
                          style: Theme.of(
                            context,
                          ).textTheme.bodyMedium?.copyWith(color: Colors.grey),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Settings List
                Card(
                  child: Column(
                    children: [
                      ListTile(
                        leading: const Icon(Icons.notifications),
                        title: Text(loc.translate('notifications')),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () {
                          _navigateToSettings('Notifications');
                        },
                      ),
                      const Divider(height: 1),
                      ListTile(
                        leading: const Icon(Icons.security),
                        title: Text(loc.translate('security_privacy')),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () {
                          _navigateToSettings('Security');
                        },
                      ),
                      const Divider(height: 1),
                      ListTile(
                        leading: const Icon(Icons.language),
                        title: Text(loc.translate('language')),
                        subtitle: Text(loc.currentLanguage.displayName),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () {
                          _navigateToSettings('Language');
                        },
                      ),
                      const Divider(height: 1),
                      ListTile(
                        leading: const Icon(Icons.help),
                        title: Text(loc.translate('help_support')),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () {
                          _navigateToSettings('Help');
                        },
                      ),
                      const Divider(height: 1),
                      ListTile(
                        leading: const Icon(Icons.info),
                        title: Text(loc.translate('about')),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () {
                          _navigateToSettings('About');
                        },
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                const SizedBox(height: 16),

                // Logout Button
                Card(
                  color: Colors.red.shade900.withValues(alpha: 0.2),
                  child: ListTile(
                    leading: const Icon(Icons.logout, color: Colors.red),
                    title: Text(
                      loc.translate('logout'),
                      style: const TextStyle(color: Colors.red),
                    ),
                    onTap: () {
                      showDialog(
                        context: context,
                        builder: (dialogContext) =>
                            Consumer<LocalizationService>(
                              builder: (context, dialogLoc, child) =>
                                  AlertDialog(
                                    title: Text(dialogLoc.translate('logout')),
                                    content: Text(
                                      dialogLoc.translate('logout_confirm'),
                                    ),
                                    actions: [
                                      TextButton(
                                        onPressed: () =>
                                            Navigator.pop(dialogContext),
                                        child: Text(
                                          dialogLoc.translate('cancel'),
                                        ),
                                      ),
                                      TextButton(
                                        onPressed: () async {
                                          final navigator = Navigator.of(
                                            context,
                                          );
                                          Navigator.pop(
                                            dialogContext,
                                          ); // Close dialog

                                          // Clear all data
                                          await _storageService.clearAll();

                                          if (mounted) {
                                            // Navigate to Intro Screen (Login)
                                            navigator.pushAndRemoveUntil(
                                              MaterialPageRoute(
                                                builder: (context) =>
                                                    const IntroScreen(),
                                              ),
                                              (route) => false,
                                            );
                                          }
                                        },
                                        child: Text(
                                          dialogLoc.translate('logout'),
                                          style: const TextStyle(
                                            color: Colors.red,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                            ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _navigateToSettings(String title) {
    if (title == 'Notifications') {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (context) => const NotificationSettingsScreen(),
        ),
      );
      return;
    }
    if (title == 'Language') {
      Navigator.of(context).push(
        MaterialPageRoute(builder: (context) => const LanguageSettingsScreen()),
      );
      return;
    }
    if (title == 'Help') {
      Navigator.of(
        context,
      ).push(MaterialPageRoute(builder: (context) => const HelpScreen()));
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => SettingsDetailScreen(title: title),
      ),
    );
  }
}
