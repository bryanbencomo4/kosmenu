import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/business_schedule.dart';
import 'package:kosmenu_app/services/merchant_session.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class BusinessHoursScreen extends StatefulWidget {
  const BusinessHoursScreen({super.key, this.initial});

  final BusinessSchedule? initial;

  @override
  State<BusinessHoursScreen> createState() => _BusinessHoursScreenState();
}

class _BusinessHoursScreenState extends State<BusinessHoursScreen> {
  static const _purple = Color(0xFF6D28D9);
  late BusinessSchedule _schedule;
  bool _saving = false;
  bool get _canEdit => MerchantSession.canManageHours;

  @override
  void initState() {
    super.initState();
    _schedule = widget.initial ?? BusinessSchedule.empty();
  }

  Future<void> _pickRange({
    required String dayKey,
    required int index,
    required bool isStart,
  }) async {
    final day = _schedule.days[dayKey] ?? const BusinessDaySchedule(open: false);
    final range = index < day.ranges.length
        ? day.ranges[index]
        : const BusinessHoursRange(start: '08:00', end: '22:00');
    final current = isStart ? range.start : range.end;
    final parts = current.split(':');
    final initial = TimeOfDay(
      hour: int.tryParse(parts[0]) ?? 8,
      minute: int.tryParse(parts.length > 1 ? parts[1] : '') ?? 0,
    );
    final picked = await showTimePicker(context: context, initialTime: initial);
    if (picked == null) return;
    final formatted =
        '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
    final ranges = [...day.ranges];
    final next = BusinessHoursRange(
      start: isStart ? formatted : range.start,
      end: isStart ? range.end : formatted,
    );
    ranges[index] = next;
    setState(() {
      _schedule = _schedule.copyWithDay(
        dayKey,
        BusinessDaySchedule(open: true, ranges: ranges),
      );
    });
  }

  Future<void> _save() async {
    if (!_canEdit) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(MerchantSession.deniedMessage('cambiar los horarios'))),
      );
      return;
    }
    final comercioId = SupabaseConfig.currentComercioId.trim();
    if (comercioId.isEmpty) return;
    setState(() => _saving = true);
    try {
      await Supabase.instance.client
          .from('comercios')
          .update({'horarios': _schedule.toMap()})
          .eq('id', comercioId);
      if (!mounted) return;
      Navigator.of(context).pop(_schedule);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar el horario: $error')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = _schedule.statusAt();
    return Scaffold(
      backgroundColor: const Color(0xFFF8F7FC),
      appBar: AppBar(
        title: Text(
          'Horarios',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
        ),
        actions: [
          if (_canEdit)
            TextButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Guardar'),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: status.isOpen ? const Color(0xFFECFDF5) : const Color(0xFFFFF7ED),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Text(
              status.caption ?? 'Define los días y franjas en que recibes pedidos.',
              style: GoogleFonts.poppins(fontWeight: FontWeight.w600, fontSize: 13),
            ),
          ),
          const SizedBox(height: 12),
          for (final key in BusinessSchedule.keys)
            _dayCard(key, _schedule.days[key] ?? const BusinessDaySchedule(open: false)),
        ],
      ),
    );
  }

  Widget _dayCard(String key, BusinessDaySchedule day) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      BusinessSchedule.labels[key] ?? key,
                      style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      day.open ? '🟢 Abierto' : '🔴 Cerrado',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: day.open ? const Color(0xFF16A34A) : const Color(0xFFDC2626),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              Switch(
                value: day.open,
                activeThumbColor: _purple,
                onChanged: !_canEdit
                    ? null
                    : (value) {
                  setState(() {
                    _schedule = _schedule.copyWithDay(
                      key,
                      BusinessDaySchedule(
                        open: value,
                        ranges: value && day.ranges.isEmpty
                            ? const [
                                BusinessHoursRange(start: '08:00', end: '22:00'),
                              ]
                            : day.ranges,
                      ),
                    );
                  });
                },
              ),
            ],
          ),
          if (day.open) ...[
            for (var i = 0; i < day.ranges.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: !_canEdit
                            ? null
                            : () => _pickRange(dayKey: key, index: i, isStart: true),
                        child: Text(BusinessSchedule.formatHour(day.ranges[i].start)),
                      ),
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 8),
                      child: Text('—'),
                    ),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: !_canEdit
                            ? null
                            : () => _pickRange(dayKey: key, index: i, isStart: false),
                        child: Text(BusinessSchedule.formatHour(day.ranges[i].end)),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Quitar franja',
                      onPressed: !_canEdit || day.ranges.length <= 1
                          ? null
                          : () {
                              final next = [...day.ranges]..removeAt(i);
                              setState(() {
                                _schedule = _schedule.copyWithDay(
                                  key,
                                  BusinessDaySchedule(open: true, ranges: next),
                                );
                              });
                            },
                      icon: const Icon(Icons.remove_circle_outline),
                    ),
                  ],
                ),
              ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: !_canEdit
                    ? null
                    : () {
                  setState(() {
                    _schedule = _schedule.copyWithDay(
                      key,
                      BusinessDaySchedule(
                        open: true,
                        ranges: [
                          ...day.ranges,
                          const BusinessHoursRange(start: '18:00', end: '23:00'),
                        ],
                      ),
                    );
                  });
                },
                icon: const Icon(Icons.add_rounded),
                label: const Text('Agregar horario'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
