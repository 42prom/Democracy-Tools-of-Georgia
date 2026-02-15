import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/localization_service.dart';

class BottomNav extends StatelessWidget {
  final int currentIndex;
  final Function(int) onTap;

  const BottomNav({
    super.key,
    required this.currentIndex,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final locService = Provider.of<LocalizationService>(context);

    return BottomNavigationBar(
      currentIndex: currentIndex,
      onTap: onTap,
      backgroundColor: const Color(0xFF1E1E1E),
      selectedItemColor: Theme.of(context).primaryColor,
      unselectedItemColor: Colors.grey,
      type: BottomNavigationBarType.fixed,
      items: [
        BottomNavigationBarItem(
          icon: const Icon(Icons.account_balance_wallet),
          label: locService.translate('nav_wallet'),
        ),
        BottomNavigationBarItem(
          icon: const Icon(Icons.message),
          label: locService.translate('nav_messages'),
        ),
        BottomNavigationBarItem(
          icon: const Icon(Icons.how_to_vote),
          label: locService.translate('nav_voting'),
        ),
        BottomNavigationBarItem(
          icon: const Icon(Icons.history),
          label: locService.translate('nav_activity'),
        ),
        BottomNavigationBarItem(
          icon: const Icon(Icons.settings),
          label: locService.translate('nav_settings'),
        ),
      ],
    );
  }
}
