import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/models/pedido.dart';
import 'package:kosmenu_app/services/order_manager_service.dart';

/// Colors taken from the kitchen KDS mockup.
abstract final class KitchenMockupColors {
  static const background = Color(0xFFF4F5F8);
  static const card = Color(0xFFFFFFFF);
  static const text = Color(0xFF111827);
  static const muted = Color(0xFF6B7280);
  static const pending = Color(0xFFF59E0B);
  static const pendingSoft = Color(0xFFFFF4E0);
  static const delivery = Color(0xFF16A34A);
  static const deliverySoft = Color(0xFFE8F8EE);
  static const paymentSoft = Color(0xFFF3F0FF);
  static const purple = Color(0xFF7C3AED);
  static const accept = Color(0xFF22C55E);
  static const prep = Color(0xFF2563EB);
  static const ready = Color(0xFF7C3AED);
  static const qtySoft = Color(0xFFFFE8EC);
  static const qty = Color(0xFFE11D48);
  static const notesSoft = Color(0xFFF3F4F6);
  static const border = Color(0xFFE5E7EB);
}

class KitchenElapsedTicker extends StatefulWidget {
  const KitchenElapsedTicker({
    super.key,
    required this.createdAt,
    required this.builder,
  });

  final DateTime? createdAt;
  final Widget Function(BuildContext context, String label) builder;

  @override
  State<KitchenElapsedTicker> createState() => _KitchenElapsedTickerState();
}

class _KitchenElapsedTickerState extends State<KitchenElapsedTicker> {
  late final ValueNotifier<String> _label;

  @override
  void initState() {
    super.initState();
    _label = ValueNotifier<String>(_format(widget.createdAt));
    if (widget.createdAt != null) {
      Future<void>.delayed(const Duration(seconds: 1), _tick);
    }
  }

  @override
  void didUpdateWidget(covariant KitchenElapsedTicker oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.createdAt != widget.createdAt) {
      _label.value = _format(widget.createdAt);
    }
  }

  void _tick() {
    if (!mounted || widget.createdAt == null) return;
    _label.value = _format(widget.createdAt);
    Future<void>.delayed(const Duration(seconds: 1), _tick);
  }

  static String _format(DateTime? createdAt) {
    if (createdAt == null) return '--:--';
    final elapsed = DateTime.now().difference(createdAt);
    final total = elapsed.inSeconds < 0 ? 0 : elapsed.inSeconds;
    final minutes = total ~/ 60;
    final seconds = total % 60;
    if (minutes >= 60) {
      final hours = minutes ~/ 60;
      final rem = minutes % 60;
      return '${hours}h ${rem.toString().padLeft(2, '0')}m';
    }
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  @override
  void dispose() {
    _label.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: _label,
      builder: (context, value, _) => widget.builder(context, value),
    );
  }
}

class KitchenOrderHeader extends StatelessWidget {
  const KitchenOrderHeader({
    super.key,
    required this.businessName,
    required this.orderId,
    required this.statusLabel,
    required this.statusColor,
    required this.createdAt,
    this.logoUrl,
    this.onBack,
  });

  final String businessName;
  final String orderId;
  final String statusLabel;
  final Color statusColor;
  final DateTime? createdAt;
  final String? logoUrl;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _RoundIconButton(
            icon: Icons.arrow_back_rounded,
            onPressed: onBack ?? () => Navigator.of(context).maybePop(),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Row(
              children: [
                _LogoBubble(logoUrl: logoUrl),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        businessName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.manrope(
                          color: KitchenMockupColors.text,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          height: 1.1,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Pedido #$orderId',
                        style: GoogleFonts.manrope(
                          color: KitchenMockupColors.muted,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.flag_rounded, size: 14, color: statusColor),
                    const SizedBox(width: 4),
                    Text(
                      statusLabel,
                      style: GoogleFonts.manrope(
                        color: statusColor,
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 6),
              KitchenElapsedTicker(
                createdAt: createdAt,
                builder: (context, label) => Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.schedule_rounded, size: 14, color: statusColor),
                    const SizedBox(width: 4),
                    Text(
                      label,
                      style: GoogleFonts.manrope(
                        color: statusColor,
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RoundIconButton extends StatelessWidget {
  const _RoundIconButton({required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: KitchenMockupColors.card,
      shape: const CircleBorder(),
      elevation: 0,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onPressed,
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, color: KitchenMockupColors.text, size: 22),
        ),
      ),
    );
  }
}

class _LogoBubble extends StatelessWidget {
  const _LogoBubble({this.logoUrl});

  final String? logoUrl;

  @override
  Widget build(BuildContext context) {
    final url = (logoUrl ?? '').trim();
    return ClipOval(
      child: SizedBox(
        width: 40,
        height: 40,
        child: url.isEmpty
            ? Image.asset('assets/branding/logotipo.png', fit: BoxFit.cover)
            : CachedNetworkImage(
                imageUrl: url,
                fit: BoxFit.cover,
                errorWidget: (context, url, error) => Image.asset(
                  'assets/branding/logotipo.png',
                  fit: BoxFit.cover,
                ),
              ),
      ),
    );
  }
}

class KitchenSummaryStrip extends StatelessWidget {
  const KitchenSummaryStrip({
    super.key,
    required this.isDelivery,
    required this.paymentTitle,
    required this.paymentSubtitle,
    required this.totalLabel,
    required this.customerName,
    this.paymentReference,
    this.hasPaymentProof = false,
    this.isLoadingPaymentProof = false,
    this.onViewPaymentProof,
    this.deliveryLabel,
    this.onWhatsapp,
    this.onCall,
  });

  final bool isDelivery;
  final String paymentTitle;
  final String paymentSubtitle;
  final String totalLabel;
  final String customerName;
  final String? paymentReference;
  final bool hasPaymentProof;
  final bool isLoadingPaymentProof;
  final VoidCallback? onViewPaymentProof;
  final String? deliveryLabel;
  final VoidCallback? onWhatsapp;
  final VoidCallback? onCall;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      decoration: _cardDecoration(),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                flex: 5,
                child: _SoftInfoChip(
                  background: KitchenMockupColors.deliverySoft,
                  icon: Icons.delivery_dining_rounded,
                  iconColor: KitchenMockupColors.delivery,
                  title: isDelivery ? 'Delivery' : 'Retiro',
                  titleColor: KitchenMockupColors.delivery,
                  subtitle: isDelivery
                      ? 'Pedido a domicilio'
                      : 'Retiro en tienda',
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 5,
                child: _SoftInfoChip(
                  background: KitchenMockupColors.paymentSoft,
                  icon: Icons.payments_outlined,
                  iconColor: KitchenMockupColors.purple,
                  title: paymentTitle,
                  titleColor: KitchenMockupColors.text,
                  subtitle: paymentSubtitle,
                ),
              ),
              const SizedBox(width: 10),
              Container(
                width: 1,
                height: 42,
                color: KitchenMockupColors.border,
              ),
              const SizedBox(width: 10),
              Flexible(
                flex: 4,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      'Total',
                      style: GoogleFonts.manrope(
                        color: KitchenMockupColors.muted,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerRight,
                      child: Text(
                        totalLabel,
                        maxLines: 1,
                        softWrap: false,
                        style: GoogleFonts.manrope(
                          color: KitchenMockupColors.text,
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          height: 1.05,
                        ),
                      ),
                    ),
                    if ((deliveryLabel ?? '').trim().isNotEmpty)
                      Text(
                        deliveryLabel!.trim(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.manrope(
                          color: KitchenMockupColors.muted,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          if ((paymentReference ?? '').trim().isNotEmpty ||
              hasPaymentProof) ...[
            const SizedBox(height: 10),
            if ((paymentReference ?? '').trim().isNotEmpty)
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Referencia: ${paymentReference!.trim()}',
                  softWrap: true,
                  style: GoogleFonts.manrope(
                    color: KitchenMockupColors.text,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            if (hasPaymentProof) ...[
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: isLoadingPaymentProof ? null : onViewPaymentProof,
                  icon: isLoadingPaymentProof
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.receipt_long_rounded, size: 18),
                  label: Text(
                    isLoadingPaymentProof
                        ? 'Cargando comprobante...'
                        : 'Ver comprobante',
                  ),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 44),
                    foregroundColor: KitchenMockupColors.purple,
                  ),
                ),
              ),
            ],
          ],
          const SizedBox(height: 12),
          const Divider(height: 1, color: KitchenMockupColors.border),
          const SizedBox(height: 10),
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: KitchenMockupColors.purple.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.person_rounded,
                  size: 17,
                  color: KitchenMockupColors.purple,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Cliente',
                      style: GoogleFonts.manrope(
                        color: KitchenMockupColors.muted,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      customerName.isEmpty ? 'Sin nombre' : customerName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.manrope(
                        color: KitchenMockupColors.text,
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
              if (onCall != null)
                _CircleAction(
                  background: const Color(0xFFEDE9FE),
                  foreground: KitchenMockupColors.purple,
                  icon: Icons.call_rounded,
                  onTap: onCall!,
                ),
              if (onCall != null && onWhatsapp != null) const SizedBox(width: 8),
              if (onWhatsapp != null)
                _CircleAction(
                  background: const Color(0xFFDCFCE7),
                  foreground: KitchenMockupColors.delivery,
                  svg: _whatsappLogoSvg,
                  onTap: onWhatsapp!,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SoftInfoChip extends StatelessWidget {
  const _SoftInfoChip({
    required this.background,
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.titleColor,
    required this.subtitle,
  });

  final Color background;
  final IconData icon;
  final Color iconColor;
  final String title;
  final Color titleColor;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: iconColor),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.manrope(
                    color: titleColor,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.manrope(
                    color: KitchenMockupColors.muted,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
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

const String _whatsappLogoSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

class _CircleAction extends StatelessWidget {
  const _CircleAction({
    required this.background,
    required this.foreground,
    this.icon,
    this.svg,
    required this.onTap,
  });

  final Color background;
  final Color foreground;
  final IconData? icon;
  final String? svg;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: background,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 38,
          height: 38,
          child: svg != null
              ? Center(
                  child: SvgPicture.string(
                    svg!,
                    width: 18,
                    height: 18,
                    colorFilter: ColorFilter.mode(foreground, BlendMode.srcIn),
                  ),
                )
              : Icon(icon, color: foreground, size: 18),
        ),
      ),
    );
  }
}

class KitchenPrepSection extends StatelessWidget {
  const KitchenPrepSection({
    super.key,
    required this.items,
    this.orderNotes,
  });

  final List<PedidoItemModel> items;
  final String? orderNotes;

  static String _kitchenNotesLabel(String notes) {
    final value = notes.trim();
    if (value.isEmpty) return 'Sin notas del pedido';
    final lower = value.toLowerCase();
    if (lower.startsWith('tipo:') ||
        lower == 'delivery' ||
        lower == 'pickup' ||
        lower == 'retiro') {
      return 'Sin notas del pedido';
    }
    return value;
  }

  @override
  Widget build(BuildContext context) {
    final notes = (orderNotes ?? '').trim();
    final count = items.fold<int>(0, (sum, item) => sum + item.cantidad);

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
      decoration: _cardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.soup_kitchen_rounded,
                color: KitchenMockupColors.qty,
                size: 22,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Lo que prepara cocina',
                  style: GoogleFonts.manrope(
                    color: KitchenMockupColors.text,
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: KitchenMockupColors.qtySoft,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  count == 1 ? '1 producto' : '$count productos',
                  style: GoogleFonts.manrope(
                    color: KitchenMockupColors.qty,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (items.isEmpty)
            Text(
              'Sin ítems en el pedido',
              style: GoogleFonts.manrope(
                color: KitchenMockupColors.muted,
                fontWeight: FontWeight.w600,
              ),
            )
          else
            ...items.map(
              (item) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.fromLTRB(10, 10, 12, 10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF1F3),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      _ProductThumb(imageUrl: item.imageUrl),
                      const SizedBox(width: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 8,
                        ),
                        decoration: BoxDecoration(
                          color: KitchenMockupColors.qtySoft,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: KitchenMockupColors.qty.withValues(
                              alpha: 0.45,
                            ),
                          ),
                        ),
                        child: Text(
                          'x${item.cantidad}',
                          style: GoogleFonts.manrope(
                            color: KitchenMockupColors.qty,
                            fontSize: 16,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      Container(
                        margin: const EdgeInsets.symmetric(horizontal: 12),
                        width: 1,
                        height: 28,
                        color: KitchenMockupColors.border,
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.displayName.trim().isEmpty
                                  ? 'Producto'
                                  : item.displayName.trim(),
                              style: GoogleFonts.manrope(
                                color: KitchenMockupColors.text,
                                fontSize: 22,
                                fontWeight: FontWeight.w900,
                                height: 1.1,
                              ),
                            ),
                            if ((item.categoryName ?? '').trim().isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 3),
                                child: Text(
                                  item.categoryName!.trim(),
                                  style: GoogleFonts.manrope(
                                    color: KitchenMockupColors.muted,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            for (final group in item.modifierGroups)
                              Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    if (group.grupo.isNotEmpty)
                                      Text(
                                        '${group.grupo}:',
                                        style: GoogleFonts.manrope(
                                          color: KitchenMockupColors.muted,
                                          fontSize: 13,
                                          fontWeight: FontWeight.w800,
                                          height: 1.2,
                                        ),
                                      ),
                                    for (final option in group.opciones)
                                      Text(
                                        option.nombre,
                                        style: GoogleFonts.manrope(
                                          color: KitchenMockupColors.text,
                                          fontSize: 16,
                                          fontWeight: FontWeight.w800,
                                          height: 1.25,
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: KitchenMockupColors.notesSoft,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.chat_bubble_outline_rounded,
                  size: 16,
                  color: KitchenMockupColors.muted,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _kitchenNotesLabel(notes),
                    style: GoogleFonts.manrope(
                      color: KitchenMockupColors.muted,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
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

class _ProductThumb extends StatelessWidget {
  const _ProductThumb({this.imageUrl});

  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    final url = (imageUrl ?? '').trim();
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        width: 56,
        height: 56,
        child: url.isEmpty
            ? Container(
                color: KitchenMockupColors.notesSoft,
                child: const Icon(
                  Icons.fastfood_rounded,
                  color: KitchenMockupColors.muted,
                ),
              )
            : Image.network(
                url,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => Container(
                  color: KitchenMockupColors.notesSoft,
                  child: const Icon(
                    Icons.fastfood_rounded,
                    color: KitchenMockupColors.muted,
                  ),
                ),
              ),
      ),
    );
  }
}

class KitchenStatusTimeline extends StatelessWidget {
  const KitchenStatusTimeline({
    super.key,
    required this.pedido,
    required this.isDelivery,
  });

  final PedidoModel pedido;
  final bool isDelivery;

  static int activeStepIndex(PedidoModel pedido, {required bool isDelivery}) {
    final code = OrderManagerService.visualStatusCodeForPedido(pedido);
    if (code == 'cancelado') return -1;
    if (code == 'entregado') return 3;
    if (code == 'en_camino' || code == 'espera_cliente') {
      return 2;
    }
    if (code == 'confirmado' || code == 'preparando') return 1;
    if (code == 'pendiente') return 0;
    final raw = OrderManagerService.normalizedRawStatus(pedido.estado);
    if (raw == 'entregado') return 3;
    if (raw == 'en_camino') return 2;
    if (raw == 'confirmado') return 1;
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final active = activeStepIndex(pedido, isDelivery: isDelivery);
    const steps = <({String label, IconData icon})>[
      (label: 'Recibido', icon: Icons.description_outlined),
      (label: 'Aceptado', icon: Icons.check_circle_outline_rounded),
      (label: 'En camino', icon: Icons.delivery_dining_rounded),
      (label: 'Entregado', icon: Icons.home_outlined),
    ];

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      padding: const EdgeInsets.fromLTRB(10, 16, 10, 14),
      decoration: _cardDecoration(),
      child: Row(
        children: [
          for (var i = 0; i < steps.length; i++) ...[
            Expanded(
              child: Column(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: active >= i && active >= 0
                          ? KitchenMockupColors.pending
                          : KitchenMockupColors.notesSoft,
                    ),
                    child: Icon(
                      steps[i].icon,
                      size: 18,
                      color: active >= i && active >= 0
                          ? Colors.white
                          : KitchenMockupColors.muted,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    steps[i].label,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.manrope(
                      color: active == i
                          ? KitchenMockupColors.text
                          : KitchenMockupColors.muted,
                      fontSize: 11,
                      fontWeight:
                          active == i ? FontWeight.w800 : FontWeight.w600,
                      height: 1.15,
                    ),
                  ),
                ],
              ),
            ),
            if (i < steps.length - 1)
              Padding(
                padding: const EdgeInsets.only(bottom: 22),
                child: Container(
                  width: 18,
                  height: 3,
                  decoration: BoxDecoration(
                    color: active > i
                        ? KitchenMockupColors.pending
                        : KitchenMockupColors.border,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class KitchenMockupActionsBar extends StatelessWidget {
  const KitchenMockupActionsBar({
    super.key,
    required this.estado,
    required this.isDelivery,
    required this.isBusy,
    required this.busyStatus,
    required this.onStatus,
    this.onCancel,
    this.hidePrimaryAction = false,
  });

  final String estado;
  final bool isDelivery;
  final bool isBusy;
  final String? busyStatus;
  final void Function(String status) onStatus;
  final VoidCallback? onCancel;
  final bool hidePrimaryAction;

  static ({String status, String label, IconData icon, Color color})?
      nextAction({
    required String estado,
    required bool isDelivery,
  }) {
    final raw = OrderManagerService.normalizedRawStatus(estado);
    if (raw == 'pendiente') {
      return (
        status: 'confirmado',
        label: 'Aceptar pedido',
        icon: Icons.check_circle_rounded,
        color: KitchenMockupColors.accept,
      );
    }
    if (raw == 'confirmado') {
      return (
        status: 'en_camino',
        label: 'Marcar en camino',
        icon: Icons.delivery_dining_rounded,
        color: const Color(0xFF0EA5E9),
      );
    }
    if (raw == 'en_camino') {
      return (
        status: 'entregado',
        label: 'Marcar entregado',
        icon: Icons.check_circle_rounded,
        color: KitchenMockupColors.accept,
      );
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final action = hidePrimaryAction
        ? null
        : nextAction(estado: estado, isDelivery: isDelivery);
    final isWide = MediaQuery.sizeOf(context).width >= 840;
    final canCancel = onCancel != null;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (action != null)
            Align(
              alignment: isWide ? Alignment.center : Alignment.center,
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxWidth: isWide ? 420 : double.infinity,
                ),
                child: _BigActionButton(
                  label: action.label,
                  icon: action.icon,
                  color: action.color,
                  loading: isBusy && busyStatus == action.status,
                  enabled: !isBusy,
                  compact: !isWide,
                  onPressed: () => onStatus(action.status),
                ),
              ),
            ),
          if (canCancel) ...[
            const SizedBox(height: 4),
            TextButton(
              onPressed: isBusy ? null : onCancel,
              child: Text(
                'Cancelar pedido',
                style: GoogleFonts.manrope(
                  color: KitchenMockupColors.qty,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _BigActionButton extends StatelessWidget {
  const _BigActionButton({
    required this.label,
    required this.icon,
    required this.color,
    required this.onPressed,
    this.loading = false,
    this.enabled = true,
    this.compact = true,
  });

  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onPressed;
  final bool loading;
  final bool enabled;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: compact ? 52 : 56,
      child: FilledButton.icon(
        style: FilledButton.styleFrom(
          backgroundColor: color,
          disabledBackgroundColor: color.withValues(alpha: 0.45),
          foregroundColor: Colors.white,
          padding: EdgeInsets.symmetric(horizontal: compact ? 16 : 22),
          textStyle: GoogleFonts.manrope(
            fontSize: compact ? 15 : 16,
            fontWeight: FontWeight.w800,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        onPressed: enabled && !loading ? onPressed : null,
        icon: loading
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2.2,
                  color: Colors.white,
                ),
              )
            : Icon(icon, size: compact ? 20 : 22),
        label: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
    );
  }
}

class KitchenDelegationCard extends StatelessWidget {
  const KitchenDelegationCard({
    super.key,
    required this.courierName,
    required this.courierPhone,
    required this.statusLabel,
    required this.pendingAcceptance,
    required this.isBusy,
    required this.onRevoke,
    required this.onInviteAnother,
    required this.onDeliverManually,
    this.feedback,
  });

  final String courierName;
  final String courierPhone;
  final String statusLabel;
  final bool pendingAcceptance;
  final bool isBusy;
  final VoidCallback onRevoke;
  final VoidCallback onInviteAnother;
  final VoidCallback onDeliverManually;
  final String? feedback;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE9D5FF)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: const Color(0xFFF3E8FF),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(
                  Icons.delivery_dining_rounded,
                  color: Color(0xFF7C3AED),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      pendingAcceptance
                          ? 'Invitación de delivery enviada'
                          : 'El repartidor se encarga de aquí en adelante',
                      style: GoogleFonts.manrope(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        color: KitchenMockupColors.text,
                      ),
                    ),
                    if (statusLabel.trim().isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        statusLabel,
                        style: GoogleFonts.manrope(
                          color: KitchenMockupColors.muted,
                          fontWeight: FontWeight.w600,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            pendingAcceptance
                ? 'El repartidor recibió el enlace. Cuando lo acepte, él marca en camino y entrega. Tú no tienes que avanzar el pedido.'
                : 'A partir de ahora el avance de la ruta lo gestiona el repartidor. No hace falta marcar en camino ni entregado desde aquí.',
            style: GoogleFonts.manrope(
              color: KitchenMockupColors.muted,
              fontSize: 13,
              fontWeight: FontWeight.w600,
              height: 1.35,
            ),
          ),
          if (courierName.trim().isNotEmpty || courierPhone.trim().isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF7F5FC),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    courierName.trim().isEmpty ? 'Repartidor' : courierName.trim(),
                    style: GoogleFonts.manrope(
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                    ),
                  ),
                  if (courierPhone.trim().isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      courierPhone.trim(),
                      style: GoogleFonts.manrope(
                        color: KitchenMockupColors.muted,
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
          if ((feedback ?? '').trim().isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              feedback!.trim(),
              style: GoogleFonts.manrope(
                color: KitchenMockupColors.purple,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ],
          if (isBusy) ...[
            const SizedBox(height: 12),
            const LinearProgressIndicator(),
          ],
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: isBusy ? null : onInviteAnother,
              icon: const Icon(Icons.swap_horiz_rounded, size: 18),
              label: const Text('Invitar a otro repartidor'),
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFF7C3AED),
                side: const BorderSide(color: Color(0xFFDDD6FE)),
                minimumSize: const Size.fromHeight(46),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: isBusy ? null : onDeliverManually,
              icon: const Icon(Icons.storefront_rounded, size: 18),
              label: const Text('Hacer el delivery manualmente'),
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFF2563EB),
                side: const BorderSide(color: Color(0xFFBFDBFE)),
                minimumSize: const Size.fromHeight(46),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ),
          Align(
            alignment: Alignment.center,
            child: TextButton(
              onPressed: isBusy ? null : onRevoke,
              child: Text(
                'Revocar invitación',
                style: GoogleFonts.manrope(
                  color: KitchenMockupColors.qty,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class KitchenDeliveryCard extends StatelessWidget {
  const KitchenDeliveryCard({
    super.key,
    required this.isDelivery,
    required this.customerName,
    required this.customerEmail,
    required this.customerPhone,
    required this.address,
    required this.coordinatesLabel,
    this.mapPreview,
    this.onOpenMap,
  });

  final bool isDelivery;
  final String customerName;
  final String customerEmail;
  final String customerPhone;
  final String address;
  final String coordinatesLabel;
  final Widget? mapPreview;
  final VoidCallback? onOpenMap;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      decoration: _cardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.person_pin_circle_outlined,
                color: KitchenMockupColors.prep,
                size: 20,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Datos de entrega',
                  style: GoogleFonts.manrope(
                    color: KitchenMockupColors.text,
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              if (onOpenMap != null)
                TextButton.icon(
                  onPressed: onOpenMap,
                  style: TextButton.styleFrom(
                    foregroundColor: KitchenMockupColors.purple,
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    visualDensity: VisualDensity.compact,
                  ),
                  icon: const Icon(Icons.map_outlined, size: 16),
                  label: Text(
                    'Ver en mapa',
                    style: GoogleFonts.manrope(
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  children: [
                    _InfoRow(
                      icon: Icons.person_outline_rounded,
                      title: customerName.isEmpty ? 'Sin nombre' : customerName,
                      subtitle: customerEmail.isEmpty ? null : customerEmail,
                    ),
                    if (customerPhone.isNotEmpty)
                      _InfoRow(
                        icon: Icons.phone_outlined,
                        title: customerPhone,
                      ),
                    _InfoRow(
                      icon: Icons.place_outlined,
                      title: address.isEmpty
                          ? (isDelivery
                                ? 'Sin dirección'
                                : 'Retiro en tienda')
                          : address,
                    ),
                    if (coordinatesLabel.isNotEmpty)
                      _InfoRow(
                        icon: Icons.near_me_outlined,
                        title: coordinatesLabel,
                      ),
                  ],
                ),
              ),
              if (mapPreview != null) ...[
                const SizedBox(width: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: SizedBox(width: 118, height: 118, child: mapPreview),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.title,
    this.subtitle,
  });

  final IconData icon;
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: KitchenMockupColors.muted),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.manrope(
                    color: KitchenMockupColors.text,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    height: 1.25,
                  ),
                ),
                if ((subtitle ?? '').trim().isNotEmpty)
                  Text(
                    subtitle!.trim(),
                    style: GoogleFonts.manrope(
                      color: KitchenMockupColors.muted,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
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

BoxDecoration _cardDecoration() {
  return BoxDecoration(
    color: KitchenMockupColors.card,
    borderRadius: BorderRadius.circular(18),
    boxShadow: [
      BoxShadow(
        color: Colors.black.withValues(alpha: 0.05),
        blurRadius: 14,
        offset: const Offset(0, 4),
      ),
    ],
  );
}

/// Kept for compatibility with older call sites.
class KitchenPrimaryActionsBar extends StatelessWidget {
  const KitchenPrimaryActionsBar({
    super.key,
    required this.actions,
    required this.isBusy,
    required this.busyStatus,
    required this.onAction,
  });

  final List<KitchenStatusAction> actions;
  final bool isBusy;
  final String? busyStatus;
  final void Function(KitchenStatusAction action) onAction;

  @override
  Widget build(BuildContext context) {
    return const SizedBox.shrink();
  }
}

class KitchenStatusAction {
  const KitchenStatusAction({
    required this.status,
    required this.label,
    required this.icon,
    required this.color,
  });

  final String status;
  final String label;
  final IconData icon;
  final Color color;
}

class KitchenExpandableSection extends StatelessWidget {
  const KitchenExpandableSection({
    super.key,
    required this.title,
    required this.child,
    this.initiallyExpanded = false,
    this.onExpansionChanged,
  });

  final String title;
  final Widget child;
  final bool initiallyExpanded;
  final ValueChanged<bool>? onExpansionChanged;

  @override
  Widget build(BuildContext context) {
    return const SizedBox.shrink();
  }
}
