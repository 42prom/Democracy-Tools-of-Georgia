import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../../config/app_config.dart';
import '../../models/poll.dart';
import '../../services/interfaces/i_api_service.dart';
import '../../services/service_locator.dart';
import '../../services/storage_service.dart';
import '../../services/wallet_service.dart';
import '../../widgets/bottom_nav.dart';
import 'poll_card.dart';
import '../activity/my_activity_screen.dart';
import '../wallet/wallet_screen.dart';
import '../wallet/unlock_wallet_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  IApiService _apiService = ServiceLocator.apiService;
  final StorageService _storageService = StorageService();
  final WalletService _walletService = WalletService();
  List<Poll> _polls = [];
  bool _loading = true;
  int _currentIndex = 2; // Start on Voting tab (center)
  String _displayName = '';
  bool _mockMode = AppConfig.mockMode;

  @override
  void initState() {
    super.initState();
    _loadUserName();
    _loadPolls();
  }

  Future<void> _toggleMockMode(bool enabled) async {
    await AppConfig.setMockMode(enabled);
    ServiceLocator.reset();
    setState(() {
      _mockMode = enabled;
      _apiService = ServiceLocator.apiService;
    });
    _loadPolls();
  }

  Future<void> _loadUserName() async {
    final name = await _storageService.getDisplayName();
    if (mounted) {
      setState(() => _displayName = name);
    }
  }

  Future<void> _loadPolls() async {
    setState(() => _loading = true);

    try {
      final polls = await _apiService.getPolls();
      setState(() {
        _polls = polls;
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to load polls: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_displayName.isNotEmpty ? _displayName : 'DTFG'),
        actions: [
          IconButton(
            icon: const Icon(Icons.account_circle),
            onPressed: () {
              // Profile action
            },
          ),
        ],
      ),
      body: Column(
        children: [
          if (!kReleaseMode && _mockMode)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 4),
              color: Colors.orange,
              child: const Text(
                'MOCK MODE',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.black,
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                ),
              ),
            ),
          Expanded(child: _buildBody()),
        ],
      ),
      bottomNavigationBar: BottomNav(
        currentIndex: _currentIndex,
        onTap: (index) {
          setState(() => _currentIndex = index);
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
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.message, size: 80, color: Colors.grey.shade600),
          const SizedBox(height: 16),
          Text(
            'No messages',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(color: Colors.grey),
          ),
          const SizedBox(height: 8),
          Text(
            'Announcements and alerts\nwill appear here.',
            style: Theme.of(context)
                .textTheme
                .bodyMedium
                ?.copyWith(color: Colors.grey),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildVotingTab() {
    // Voting tab - shows polls that require re-auth based on priority/risk
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_polls.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.how_to_vote, size: 80, color: Colors.grey.shade600),
            const SizedBox(height: 16),
            Text(
              'No polls available',
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(color: Colors.grey),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadPolls,
      child: ListView.builder(
        itemCount: _polls.length,
        itemBuilder: (context, index) {
          return PollCard(poll: _polls[index]);
        },
      ),
    );
  }

  Widget _buildWalletTab() {
    if (!_walletService.isUnlocked) {
      // Prompt biometric unlock before showing wallet contents.
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.lock_outline, size: 64, color: Colors.grey.shade600),
            const SizedBox(height: 16),
            Text(
              'Wallet is locked',
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(color: Colors.grey),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _unlockWallet,
              icon: const Icon(Icons.fingerprint),
              label: const Text('Unlock Wallet'),
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
                      _displayName.isNotEmpty ? _displayName : 'Citizen User',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Enrolled',
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
                    title: const Text('Notifications'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      // TODO: Navigate to notifications settings
                    },
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.security),
                    title: const Text('Security & Privacy'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      // TODO: Navigate to security settings
                    },
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.language),
                    title: const Text('Language'),
                    subtitle: const Text('English'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      // TODO: Navigate to language settings
                    },
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.help),
                    title: const Text('Help & Support'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      // TODO: Navigate to help
                    },
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.info),
                    title: const Text('About'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      // TODO: Navigate to about
                    },
                  ),
                ],
              ),
            ),
            // Developer section (debug builds only)
            if (!kReleaseMode) ...[
              const SizedBox(height: 16),
              Card(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      child: Text(
                        'Developer',
                        style: Theme.of(context).textTheme.labelMedium
                            ?.copyWith(
                              color: Colors.orange,
                              fontWeight: FontWeight.bold,
                            ),
                      ),
                    ),
                    SwitchListTile(
                      secondary: const Icon(
                        Icons.science,
                        color: Colors.orange,
                      ),
                      title: const Text('Mock Mode'),
                      subtitle: const Text('Use fake data, no server needed'),
                      value: _mockMode,
                      activeTrackColor: Colors.orange.withValues(alpha: 0.4),
                      activeThumbColor: Colors.orange,
                      onChanged: _toggleMockMode,
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 16),

            // Logout Button
            Card(
              color: Colors.red.shade900.withValues(alpha: 0.2),
              child: ListTile(
                leading: const Icon(Icons.logout, color: Colors.red),
                title: const Text(
                  'Logout',
                  style: TextStyle(color: Colors.red),
                ),
                onTap: () {
                  // TODO: Implement logout
                  showDialog(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: const Text('Logout'),
                      content: const Text(
                        'Are you sure you want to logout? You will need to re-enroll to vote again.',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context),
                          child: const Text('Cancel'),
                        ),
                        TextButton(
                          onPressed: () {
                            // TODO: Clear credentials and navigate to intro
                            Navigator.pop(context);
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                  'Logout functionality coming soon',
                                ),
                              ),
                            );
                          },
                          child: const Text(
                            'Logout',
                            style: TextStyle(color: Colors.red),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
