import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:logging/logging.dart';
import 'package:provider/provider.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'config/theme.dart';
import 'services/storage_service.dart';
import 'services/notification_service.dart';
import 'services/localization_service.dart';
import 'services/service_locator.dart';
import 'screens/enrollment/intro_screen.dart';
import 'screens/dashboard/dashboard_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Setup logging
  Logger.root.level = Level.ALL;
  Logger.root.onRecord.listen((record) {
    debugPrint('${record.level.name}: ${record.time}: ${record.message}');
  });

  // Initialize Firebase (optional - for notifications)
  bool firebaseInitialized = false;
  try {
    await Firebase.initializeApp();
    firebaseInitialized = true;
    debugPrint('✅ Firebase initialized successfully');
  } catch (e) {
    debugPrint('⚠️  Firebase initialization failed (optional): $e');
    debugPrint('   App will continue without push notifications');
  }

  // Initialize notification service only if Firebase worked
  if (firebaseInitialized) {
    try {
      await NotificationService().initialize();
      debugPrint('✅ Notification service initialized');
    } catch (e) {
      debugPrint('⚠️  Notification service failed: $e');
    }
  }

  // Initialize localization service
  final localizationService = LocalizationService();
  await localizationService.initialize();
  debugPrint(
    '✅ Localization initialized: ${localizationService.currentLanguage.displayName}',
  );

  // Set preferred orientations
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  runApp(MyApp(localizationService: localizationService));
}

class MyApp extends StatelessWidget {
  final LocalizationService localizationService;

  const MyApp({super.key, required this.localizationService});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider<LocalizationService>.value(
      value: localizationService,
      child: Consumer<LocalizationService>(
        builder: (context, locService, child) {
          return MaterialApp(
            title: 'DTG',
            theme: AppTheme.darkTheme,
            debugShowCheckedModeBanner: false,
            locale: locService.locale,
            supportedLocales: const [
              Locale('en'), // English
              Locale('ka'), // Georgian
            ],
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            home: const SplashScreen(),
          );
        },
      ),
    );
  }
}

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  final StorageService _storageService = StorageService();

  @override
  void initState() {
    super.initState();
    _checkEnrollment();
  }

  Future<void> _checkEnrollment() async {
    // Wait for splash animation
    await Future.delayed(const Duration(seconds: 2));

    final isEnrolled = await _storageService.isEnrolled();
    final credential = await _storageService.getCredential();

    if (!mounted) return;

    if (isEnrolled && credential != null) {
      // Verify session is still valid by pinging backend
      final sessionValid = await _verifySession(credential);

      if (!mounted) return;

      if (sessionValid) {
        // Session valid - go to dashboard
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (context) => const DashboardScreen()),
        );
      } else {
        // Session expired/invalid - clear and re-enroll
        debugPrint('[Session] Invalid session, clearing credentials');
        await _storageService.clearAll();
        if (!mounted) return;
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (context) => const IntroScreen()),
        );
      }
    } else if (isEnrolled && credential == null) {
      // Enrolled flag set but no credential - inconsistent state, re-enroll
      debugPrint('[Session] Enrolled but no credential, resetting');
      await _storageService.setEnrolled(false);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (context) => const IntroScreen()),
      );
    } else {
      // New user - start enrollment flow
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (context) => const IntroScreen()),
      );
    }
  }

  /// Verify the stored credential is still valid by calling the backend
  Future<bool> _verifySession(String credential) async {
    try {
      final api = ServiceLocator.apiService;
      api.setCredential(credential);
      // Try to fetch polls - this will fail with 401 if token is invalid
      await api.getPolls();
      return true;
    } catch (e) {
      final errorStr = e.toString().toLowerCase();
      // Check for auth-related failures
      if (errorStr.contains('401') ||
          errorStr.contains('unauthorized') ||
          errorStr.contains('not authenticated') ||
          errorStr.contains('expired')) {
        return false;
      }
      // Network errors or other issues - assume session is valid, let dashboard handle
      debugPrint('[Session] Verification error (non-auth): $e');
      return true;
    }
  }

  @override
  Widget build(BuildContext context) {
    final locService = Provider.of<LocalizationService>(context);

    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset('assets/images/logo.png', width: 150, height: 150),
            const SizedBox(height: 24),
            Text(
              locService.translate('app_name'),
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.headlineLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32.0),
              child: Text(
                locService.translate('app_subtitle'),
                textAlign: TextAlign.center,
                style: Theme.of(
                  context,
                ).textTheme.bodyLarge?.copyWith(color: Colors.grey),
              ),
            ),
            const SizedBox(height: 40),
            const CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
