import 'dart:async';
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // Ignore initialization errors in background isolate.
  }
}

class PushNotificationService {
  PushNotificationService._();

  static final PushNotificationService instance = PushNotificationService._();

  static const String _channelId = 'pedidos_channel';
  static const String _channelName = 'Pedidos Nuevos';
  static const String _channelDescription =
      'Notificaciones de pedidos nuevos para tu comercio.';

  FirebaseMessaging? _messaging;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();
  final StreamController<String> _orderTapController =
      StreamController<String>.broadcast();

  StreamSubscription<AuthState>? _authSubscription;
  StreamSubscription<String>? _tokenRefreshSubscription;
  bool _initialized = false;

  Stream<String> get orderTapStream => _orderTapController.stream;

  Future<void> initialize() async {
    if (_initialized || kIsWeb) {
      return;
    }

    await Firebase.initializeApp();
    _messaging = FirebaseMessaging.instance;
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    await _initializeLocalNotifications();
    await _requestPermissions();
    await _syncTokenForCurrentUser();

    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
    FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageTap);

    final initialMessage = await _messaging!.getInitialMessage();
    if (initialMessage != null) {
      _handleMessageTap(initialMessage);
    }

    _tokenRefreshSubscription = _messaging!.onTokenRefresh.listen(
      (token) => _upsertToken(token),
    );

    _authSubscription = Supabase.instance.client.auth.onAuthStateChange.listen((_) {
      _syncTokenForCurrentUser();
    });

    _initialized = true;
  }

  Future<void> dispose() async {
    await _authSubscription?.cancel();
    await _tokenRefreshSubscription?.cancel();
    await _orderTapController.close();
  }

  Future<void> _initializeLocalNotifications() async {
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const darwinSettings = DarwinInitializationSettings();

    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: darwinSettings,
    );

    await _localNotifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: (response) {
        _emitOrderIdFromPayload(response.payload);
      },
      onDidReceiveBackgroundNotificationResponse: _onBackgroundNotificationTap,
    );

    const channel = AndroidNotificationChannel(
      _channelId,
      _channelName,
      description: _channelDescription,
      importance: Importance.max,
      playSound: true,
      sound: RawResourceAndroidNotificationSound('cash_register'),
    );

    await _localNotifications
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.createNotificationChannel(channel);

    final launchDetails = await _localNotifications
        .getNotificationAppLaunchDetails();
    final launchPayload = launchDetails?.notificationResponse?.payload;
    if ((launchPayload ?? '').isNotEmpty) {
      _emitOrderIdFromPayload(launchPayload);
    }
  }

  Future<void> _requestPermissions() async {
    await _messaging!.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      announcement: false,
      carPlay: false,
      criticalAlert: false,
      provisional: false,
    );
  }

  Future<void> _handleForegroundMessage(RemoteMessage message) async {
    final orderId = _extractOrderId(message);

    final payload = jsonEncode({'orderId': orderId});

    const androidDetails = AndroidNotificationDetails(
      _channelId,
      _channelName,
      channelDescription: _channelDescription,
      importance: Importance.max,
      priority: Priority.high,
      playSound: true,
      sound: RawResourceAndroidNotificationSound('cash_register'),
    );

    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
      sound: 'cash_register.aiff',
    );

    await _localNotifications.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      message.notification?.title ?? '💰 ¡Nuevo Pedido!',
      message.notification?.body ??
          'Has recibido un nuevo pedido en tu comercio.',
      const NotificationDetails(android: androidDetails, iOS: iosDetails),
      payload: payload,
    );
  }

  void _handleMessageTap(RemoteMessage message) {
    final orderId = _extractOrderId(message);
    if (orderId.isEmpty) {
      return;
    }
    _orderTapController.add(orderId);
  }

  void _emitOrderIdFromPayload(String? payload) {
    final raw = (payload ?? '').trim();
    if (raw.isEmpty) {
      return;
    }

    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) {
        final orderId = (decoded['orderId'] ?? '').toString().trim();
        if (orderId.isNotEmpty) {
          _orderTapController.add(orderId);
        }
      }
    } catch (_) {
      // Ignore malformed payloads.
    }
  }

  String _extractOrderId(RemoteMessage message) {
    final direct = (message.data['orderId'] ?? '').toString().trim();
    if (direct.isNotEmpty) {
      return direct;
    }

    final fallback = (message.data['order_id'] ?? '').toString().trim();
    return fallback;
  }

  Future<void> _syncTokenForCurrentUser() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) {
      return;
    }

    final token = await _messaging!.getToken();
    if (token == null || token.trim().isEmpty) {
      return;
    }

    await _upsertToken(token, userIdOverride: user.id);
  }

  Future<void> _upsertToken(String token, {String? userIdOverride}) async {
    final userId = (userIdOverride ?? Supabase.instance.client.auth.currentUser?.id ?? '').trim();
    if (userId.isEmpty) {
      return;
    }

    final normalizedToken = token.trim();
    if (normalizedToken.isEmpty) {
      return;
    }

    final platform = defaultTargetPlatform;
    final deviceType = switch (platform) {
      TargetPlatform.android => 'android',
      TargetPlatform.iOS => 'ios',
      TargetPlatform.macOS => 'macos',
      TargetPlatform.windows => 'windows',
      TargetPlatform.linux => 'linux',
      TargetPlatform.fuchsia => 'fuchsia',
    };

    await Supabase.instance.client.from('user_tokens').upsert(
      {
        'user_id': userId,
        'fcm_token': normalizedToken,
        'device_type': deviceType,
        'updated_at': DateTime.now().toIso8601String(),
      },
      onConflict: 'user_id,fcm_token',
    );
  }
}

@pragma('vm:entry-point')
void _onBackgroundNotificationTap(NotificationResponse response) {
  final payload = response.payload;
  if ((payload ?? '').trim().isEmpty) {
    return;
  }
}