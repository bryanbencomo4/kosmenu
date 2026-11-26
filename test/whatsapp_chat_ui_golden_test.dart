import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/widgets/whatsapp_chat_ui.dart';

Future<void> _loadFont() async {
  final data = await File('assets/fonts/Manrope-Regular.ttf').readAsBytes();
  final loader = FontLoader('Manrope')
    ..addFont(Future.value(ByteData.view(data.buffer)));
  await loader.load();
}

Widget _harness(ChatPalette p, TextEditingController c) {
  final now = DateTime(2026, 11, 26, 1, 40);
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: ThemeData(fontFamily: 'Manrope'),
    home: Scaffold(
      backgroundColor: p.bg,
      body: Column(
        children: [
          ChatHeaderBar(
            palette: p,
            title: 'elmenuxfa.com',
            subtitle: 'Asistente del negocio',
            onBack: () {},
            onToggleTheme: () {},
            onHome: () {},
          ),
          Expanded(
            child: ChatWallpaper(
              palette: p,
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 8),
                children: [
                  ChatBubble(
                    palette: p,
                    mine: false,
                    time: now,
                    text:
                        '¡Hola de nuevo! 🙌 Seguimos con *el cambio de tasa*.\n\nDime cómo lo quieres y te lo preparo; tú solo confirmas aquí en el chat ✅',
                  ),
                  ChatBubble(
                    palette: p,
                    mine: true,
                    time: now,
                    text: 'necesito cambiar la tasa',
                  ),
                  ChatBubble(
                    palette: p,
                    mine: false,
                    time: now,
                    text:
                        'Listo, _preparé_ el cambio. Mira https://app.elmenuxfa.com/asistente y ~no~ lo apliques todavía.',
                    children: [
                      ChatCard(
                        palette: p,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '✅ Confirmar cambio',
                              style: TextStyle(
                                color: p.text,
                                fontWeight: FontWeight.w600,
                                fontSize: 13,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Tasa BCV: 45,50',
                              style: TextStyle(color: p.textMuted, fontSize: 12),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(
                                  child: ChatCardButton(
                                    palette: p,
                                    label: 'Confirmar',
                                    onPressed: () {},
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: ChatCardButton(
                                    palette: p,
                                    primary: false,
                                    label: 'Cancelar',
                                    onPressed: () {},
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  ChatTypingBubble(palette: p),
                ],
              ),
            ),
          ),
          ChatSuggestedChips(
            palette: p,
            labels: const [
              '📋 Ver menú',
              '💵 Cambiar precio',
              '🕒 Horario',
              '🟢 Abrir / Cerrar',
              '🧾 Pedidos',
            ],
            onPick: (_) {},
          ),
          ChatComposerBar(
            palette: p,
            controller: c,
            onSend: () {},
            placeholder: 'Escríbeme como en WhatsApp…',
          ),
        ],
      ),
    ),
  );
}

void main() {
  setUpAll(_loadFont);

  for (final dark in [false, true]) {
    testWidgets('whatsapp chat ui ${dark ? 'dark' : 'light'}', (tester) async {
      tester.view.physicalSize = const Size(412 * 2, 860 * 2);
      tester.view.devicePixelRatio = 2;
      addTearDown(tester.view.reset);
      final c = TextEditingController();
      await tester.pumpWidget(_harness(ChatPalette.of(dark: dark), c));
      await tester.runAsync(() async {
        final ctx = tester.element(find.byType(Scaffold));
        await precacheImage(const AssetImage('assets/chat/doodle-pattern.png'), ctx);
        await precacheImage(const AssetImage('assets/branding/elmenuxfa-avatar.png'), ctx);
      });
      await tester.pump(const Duration(milliseconds: 300));
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('goldens/whatsapp_chat_ui_${dark ? 'dark' : 'light'}.png'),
      );
      // Typing enables send.
      await tester.enterText(find.byType(TextField), 'hola');
      await tester.pump();
      expect(find.byIcon(Icons.send_rounded), findsOneWidget);
    });
  }
}
