import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:kosmenu_app/core/constants.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ChatConversationSummary {
  const ChatConversationSummary({
    required this.id,
    required this.status,
    this.consumerLabel,
    this.lastMessageAt,
    this.lastMessagePreview,
    this.unreadMerchantCount = 0,
    this.assignedUserId,
  });

  final String id;
  final String status;
  final String? consumerLabel;
  final String? lastMessageAt;
  final String? lastMessagePreview;
  final int unreadMerchantCount;
  final String? assignedUserId;

  factory ChatConversationSummary.fromJson(Map<String, dynamic> json) {
    return ChatConversationSummary(
      id: (json['id'] ?? '').toString(),
      status: (json['status'] ?? 'ai_handling').toString(),
      consumerLabel: json['consumer_label']?.toString(),
      lastMessageAt: json['last_message_at']?.toString(),
      lastMessagePreview: json['last_message_preview']?.toString(),
      unreadMerchantCount:
          int.tryParse('${json['unread_merchant_count'] ?? 0}') ?? 0,
      assignedUserId: json['assigned_user_id']?.toString(),
    );
  }
}

class ChatMessageRow {
  const ChatMessageRow({
    required this.id,
    required this.seq,
    required this.role,
    required this.body,
    required this.createdAt,
    this.payload = const <String, dynamic>{},
  });

  final String id;
  final int seq;
  final String role;
  final String body;
  final String createdAt;
  final Map<String, dynamic> payload;

  factory ChatMessageRow.fromJson(Map<String, dynamic> json) {
    final rawPayload = json['payload'];
    return ChatMessageRow(
      id: (json['id'] ?? '').toString(),
      seq: int.tryParse('${json['seq'] ?? 0}') ?? 0,
      role: (json['role'] ?? '').toString(),
      body: (json['body'] ?? '').toString(),
      createdAt: (json['created_at'] ?? '').toString(),
      payload: rawPayload is Map
          ? Map<String, dynamic>.from(rawPayload)
          : const <String, dynamic>{},
    );
  }

  List<String> get productProposalLabels {
    final cards = payload['product_cards'];
    if (cards is! List) return const [];
    return cards
        .whereType<Map>()
        .map((card) {
          final row = Map<String, dynamic>.from(card);
          return (row['name'] ?? row['nombre'] ?? row['title'] ?? '')
              .toString()
              .trim();
        })
        .where((name) => name.isNotEmpty)
        .take(8)
        .toList(growable: false);
  }
}

class ChatSupervisionFlags {
  const ChatSupervisionFlags({
    this.enabled = true,
    this.humanTakeover = true,
    this.wasenderNotify = false,
  });

  final bool enabled;
  final bool humanTakeover;
  final bool wasenderNotify;

  factory ChatSupervisionFlags.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const ChatSupervisionFlags();
    return ChatSupervisionFlags(
      enabled: json['enabled'] != false,
      humanTakeover: json['human_takeover'] != false,
      wasenderNotify: json['wasender_notify'] == true,
    );
  }
}

class ChatConversationDetail {
  const ChatConversationDetail({
    required this.conversation,
    required this.messages,
    this.flags = const ChatSupervisionFlags(),
  });

  final ChatConversationSummary conversation;
  final List<ChatMessageRow> messages;
  final ChatSupervisionFlags flags;
}

/// Talks to Next.js `/api/panel/conversaciones` with the merchant Supabase JWT.
class ChatSupervisionService {
  ChatSupervisionService._();

  static String? get _accessToken =>
      Supabase.instance.client.auth.currentSession?.accessToken;

  static Uri _uri(String path, [Map<String, String>? query]) {
    final base = AppConstants.apiBaseUrl;
    return Uri.parse('$base$path').replace(queryParameters: query);
  }

  static Future<List<ChatConversationSummary>> listConversations(
    String comercioId,
  ) async {
    final token = _accessToken;
    if (token == null || token.isEmpty) {
      throw StateError('Sesión requerida');
    }
    final res = await http.get(
      _uri('/api/panel/conversaciones', {'comercioId': comercioId}),
      headers: {'Authorization': 'Bearer $token'},
    );
    final body = jsonDecode(res.body.isEmpty ? '{}' : res.body);
    if (res.statusCode == 403 &&
        (body is Map && body['error'] == 'supervision_disabled')) {
      return const [];
    }
    if (res.statusCode != 200) {
      throw StateError(
        (body is Map ? body['error'] : null)?.toString() ??
            'No se pudo cargar la bandeja (${res.statusCode})',
      );
    }
    final rows = (body is Map ? body['conversations'] : null) as List? ?? const [];
    return rows
        .whereType<Map>()
        .map((row) => ChatConversationSummary.fromJson(
              Map<String, dynamic>.from(row),
            ))
        .toList(growable: false);
  }

  static Future<ChatConversationDetail> getConversation(
    String conversationId, {
    int afterSeq = 0,
  }) async {
    final token = _accessToken;
    if (token == null || token.isEmpty) {
      throw StateError('Sesión requerida');
    }
    final res = await http.get(
      _uri(
        '/api/panel/conversaciones/${Uri.encodeComponent(conversationId)}',
        afterSeq > 0 ? {'afterSeq': '$afterSeq'} : null,
      ),
      headers: {'Authorization': 'Bearer $token'},
    );
    final body = jsonDecode(res.body.isEmpty ? '{}' : res.body);
    if (res.statusCode != 200) {
      throw StateError(
        (body is Map ? body['error'] : null)?.toString() ??
            'No se pudo abrir la conversación (${res.statusCode})',
      );
    }
    final map = body is Map ? Map<String, dynamic>.from(body) : <String, dynamic>{};
    final conversation = ChatConversationSummary.fromJson(
      Map<String, dynamic>.from(map['conversation'] as Map? ?? const {}),
    );
    final messages = ((map['messages'] as List?) ?? const [])
        .whereType<Map>()
        .map((row) => ChatMessageRow.fromJson(Map<String, dynamic>.from(row)))
        .toList(growable: false);
    final flagsRaw = map['flags'];
    return ChatConversationDetail(
      conversation: conversation,
      messages: messages,
      flags: ChatSupervisionFlags.fromJson(
        flagsRaw is Map ? Map<String, dynamic>.from(flagsRaw) : null,
      ),
    );
  }

  static Future<ChatConversationSummary> act({
    required String conversationId,
    required String action,
    String? text,
  }) async {
    final token = _accessToken;
    if (token == null || token.isEmpty) {
      throw StateError('Sesión requerida');
    }
    final res = await http.post(
      _uri(
        '/api/panel/conversaciones/${Uri.encodeComponent(conversationId)}',
      ),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'action': action,
        if (text != null) 'text': text,
      }),
    );
    final body = jsonDecode(res.body.isEmpty ? '{}' : res.body);
    if (res.statusCode != 200) {
      throw StateError(
        (body is Map ? body['error'] : null)?.toString() ??
            'Acción fallida (${res.statusCode})',
      );
    }
    final conversation = (body is Map ? body['conversation'] : null) as Map?;
    if (conversation == null) {
      return ChatConversationSummary(id: conversationId, status: action);
    }
    return ChatConversationSummary.fromJson(
      Map<String, dynamic>.from(conversation),
    );
  }
}
