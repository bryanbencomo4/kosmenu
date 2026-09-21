import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:pretty_qr_code/pretty_qr_code.dart';
import 'package:kosmenu_app/services/merchant_session.dart';

enum MerchantNavDestination {
  home,
  orders,
  digitalMenu,
  products,
  clients,
  stats,
  marketing,
  settings,
  plan,
}

extension MerchantNavDestinationUi on MerchantNavDestination {
  String get title {
    switch (this) {
      case MerchantNavDestination.home:
        return 'Inicio';
      case MerchantNavDestination.orders:
        return 'Pedidos';
      case MerchantNavDestination.digitalMenu:
        return 'Menú digital';
      case MerchantNavDestination.products:
        return 'Productos';
      case MerchantNavDestination.clients:
        return 'Clientes';
      case MerchantNavDestination.stats:
        return 'Estadísticas';
      case MerchantNavDestination.marketing:
        return 'Herramientas de venta';
      case MerchantNavDestination.settings:
        return 'Configuración';
      case MerchantNavDestination.plan:
        return 'Plan y facturación';
    }
  }
}

class MerchantProfileStep {
  const MerchantProfileStep({
    required this.label,
    required this.done,
    required this.onTap,
  });

  final String label;
  final bool done;
  final VoidCallback onTap;
}

class MerchantTopProduct {
  const MerchantTopProduct({
    required this.name,
    required this.quantity,
    this.imageUrl,
  });

  final String name;
  final int quantity;
  final String? imageUrl;
}

class MerchantDashboardSidebar extends StatelessWidget {
  const MerchantDashboardSidebar({
    super.key,
    required this.selected,
    required this.planName,
    required this.onSelect,
    this.collapsed = false,
    this.onToggleCollapsed,
    this.compact = false,
  });

  static const double expandedWidth = 248;
  static const double collapsedWidth = 80;

  final MerchantNavDestination selected;
  final String planName;
  final ValueChanged<MerchantNavDestination> onSelect;
  final bool collapsed;
  final VoidCallback? onToggleCollapsed;
  final bool compact;

  static const _purple = Color(0xFF6D28D9);
  static const _text = Color(0xFF1F2937);
  static const _muted = Color(0xFF6B6F92);

  @override
  Widget build(BuildContext context) {
    final items = <({
      MerchantNavDestination id,
      IconData icon,
      String label,
    })>[
      (id: MerchantNavDestination.home, icon: Icons.home_rounded, label: 'Inicio'),
      (
        id: MerchantNavDestination.orders,
        icon: Icons.shopping_bag_outlined,
        label: 'Pedidos',
      ),
      (
        id: MerchantNavDestination.digitalMenu,
        icon: Icons.restaurant_menu_rounded,
        label: 'Menú digital',
      ),
      (
        id: MerchantNavDestination.products,
        icon: Icons.inventory_2_outlined,
        label: 'Productos',
      ),
      (
        id: MerchantNavDestination.clients,
        icon: Icons.groups_outlined,
        label: 'Clientes',
      ),
      (
        id: MerchantNavDestination.stats,
        icon: Icons.bar_chart_rounded,
        label: 'Estadísticas',
      ),
      (
        id: MerchantNavDestination.marketing,
        icon: Icons.campaign_outlined,
        label: 'Herramientas de venta',
      ),
      (
        id: MerchantNavDestination.settings,
        icon: Icons.settings_outlined,
        label: 'Configuración',
      ),
    ];

    return ColoredBox(
      color: Colors.white,
      child: SafeArea(
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            collapsed ? 10 : 16,
            16,
            collapsed ? 10 : 16,
            12,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Image.asset(
                      'assets/branding/isotipo.png',
                      width: 36,
                      height: 36,
                      fit: BoxFit.cover,
                    ),
                  ),
                  if (!collapsed) ...[
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'ElMenúXFA',
                            style: GoogleFonts.poppins(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: _text,
                              height: 1.1,
                            ),
                          ),
                          Text(
                            'TU MENÚ, MÁS VENTAS',
                            style: GoogleFonts.poppins(
                              fontSize: 8,
                              letterSpacing: 0.6,
                              fontWeight: FontWeight.w600,
                              color: _muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 18),
              Expanded(
                child: ListView(
                  padding: EdgeInsets.zero,
                  children: [
                    for (final item in items)
                      if (MerchantSession.canOpen(item.id))
                        _SidebarItem(
                          icon: item.icon,
                          label: item.label,
                          selected: selected == item.id,
                          collapsed: collapsed,
                          onTap: () => onSelect(item.id),
                        ),
                    if (MerchantSession.canOpen(MerchantNavDestination.plan)) ...[
                      const SizedBox(height: 16),
                      _PlanTile(
                        planName: planName,
                        collapsed: collapsed,
                        onTap: () => onSelect(MerchantNavDestination.plan),
                      ),
                    ],
                  ],
                ),
              ),
              if (onToggleCollapsed != null)
                Align(
                  alignment: collapsed ? Alignment.center : Alignment.centerRight,
                  child: IconButton(
                    tooltip: collapsed ? 'Expandir menú' : 'Plegar menú',
                    onPressed: onToggleCollapsed,
                    icon: Icon(
                      collapsed
                          ? Icons.chevron_right_rounded
                          : Icons.chevron_left_rounded,
                      color: _muted,
                    ),
                  ),
                ),
              if (!collapsed) ...[
                Text(
                  'ElMenúXFA',
                  style: GoogleFonts.poppins(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: _text,
                  ),
                ),
                Text(
                  'v1.0.0',
                  style: GoogleFonts.poppins(fontSize: 10, color: _muted),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SidebarItem extends StatelessWidget {
  const _SidebarItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
    this.collapsed = false,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final bool collapsed;

  @override
  Widget build(BuildContext context) {
    final child = Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Material(
        color: selected ? MerchantDashboardSidebar._purple : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: collapsed ? 0 : 12,
              vertical: 10,
            ),
            child: collapsed
                ? Center(
                    child: Icon(
                      icon,
                      size: 20,
                      color: selected ? Colors.white : const Color(0xFF6B6F92),
                    ),
                  )
                : Row(
                    children: [
                      Icon(
                        icon,
                        size: 20,
                        color: selected ? Colors.white : const Color(0xFF6B6F92),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          label,
                          style: GoogleFonts.poppins(
                            fontSize: 13,
                            fontWeight:
                                selected ? FontWeight.w700 : FontWeight.w500,
                            color:
                                selected ? Colors.white : const Color(0xFF374151),
                          ),
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );

    if (!collapsed) return child;
    return Tooltip(message: label, child: child);
  }
}

class _PlanTile extends StatelessWidget {
  const _PlanTile({
    required this.planName,
    required this.onTap,
    this.collapsed = false,
  });

  final String planName;
  final VoidCallback onTap;
  final bool collapsed;

  @override
  Widget build(BuildContext context) {
    if (collapsed) {
      return Tooltip(
        message: 'Plan $planName',
        child: Material(
          color: const Color(0xFFF8F5FF),
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(12),
            child: const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Icon(
                Icons.workspace_premium_rounded,
                color: Color(0xFFF59E0B),
                size: 20,
              ),
            ),
          ),
        ),
      );
    }

    return Material(
      color: const Color(0xFFF8F5FF),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(
                    Icons.workspace_premium_rounded,
                    color: Color(0xFFF59E0B),
                    size: 18,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Plan Actual',
                    style: GoogleFonts.poppins(
                      fontSize: 11,
                      color: const Color(0xFF6B6F92),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                planName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: const Color(0xFF11183C),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Ver planes →',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: MerchantDashboardSidebar._purple,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class MerchantHomeHeader extends StatelessWidget {
  const MerchantHomeHeader({
    super.key,
    required this.commerceName,
    required this.businessOnline,
    required this.isUpdatingOnline,
    required this.onToggleOnline,
    required this.onOpenNotifications,
    required this.onOpenProfile,
    this.onScanWithAi,
    this.onOpenMenu,
    this.showMenuButton = false,
    this.showActions = true,
    this.hoursCaption,
  });

  final String commerceName;
  final bool businessOnline;
  final bool isUpdatingOnline;
  final ValueChanged<bool> onToggleOnline;
  final VoidCallback onOpenNotifications;
  final VoidCallback onOpenProfile;
  final VoidCallback? onScanWithAi;
  final VoidCallback? onOpenMenu;
  final bool showMenuButton;
  final bool showActions;
  final String? hoursCaption;

  static const _text = Color(0xFF11183C);
  static const _muted = Color(0xFF6B6F92);

  static String greetingFor(DateTime now) {
    final hour = now.hour;
    if (hour < 12) return 'Buenos días';
    if (hour < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }

  static String longDateEs(DateTime now) {
    const weekdays = <String>[
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
      'Domingo',
    ];
    const months = <String>[
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre',
    ];
    final weekday = weekdays[(now.weekday - 1).clamp(0, 6)];
    final month = months[(now.month - 1).clamp(0, 11)];
    return '$weekday, ${now.day} de $month de ${now.year}';
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final name = commerceName.trim().isEmpty ? 'tu negocio' : commerceName.trim();
    final isMobile = MediaQuery.sizeOf(context).width < 720;
    final initials = _initials(name);

    final greeting = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '¡${greetingFor(now)}, $name! 👋',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: GoogleFonts.poppins(
            fontSize: isMobile ? 20 : 24,
            fontWeight: FontWeight.w800,
            color: _text,
            height: 1.15,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          hoursCaption?.trim().isNotEmpty == true
              ? hoursCaption!
              : businessOnline
                  ? 'Tu negocio está abierto y listo para recibir más pedidos.'
                  : 'Tu negocio está pausado. Actívalo para recibir pedidos.',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: GoogleFonts.poppins(
            fontSize: 13,
            fontWeight: FontWeight.w500,
            color: _muted,
          ),
        ),
      ],
    );

    final statusChip = PopupMenuButton<bool>(
      enabled: !isUpdatingOnline && MerchantSession.canManageSettings,
      tooltip: 'Estado del negocio',
      onSelected: onToggleOnline,
      itemBuilder: (context) => const [
        PopupMenuItem(value: true, child: Text('Negocio abierto')),
        PopupMenuItem(value: false, child: Text('Negocio pausado')),
      ],
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
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
            const SizedBox(width: 8),
            Text(
              businessOnline ? 'Negocio abierto' : 'Negocio pausado',
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: _text,
              ),
            ),
            const SizedBox(width: 2),
            const Icon(Icons.keyboard_arrow_down_rounded, size: 18),
          ],
        ),
      ),
    );

    final actions = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        statusChip,
        const SizedBox(width: 8),
        if (onScanWithAi != null) ...[
          _RoundIconButton(
            icon: Icons.auto_awesome_rounded,
            onTap: onScanWithAi!,
          ),
          const SizedBox(width: 8),
        ],
        _RoundIconButton(
          icon: Icons.notifications_none_rounded,
          onTap: onOpenNotifications,
        ),
        const SizedBox(width: 8),
        InkWell(
          onTap: onOpenProfile,
          borderRadius: BorderRadius.circular(999),
          child: Container(
            padding: const EdgeInsets.fromLTRB(6, 5, 12, 5),
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
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: _text,
                          height: 1.1,
                        ),
                      ),
                      Text(
                        'Administrador',
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          color: _muted,
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );

    if (isMobile) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              if (showMenuButton)
                IconButton(
                  onPressed: onOpenMenu,
                  icon: const Icon(Icons.menu_rounded),
                ),
              Expanded(child: greeting),
            ],
          ),
          if (showActions) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.spaceBetween,
              children: [
                actions,
                Text(
                  longDateEs(now),
                  style: GoogleFonts.poppins(fontSize: 11, color: _muted),
                ),
              ],
            ),
          ],
        ],
      );
    }

    if (!showActions) {
      return greeting;
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: greeting),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            actions,
            const SizedBox(height: 8),
            Text(
              longDateEs(now),
              style: GoogleFonts.poppins(fontSize: 11, color: _muted),
            ),
          ],
        ),
      ],
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

class _RoundIconButton extends StatelessWidget {
  const _RoundIconButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: const Color(0xFFE5E7EB)),
          ),
          child: Icon(icon, size: 20, color: const Color(0xFF11183C)),
        ),
      ),
    );
  }
}

class MerchantQuickActions extends StatelessWidget {
  const MerchantQuickActions({
    super.key,
    required this.onAddProduct,
    required this.onEditMenu,
    required this.onShareQr,
    required this.onImprovePhotos,
    required this.onConfigureHours,
  });

  final VoidCallback onAddProduct;
  final VoidCallback onEditMenu;
  final VoidCallback onShareQr;
  final VoidCallback onImprovePhotos;
  final VoidCallback onConfigureHours;

  @override
  Widget build(BuildContext context) {
    final isMobile = MediaQuery.sizeOf(context).width < 720;
    final actions = <_QuickActionData>[
      if (MerchantSession.canManageCatalog)
        _QuickActionData(
          title: 'Agregar producto',
          icon: Icons.add_rounded,
          color: const Color(0xFF7C3AED),
          background: const Color(0xFFF3E8FF),
          onTap: onAddProduct,
        ),
      if (MerchantSession.canManageCatalog)
        _QuickActionData(
          title: 'Editar menú',
          icon: Icons.edit_outlined,
          color: const Color(0xFF2563EB),
          background: const Color(0xFFEFF6FF),
          onTap: onEditMenu,
        ),
      if (MerchantSession.canOpen(MerchantNavDestination.digitalMenu))
        _QuickActionData(
          title: 'Compartir QR',
          icon: Icons.qr_code_2_rounded,
          color: const Color(0xFF16A34A),
          background: const Color(0xFFECFDF5),
          onTap: onShareQr,
        ),
      if (MerchantSession.canManageCatalog)
        _QuickActionData(
          title: 'Mejorar fotos con IA',
          icon: Icons.auto_awesome_rounded,
          color: const Color(0xFFD97706),
          background: const Color(0xFFFFF7ED),
          onTap: onImprovePhotos,
        ),
      if (MerchantSession.canManageHours)
        _QuickActionData(
          title: 'Configurar horarios',
          icon: Icons.schedule_rounded,
          color: const Color(0xFFDC2626),
          background: const Color(0xFFFEF2F2),
          onTap: onConfigureHours,
        ),
    ];
    if (actions.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Acciones rápidas',
          style: GoogleFonts.poppins(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: const Color(0xFF11183C),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Todo lo que necesitas, en un solo lugar.',
          style: GoogleFonts.poppins(
            fontSize: 12,
            color: const Color(0xFF6B6F92),
          ),
        ),
        const SizedBox(height: 12),
        if (isMobile)
          SizedBox(
            height: 108,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: actions.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (context, index) {
                return SizedBox(width: 148, child: _QuickActionCard(data: actions[index]));
              },
            ),
          )
        else
          SizedBox(
            height: 108,
            child: Row(
              children: [
                for (var i = 0; i < actions.length; i++) ...[
                  if (i > 0) const SizedBox(width: 10),
                  Expanded(child: _QuickActionCard(data: actions[i])),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class _QuickActionData {
  const _QuickActionData({
    required this.title,
    required this.icon,
    required this.color,
    required this.background,
    required this.onTap,
  });

  final String title;
  final IconData icon;
  final Color color;
  final Color background;
  final VoidCallback onTap;
}

class _QuickActionCard extends StatelessWidget {
  const _QuickActionCard({required this.data});

  final _QuickActionData data;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: data.background,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: data.onTap,
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 16, 14, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(data.icon, color: data.color, size: 22),
              const Spacer(),
              Text(
                data.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.poppins(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: const Color(0xFF11183C),
                  height: 1.2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class MerchantSmartMenuCard extends StatelessWidget {
  const MerchantSmartMenuCard({
    super.key,
    required this.publicUrl,
    required this.displayUrl,
    required this.visits,
    required this.scans,
    required this.menuOrders,
    required this.onCopy,
    required this.onDownloadQr,
    this.onOpenUrl,
  });

  final String publicUrl;
  final String displayUrl;
  final int visits;
  final int scans;
  final int menuOrders;
  final VoidCallback onCopy;
  final VoidCallback onDownloadQr;
  final VoidCallback? onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final isMobile = MediaQuery.sizeOf(context).width < 720;
    final hasTraffic = visits > 0 || scans > 0;

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        boxShadow: const [
          BoxShadow(
            color: Color(0x100F172A),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Tu menú inteligente',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: const Color(0xFF11183C),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Comparte tu menú y recibe más clientes',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: const Color(0xFF6B6F92),
                      ),
                    ),
                  ],
                ),
              ),
              if (!isMobile) _QrBox(data: publicUrl),
            ],
          ),
          if (isMobile) ...[
            const SizedBox(height: 12),
            Align(alignment: Alignment.center, child: _QrBox(data: publicUrl)),
          ],
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
            decoration: BoxDecoration(
              color: const Color(0xFFF8F7FC),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Expanded(
                  child: GestureDetector(
                    onTap: onOpenUrl,
                    child: Text(
                      displayUrl,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: const Color(0xFF11183C),
                      ),
                    ),
                  ),
                ),
                FilledButton(
                  onPressed: onCopy,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF6D28D9),
                    visualDensity: VisualDensity.compact,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                  child: const Text('Copiar'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: onDownloadQr,
              icon: const Icon(Icons.download_rounded, size: 16),
              label: const Text('Descargar QR'),
            ),
          ),
          const SizedBox(height: 4),
          if (!hasTraffic)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                'Sin datos todavía. Comparte tu QR para empezar a recibir visitas.',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: const Color(0xFF6B6F92),
                ),
              ),
            )
          else
            Row(
            children: [
              Expanded(
                child: _MenuStat(
                  icon: Icons.visibility_outlined,
                  value: '$visits',
                  label: 'Visitas al menú',
                ),
              ),
              Expanded(
                child: _MenuStat(
                  icon: Icons.qr_code_scanner_rounded,
                  value: '$scans',
                  label: 'Escaneos QR',
                ),
              ),
              Expanded(
                child: _MenuStat(
                  icon: Icons.shopping_cart_outlined,
                  value: '$menuOrders',
                  label: 'Pedidos desde el menú',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _QrBox extends StatelessWidget {
  const _QrBox({required this.data});

  final String data;

  @override
  Widget build(BuildContext context) {
    final payload = data.trim().isEmpty ? 'https://elmenuxfa.com' : data;
    return Container(
      width: 92,
      height: 92,
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: PrettyQrView.data(
        data: payload,
        errorCorrectLevel: QrErrorCorrectLevel.M,
        decoration: const PrettyQrDecoration(
          background: Colors.white,
          shape: PrettyQrSmoothSymbol(color: Color(0xFF11183C)),
        ),
      ),
    );
  }
}

class _MenuStat extends StatelessWidget {
  const _MenuStat({
    required this.icon,
    required this.value,
    required this.label,
  });

  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, size: 18, color: const Color(0xFF6B6F92)),
        const SizedBox(height: 4),
        Text(
          value,
          style: GoogleFonts.poppins(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: const Color(0xFF11183C),
          ),
        ),
        Text(
          label,
          textAlign: TextAlign.center,
          maxLines: 2,
          style: GoogleFonts.poppins(
            fontSize: 10,
            color: const Color(0xFF6B6F92),
            height: 1.15,
          ),
        ),
      ],
    );
  }
}

class MerchantTipCard extends StatelessWidget {
  const MerchantTipCard({super.key, required this.onImprovePhotos});

  final VoidCallback onImprovePhotos;

  static const _tips = <({String title, String body})>[
    (
      title: 'Una buena foto vende más',
      body:
          'Usa el Asistente IA para mejorar las fotos de tus productos y aumenta tus ventas.',
    ),
    (
      title: 'Comparte tu QR todos los días',
      body:
          'Imprime el código y colócalo en mesas, empaques y redes para que más clientes pidan.',
    ),
    (
      title: 'Un menú claro convierte más',
      body:
          'Revisa nombres, precios y fotos. Un catálogo completo genera más confianza.',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final tip = _tips[DateTime.now().weekday % _tips.length];
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF111827), Color(0xFF4C1D95)],
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Positioned(
            right: -20,
            top: -10,
            child: Icon(
              Icons.fastfood_rounded,
              size: 120,
              color: Colors.white.withValues(alpha: 0.08),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    'CONSEJO DEL DÍA',
                    style: GoogleFonts.poppins(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.6,
                      color: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  tip.title,
                  style: GoogleFonts.poppins(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    height: 1.15,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  tip.body,
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Colors.white.withValues(alpha: 0.82),
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 14),
                TextButton(
                  onPressed: onImprovePhotos,
                  style: TextButton.styleFrom(
                    foregroundColor: Colors.white,
                    padding: EdgeInsets.zero,
                  ),
                  child: const Text('Mejorar fotos ahora →'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class MerchantAiCreditsCard extends StatelessWidget {
  const MerchantAiCreditsCard({
    super.key,
    required this.balance,
    required this.onHistory,
    required this.onReload,
  });

  final double balance;
  final VoidCallback onHistory;
  final VoidCallback onReload;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        boxShadow: const [
          BoxShadow(
            color: Color(0x100F172A),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
                    Text(
                      'Fotos profesionales IA',
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: const Color(0xFF11183C),
                      ),
                    ),
              const Spacer(),
              TextButton(
                onPressed: onHistory,
                child: const Text('Ver historial'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: const BoxDecoration(
                  color: Color(0xFFF3E8FF),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.auto_awesome_rounded,
                  color: Color(0xFF6D28D9),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Fotos profesionales IA disponibles',
                      style: GoogleFonts.poppins(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: const Color(0xFF11183C),
                      ),
                    ),
                    Text(
                      '${balance.round()} mejoras restantes',
                      style: GoogleFonts.poppins(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: const Color(0xFF6D28D9),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: onReload,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF6D28D9),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
                child: const Text('Ver créditos'),
            ),
          ),
        ],
      ),
    );
  }
}

class MerchantProfileProgressCard extends StatelessWidget {
  const MerchantProfileProgressCard({super.key, required this.steps});

  final List<MerchantProfileStep> steps;

  @override
  Widget build(BuildContext context) {
    final done = steps.where((step) => step.done).length;
    final percent = steps.isEmpty ? 0 : ((done / steps.length) * 100).round();
    MerchantProfileStep? next;
    for (final step in steps) {
      if (!step.done) {
        next = step;
        break;
      }
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        boxShadow: const [
          BoxShadow(
            color: Color(0x100F172A),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Completa tu perfil',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: const Color(0xFF11183C),
                  ),
                ),
              ),
              Text(
                '$percent%',
                style: GoogleFonts.poppins(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: const Color(0xFF6D28D9),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: steps.isEmpty ? 0 : done / steps.length,
              minHeight: 8,
              backgroundColor: const Color(0xFFEDE9FE),
              color: const Color(0xFF6D28D9),
            ),
          ),
          const SizedBox(height: 12),
          for (final step in steps)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: InkWell(
                onTap: step.done ? null : step.onTap,
                child: Row(
                  children: [
                    Icon(
                      step.done
                          ? Icons.check_circle_rounded
                          : Icons.radio_button_unchecked_rounded,
                      size: 18,
                      color: step.done
                          ? const Color(0xFF16A34A)
                          : const Color(0xFFD1D5DB),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        step.label,
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          color: const Color(0xFF374151),
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          if (next != null)
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: next.onTap,
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFF6D28D9),
                  side: const BorderSide(color: Color(0xFFDDD6FE)),
                ),
                child: const Text('Completar ahora'),
              ),
            ),
        ],
      ),
    );
  }
}

class MerchantTopProductsCard extends StatelessWidget {
  const MerchantTopProductsCard({
    super.key,
    required this.products,
    required this.onSeeAll,
    required this.onAddProduct,
  });

  final List<MerchantTopProduct> products;
  final VoidCallback onSeeAll;
  final VoidCallback onAddProduct;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        boxShadow: const [
          BoxShadow(
            color: Color(0x100F172A),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Productos más vendidos',
                  style: GoogleFonts.poppins(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: const Color(0xFF11183C),
                  ),
                ),
              ),
              TextButton(onPressed: onSeeAll, child: const Text('Ver todos')),
            ],
          ),
          const SizedBox(height: 8),
          if (products.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Column(
                children: [
                  const Icon(
                    Icons.inventory_2_outlined,
                    size: 36,
                    color: Color(0xFF9CA3AF),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Aún no hay datos',
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: const Color(0xFF11183C),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Tus productos más vendidos aparecerán aquí cuando recibas pedidos.',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: const Color(0xFF6B6F92),
                    ),
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: MerchantSession.canManageCatalog ? onAddProduct : null,
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF6D28D9),
                    ),
                    child: const Text('Agregar producto'),
                  ),
                ],
              ),
            )
          else
            for (final product in products)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: product.imageUrl == null
                          ? Container(
                              width: 40,
                              height: 40,
                              color: const Color(0xFFF3E8FF),
                              child: const Icon(
                                Icons.fastfood_rounded,
                                color: Color(0xFF6D28D9),
                                size: 18,
                              ),
                            )
                          : Image.network(
                              product.imageUrl!,
                              width: 40,
                              height: 40,
                              fit: BoxFit.cover,
                            ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        product.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Text(
                      '${product.quantity} uds',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: const Color(0xFF6B6F92),
                      ),
                    ),
                  ],
                ),
              ),
        ],
      ),
    );
  }
}

class MerchantGrowBanner extends StatelessWidget {
  const MerchantGrowBanner({
    super.key,
    required this.onSeePlans,
    required this.onDismiss,
  });

  final VoidCallback onSeePlans;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final isMobile = MediaQuery.sizeOf(context).width < 720;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 10, 14),
      decoration: BoxDecoration(
        color: const Color(0xFFF3E8FF),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 2),
            child: Icon(Icons.rocket_launch_rounded, color: Color(0xFF6D28D9)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '¡Haz crecer tu negocio!',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: const Color(0xFF11183C),
                  ),
                ),
                Text(
                  'Descubre todas las herramientas que tenemos para ti.',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: const Color(0xFF6B6F92),
                  ),
                ),
                if (isMobile)
                  TextButton(
                    onPressed: onSeePlans,
                    style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      visualDensity: VisualDensity.compact,
                    ),
                    child: const Text('Ver planes'),
                  ),
              ],
            ),
          ),
          if (!isMobile)
            TextButton(onPressed: onSeePlans, child: const Text('Ver planes')),
          IconButton(
            onPressed: onDismiss,
            icon: const Icon(Icons.close_rounded, size: 18),
          ),
        ],
      ),
    );
  }
}

class MerchantEmptyPanel extends StatelessWidget {
  const MerchantEmptyPanel({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 22, 16, 22),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        boxShadow: const [
          BoxShadow(
            color: Color(0x100F172A),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          Icon(icon, size: 36, color: const Color(0xFF9CA3AF)),
          const SizedBox(height: 8),
          Text(
            title,
            style: GoogleFonts.poppins(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: const Color(0xFF11183C),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: GoogleFonts.poppins(
              fontSize: 12,
              color: const Color(0xFF6B6F92),
            ),
          ),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 12),
            FilledButton(
              onPressed: onAction,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF6D28D9),
              ),
              child: Text(actionLabel!),
            ),
          ],
        ],
      ),
    );
  }
}
