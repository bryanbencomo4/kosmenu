import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/search_text.dart';
import 'package:kosmenu_app/services/delivery_courier_service.dart';
import 'package:kosmenu_app/widgets/assign_courier/assign_courier_theme.dart';
import 'package:kosmenu_app/widgets/assign_courier/courier_card.dart';
import 'package:kosmenu_app/widgets/assign_courier/courier_selector.dart';
import 'package:kosmenu_app/widgets/assign_courier/empty_courier_state.dart';
import 'package:kosmenu_app/widgets/assign_courier/register_courier_button.dart';
import 'package:kosmenu_app/widgets/assign_courier/register_courier_sheet.dart';

class AssignCourierSheet extends StatefulWidget {
  const AssignCourierSheet({
    super.key,
    required this.comercioId,
    this.initialQuery = '',
  });

  final String comercioId;
  final String initialQuery;

  @override
  State<AssignCourierSheet> createState() => _AssignCourierSheetState();
}

class _AssignCourierSheetState extends State<AssignCourierSheet> {
  final TextEditingController _searchController = TextEditingController();

  List<DeliveryCourier> _couriersList = const <DeliveryCourier>[];
  DeliveryCourier? _selectedCourier;
  bool _isLoading = true;
  bool _sending = false;
  String _query = '';

  bool get _hasCouriers => _couriersList.isNotEmpty;

  List<DeliveryCourier> get _visibleCouriers {
    final query = _query.trim();
    final digits = DeliveryCourierService.normalizeDigits(query);
    final needle = query.toLowerCase();
    final filtered = _couriersList.where((courier) {
      if (query.isEmpty) return true;
      if (needle.isNotEmpty && foldSearchText(courier.alias).contains(foldSearchText(needle))) {
        return true;
      }
      if (digits.isNotEmpty && courier.normalizedPhone.contains(digits)) {
        return true;
      }
      if (digits.isNotEmpty && courier.displayPhone.contains(digits)) {
        return true;
      }
      return false;
    }).toList(growable: false);

    filtered.sort((a, b) {
      final aTime = a.lastUsedAt?.millisecondsSinceEpoch ?? 0;
      final bTime = b.lastUsedAt?.millisecondsSinceEpoch ?? 0;
      if (aTime != bTime) return bTime.compareTo(aTime);
      if (a.completedOrdersCount != b.completedOrdersCount) {
        return b.completedOrdersCount.compareTo(a.completedOrdersCount);
      }
      return a.alias.toLowerCase().compareTo(b.alias.toLowerCase());
    });
    return filtered;
  }

  @override
  void initState() {
    super.initState();
    unawaited(_loadCouriers());
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadCouriers({DeliveryCourier? prefer}) async {
    setState(() => _isLoading = true);
    final list = await DeliveryCourierService.listByComercio(
      comercioId: widget.comercioId,
      query: '',
      limit: 80,
    );
    if (!mounted) return;

    DeliveryCourier? selected = prefer ?? _selectedCourier;
    final initialDigits = DeliveryCourierService.normalizeDigits(widget.initialQuery);
    if (selected == null && initialDigits.length >= 10) {
      for (final courier in list) {
        if (courier.normalizedPhone == initialDigits ||
            courier.normalizedPhone.endsWith(initialDigits) ||
            initialDigits.endsWith(courier.normalizedPhone)) {
          selected = courier;
          break;
        }
      }
    }
    final selectedId = selected?.id;
    if (selectedId != null) {
      for (final courier in list) {
        if (courier.id == selectedId) {
          selected = courier;
          break;
        }
      }
    }

    setState(() {
      _couriersList = list;
      _selectedCourier = selected;
      _isLoading = false;
    });
  }

  Future<void> _openRegister() async {
    final created = await showModalBottomSheet<DeliveryCourier>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => RegisterCourierSheet(comercioId: widget.comercioId),
    );
    if (!mounted || created == null) return;
    await _loadCouriers(prefer: created);
  }

  void _selectCourier(DeliveryCourier courier) {
    setState(() => _selectedCourier = courier);
  }

  void _submitSelection() {
    final selected = _selectedCourier;
    if (_sending || selected == null) return;
    setState(() => _sending = true);
    Navigator.of(context).pop(
      DeliveryCourierSelection(
        courierId: selected.id,
        alias: selected.alias,
        phoneE164: selected.displayPhone,
        normalizedPhone: selected.normalizedPhone,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    final maxSheetHeight = MediaQuery.sizeOf(context).height * 0.88;
    final visible = _visibleCouriers;
    final canAssign = _selectedCourier != null && !_sending;

    return AnimatedPadding(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOut,
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxSheetHeight),
          child: Container(
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: _hasCouriers ? MainAxisSize.max : MainAxisSize.min,
                children: [
                  Center(
                    child: Container(
                      width: 44,
                      height: 5,
                      decoration: BoxDecoration(
                        color: AssignCourierTheme.border,
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Asignar repartidor',
                    style: GoogleFonts.manrope(
                      color: AssignCourierTheme.text,
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Selecciona un repartidor disponible para asignarlo a este pedido.',
                    style: GoogleFonts.manrope(
                      color: AssignCourierTheme.muted,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 18),
                  Row(
                    children: [
                      Text(
                        'Repartidor',
                        style: GoogleFonts.manrope(
                          color: AssignCourierTheme.text,
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const Spacer(),
                      RegisterCourierButton(onPressed: _openRegister),
                    ],
                  ),
                  const SizedBox(height: 8),
                  CourierSelector(
                    controller: _searchController,
                    enabled: _hasCouriers,
                    onChanged: (value) => setState(() => _query = value),
                  ),
                  const SizedBox(height: 18),
                  if (_isLoading)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 36),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else if (!_hasCouriers)
                    EmptyCourierState(onRegister: _openRegister)
                  else ...[
                    Text(
                      'Repartidores frecuentes',
                      style: GoogleFonts.manrope(
                        color: AssignCourierTheme.text,
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Expanded(
                      child: visible.isEmpty
                          ? Padding(
                              padding: const EdgeInsets.symmetric(vertical: 24),
                              child: Center(
                                child: Text(
                                  'Ningún repartidor coincide con la búsqueda.',
                                  textAlign: TextAlign.center,
                                  style: GoogleFonts.manrope(
                                    color: AssignCourierTheme.muted,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            )
                          : ListView.separated(
                              itemCount: visible.length,
                              separatorBuilder: (_, _) => const SizedBox(height: 8),
                              itemBuilder: (context, index) {
                                final courier = visible[index];
                                return CourierCard(
                                  courier: courier,
                                  selected: _selectedCourier?.id == courier.id,
                                  onTap: () => _selectCourier(courier),
                                );
                              },
                            ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: _sending ? null : () => Navigator.of(context).pop(),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size.fromHeight(50),
                            foregroundColor: AssignCourierTheme.text,
                            side: const BorderSide(color: AssignCourierTheme.border),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          child: Text(
                            'Cancelar',
                            style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: canAssign ? _submitSelection : null,
                          style: FilledButton.styleFrom(
                            minimumSize: const Size.fromHeight(50),
                            backgroundColor: AssignCourierTheme.purple,
                            disabledBackgroundColor: AssignCourierTheme.purpleMuted,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          icon: _sending
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Icon(Icons.send_rounded, size: 18),
                          label: Text(
                            'Asignar',
                            style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
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
