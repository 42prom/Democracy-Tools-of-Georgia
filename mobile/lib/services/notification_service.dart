import 'dart:io';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter/foundation.dart';

import 'service_locator.dart';
import 'storage_service.dart';

class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  FirebaseMessaging? get _fcm {
    try {
      return FirebaseMessaging.instance;
    } catch (e) {
      return null;
    }
  }

  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();
  final StorageService _storageService = StorageService();

  bool _initialized = false;

  Future<void> initialize() async {
    if (_initialized) {
      return;
    }

    // 1. Setup local notifications for foreground display
    const AndroidInitializationSettings initializationSettingsAndroid =
        AndroidInitializationSettings('@mipmap/ic_launcher');

    const DarwinInitializationSettings initializationSettingsDarwin =
        DarwinInitializationSettings();

    const InitializationSettings initializationSettings =
        InitializationSettings(
          android: initializationSettingsAndroid,
          iOS: initializationSettingsDarwin,
        );

    await _localNotifications.initialize(initializationSettings);

    // 3. Create Android notification channel
    const AndroidNotificationChannel channel = AndroidNotificationChannel(
      'high_importance_channel',
      'High Importance Notifications',
      description: 'This channel is used for important notifications.',
      importance: Importance.max,
    );

    await _localNotifications
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.createNotificationChannel(channel);

    try {
      // 4. Handle foreground messages
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        RemoteNotification? notification = message.notification;
        AndroidNotification? android = message.notification?.android;

        if (notification != null && android != null && !kIsWeb) {
          _localNotifications.show(
            notification.hashCode,
            notification.title,
            notification.body,
            NotificationDetails(
              android: AndroidNotificationDetails(
                channel.id,
                channel.name,
                channelDescription: channel.description,
                icon: android.smallIcon,
              ),
            ),
          );
        }
      });

      // 5. Handle background/terminated state messages
      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        if (kDebugMode) {
          print('A new onMessageOpenedApp event was published!');
        }
      });
    } catch (e) {
      if (kDebugMode) {
        print('[Notifications] Firebase Messaging skipped: $e');
      }
    }

    _initialized = true;

    // Auto-register if enrolled
    if (await _storageService.isEnrolled()) {
      registerDevice();
    }
  }

  /// Request system permissions for notifications.
  /// This should be called at a logical point (e.g., after verification) to improve UX.
  Future<void> requestPermission() async {
    final fcm = _fcm;
    if (fcm == null) {
      return;
    }

    NotificationSettings settings = await fcm.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (kDebugMode) {
      print(
        '[Notifications] Permission status: ${settings.authorizationStatus}',
      );
    }

    // After permission is granted/denied, ensure device is registered if we have a token
    if (await _storageService.isEnrolled()) {
      await registerDevice();
    }
  }

  /// Check the current authorization status from FCM
  Future<AuthorizationStatus> getPermissionStatus() async {
    final fcm = _fcm;
    if (fcm == null) {
      return AuthorizationStatus.notDetermined;
    }
    final settings = await fcm.getNotificationSettings();
    return settings.authorizationStatus;
  }

  /// Helper to check if notifications are allowed at the system level
  Future<bool> isPermissionGranted() async {
    final status = await getPermissionStatus();
    return status == AuthorizationStatus.authorized ||
        status == AuthorizationStatus.provisional;
  }

  Future<void> registerDevice() async {
    try {
      final fcm = _fcm;
      if (fcm == null) {
        if (kDebugMode) {
          print('[Notifications] FCM instance unavailable for registration');
        }
        return;
      }

      String? token = await fcm.getToken();
      if (token == null) {
        return;
      }

      final credential = await _storageService.getCredential();
      if (credential == null) {
        return;
      }

      final api = ServiceLocator.apiService;
      api.setCredential(credential);
      await api.registerDevice(token, Platform.isIOS ? 'ios' : 'android');

      if (kDebugMode) {
        print('Device registered with backend successfully');
      }
    } catch (e) {
      if (kDebugMode) {
        print('Error registering device: $e');
      }
    }
  }

  Future<void> unregisterDevice() async {
    try {
      final fcm = _fcm;
      if (fcm == null) {
        return;
      }

      String? token = await fcm.getToken();
      if (token == null) {
        return;
      }

      final credential = await _storageService.getCredential();
      if (credential == null) {
        return;
      }

      final api = ServiceLocator.apiService;
      api.setCredential(credential);
      await api.unregisterDevice(token);
    } catch (e) {
      if (kDebugMode) {
        print('Error unregistering device: $e');
      }
    }
  }
}
