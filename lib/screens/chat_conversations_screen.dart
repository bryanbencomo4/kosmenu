import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kosmenu_app/services/chat_supervision_service.dart';
import 'package:kosmenu_app/services/merchant_deep_link.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

String _chatStatusLabel(String status) {
  switch (status) {
    case 'human_handling':
      return 'Humano';
    case 'needs_attention':
      return 'Atención';
    case 'closed':
      return 'Cerrada';
    default:
      return 'IA';
  }
}

String _chatAssigneeLabel(String? assignedUserId) {
  final id = (assignedUserId ?? '').trim();
  if (id.isEmpty) return '';
  final me = Supabase.instance.client.auth.currentUser?.id;
  if (me != null && me == id) return 'Resp: Tú';
  return 'Resp: Personal';
}

/// Merchant inbox for supervised chatbot conversations (Flutter panel).
class ChatConversationsScreen extends StatefulWidget {
  const ChatConversationsScreen({
    super.key,
    required this.comercioId,
    this.initialConversationId,
  });

  final String comercioId;
  final String? initialConversationId;

  @override
  State<ChatConversationsScreen> createState() =>
      _ChatConversationsScreenState();
}

class _ChatConversationsScreenState extends State<ChatConversationsScreen> {
  late Future<List<ChatConversationSummary>> _future;
  RealtimeChannel? _inboxChannel;
  Timer? _recoveryTimer;

  @override
  void initState() {
    super.initState();
    _future = ChatSupervisionService.listConversations(widget.comercioId);
    _bindInboxRealtime();
    _recoveryTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (!mounted) return;
      unawaited(_reload(silent: true));
    });
    final initial = (widget.initialConversationId ?? '').trim();
    if (initial.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        unawaited(_openConversation(initial));
      });
    }
  }

  @override
  void dispose() {
    _recoveryTimer?.cancel();
    unawaited(_inboxChannel?.unsubscribe() ?? Future<void>.value());
    super.dispose();
  }

  void _bindInboxRealtime() {
    if (_inboxChannel != null) return;
    try {
      _inboxChannel = Supabase.instance.client
          .channel('commerce:${widget.comercioId}:chat_inbox')
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'chat_conversations',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'comercio_id',
              value: widget.comercioId,
            ),
            callback: (_) {
              unawaited(_reload(silent: true));
            },
          )
          .subscribe();
    } catch (_) {
      // Publication may be pending — REST reload still works.
    }
  }

  Future<void> _reload({bool silent = false}) async {
    final next = ChatSupervisionService.listConversations(widget.comercioId);
    if (!silent && mounted) {
      setState(() => _future = next);
    } else {
      _future = next;
      try {
        final rows = await next;
        if (!mounted) return;
        setState(() => _future = Future.value(rows));
      } catch (_) {
        /* keep prior future */
      }
      return;
    }
    await _future;
  }

  Future<void> _openConversation(String id) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ChatConversationDetailScreen(
          conversationId: id,
          comercioId: widget.comercioId,
        ),
      ),
    );
    if (mounted) await _reload();
  }

  /// Needs-attention first, then by last message (newest first).
  List<ChatConversationSummary> _prioritizeInbox(
    List<ChatConversationSummary> rows,
  ) {
    int rank(String status) {
      switch (status) {
        case 'needs_attention':
          return 0;
        case 'human_handling':
          return 1;
        case 'closed':
          return 3;
        default:
          return 2;
      }
    }

    final sorted = List<ChatConversationSummary>.from(rows);
    sorted.sort((a, b) {
      final byStatus = rank(a.status).compareTo(rank(b.status));
      if (byStatus != 0) return byStatus;
      final aAt = a.lastMessageAt ?? '';
      final bAt = b.lastMessageAt ?? '';
      return bAt.compareTo(aAt);
    });
    return sorted;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Conversaciones'),
        actions: [
          IconButton(
            tooltip: 'Actualizar',
            onPressed: () => unawaited(_reload()),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: FutureBuilder<List<ChatConversationSummary>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      snapshot.error.toString(),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: () => unawaited(_reload()),
                      child: const Text('Reintentar'),
                    ),
                  ],
                ),
              ),
            );
          }
          final rows = _prioritizeInbox(
            snapshot.data ?? const <ChatConversationSummary>[],
          );
          if (rows.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'No hay conversaciones todavía.\n'
                  'Cuando un cliente escriba al asistente aparecerán aquí.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: rows.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final row = rows[index];
                return ListTile(
                  title: Text(row.consumerLabel?.trim().isNotEmpty == true
                      ? row.consumerLabel!.trim()
                      : 'Cliente anónimo'),
                  subtitle: Text(
                    row.lastMessagePreview?.trim().isNotEmpty == true
                        ? row.lastMessagePreview!.trim()
                        : 'Sin mensajes',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        _chatStatusLabel(row.status),
                        style: Theme.of(context).textTheme.labelSmall,
                      ),
                      if ((row.assignedUserId ?? '').isNotEmpty)
                        Text(
                          _chatAssigneeLabel(row.assignedUserId),
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                      if (row.unreadMerchantCount > 0)
                        Text(
                          '${row.unreadMerchantCount} nuevo(s)',
                          style: const TextStyle(
                            color: Color(0xFFC45C26),
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                    ],
                  ),
                  onTap: () => unawaited(_openConversation(row.id)),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class ChatConversationDetailScreen extends StatefulWidget {
  const ChatConversationDetailScreen({
    super.key,
    required this.conversationId,
    required this.comercioId,
  });

  final String conversationId;
  final String comercioId;

  @override
  State<ChatConversationDetailScreen> createState() =>
      _ChatConversationDetailScreenState();
}

class _ChatConversationDetailScreenState
    extends State<ChatConversationDetailScreen> {
  ChatConversationDetail? _detail;
  String? _error;
  bool _busy = false;
  final _draft = TextEditingController();
  RealtimeChannel? _channel;
  Timer? _recoveryTimer;
  int _lastSeq = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
    _recoveryTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (!mounted) return;
      unawaited(_load(incremental: true));
    });
  }

  @override
  void dispose() {
    _recoveryTimer?.cancel();
    unawaited(_channel?.unsubscribe() ?? Future<void>.value());
    _draft.dispose();
    super.dispose();
  }

  Future<void> _load({bool incremental = false}) async {
    try {
      final detail = await ChatSupervisionService.getConversation(
        widget.conversationId,
        afterSeq: incremental ? _lastSeq : 0,
      );
      if (!mounted) return;
      setState(() {
        _error = null;
        if (incremental && _detail != null) {
          final seen = _detail!.messages.map((m) => m.id).toSet();
          final merged = [
            ..._detail!.messages,
            ...detail.messages.where((m) => !seen.contains(m.id)),
          ];
          _detail = ChatConversationDetail(
            conversation: detail.conversation,
            messages: merged,
          );
        } else {
          _detail = detail;
        }
        _lastSeq = (_detail?.messages ?? const [])
            .fold<int>(0, (max, m) => m.seq > max ? m.seq : max);
      });
      _bindRealtime();
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    }
  }

  void _bindRealtime() {
    if (_channel != null) return;
    try {
      _channel = Supabase.instance.client
          .channel('chat_messages:${widget.conversationId}')
          .onPostgresChanges(
            event: PostgresChangeEvent.insert,
            schema: 'public',
            table: 'chat_messages',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'conversation_id',
              value: widget.conversationId,
            ),
            callback: (_) {
              unawaited(_load(incremental: true));
            },
          )
          .subscribe();
    } catch (_) {
      // Table may not be published yet — REST recovery still works.
    }
  }

  Future<void> _act(String action, {String? text}) async {
    setState(() => _busy = true);
    try {
      await ChatSupervisionService.act(
        conversationId: widget.conversationId,
        action: action,
        text: text,
      );
      if (text != null) _draft.clear();
      await _load();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_friendlyActError(error))),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _friendlyActError(Object error) {
    final raw = error.toString();
    if (raw.contains('human_takeover_disabled')) {
      return 'La intervención humana está desactivada (feature flag).';
    }
    if (raw.contains('conflict')) {
      return 'Otro empleado ya tomó esta conversación.';
    }
    if (raw.contains('not_assignee')) {
      return 'Solo el responsable (o un administrador) puede responder.';
    }
    if (raw.contains('not_in_human_mode')) {
      return 'Toma la conversación antes de escribir.';
    }
    if (raw.contains('supervision_disabled')) {
      return 'La supervisión no está activa para este comercio.';
    }
    return raw;
  }

  String _roleLabel(String role) {
    switch (role) {
      case 'consumer':
        return 'Cliente';
      case 'staff':
        return 'Personal';
      case 'system':
        return 'Sistema';
      default:
        return 'Asistente';
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = _detail?.conversation.status ?? '…';
    final human = status == 'human_handling';
    final assignee = _chatAssigneeLabel(_detail?.conversation.assignedUserId);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Conversación'),
        actions: [
          IconButton(
            onPressed: _busy ? null : () => unawaited(_load()),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    assignee.isEmpty
                        ? 'Estado: $status'
                        : 'Estado: $status · $assignee',
                  ),
                ),
                TextButton(
                  onPressed: _busy ? null : () => unawaited(_act('take')),
                  child: const Text('Tomar'),
                ),
                TextButton(
                  onPressed: _busy ? null : () => unawaited(_act('return')),
                  child: const Text('Devolver'),
                ),
                TextButton(
                  onPressed: _busy ? null : () => unawaited(_act('close')),
                  child: const Text('Cerrar'),
                ),
              ],
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            ),
          Expanded(
            child: _detail == null
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _detail!.messages.length,
                    itemBuilder: (context, index) {
                      final m = _detail!.messages[index];
                      final mine = m.role == 'staff' || m.role == 'assistant';
                      return Align(
                        alignment: mine
                            ? Alignment.centerLeft
                            : Alignment.centerRight,
                        child: Container(
                          margin: const EdgeInsets.symmetric(vertical: 4),
                          padding: const EdgeInsets.all(10),
                          constraints: BoxConstraints(
                            maxWidth: MediaQuery.sizeOf(context).width * 0.82,
                          ),
                          decoration: BoxDecoration(
                            color: m.role == 'consumer'
                                ? const Color(0xFFDCF8C6)
                                : m.role == 'staff'
                                    ? const Color(0xFFFFF4E8)
                                    : const Color(0xFFF3F4F6),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _roleLabel(m.role),
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF6B7280),
                                ),
                              ),
                              Text(m.body),
                              if (m.productProposalLabels.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(
                                  'Propuestas: ${m.productProposalLabels.join(' · ')}',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: Color(0xFF6B7280),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _draft,
                          enabled: human && !_busy,
                          decoration: InputDecoration(
                            hintText: human
                                ? 'Escribe al cliente…'
                                : 'Toma la conversación para escribir',
                            border: const OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(
                        onPressed: !human ||
                                _busy ||
                                _draft.text.trim().isEmpty
                            ? null
                            : () => unawaited(
                                  _act('message', text: _draft.text.trim()),
                                ),
                        child: const Text('Enviar'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Solo texto por ahora: notas de voz y adjuntos aún no '
                    'están disponibles desde el panel.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: const Color(0xFF6B7280),
                        ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Opens inbox for the active comercio; uses deep-link conversation if present.
Future<void> openChatConversationsInbox(
  BuildContext context, {
  required String comercioId,
  String? conversationId,
}) {
  final initial =
      (conversationId ?? MerchantDeepLink.consumeConversation() ?? '').trim();
  return Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => ChatConversationsScreen(
        comercioId: comercioId,
        initialConversationId: initial.isEmpty ? null : initial,
      ),
    ),
  );
}
