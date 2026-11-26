import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:kosmenu_app/screens/business_assistant_hash_stub.dart'
    if (dart.library.html) 'package:kosmenu_app/screens/business_assistant_hash_web.dart';
import 'package:kosmenu_app/services/elmenuxfa_api_config.dart';
import 'package:kosmenu_app/services/merchant_deep_link.dart';
import 'package:kosmenu_app/widgets/whatsapp_chat_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
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
  _ChatMsg({
    required this.role,
    required this.text,
    this.proposal,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  final String role;
  final String text;
  final _Proposal? proposal;
  final DateTime createdAt;
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

  static const _themePrefKey = 'elmenuxfa:chat-theme-v1';

  /// `null` = follow the system theme until the user picks one.
  bool? _darkOverride;
  String? _pendingHandoffHint;
  String? _pendingHandoffDraft;

  ChatPalette _palette(BuildContext context) {
    final dark = _darkOverride ??
        (MediaQuery.platformBrightnessOf(context) == Brightness.dark);
    return ChatPalette.of(dark: dark);
  }

  Future<void> _loadTheme() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final v = prefs.getString(_themePrefKey);
      if (!mounted) return;
      if (v == 'dark' || v == 'light') {
        setState(() => _darkOverride = v == 'dark');
      }
    } catch (_) {
      /* ignore */
    }
  }

  Future<void> _toggleTheme() async {
    final nextDark = !_palette(context).dark;
    setState(() => _darkOverride = nextDark);
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_themePrefKey, nextDark ? 'dark' : 'light');
    } catch (_) {
      /* ignore */
    }
  }

  @override
  void initState() {
    super.initState();
    _loadTheme();
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
      final draft = (json?['handoffDraft'] as String?)?.trim();
      if (draft != null && draft.isNotEmpty) {
        _pendingHandoffDraft = draft;
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
        // The server text already says "Seguimos con …" / "Retomamos …"; never repeat it.
        final alreadyContinues =
            RegExp(r'\b(seguimos con|retomamos)\b', caseSensitive: false)
                .hasMatch(text);
        final continuity = (!_needsAuth &&
                !alreadyContinues &&
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
        final prefill = _pendingHandoffDraft ?? _pendingHandoffHint;
        if (!_needsAuth && prefill != null && _input.text.trim().isEmpty) {
          _input.text = prefill;
        }
      }
      _booted = true;
    } catch (_) {
      _error = 'No pude conectar con el asistente. Revisa tu conexión.';
      _handoffValid = false;
      _messages.add(
        _ChatMsg(
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
        _ChatMsg(
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
        _ChatMsg(
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
        _ChatMsg(
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

  Widget _buildAuthCard(BuildContext context, ChatPalette p) {
    return ChatCard(
      palette: p,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '🔐 Entrar al panel',
            style: TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 13,
              color: p.text,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Usa el mismo inicio de sesión de tu negocio',
            style: TextStyle(fontSize: 12, color: p.textMuted),
          ),
          const SizedBox(height: 10),
          ChatCardButton(
            palette: p,
            label: 'Ir a iniciar sesión',
            onPressed: _openCanonicalLogin,
          ),
        ],
      ),
    );
  }

  Widget _buildProposalCard(BuildContext context, ChatPalette p, _Proposal proposal) {
    return ChatCard(
      palette: p,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '✅ Confirmar cambio',
            style: TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 13,
              color: p.text,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            proposal.summary,
            style: TextStyle(fontSize: 12, color: p.textMuted),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: ChatCardButton(
                  palette: p,
                  label: 'Confirmar',
                  onPressed: _busy ? null : () => _confirm(proposal, 'apply'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ChatCardButton(
                  palette: p,
                  primary: false,
                  label: 'Cancelar',
                  onPressed: _busy ? null : () => _confirm(proposal, 'cancel'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = _palette(context);
    final session = Supabase.instance.client.auth.currentSession;
    final showChips =
        _messages.length <= 2 && !_busy && !_messages.any((m) => m.proposal != null);
    final chipsVisible = showChips && !_needsAuth && _chips.isNotEmpty;

    return Scaffold(
      key: const Key('business_assistant_screen'),
      backgroundColor: p.bg,
      resizeToAvoidBottomInset: true,
      body: Column(
        children: [
          ChatHeaderBar(
            palette: p,
            title: 'elmenuxfa.com',
            subtitle: 'Asistente del negocio',
            typing: _busy,
            onBack: _goHome,
            onHome: _goHome,
            onToggleTheme: _toggleTheme,
          ),
          Expanded(
            child: ChatWallpaper(
              palette: p,
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: kChatMaxWidth),
                  child: Column(
                    children: [
                      if (_recoveryHint)
                        Container(
                          width: double.infinity,
                          margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: p.dark
                                ? const Color(0xFF3B3320)
                                : const Color(0xFFFFF3C4),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            'El acceso de WhatsApp expiró o ya se usó. Puedes seguir administrando con tu sesión.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 12,
                              color: p.dark
                                  ? const Color(0xFFFFE9A8)
                                  : const Color(0xFF54410C),
                            ),
                          ),
                        ),
                      Expanded(
                        child: ListView.builder(
                          controller: _scroll,
                          padding: const EdgeInsets.fromLTRB(0, 8, 0, 8),
                          itemCount: _messages.length + (_busy ? 1 : 0),
                          itemBuilder: (context, i) {
                            if (_busy && i == _messages.length) {
                              return ChatTypingBubble(palette: p);
                            }
                            final m = _messages[i];
                            final mine = m.role == 'user';
                            final groupedWithPrev =
                                i > 0 && _messages[i - 1].role == m.role;
                            final isLast = i == _messages.length - 1;
                            final cards = <Widget>[
                              if (m.proposal != null)
                                _buildProposalCard(context, p, m.proposal!),
                              if ((session == null || _needsAuth) &&
                                  isLast &&
                                  !_busy)
                                _buildAuthCard(context, p),
                            ];
                            return ChatBubble(
                              palette: p,
                              text: m.text,
                              mine: mine,
                              time: m.createdAt,
                              groupedWithPrev: groupedWithPrev,
                              children: cards,
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (chipsVisible)
            ChatSuggestedChips(
              palette: p,
              labels: [for (final c in _chips) c.label],
              enabled: !_busy,
              onPick: (i) => _sendText(_chips[i].text),
            ),
          if (_error != null)
            ColoredBox(
              color: p.composer,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    _error!,
                    style: const TextStyle(color: Color(0xFFE11D48), fontSize: 12),
                  ),
                ),
              ),
            ),
          ChatComposerBar(
            palette: p,
            controller: _input,
            busy: _busy,
            placeholder: 'Escríbeme como en WhatsApp…',
            onSend: _send,
          ),
        ],
      ),
    );
  }
}
