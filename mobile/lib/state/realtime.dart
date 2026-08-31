import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config.dart';

/// اتصال Socket.IO بالخادم — نفس القنوات الموثّقة في README.
///
/// أسماء القنوات التي تحمل معرّفات (`event_reaction_<id>`،
/// `new_congratulation_<id>`) يُشترك بها عند فتح شاشة المناسبة ويُلغى
/// الاشتراك عند إغلاقها.
class RealtimeService {
  io.Socket? _socket;

  /// مناسبة جديدة نُشرت — الشاشة الرئيسية تعيد التحميل.
  final _newEvent = StreamController<Map<String, dynamic>>.broadcast();

  /// إشعار عام من الإدارة.
  final _broadcast = StreamController<Map<String, dynamic>>.broadcast();

  Stream<Map<String, dynamic>> get onNewEvent => _newEvent.stream;
  Stream<Map<String, dynamic>> get onBroadcast => _broadcast.stream;

  bool get isConnected => _socket?.connected ?? false;

  void connect() {
    if (_socket != null) return;

    final socket = io.io(
      AppConfig.apiBase,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .enableReconnection()
          .enableAutoConnect()
          .build(),
    );

    socket.on('new_event_created', (data) {
      if (data is Map) _newEvent.add(Map<String, dynamic>.from(data));
    });

    socket.on('system_broadcast', (data) {
      if (data is Map) _broadcast.add(Map<String, dynamic>.from(data));
    });

    socket.onConnectError((error) {
      // البث اللحظي تحسين وليس شرطاً — التطبيق يعمل بدونه.
      debugPrint('Socket.IO connect error: $error');
    });

    _socket = socket;
  }

  /// يستمع لتفاعلات مناسبة بعينها. يُعيد دالة لإلغاء الاشتراك.
  VoidCallback onEventReaction(int eventId, void Function() handler) {
    final channel = 'event_reaction_$eventId';
    void listener(dynamic _) => handler();
    _socket?.on(channel, listener);
    return () => _socket?.off(channel, listener);
  }

  /// يستمع للتبريكات الجديدة على مناسبة بعينها.
  VoidCallback onNewCongratulation(
    int eventId,
    void Function(Map<String, dynamic>) handler,
  ) {
    final channel = 'new_congratulation_$eventId';
    void listener(dynamic data) {
      if (data is Map) handler(Map<String, dynamic>.from(data));
    }

    _socket?.on(channel, listener);
    return () => _socket?.off(channel, listener);
  }

  void dispose() {
    _socket?.dispose();
    _socket = null;
    _newEvent.close();
    _broadcast.close();
  }
}
