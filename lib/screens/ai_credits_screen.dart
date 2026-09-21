import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/merchant_panel.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class AiCreditsScreen extends StatefulWidget {
  const AiCreditsScreen({super.key, this.initialBalance = 0});

  final double initialBalance;

  @override
  State<AiCreditsScreen> createState() => _AiCreditsScreenState();
}

class _AiCreditsScreenState extends State<AiCreditsScreen> {
  static const _purple = Color(0xFF6D28D9);
  bool _loading = true;
  String? _error;
  double _balance = 0;
  List<AiCreditTransaction> _items = const [];

  @override
  void initState() {
    super.initState();
    _balance = widget.initialBalance;
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await Supabase.instance.client.functions.invoke(
        'get-ai-credits',
        method: HttpMethod.get,
        queryParameters: <String, String>{
          'commerce_id': SupabaseConfig.currentComercioId,
          'include_history': '1',
        },
      );
      final data = response.data is Map
          ? Map<String, dynamic>.from(response.data as Map)
          : const <String, dynamic>{};
      final rawTx = data['transactions'];
      final items = rawTx is List
          ? rawTx
              .whereType<Map>()
              .map(
                (row) => AiCreditTransaction.fromMap(
                  Map<String, dynamic>.from(row),
                ),
              )
              .toList(growable: false)
          : const <AiCreditTransaction>[];
      if (!mounted) return;
      setState(() {
        _balance = data['credits_balance'] is num
            ? (data['credits_balance'] as num).toDouble()
            : double.tryParse('${data['credits_balance'] ?? _balance}') ??
                _balance;
        _items = items;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = '$error';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8F7FC),
      appBar: AppBar(
        title: Text(
          'Fotos profesionales IA',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('No se pudo cargar el historial.', textAlign: TextAlign.center, style: GoogleFonts.poppins()),
                        const SizedBox(height: 8),
                        Text(_error!, textAlign: TextAlign.center, style: GoogleFonts.poppins(fontSize: 12, color: const Color(0xFF6B6F92))),
                        const SizedBox(height: 12),
                        FilledButton(onPressed: _load, child: const Text('Reintentar')),
                      ],
                    ),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                    children: [
                      Container(
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Fotos profesionales IA disponibles',
                              style: GoogleFonts.poppins(
                                fontSize: 13,
                                color: const Color(0xFF6B6F92),
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${_balance.round()}',
                              style: GoogleFonts.poppins(
                                fontSize: 34,
                                fontWeight: FontWeight.w800,
                                color: _purple,
                                height: 1.1,
                              ),
                            ),
                            Text(
                              'mejoras restantes',
                              style: GoogleFonts.poppins(
                                fontSize: 13,
                                color: const Color(0xFF6B6F92),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Historial',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(height: 8),
                      if (_items.isEmpty)
                        Container(
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Text(
                            'Todavía no hay movimientos. Cuando generes fotos o textos con IA, aparecerán aquí.',
                            style: GoogleFonts.poppins(
                              fontSize: 13,
                              color: const Color(0xFF6B6F92),
                            ),
                          ),
                        )
                      else
                        ..._groupedTiles(),
                      const SizedBox(height: 20),
                      Text(
                        'Paquetes disponibles próximamente',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(color: const Color(0xFFEDE9FE)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _packageRow('Paquete básico', '50 créditos'),
                            _packageRow('Paquete profesional', '150 créditos'),
                            _packageRow('Paquete negocio', '500 créditos'),
                            const SizedBox(height: 10),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF8F7FC),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                'Paquetes disponibles próximamente. Cuando activemos la recarga, pagarás con el mismo Pago Móvil de tu plan. No hay un botón de compra activo.',
                                style: GoogleFonts.poppins(
                                  fontSize: 12.5,
                                  height: 1.35,
                                  color: const Color(0xFF4B5563),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }

  List<Widget> _groupedTiles() {
    String? lastLabel;
    final widgets = <Widget>[];
    for (final item in _items) {
      final label = _dayLabel(item.createdAt.toLocal());
      if (label != lastLabel) {
        widgets.add(
          Padding(
            padding: const EdgeInsets.only(top: 12, bottom: 6),
            child: Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: const Color(0xFF6B6F92),
              ),
            ),
          ),
        );
        lastLabel = label;
      }
      final sign = item.isCredit ? '+' : '−';
      widgets.add(
        Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  item.title,
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w600,
                    fontSize: 13.5,
                  ),
                ),
              ),
              Text(
                '$sign${item.amount.toStringAsFixed(item.amount % 1 == 0 ? 0 : 2)} crédito${item.amount == 1 ? '' : 's'}',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w700,
                  color: item.isCredit ? const Color(0xFF16A34A) : const Color(0xFFB45309),
                ),
              ),
            ],
          ),
        ),
      );
    }
    return widgets;
  }

  String _dayLabel(DateTime date) {
    const months = <String>[
      'ene', 'feb', 'mar', 'abr', 'may', 'jun',
      'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
    ];
    return '${date.day} ${months[(date.month - 1).clamp(0, 11)]}';
  }

  Widget _packageRow(String name, String credits) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(
            child: Text(name, style: GoogleFonts.poppins(fontWeight: FontWeight.w600)),
          ),
          Text(credits, style: GoogleFonts.poppins(color: const Color(0xFF6B6F92))),
        ],
      ),
    );
  }
}
