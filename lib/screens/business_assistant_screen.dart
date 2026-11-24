import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:kosmenu_app/core/theme/app_theme.dart';
import 'package:kosmenu_app/screens/business_assistant_hash_stub.dart'
    if (dart.library.html) 'package:kosmenu_app/screens/business_assistant_hash_web.dart';
import 'package:kosmenu_app/services/elmenuxfa_api_config.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

/// Conversational business assistant at app.elmenuxfa.com/asistente
/// Uses existing Supabase session + Next /api/asistente-negocio.
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

class _ChatMsg {
  _ChatMsg({required this.role, required this.text});
  final String role;
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
  StreamSubscription<AuthState>? _authSub;

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
        // Re-boot after login to recover pending request (if still within TTL).
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

  Future<void> _boot({bool force = false}) async {
    if (_busy && !force) return;
    // Re-read hash on boot — PathUrlStrategy / Uri.base may omit fragment.
    if (kIsWeb) {
      final fromLoc = readBusinessAssistantHandoffFromLocation() ??
          BusinessAssistantScreen.handoffCodeFromUri(Uri.base);
      if (fromLoc != null && fromLoc.isNotEmpty) {
        _handoffCode = fromLoc;
      }
      // Drop visible ?h= / #h= after capture (continuity kept in memory).
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
      final handoffError = (json?['handoffError'] as String?)?.trim();
      if (handoffError != null && handoffError.isNotEmpty) {
        _handoffValid = false;
      }
      if (text != null && text.isNotEmpty) {
        _messages.add(_ChatMsg(role: 'assistant', text: text));
      }
      _booted = true;
    } catch (e) {
      _error = 'No pude conectar con el asistente. Revisa tu conexión.';
      _handoffValid = false;
      _messages.add(
        _ChatMsg(
          role: 'assistant',
          text:
              'No pude cargar el asistente ahora. Puedes abrir el panel: https://app.elmenuxfa.com/',
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

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _busy) return;
    _input.clear();
    setState(() {
      _messages.add(_ChatMsg(role: 'user', text: text));
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
      final reply = (json?['text'] as String?)?.trim() ??
          'No tengo una respuesta clara ahora.';
      _messages.add(_ChatMsg(role: 'assistant', text: reply));
      final needsAuth = json?['needsAuth'] == true;
      if (needsAuth && Supabase.instance.client.auth.currentSession == null) {
        _messages.add(
          _ChatMsg(
            role: 'assistant',
            text:
                'Inicia sesión abajo para continuar sin perder esta solicitud.',
          ),
        );
      }
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

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent + 80,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _openPanel({bool register = false}) async {
    final uri = Uri.parse(
      register
          ? 'https://app.elmenuxfa.com/?tab=register'
          : 'https://app.elmenuxfa.com/',
    );
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = Supabase.instance.client.auth.currentSession;
    final theme = Theme.of(context);

    return Scaffold(
      key: const Key('business_assistant_screen'),
      backgroundColor: const Color(0xFFF7F4EF),
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: Colors.black87,
        elevation: 0.5,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'elmenuxfa.com',
              style: theme.textTheme.labelSmall?.copyWith(
                color: Colors.black54,
                letterSpacing: 0.4,
              ),
            ),
            const Text(
              'Asistente para negocios',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => _openPanel(), child: const Text('Panel')),
        ],
      ),
      body: Column(
        children: [
          if (_recoveryHint)
            Material(
              color: const Color(0xFFFEF3C7),
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Text(
                  'El acceso de WhatsApp expiró o ya se usó. Escribe de nuevo por WhatsApp para un enlace nuevo; puedes seguir consultando con tu sesión.',
                  style: TextStyle(fontSize: 13),
                ),
              ),
            ),
          if (session == null)
            Material(
              color: const Color(0xFFFFF7ED),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _handoffValid
                            ? 'Solicitud de WhatsApp lista. Inicia sesión para continuar con permisos.'
                            : 'No hay sesión. Entra para consultar tu menú, o registra un negocio.',
                        style: const TextStyle(fontSize: 13),
                      ),
                    ),
                    TextButton(
                      onPressed: () {
                        Navigator.of(context).pushNamedAndRemoveUntil(
                          '/',
                          (_) => false,
                        );
                      },
                      child: const Text('Entrar'),
                    ),
                    TextButton(
                      onPressed: () => _openPanel(register: true),
                      child: const Text('Registrar'),
                    ),
                  ],
                ),
              ),
            ),
          Expanded(
            child: ListView.builder(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
              itemCount: _messages.length + (_busy ? 1 : 0),
              itemBuilder: (context, i) {
                if (_busy && i == _messages.length) {
                  return const Padding(
                    padding: EdgeInsets.all(8),
                    child: Text('…', style: TextStyle(color: Colors.black45)),
                  );
                }
                final m = _messages[i];
                final mine = m.role == 'user';
                return Align(
                  alignment:
                      mine ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    constraints: BoxConstraints(
                      maxWidth: MediaQuery.sizeOf(context).width * 0.86,
                    ),
                    decoration: BoxDecoration(
                      color: mine ? AppColors.accent : Colors.white,
                      borderRadius: BorderRadius.circular(16),
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
                      style: TextStyle(
                        color: mine ? Colors.white : Colors.black87,
                        height: 1.35,
                        fontSize: 14.5,
                      ),
                    ),
                  ),
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
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 12),
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
                        hintText: 'Escribe tu mensaje…',
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
                      shape: const CircleBorder(),
                      padding: const EdgeInsets.all(14),
                    ),
                    child: const Icon(Icons.send_rounded),
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
