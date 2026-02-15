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

  final FirebaseMessaging _fcm = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();
  final StorageService _storageService = StorageService();

  bool _initialized = false;

  Future<void> initialize() async {
    if (_initialized) return;

    // 1. Request permissions (especially for iOS)
    NotificationSettings settings = await _fcm.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (kDebugMode) {
      print('User granted permission: ${settings.authorizationStatus}');
    }

    // 2. Setup local notifications for foreground display
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

    // 5. Handle background/terminated state messages when app is opened via notification
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      if (kDebugMode) {
        print('A new onMessageOpenedApp event was published!');
      }
      // Handle navigation if needed
    });

    _initialized = true;

    // Auto-register if enrolled
    if (await _storageService.isEnrolled()) {
      registerDevice();
    }
  }

  Future<void> registerDevice() async {
    try {
      String? token = await _fcm.getToken();
      if (token == null) return;

      final credential = await _storageService.getCredential();
      if (credential == null) return;

      // Use unified API service for consistent timeout, auth, and error handling
      final api = ServiceLocator.apiService;
      api.setCredential(credential);
      await api.registerDevice(token, Platform.isIOS ? 'ios' : 'android');

      if (kDebugMode) print('Device registered with backend successfully');
    } catch (e) {
      if (kDebugMode) print('Error registering device: $e');
    }
  }

  Future<void> unregisterDevice() async {
    try {
      String? token = await _fcm.getToken();
      if (token == null) return;

      final credential = await _storageService.getCredential();
      if (credential == null) return;

      // Use unified API service
      final api = ServiceLocator.apiService;
      api.setCredential(credential);
      await api.unregisterDevice(token);
    } catch (e) {
      if (kDebugMode) print('Error unregistering device: $e');
    }
  }
}
