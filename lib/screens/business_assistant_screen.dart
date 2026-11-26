import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:kosmenu_app/screens/business_assistant_hash_stub.dart'
    if (dart.library.html) 'package:kosmenu_app/screens/business_assistant_hash_web.dart';
import 'package:kosmenu_app/services/elmenuxfa_api_config.dart';
import 'package:kosmenu_app/services/merchant_deep_link.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Conversational business assistant at app.elmenuxfa.com/asistente
/// Uses existing Supabase session + Next /api/asistente-negocio.
/// Auth is the same AuthScreen on app root — never a second login form.
class BusinessAssistantScreen extends StatefulWidget {
  const BusinessAssistantScreen({super.key, this.handoffCode});

  final String? handoffCode;

  static String? handoffCodeFromUri(Uri uri) {
    final fromQuery = uri.queryParameters['h']?.trim();
    if (fromQuery != null && fromQuery.isNotEmpty) return fromQuery;
    final frag = uri.fragment.trim();
    if (frag.startsWith('h=')) {
      return Uri.decodeComponent(frag.substring(2));
    }
    final params = Uri.splitQueryString(frag);
    final h = params['h']?.trim();
    return (h != null && h.isNotEmpty) ? h : null;
  }

  @override
  State<BusinessAssistantScreen> createState() =>
      _BusinessAssistantScreenState();
}

class _Proposal {
  _Proposal({
    required this.action,
    required this.confirmToken,
    required this.summary,
  });

  final String action;
  final String confirmToken;
  final String summary;

  static _Proposal? fromJson(dynamic raw) {
    if (raw is! Map) return null;
    final token = (raw['confirmToken'] as String?)?.trim();
    final summary = (raw['summary'] as String?)?.trim();
    final action = (raw['action'] as String?)?.trim();
    if (token == null ||
        token.isEmpty ||
        summary == null ||
        summary.isEmpty ||
        action == null ||
        action.isEmpty) {
      return null;
    }
    return _Proposal(action: action, confirmToken: token, summary: summary);
  }
}

class _ChatMsg {
  const _ChatMsg({
    required this.role,
    required this.text,
    this.proposal,
  });

  final String role;
  final String text;
  final _Proposal? proposal;
}

class _Chip {
  const _Chip(this.id, this.label, [String? text]) : text = text ?? label;
  final String id;
  final String label;
  final String text;
}

class _BusinessAssistantScreenState extends State<BusinessAssistantScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final _messages = <_ChatMsg>[];
  var _busy = false;
  var _booted = false;
  String? _error;
  String? _handoffCode;
  var _handoffConsumed = false;
  var _handoffValid = false;
  var _recoveryHint = false;
  var _needsAuth = false;
  final _chips = <_Chip>[];
  StreamSubscription<AuthState>? _authSub;

  /// Shared conversational tokens (aligned with Next chat-theme light).
  static const _bg = Color(0xFFEFEAE2);
  static const _headerBg = Color(0xFFF0F2F5);
  static const _headerFg = Color(0xFF111B21);
  static const _headerMuted = Color(0xFF667781);
  static const _bubbleIn = Color(0xFFFFFFFF);
  static const _bubbleOut = Color(0xFFD9FDD3);
  static const _composerBg = Color(0xFFF0F2F5);
  static const _send = Color(0xFF00A884);
  String? _pendingHandoffHint;

  @override
  void initState() {
    super.initState();
    _handoffCode = widget.handoffCode;
    if ((_handoffCode == null || _handoffCode!.isEmpty) && kIsWeb) {
      _handoffCode = readBusinessAssistantHandoffFromLocation() ??
          BusinessAssistantScreen.handoffCodeFromUri(Uri.base);
    }
    _authSub = Supabase.instance.client.auth.onAuthStateChange.listen((_) {
      if (mounted && _booted) {
        _boot(force: true);
      }
    });
    if (kIsWeb) {
      listenBusinessAssistantHashChange((_) {
        final code = readBusinessAssistantHandoffFromLocation() ??
            BusinessAssistantScreen.handoffCodeFromUri(Uri.base);
        if (code == null || code.isEmpty || code == _handoffCode) return;
        _handoffCode = code;
        _handoffConsumed = false;
        if (mounted) _boot(force: true);
      });
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _boot());
  }

  @override
  void dispose() {
    _authSub?.cancel();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<String?> _accessToken() async {
    final session = Supabase.instance.client.auth.currentSession;
    return session?.accessToken;
  }

  Future<Map<String, dynamic>?> _post(Map<String, dynamic> body) async {
    final token = await _accessToken();
    final uri = ElmenuxfaApiConfig.uri('/api/asistente-negocio');
    final headers = <String, String>{
      'content-type': 'application/json',
      'accept': 'application/json',
    };
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    final res = await http
        .post(uri, headers: headers, body: jsonEncode(body))
        .timeout(const Duration(seconds: 45));
    if (res.statusCode >= 400) {
      throw StateError('assistant_http_${res.statusCode}');
    }
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  void _applyChips(Map<String, dynamic>? json) {
    final raw = json?['chips'];
    _chips.clear();
    if (raw is List) {
      for (final item in raw) {
        if (item is! Map) continue;
        final id = (item['id'] as String?)?.trim();
        final label = (item['label'] as String?)?.trim();
        final text = (item['text'] as String?)?.trim();
        if (id == null || label == null || label.isEmpty) continue;
        _chips.add(_Chip(id, label, (text != null && text.isNotEmpty) ? text : label));
      }
    }
    if (_chips.isEmpty) {
      _chips.addAll(const [
        _Chip('menu', '📋 Ver menú', 'ver menú'),
        _Chip('price', '💵 Cambiar precio', 'cambiar precio'),
        _Chip('hours', '🕒 Horario', 'horario'),
        _Chip('online', '🟢 Abrir / Cerrar', 'abrir'),
        _Chip('orders', '🧾 Pedidos', 'pedidos'),
      ]);
    }
  }

  Future<void> _boot({bool force = false}) async {
    if (_busy && !force) return;
    if (kIsWeb) {
      final fromLoc = readBusinessAssistantHandoffFromLocation() ??
          BusinessAssistantScreen.handoffCodeFromUri(Uri.base);
      if (fromLoc != null && fromLoc.isNotEmpty) {
        _handoffCode = fromLoc;
      }
      if (_handoffCode != null && _handoffCode!.isNotEmpty) {
        scrubBusinessAssistantHandoffFromUrl();
      }
    }
    setState(() {
      _busy = true;
      _error = null;
      if (force) _messages.clear();
    });
    try {
      final json = await _post({
        if (_handoffCode != null) 'handoffCode': _handoffCode,
        'handoffAction': 'peek',
      });
      final text = (json?['text'] as String?)?.trim();
      _handoffValid = json?['handoffValid'] == true;
      _recoveryHint = json?['recoveryHint'] == true;
      _needsAuth = json?['needsAuth'] == true || json?['authenticated'] == false;
      final handoffError = (json?['handoffError'] as String?)?.trim();
      if (handoffError != null && handoffError.isNotEmpty) {
        _handoffValid = false;
      }
      final hint = (json?['handoffHint'] as String?)?.trim();
      if (hint != null && hint.isNotEmpty) {
        _pendingHandoffHint = hint;
      }
      _applyChips(json);
      // Avoid duplicate Entrar/Registrarme chips under the inline auth card.
      if (_needsAuth) {
        _chips.removeWhere(
          (c) =>
              c.id == 'auth_login' ||
              c.id == 'auth_register' ||
              c.label.contains('Entrar') ||
              c.label.contains('Registrarme'),
        );
      }
      if (text != null && text.isNotEmpty) {
        final continuity = (!_needsAuth &&
                _pendingHandoffHint != null &&
                _pendingHandoffHint!.isNotEmpty)
            ? '\n\nSigo con tu solicitud: *$_pendingHandoffHint*. ¿La aplicamos?'
            : '';
        _messages.add(
          _ChatMsg(
            role: 'assistant',
            text: '$text$continuity',
            proposal: _Proposal.fromJson(json?['proposal']),
          ),
        );
        if (!_needsAuth &&
            _pendingHandoffHint != null &&
            _input.text.trim().isEmpty) {
          _input.text = _pendingHandoffHint!;
        }
      }
      _booted = true;
    } catch (_) {
      _error = 'No pude conectar con el asistente. Revisa tu conexión.';
      _handoffValid = false;
      _messages.add(
        const _ChatMsg(
          role: 'assistant',
          text:
              'No pude cargar el asistente ahora. Vuelve a Inicio e intenta de nuevo.',
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
      _scrollToEnd();
    }
  }

  Future<void> _consumeHandoffOnce() async {
    if (_handoffConsumed || _handoffCode == null) return;
    try {
      await _post({
        'handoffCode': _handoffCode,
        'handoffAction': 'consume',
      });
      _handoffConsumed = true;
    } catch (_) {
      /* non-fatal */
    }
  }

  Future<void> _sendText(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty || _busy) return;
    setState(() {
      _messages.add(_ChatMsg(role: 'user', text: trimmed));
      _busy = true;
    });
    _scrollToEnd();
    await _consumeHandoffOnce();
    try {
      final history = _messages
          .map((m) => {'role': m.role, 'text': m.text})
          .toList(growable: false);
      final json = await _post({
        'messages': history,
        if (_handoffCode != null) 'handoffCode': _handoffCode,
        'handoffAction': 'peek',
      });
      _ingestAssistant(json);
    } catch (_) {
      _messages.add(
        const _ChatMsg(
          role: 'assistant',
          text: 'Tuve un problema técnico. Intenta de nuevo en un momento.',
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
      _scrollToEnd();
    }
  }

  void _ingestAssistant(Map<String, dynamic>? json) {
    final reply = (json?['text'] as String?)?.trim() ??
        'No tengo una respuesta clara ahora.';
    _needsAuth = json?['needsAuth'] == true || json?['authenticated'] == false;
    _applyChips(json);
    _messages.add(
      _ChatMsg(
        role: 'assistant',
        text: reply,
        proposal: _Proposal.fromJson(json?['proposal']),
      ),
    );
    if (_needsAuth && Supabase.instance.client.auth.currentSession == null) {
      _messages.add(
        const _ChatMsg(
          role: 'assistant',
          text:
              'Inicia sesión abajo para continuar como administrador sin perder esta solicitud.',
        ),
      );
    }
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    _input.clear();
    await _sendText(text);
  }

  Future<void> _confirm(_Proposal proposal, String action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final json = await _post({
        'confirmToken': proposal.confirmToken,
        'confirmAction': action,
        if (_handoffCode != null) 'handoffCode': _handoffCode,
        'handoffAction': 'peek',
      });
      _ingestAssistant(json);
    } catch (_) {
      _messages.add(
        const _ChatMsg(
          role: 'assistant',
          text: 'No pude procesar la confirmación. Intenta de nuevo.',
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
      _scrollToEnd();
    }
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent + 120,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOut,
      );
    });
  }

  void _goHome() {
    Navigator.of(context).pushNamedAndRemoveUntil('/', (_) => false);
  }

  void _openCanonicalLogin() {
    // Same AuthScreen as panel — app root with post-login return to /asistente.
    MerchantDeepLink.rememberNext('/asistente');
    Navigator.of(context).pushNamedAndRemoveUntil('/', (_) => false);
  }

  Widget _buildAuthCard(BuildContext context) {
    return Container(
      width: MediaQuery.sizeOf(context).width * 0.86,
      margin: const EdgeInsets.only(bottom: 10, top: 2),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        color: _bubbleIn,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x1A000000)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            '🔐 Entrar al panel',
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 13,
              color: _headerFg,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Usa el mismo inicio de sesión de tu negocio',
            style: TextStyle(fontSize: 12, color: _headerMuted),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 40,
            child: FilledButton(
              onPressed: _openCanonicalLogin,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF5B21B6),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text(
                'Ir a iniciar sesión',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = Supabase.instance.client.auth.currentSession;
    final showChips =
        _messages.length <= 2 && !_busy && !_messages.any((m) => m.proposal != null);

    return Scaffold(
      key: const Key('business_assistant_screen'),
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _headerBg,
        foregroundColor: _headerFg,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        titleSpacing: 8,
        title: const Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: Color(0xFF00A884),
              child: Text(
                'e',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'elmenuxfa.com',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                      color: _headerFg,
                    ),
                  ),
                  Text(
                    'Asistente del negocio',
                    style: TextStyle(fontSize: 12, color: _headerMuted),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: _goHome,
            child: const Text(
              'Inicio',
              style: TextStyle(color: _headerFg, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
      body: DecoratedBox(
        decoration: const BoxDecoration(
          color: _bg,
          // Soft doodle-like grain (network asset from public site when online).
        ),
        child: Column(
        children: [
          if (_recoveryHint)
            const Material(
              color: Color(0xFFFEF3C7),
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Text(
                  'El acceso de WhatsApp expiró o ya se usó. Puedes seguir administrando con tu sesión.',
                  style: TextStyle(fontSize: 13),
                ),
              ),
            ),
          Expanded(
            child: ListView.builder(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(12, 14, 12, 8),
              itemCount: _messages.length + (_busy ? 1 : 0),
              itemBuilder: (context, i) {
                if (_busy && i == _messages.length) {
                  return Align(
                    alignment: Alignment.centerLeft,
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        color: _bubbleIn,
                        borderRadius: BorderRadius.circular(16)
                            .copyWith(bottomLeft: const Radius.circular(4)),
                      ),
                      child: const Text('…', style: TextStyle(color: Colors.black45)),
                    ),
                  );
                }
                final m = _messages[i];
                final mine = m.role == 'user';
                return Column(
                  crossAxisAlignment:
                      mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                  children: [
                    Align(
                      alignment:
                          mine ? Alignment.centerRight : Alignment.centerLeft,
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 6),
                        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                        constraints: BoxConstraints(
                          maxWidth: MediaQuery.sizeOf(context).width * 0.82,
                        ),
                        decoration: BoxDecoration(
                          color: mine ? _bubbleOut : _bubbleIn,
                          borderRadius: BorderRadius.circular(16).copyWith(
                            bottomRight:
                                mine ? const Radius.circular(4) : null,
                            bottomLeft:
                                mine ? null : const Radius.circular(4),
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.04),
                              blurRadius: 6,
                              offset: const Offset(0, 2),
                            ),
                          ],
                        ),
                        child: Text(
                          m.text,
                          style: const TextStyle(
                            color: Colors.black87,
                            height: 1.4,
                            fontSize: 14.5,
                          ),
                        ),
                      ),
                    ),
                    if (m.proposal != null)
                      Container(
                        width: MediaQuery.sizeOf(context).width * 0.82,
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: const Color(0xFFE5E7EB)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              '✅ Confirmar cambio',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              m.proposal!.summary,
                              style: const TextStyle(
                                fontSize: 12.5,
                                color: Colors.black54,
                              ),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(
                                  child: FilledButton(
                                    onPressed: _busy
                                        ? null
                                        : () => _confirm(m.proposal!, 'apply'),
                                    child: const Text('Confirmar'),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: OutlinedButton(
                                    onPressed: _busy
                                        ? null
                                        : () => _confirm(m.proposal!, 'cancel'),
                                    child: const Text('Cancelar'),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    if ((session == null || _needsAuth) &&
                        i == _messages.length - 1 &&
                        !(_busy && i == _messages.length))
                      _buildAuthCard(context),
                  ],
                );
              },
            ),
          ),
          if (showChips && !_needsAuth)
            SizedBox(
              height: 44,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                itemCount: _chips.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, i) {
                  final chip = _chips[i];
                  return ActionChip(
                    label: Text(chip.label, style: const TextStyle(fontSize: 13)),
                    backgroundColor: Colors.white,
                    side: const BorderSide(color: Color(0x22000000)),
                    onPressed: _busy ? null : () => _sendText(chip.text),
                  );
                },
              ),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            ),
          SafeArea(
            top: false,
            child: Container(
              color: _composerBg,
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                      decoration: InputDecoration(
                        hintText: 'Escríbeme como en WhatsApp…',
                        filled: true,
                        fillColor: Colors.white,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: _busy ? null : _send,
                    style: FilledButton.styleFrom(
                      backgroundColor: _send,
                      foregroundColor: Colors.white,
                      shape: const CircleBorder(),
                      padding: const EdgeInsets.all(12),
                    ),
                    child: const Icon(Icons.send_rounded, size: 20),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
      ),
    );
  }
}
