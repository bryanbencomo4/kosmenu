// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use

import 'dart:async';
import 'dart:html' as html;
import 'dart:ui_web' as ui_web;

import 'package:flutter/material.dart';

/// Whether this build can host the full merchant chat (voice, photos, cards) in an iframe.
const bool businessAssistantEmbedSupported = true;

/// Flutter Web iframe that hosts the full Next.js merchant assistant
/// (`/asistente-negocio?embed=1`) so the merchant keeps one login and never
/// leaves the chat. The Supabase session is handed over via `postMessage`.
class BusinessAssistantEmbed extends StatefulWidget {
  const BusinessAssistantEmbed({
    super.key,
    required this.src,
    required this.accessToken,
    required this.authChanges,
    required this.onHome,
    required this.onNeedAuth,
  });

  final Uri src;
  final String? Function() accessToken;
  final Stream<void> authChanges;
  final VoidCallback onHome;
  final VoidCallback onNeedAuth;

  @override
  State<BusinessAssistantEmbed> createState() => _BusinessAssistantEmbedState();
}

class _BusinessAssistantEmbedState extends State<BusinessAssistantEmbed> {
  late final String _viewType;
  html.IFrameElement? _iframe;
  StreamSubscription<html.MessageEvent>? _messages;
  StreamSubscription<void>? _auth;

  String get _origin => widget.src.origin;

  @override
  void initState() {
    super.initState();
    _viewType =
        'business-assistant-embed-${identityHashCode(this)}-${DateTime.now().microsecondsSinceEpoch}';
    ui_web.platformViewRegistry.registerViewFactory(_viewType, (int viewId) {
      final iframe = html.IFrameElement()
        ..src = widget.src.toString()
        ..style.border = 'none'
        ..style.width = '100%'
        ..style.height = '100%'
        ..allow = 'microphone; camera; clipboard-write; autoplay';
      _iframe = iframe;
      iframe.onLoad.listen((_) => _sendAuth());
      return iframe;
    });
    _messages = html.window.onMessage.listen(_onMessage);
    _auth = widget.authChanges.listen((_) => _sendAuth());
  }

  void _onMessage(html.MessageEvent event) {
    if (event.origin != _origin) return;
    final data = event.data;
    if (data is! Map) return;
    switch (data['type']) {
      case 'elmenuxfa:ready':
        _sendAuth();
      case 'elmenuxfa:need-auth':
        widget.onNeedAuth();
      case 'elmenuxfa:navigate':
        widget.onHome();
    }
  }

  void _sendAuth() {
    final token = widget.accessToken();
    if (token == null || token.isEmpty) return;
    _iframe?.contentWindow?.postMessage(
      {'type': 'elmenuxfa:auth', 'accessToken': token},
      _origin,
    );
  }

  @override
  void dispose() {
    _messages?.cancel();
    _auth?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return HtmlElementView(viewType: _viewType);
  }
}
