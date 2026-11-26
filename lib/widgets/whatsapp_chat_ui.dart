import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/// Shared WhatsApp-grade chat UI for every ElMenúXFA conversational surface
/// on Flutter. Mirrors the Next chat shell (`chat-theme.ts`, `ChatHeader`,
/// `ChatMessageBubble`, `ChatSuggestedReplies`, `ChatComposer`) so the
/// restaurant chatbot, the discovery assistant and the business assistant all
/// look and feel identical.

/// Same tokens as `site/app/v/[id]/_components/chat/chat-theme.ts`.
class ChatPalette {
  const ChatPalette({
    required this.dark,
    required this.bg,
    required this.header,
    required this.headerBorder,
    required this.bubbleIn,
    required this.bubbleOut,
    required this.text,
    required this.textMuted,
    required this.link,
    required this.composer,
    required this.input,
    required this.send,
    required this.sendFg,
    required this.card,
    required this.cardBorder,
  });

  final bool dark;
  final Color bg;
  final Color header;
  final Color headerBorder;
  final Color bubbleIn;
  final Color bubbleOut;
  final Color text;
  final Color textMuted;
  final Color link;
  final Color composer;
  final Color input;
  final Color send;
  final Color sendFg;
  final Color card;
  final Color cardBorder;

  static const light = ChatPalette(
    dark: false,
    bg: Color(0xFFEFEAE2),
    header: Color(0xFFF0F2F5),
    headerBorder: Color(0x0F000000),
    bubbleIn: Color(0xFFFFFFFF),
    bubbleOut: Color(0xFFD9FDD3),
    text: Color(0xFF111B21),
    textMuted: Color(0xFF667781),
    link: Color(0xFF027EB5),
    composer: Color(0xFFF0F2F5),
    input: Color(0xFFFFFFFF),
    send: Color(0xFF00A884),
    sendFg: Color(0xFFFFFFFF),
    card: Color(0xFFFFFFFF),
    cardBorder: Color(0x14000000),
  );

  static const darkTheme = ChatPalette(
    dark: true,
    bg: Color(0xFF0B141A),
    header: Color(0xFF1F2C34),
    headerBorder: Color(0x0FFFFFFF),
    bubbleIn: Color(0xFF202C33),
    bubbleOut: Color(0xFF005C4B),
    text: Color(0xFFE9EDEF),
    textMuted: Color(0xFF8696A0),
    link: Color(0xFF53BDEB),
    composer: Color(0xFF1F2C34),
    input: Color(0xFF2A3942),
    send: Color(0xFF00A884),
    sendFg: Color(0xFFFFFFFF),
    card: Color(0xFF202C33),
    cardBorder: Color(0x14FFFFFF),
  );

  static ChatPalette of({required bool dark}) => dark ? darkTheme : light;
}

/// Max chat column width (Tailwind `max-w-5xl`).
const double kChatMaxWidth = 1024;
const double _kBubbleMaxWidth = 352; // 22rem
const double _kCardMaxWidth = 352;

/// Doodle wallpaper (same asset/opacity/invert as the web shell).
class ChatWallpaper extends StatelessWidget {
  const ChatWallpaper({super.key, required this.palette, required this.child});

  final ChatPalette palette;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final alpha = palette.dark ? 0.07 : 0.055;
    // Light theme inverts the (white) doodle to dark lines, like `filter: invert(1)`.
    final matrix = palette.dark
        ? <double>[
            1, 0, 0, 0, 0, //
            0, 1, 0, 0, 0,
            0, 0, 1, 0, 0,
            0, 0, 0, alpha, 0,
          ]
        : <double>[
            -1, 0, 0, 0, 255, //
            0, -1, 0, 0, 255,
            0, 0, -1, 0, 255,
            0, 0, 0, alpha, 0,
          ];
    return Stack(
      fit: StackFit.expand,
      children: [
        ColoredBox(color: palette.bg),
        IgnorePointer(
          child: DecoratedBox(
            decoration: BoxDecoration(
              image: DecorationImage(
                image: const AssetImage('assets/chat/doodle-pattern.png'),
                repeat: ImageRepeat.repeat,
                alignment: Alignment.topCenter,
                // Source is 540px wide; the web shell renders it at 420px.
                scale: 540 / 420,
                colorFilter: ColorFilter.matrix(matrix),
              ),
            ),
          ),
        ),
        child,
      ],
    );
  }
}

enum ChatHeaderAction { toggleTheme, home }

/// WhatsApp-like top bar (back, avatar, name + status, overflow menu).
class ChatHeaderBar extends StatelessWidget {
  const ChatHeaderBar({
    super.key,
    required this.palette,
    required this.title,
    required this.subtitle,
    required this.onBack,
    required this.onToggleTheme,
    this.onHome,
    this.avatarAsset = 'assets/branding/elmenuxfa-avatar.png',
    this.typing = false,
  });

  final ChatPalette palette;
  final String title;
  final String subtitle;
  final bool typing;
  final String avatarAsset;
  final VoidCallback onBack;
  final VoidCallback onToggleTheme;
  final VoidCallback? onHome;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: palette.header,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: palette.headerBorder)),
        ),
        child: SafeArea(
          bottom: false,
          child: SizedBox(
            height: 56,
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: kChatMaxWidth),
                child: Row(
                  children: [
                    const SizedBox(width: 2),
                    IconButton(
                      onPressed: onBack,
                      tooltip: 'Volver',
                      icon: Icon(Icons.arrow_back, color: palette.text, size: 22),
                    ),
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: palette.input,
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: Image.asset(
                        avatarAsset,
                        fit: BoxFit.cover,
                        cacheWidth: 120,
                        errorBuilder: (_, _, _) => Center(
                          child: Text(
                            title.isEmpty ? 'e' : title[0],
                            style: TextStyle(
                              color: palette.text,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: palette.text,
                              fontSize: 15.5,
                              fontWeight: FontWeight.w600,
                              height: 1.15,
                              letterSpacing: -0.15,
                            ),
                          ),
                          const SizedBox(height: 1),
                          Text(
                            typing ? 'escribiendo…' : subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: palette.textMuted,
                              fontSize: 12,
                              height: 1.15,
                            ),
                          ),
                        ],
                      ),
                    ),
                    PopupMenuButton<ChatHeaderAction>(
                      tooltip: 'Más opciones',
                      icon: Icon(Icons.more_vert, color: palette.text, size: 20),
                      color: palette.card,
                      surfaceTintColor: Colors.transparent,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(color: palette.cardBorder),
                      ),
                      onSelected: (a) {
                        switch (a) {
                          case ChatHeaderAction.toggleTheme:
                            onToggleTheme();
                          case ChatHeaderAction.home:
                            onHome?.call();
                        }
                      },
                      itemBuilder: (_) => [
                        PopupMenuItem(
                          value: ChatHeaderAction.toggleTheme,
                          child: Row(
                            children: [
                              Icon(
                                palette.dark
                                    ? Icons.light_mode_outlined
                                    : Icons.dark_mode_outlined,
                                size: 18,
                                color: palette.text,
                              ),
                              const SizedBox(width: 10),
                              Text(
                                palette.dark ? 'Tema claro' : 'Tema oscuro',
                                style: TextStyle(color: palette.text, fontSize: 14),
                              ),
                            ],
                          ),
                        ),
                        if (onHome != null)
                          PopupMenuItem(
                            value: ChatHeaderAction.home,
                            child: Row(
                              children: [
                                Icon(Icons.home_outlined, size: 18, color: palette.text),
                                const SizedBox(width: 10),
                                Text(
                                  'Ir al inicio',
                                  style: TextStyle(color: palette.text, fontSize: 14),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(width: 2),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// WhatsApp inline formatting: *bold* _italic_ ~strike~ `code` + tappable links.
class ChatRichText extends StatefulWidget {
  const ChatRichText({
    super.key,
    required this.text,
    required this.palette,
    this.fontSize = 14.5,
  });

  final String text;
  final ChatPalette palette;
  final double fontSize;

  @override
  State<ChatRichText> createState() => _ChatRichTextState();
}

class _ChatRichTextState extends State<ChatRichText> {
  final _recognizers = <TapGestureRecognizer>[];

  @override
  void dispose() {
    _disposeRecognizers();
    super.dispose();
  }

  void _disposeRecognizers() {
    for (final r in _recognizers) {
      r.dispose();
    }
    _recognizers.clear();
  }

  static final _urlRe = RegExp(
    r'(?:https?:\/\/|www\.)[^\s<>"]+',
    caseSensitive: false,
  );
  static final _emailRe = RegExp(
    r'\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b',
    caseSensitive: false,
  );

  static bool _isOpenBoundary(String? prev) =>
      prev == null || RegExp(r'''[\s(\[{>¡¿"'“‘,.;:!?-]''').hasMatch(prev);

  static bool _isCloseBoundary(String? next) =>
      next == null || RegExp(r'''[\s)\]}<,.;:!?"'”’-]''').hasMatch(next);

  static int _findClose(String text, String marker, int start) {
    for (var j = start + 1; j < text.length; j++) {
      final ch = text[j];
      if (ch == '\n') return -1;
      if (ch != marker) continue;
      if (j == start + 1) return -1;
      if (RegExp(r'\s').hasMatch(text[start + 1]) ||
          RegExp(r'\s').hasMatch(text[j - 1])) {
        return -1;
      }
      final next = j + 1 < text.length ? text[j + 1] : null;
      if (!_isCloseBoundary(next)) continue;
      return j;
    }
    return -1;
  }

  List<InlineSpan> _inline(String text, TextStyle base, int depth) {
    final out = <InlineSpan>[];
    final buf = StringBuffer();
    void flush() {
      if (buf.isNotEmpty) {
        out.add(TextSpan(text: buf.toString(), style: base));
        buf.clear();
      }
    }

    var i = 0;
    while (i < text.length) {
      final ch = text[i];
      if (ch == '*' || ch == '_' || ch == '~' || ch == '`') {
        final prev = i > 0 ? text[i - 1] : null;
        if (_isOpenBoundary(prev)) {
          final close = _findClose(text, ch, i);
          if (close > i) {
            final inner = text.substring(i + 1, close);
            flush();
            switch (ch) {
              case '*':
                final s = base.copyWith(fontWeight: FontWeight.w700);
                out.addAll(depth >= 2 ? [TextSpan(text: inner, style: s)] : _inline(inner, s, depth + 1));
              case '_':
                final s = base.copyWith(fontStyle: FontStyle.italic);
                out.addAll(depth >= 2 ? [TextSpan(text: inner, style: s)] : _inline(inner, s, depth + 1));
              case '~':
                final s = base.copyWith(decoration: TextDecoration.lineThrough);
                out.addAll(depth >= 2 ? [TextSpan(text: inner, style: s)] : _inline(inner, s, depth + 1));
              default:
                out.add(
                  TextSpan(
                    text: inner,
                    style: base.copyWith(
                      fontFamily: 'monospace',
                      backgroundColor: widget.palette.textMuted.withValues(alpha: 0.14),
                    ),
                  ),
                );
            }
            i = close + 1;
            continue;
          }
        }
      }
      buf.write(ch);
      i += 1;
    }
    flush();
    return out;
  }

  InlineSpan _link(String raw, String href, TextStyle base) {
    final recognizer = TapGestureRecognizer()
      ..onTap = () {
        final uri = Uri.tryParse(href);
        if (uri != null) {
          launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      };
    _recognizers.add(recognizer);
    return TextSpan(
      text: raw,
      recognizer: recognizer,
      style: base.copyWith(
        color: widget.palette.link,
        decoration: TextDecoration.underline,
        decorationColor: widget.palette.link,
      ),
    );
  }

  List<InlineSpan> _line(String line, TextStyle base) {
    final matches = <({int start, int end, String raw, String href})>[];
    for (final m in _urlRe.allMatches(line)) {
      var raw = m.group(0)!;
      // Trailing punctuation belongs to the sentence, not the link.
      while (raw.isNotEmpty && '.,;:!?)'.contains(raw[raw.length - 1])) {
        raw = raw.substring(0, raw.length - 1);
      }
      if (raw.isEmpty) continue;
      final href = raw.toLowerCase().startsWith('http') ? raw : 'https://$raw';
      matches.add((start: m.start, end: m.start + raw.length, raw: raw, href: href));
    }
    for (final m in _emailRe.allMatches(line)) {
      if (matches.any((x) => m.start < x.end && m.end > x.start)) continue;
      final raw = m.group(0)!;
      matches.add((start: m.start, end: m.end, raw: raw, href: 'mailto:$raw'));
    }
    matches.sort((a, b) => a.start.compareTo(b.start));
    if (matches.isEmpty) return _inline(line, base, 0);
    final spans = <InlineSpan>[];
    var last = 0;
    for (final m in matches) {
      if (m.start < last) continue;
      if (m.start > last) spans.addAll(_inline(line.substring(last, m.start), base, 0));
      spans.add(_link(m.raw, m.href, base));
      last = m.end;
    }
    if (last < line.length) spans.addAll(_inline(line.substring(last), base, 0));
    return spans;
  }

  @override
  Widget build(BuildContext context) {
    _disposeRecognizers();
    final base = TextStyle(
      color: widget.palette.text,
      fontSize: widget.fontSize,
      height: 1.4,
    );
    // Gemini sometimes emits **bold**; WhatsApp style expects *bold*.
    final normalized = widget.text
        .replaceAll(RegExp(r'\r\n?'), '\n')
        .replaceAllMapped(RegExp(r'\*\*([^*\n]+)\*\*'), (m) => '*${m.group(1)}*');
    final paragraphs = normalized.split(RegExp(r'\n{2,}'));
    final spans = <InlineSpan>[];
    for (var pi = 0; pi < paragraphs.length; pi++) {
      if (pi > 0) spans.add(TextSpan(text: '\n\n', style: base.copyWith(fontSize: 6, height: 1)));
      final lines = paragraphs[pi].split('\n');
      for (var li = 0; li < lines.length; li++) {
        if (li > 0) spans.add(TextSpan(text: '\n', style: base));
        spans.addAll(_line(lines[li], base));
      }
    }
    return Text.rich(TextSpan(children: spans), textWidthBasis: TextWidthBasis.longestLine);
  }
}

String formatChatTime(DateTime t) {
  final h = t.hour.toString().padLeft(2, '0');
  final m = t.minute.toString().padLeft(2, '0');
  return '$h:$m';
}

/// Text bubble with WhatsApp radii, time and (outgoing) read ticks.
class ChatBubble extends StatelessWidget {
  const ChatBubble({
    super.key,
    required this.palette,
    required this.text,
    required this.mine,
    required this.time,
    this.groupedWithPrev = false,
    this.children = const [],
  });

  final ChatPalette palette;
  final String text;
  final bool mine;
  final DateTime time;
  final bool groupedWithPrev;

  /// Cards rendered right below the bubble (proposal, auth…).
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    const big = Radius.circular(16);
    const small = Radius.circular(6);
    final radius = mine
        ? BorderRadius.only(
            topLeft: big,
            topRight: groupedWithPrev ? small : big,
            bottomLeft: big,
            bottomRight: small,
          )
        : BorderRadius.only(
            topLeft: groupedWithPrev ? small : big,
            topRight: big,
            bottomLeft: small,
            bottomRight: big,
          );
    final maxW = math.min(MediaQuery.sizeOf(context).width * 0.85, _kBubbleMaxWidth);
    return Padding(
      padding: EdgeInsets.fromLTRB(12, groupedWithPrev ? 2 : 6, 12, 0),
      child: Column(
        crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          if (text.trim().isNotEmpty)
            ConstrainedBox(
              constraints: BoxConstraints(maxWidth: maxW),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: mine ? palette.bubbleOut : palette.bubbleIn,
                  borderRadius: radius,
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x0D000000),
                      blurRadius: 2,
                      offset: Offset(0, 1),
                    ),
                  ],
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 6, 10, 6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Align(
                        alignment: Alignment.centerLeft,
                        child: ChatRichText(text: text, palette: palette),
                      ),
                      const SizedBox(height: 2),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            formatChatTime(time),
                            style: TextStyle(
                              color: palette.textMuted,
                              fontSize: 10.5,
                              height: 1,
                              fontFeatures: const [FontFeature.tabularFigures()],
                            ),
                          ),
                          if (mine) ...[
                            const SizedBox(width: 3),
                            const Icon(Icons.done_all, size: 15, color: Color(0xFF53BDEB)),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          for (final c in children)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxWidth: math.min(MediaQuery.sizeOf(context).width * 0.92, _kCardMaxWidth),
                ),
                child: c,
              ),
            ),
        ],
      ),
    );
  }
}

/// Card used under bubbles (proposals, login prompt…).
class ChatCard extends StatelessWidget {
  const ChatCard({super.key, required this.palette, required this.child});

  final ChatPalette palette;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: palette.cardBorder),
        boxShadow: const [
          BoxShadow(color: Color(0x0D000000), blurRadius: 2, offset: Offset(0, 1)),
        ],
      ),
      child: Padding(padding: const EdgeInsets.all(12), child: child),
    );
  }
}

/// WhatsApp green action button used in cards.
class ChatCardButton extends StatelessWidget {
  const ChatCardButton({
    super.key,
    required this.palette,
    required this.label,
    required this.onPressed,
    this.primary = true,
  });

  final ChatPalette palette;
  final String label;
  final VoidCallback? onPressed;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    final fg = primary ? palette.sendFg : palette.text;
    return Material(
      color: primary ? palette.send : palette.input,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: primary ? BorderSide.none : BorderSide(color: palette.cardBorder),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onPressed,
        child: Opacity(
          opacity: onPressed == null ? 0.5 : 1,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            child: Center(
              child: Text(
                label,
                style: TextStyle(color: fg, fontSize: 12.5, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Three bouncing dots inside an incoming bubble.
class ChatTypingBubble extends StatefulWidget {
  const ChatTypingBubble({super.key, required this.palette});

  final ChatPalette palette;

  @override
  State<ChatTypingBubble> createState() => _ChatTypingBubbleState();
}

class _ChatTypingBubbleState extends State<ChatTypingBubble>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 6, 12, 0),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Semantics(
          label: 'El asistente está escribiendo',
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: widget.palette.bubbleIn,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
                bottomRight: Radius.circular(16),
                bottomLeft: Radius.circular(6),
              ),
              boxShadow: const [
                BoxShadow(color: Color(0x0D000000), blurRadius: 2, offset: Offset(0, 1)),
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: AnimatedBuilder(
                animation: _c,
                builder: (_, _) {
                  return Row(
                    mainAxisSize: MainAxisSize.min,
                    children: List.generate(3, (i) {
                      final phase = (_c.value - i * 0.12) % 1.0;
                      final lift = phase < 0.5 ? math.sin(phase * 2 * math.pi) * 4 : 0.0;
                      return Padding(
                        padding: EdgeInsets.only(right: i == 2 ? 0 : 6),
                        child: Transform.translate(
                          offset: Offset(0, -lift),
                          child: Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: widget.palette.textMuted,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ),
                      );
                    }),
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Horizontal quick-reply pills (full labels, never truncated).
class ChatSuggestedChips extends StatelessWidget {
  const ChatSuggestedChips({
    super.key,
    required this.palette,
    required this.labels,
    required this.onPick,
    this.enabled = true,
  });

  final ChatPalette palette;
  final List<String> labels;
  final void Function(int index) onPick;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    if (labels.isEmpty) return const SizedBox.shrink();
    return ColoredBox(
      color: palette.composer,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: kChatMaxWidth),
          child: SizedBox(
            height: 46,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
              itemCount: labels.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                return Material(
                  color: palette.card,
                  elevation: 0.5,
                  shadowColor: const Color(0x33000000),
                  shape: StadiumBorder(side: BorderSide(color: palette.cardBorder)),
                  child: InkWell(
                    customBorder: const StadiumBorder(),
                    onTap: enabled ? () => onPick(i) : null,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      child: Center(
                        child: Text(
                          labels[i],
                          maxLines: 1,
                          softWrap: false,
                          style: TextStyle(
                            color: palette.text,
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

const _emojiSet = <String>[
  '😀', '😃', '😄', '😁', '😅', '😂', '🙂', '😉', '😍', '🥰',
  '😘', '😜', '🤔', '😏', '😌', '😔', '😢', '😭', '😤', '🤯',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '✌️', '👋', '❤️', '🔥',
  '✨', '⭐', '🍕', '🍔', '🌮', '🍟', '🥤', '🍺', '🍰', '🍦',
  '✅', '❌', '💯', '🎉', '🏠', '🚗', '⏰', '📍',
];

/// WhatsApp composer: emoji + text pill and a round green send button.
class ChatComposerBar extends StatefulWidget {
  const ChatComposerBar({
    super.key,
    required this.palette,
    required this.controller,
    required this.onSend,
    this.busy = false,
    this.placeholder = 'Escribe un mensaje',
  });

  final ChatPalette palette;
  final TextEditingController controller;
  final VoidCallback onSend;
  final bool busy;
  final String placeholder;

  @override
  State<ChatComposerBar> createState() => _ChatComposerBarState();
}

class _ChatComposerBarState extends State<ChatComposerBar> {
  var _emojiOpen = false;
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onText);
    _focus.addListener(() {
      if (_focus.hasFocus && _emojiOpen) setState(() => _emojiOpen = false);
    });
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onText);
    _focus.dispose();
    super.dispose();
  }

  void _onText() => setState(() {});

  void _insertEmoji(String emoji) {
    final c = widget.controller;
    final sel = c.selection;
    final text = c.text;
    final start = sel.isValid ? sel.start : text.length;
    final end = sel.isValid ? sel.end : text.length;
    final next = text.replaceRange(start, end, emoji);
    c.value = TextEditingValue(
      text: next,
      selection: TextSelection.collapsed(offset: start + emoji.length),
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.palette;
    final canSend = !widget.busy && widget.controller.text.trim().isNotEmpty;
    return ColoredBox(
      color: p.composer,
      child: SafeArea(
        top: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: kChatMaxWidth),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(6, 4, 6, 6),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_emojiOpen)
                    Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: p.card,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: p.cardBorder),
                      ),
                      constraints: const BoxConstraints(maxHeight: 176),
                      child: GridView.count(
                        shrinkWrap: true,
                        crossAxisCount: 8,
                        children: [
                          for (final e in _emojiSet)
                            InkWell(
                              borderRadius: BorderRadius.circular(12),
                              onTap: () => _insertEmoji(e),
                              child: Center(
                                child: Text(e, style: const TextStyle(fontSize: 22)),
                              ),
                            ),
                        ],
                      ),
                    ),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: p.input,
                            borderRadius: BorderRadius.circular(24),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              IconButton(
                                visualDensity: VisualDensity.compact,
                                tooltip: 'Emojis',
                                onPressed: widget.busy
                                    ? null
                                    : () {
                                        FocusScope.of(context).unfocus();
                                        setState(() => _emojiOpen = !_emojiOpen);
                                      },
                                icon: Icon(
                                  _emojiOpen
                                      ? Icons.keyboard_outlined
                                      : Icons.sentiment_satisfied_alt_outlined,
                                  color: p.textMuted,
                                  size: 22,
                                ),
                              ),
                              Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 4),
                                  child: TextField(
                                    key: const Key('business_assistant_input'),
                                    controller: widget.controller,
                                    focusNode: _focus,
                                    readOnly: widget.busy,
                                    minLines: 1,
                                    maxLines: 5,
                                    cursorColor: p.send,
                                    textInputAction: TextInputAction.send,
                                    onSubmitted: (_) {
                                      if (canSend) widget.onSend();
                                    },
                                    style: TextStyle(
                                      color: p.text,
                                      fontSize: 15,
                                      height: 1.33,
                                    ),
                                    decoration: InputDecoration(
                                      isDense: true,
                                      hintText: widget.placeholder,
                                      hintStyle: TextStyle(color: p.textMuted, fontSize: 15),
                                      border: InputBorder.none,
                                      enabledBorder: InputBorder.none,
                                      focusedBorder: InputBorder.none,
                                      filled: false,
                                      contentPadding: const EdgeInsets.symmetric(vertical: 8),
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 12),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Opacity(
                        opacity: canSend || widget.busy ? 1 : 0.4,
                        child: Material(
                          color: p.send,
                          shape: const CircleBorder(),
                          elevation: 1,
                          shadowColor: const Color(0x33000000),
                          child: InkWell(
                            customBorder: const CircleBorder(),
                            onTap: canSend ? widget.onSend : null,
                            child: SizedBox(
                              width: 44,
                              height: 44,
                              child: Center(
                                child: widget.busy
                                    ? SizedBox(
                                        width: 16,
                                        height: 16,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: p.sendFg,
                                        ),
                                      )
                                    : Icon(Icons.send_rounded, size: 20, color: p.sendFg),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
