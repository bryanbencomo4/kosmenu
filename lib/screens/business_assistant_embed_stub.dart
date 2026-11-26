import 'dart:async';

import 'package:flutter/material.dart';

/// Non-web builds keep the native chat.
const bool businessAssistantEmbedSupported = false;

class BusinessAssistantEmbed extends StatelessWidget {
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
  Widget build(BuildContext context) => const SizedBox.shrink();
}
