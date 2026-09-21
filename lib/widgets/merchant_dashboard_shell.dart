import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/widgets/merchant_dashboard_home.dart';

class MerchantShellScope extends InheritedWidget {
  const MerchantShellScope({
    super.key,
    required this.selected,
    required this.onSelect,
    required this.onResetContent,
    required super.child,
  });

  final MerchantNavDestination selected;
  final ValueChanged<MerchantNavDestination> onSelect;
  final VoidCallback onResetContent;

  static MerchantShellScope? maybeOf(BuildContext context) {
    return context.getInheritedWidgetOfExactType<MerchantShellScope>();
  }

  static MerchantShellScope of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<MerchantShellScope>();
    assert(scope != null, 'MerchantShellScope not found');
    return scope!;
  }

  void goHome({bool resetContent = false}) {
    onSelect(MerchantNavDestination.home);
    if (resetContent) {
      onResetContent();
    }
  }

  @override
  bool updateShouldNotify(MerchantShellScope oldWidget) {
    return selected != oldWidget.selected;
  }
}

PageRoute<T> merchantShellRoute<T>(Widget page) {
  return PageRouteBuilder<T>(
    pageBuilder: (context, animation, secondaryAnimation) => page,
    transitionDuration: const Duration(milliseconds: 240),
    reverseTransitionDuration: const Duration(milliseconds: 180),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      final curved = CurvedAnimation(
        parent: animation,
        curve: Curves.easeOutCubic,
        reverseCurve: Curves.easeInCubic,
      );
      return FadeTransition(
        opacity: curved,
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0.018, 0),
            end: Offset.zero,
          ).animate(curved),
          child: child,
        ),
      );
    },
  );
}

class MerchantShellHeader extends StatelessWidget {
  const MerchantShellHeader({
    super.key,
    required this.title,
    required this.commerceName,
    required this.businessOnline,
    required this.isUpdatingOnline,
    required this.onToggleOnline,
    required this.onOpenNotifications,
    required this.onOpenProfile,
    this.onOpenMenu,
    this.onScanWithAi,
    this.showMenuButton = false,
  });

  final String title;
  final String commerceName;
  final bool businessOnline;
  final bool isUpdatingOnline;
  final ValueChanged<bool> onToggleOnline;
  final VoidCallback onOpenNotifications;
  final VoidCallback onOpenProfile;
  final VoidCallback? onOpenMenu;
  final VoidCallback? onScanWithAi;
  final bool showMenuButton;

  static const _text = Color(0xFF11183C);

  @override
  Widget build(BuildContext context) {
    final isMobile = MediaQuery.sizeOf(context).width < 720;
    final name = commerceName.trim().isEmpty ? 'Negocio' : commerceName.trim();
    final initials = _initials(name);

    return Container(
      padding: EdgeInsets.fromLTRB(isMobile ? 8 : 20, 12, 16, 12),
      decoration: const BoxDecoration(
        color: Color(0xFFF8F7FC),
        border: Border(bottom: BorderSide(color: Color(0xFFEEEFF5))),
      ),
      child: Row(
        children: [
          if (showMenuButton)
            IconButton(
              tooltip: 'Menú',
              onPressed: onOpenMenu,
              icon: const Icon(Icons.menu_rounded),
            ),
          Expanded(
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.poppins(
                fontSize: isMobile ? 18 : 20,
                fontWeight: FontWeight.w800,
                color: _text,
              ),
            ),
          ),
          PopupMenuButton<bool>(
            enabled: !isUpdatingOnline,
            tooltip: 'Estado del negocio',
            onSelected: onToggleOnline,
            itemBuilder: (context) => const [
              PopupMenuItem(value: true, child: Text('Negocio abierto')),
              PopupMenuItem(value: false, child: Text('Negocio pausado')),
            ],
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: const Color(0xFFE5E7EB)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: businessOnline
                          ? const Color(0xFF16A34A)
                          : const Color(0xFFEF4444),
                      shape: BoxShape.circle,
                    ),
                  ),
                  if (!isMobile) ...[
                    const SizedBox(width: 8),
                    Text(
                      businessOnline ? 'Negocio abierto' : 'Negocio pausado',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: _text,
                      ),
                    ),
                    const Icon(Icons.keyboard_arrow_down_rounded, size: 18),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          if (onScanWithAi != null) ...[
            Material(
              color: Colors.white,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: onScanWithAi,
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: const Color(0xFFE5E7EB)),
                  ),
                  child: const Icon(
                    Icons.auto_awesome_rounded,
                    size: 20,
                    color: _text,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
          ],
          Material(
            color: Colors.white,
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: onOpenNotifications,
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0xFFE5E7EB)),
                ),
                child: const Icon(
                  Icons.notifications_none_rounded,
                  size: 20,
                  color: _text,
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          InkWell(
            onTap: onOpenProfile,
            borderRadius: BorderRadius.circular(999),
            child: Container(
              padding: const EdgeInsets.fromLTRB(6, 5, 10, 5),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: const Color(0xFFE5E7EB)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircleAvatar(
                    radius: 14,
                    backgroundColor: const Color(0xFF6D28D9),
                    child: Text(
                      initials,
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  if (!isMobile) ...[
                    const SizedBox(width: 8),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 140),
                      child: Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: _text,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _initials(String name) {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'N';
    if (parts.length == 1) {
      return parts.first.substring(0, 1).toUpperCase();
    }
    return (parts[0].substring(0, 1) + parts[1].substring(0, 1)).toUpperCase();
  }
}

class MerchantShellSwitcher extends StatelessWidget {
  const MerchantShellSwitcher({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 240),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      transitionBuilder: (child, animation) {
        return FadeTransition(
          opacity: animation,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0.018, 0),
              end: Offset.zero,
            ).animate(animation),
            child: child,
          ),
        );
      },
      child: child,
    );
  }
}
