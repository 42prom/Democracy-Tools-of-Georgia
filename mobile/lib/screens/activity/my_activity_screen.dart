import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/activity_item.dart';
import '../../services/interfaces/i_api_service.dart';
import '../../services/service_locator.dart';
import '../../services/storage_service.dart';
import '../../services/localization_service.dart';
import 'activity_detail_screen.dart';

class MyActivityScreen extends StatefulWidget {
  const MyActivityScreen({super.key});

  @override
  State<MyActivityScreen> createState() => _MyActivityScreenState();
}

class _MyActivityScreenState extends State<MyActivityScreen> {
  final StorageService _storageService = StorageService();
  final IApiService _api = ServiceLocator.apiService;
  List<ActivityItem> _items = [];
  bool _loading = true;
  bool _isOffline = false;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);

    // 1. Load from local cache immediately (instant UI)
    final cachedItems = await _storageService.getActivityItems();
    if (mounted && cachedItems.isNotEmpty) {
      setState(() {
        _items = cachedItems;
        _loading = false;
      });
    }

    // 2. Fetch from API (source of truth)
    try {
      final apiItems = await _api.getMyActivity();
      if (mounted) {
        setState(() {
          _items = apiItems;
          _loading = false;
          _isOffline = false;
        });
      }

      // 3. Update local cache with API data
      await _storageService.clearActivityItems();
      for (final item in apiItems) {
        await _storageService.saveActivityItem(item);
      }
    } catch (e) {
      debugPrint('[MyActivity] API fetch failed: $e');
      // Keep cached data, mark as offline
      if (mounted) {
        setState(() {
          _loading = false;
          _isOffline = true;
        });
      }
    }
  }

  List<ActivityItem> get _filtered {
    if (_searchQuery.isEmpty) return _items;
    final q = _searchQuery.toLowerCase();
    return _items.where((i) => i.title.toLowerCase().contains(q)).toList();
  }

  @override
  Widget build(BuildContext context) {
    final loc = Provider.of<LocalizationService>(context);
    return Column(
      children: [
        // Offline indicator
        if (_isOffline)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 16),
            color: Colors.orange.shade100,
            child: Row(
              children: [
                Icon(Icons.cloud_off, size: 16, color: Colors.orange.shade800),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Showing cached data (offline)',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.orange.shade800,
                    ),
                  ),
                ),
              ],
            ),
          ),

        // Search bar
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: TextField(
            decoration: InputDecoration(
              hintText: loc.translate('search_by_title'),
              prefixIcon: const Icon(Icons.search),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              contentPadding: const EdgeInsets.symmetric(
                vertical: 0,
                horizontal: 12,
              ),
              isDense: true,
            ),
            onChanged: (v) => setState(() => _searchQuery = v),
          ),
        ),

        // Content
        Expanded(child: _buildContent(loc)),
      ],
    );
  }

  Widget _buildContent(LocalizationService loc) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    final filtered = _filtered;

    if (_items.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.history, size: 80, color: Colors.grey.shade600),
            const SizedBox(height: 16),
            Text(
              loc.translate('no_activity'),
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(color: Colors.grey),
            ),
            const SizedBox(height: 8),
            Text(
              loc.translate(
                'voting_history',
              ), // Using existing key for description prefix
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: Colors.grey),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      );
    }

    if (filtered.isEmpty) {
      return Center(
        child: Text(
          loc.translate('no_search_results'),
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: Colors.grey),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        itemCount: filtered.length,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemBuilder: (context, index) {
          final item = filtered[index];
          return _ActivityTile(
            item: item,
            onTap: () async {
              await Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => ActivityDetailScreen(item: item),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class _ActivityTile extends StatelessWidget {
  final ActivityItem item;
  final VoidCallback onTap;

  const _ActivityTile({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final loc = Provider.of<LocalizationService>(context);
    final ended = item.hasEnded;
    final typeKey = item.type.toLowerCase();

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(
          item.type == 'survey' ? Icons.assignment : Icons.how_to_vote,
          color: Theme.of(context).primaryColor,
        ),
        title: Text(item.title, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(
          '${loc.translate(typeKey)}  •  ${_formatDate(item.votedAt)}${item.rewardAmount != null ? "  •  +${item.rewardAmount} ${item.rewardToken}" : ""}',
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: Colors.grey),
        ),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: ended
                ? Colors.grey.withValues(alpha: 0.2)
                : Colors.green.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            ended ? loc.translate('ended') : loc.translate('live'),
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: ended ? Colors.grey : Colors.green,
            ),
          ),
        ),
        onTap: onTap,
      ),
    );
  }

  String _formatDate(DateTime dt) {
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
  }
}
