import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kosmenu_app/core/exchange_rate_adjustment.dart';

/// UI for "Ajustar esta tasa para mi negocio". Every number shown comes from
/// [effectiveRate] (the single resolved rate), never from the typed reference.
class ExchangeAdjustmentPanel extends StatelessWidget {
  const ExchangeAdjustmentPanel({
    super.key,
    required this.baseCurrency,
    required this.quoteCurrency,
    required this.enabled,
    required this.referenceController,
    required this.referenceFromCode,
    required this.referenceToCode,
    required this.issue,
    required this.sourceRate,
    required this.effectiveRate,
    required this.sourceLabel,
    required this.factor,
    required this.referenceValue,
    required this.accent,
    required this.onToggled,
    required this.onReferenceChanged,
  });

  final String baseCurrency;
  final String quoteCurrency;
  final bool enabled;
  final TextEditingController referenceController;
  final String referenceFromCode;
  final String referenceToCode;

  /// '' = neutral (still empty), otherwise the message to show.
  final String issue;
  final double sourceRate;

  /// Source rate with the adjustment applied (see resolveEffectiveExchangeRate).
  final double effectiveRate;
  final String sourceLabel;

  /// Non-null only when a valid adjustment is currently applied.
  final double? factor;
  final double? referenceValue;
  final Color accent;
  final ValueChanged<bool> onToggled;
  final ValueChanged<String> onReferenceChanged;

  static const Color _ink = Color(0xFFF8FAFC);
  static const Color _muted = Color(0xFFCBD5E1);
  static const Color _soft = Color(0xFF94A3B8);
  static const Color _surface = Color(0xFF1A2740);
  static const Color _border = Color(0xFF334155);
  static const Color _field = Color(0xFF120E25);
  static const Color _info = Color(0xFF7DD3FC);

  @override
  Widget build(BuildContext context) {
    final quoteLabel = quoteCurrency == 'VES' ? 'Bs' : quoteCurrency;
    final sampleAmount = baseCurrency == 'COP' ? 50000.0 : 100.0;
    final showApplied = enabled && factor != null && effectiveRate > 0;
    final details = factor;

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: _surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _border),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                value: enabled,
                onChanged: (value) => onToggled(value == true),
                activeColor: accent,
                title: const Text(
                  'Ajuste para mi negocio (opcional)',
                  style: TextStyle(
                    color: _ink,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                subtitle: const Text(
                  'Pon tu precio comercial; seguirá moviéndose con la fuente.',
                  style: TextStyle(color: _soft, fontSize: 12, height: 1.3),
                ),
              ),
              if (enabled) ...[
                const SizedBox(height: 8),
                TextField(
                  controller: referenceController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  inputFormatters: <TextInputFormatter>[
                    FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
                  ],
                  style: const TextStyle(
                    color: _ink,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                  decoration: InputDecoration(
                    labelText: '1 $referenceFromCode equivale a',
                    suffixText: ' $referenceToCode',
                    helperText: 'Referencia inicial del ajuste',
                    helperStyle: const TextStyle(color: _soft, fontSize: 11),
                    errorText: issue.isEmpty ? null : issue,
                    errorMaxLines: 3,
                    filled: true,
                    fillColor: _field,
                    labelStyle: const TextStyle(color: _muted),
                    suffixStyle: const TextStyle(
                      color: _muted,
                      fontWeight: FontWeight.w600,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: _border),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: _border),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: accent, width: 1.4),
                    ),
                  ),
                  onChanged: onReferenceChanged,
                ),
                if (showApplied) ...[
                  const SizedBox(height: 14),
                  const Text(
                    'Tasa aplicada ahora',
                    style: TextStyle(
                      color: _soft,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.2,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${formatAdjustmentRate(effectiveRate)} $quoteCurrency por 1 $baseCurrency',
                    style: const TextStyle(
                      color: _ink,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      height: 1.25,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                    decoration: BoxDecoration(
                      color: _field,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: _border),
                    ),
                    child: _PreviewLine(
                      from:
                          '${formatAdjustmentSample(sampleAmount)} $baseCurrency',
                      to:
                          '${formatAdjustmentAmount(sampleAmount * effectiveRate)} $quoteLabel',
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    '✓ Se actualizará automáticamente con $sourceLabel',
                    style: const TextStyle(
                      color: _info,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
                if (sourceRate <= 0) ...[
                  const SizedBox(height: 8),
                  const Text(
                    'La fuente seleccionada no esta disponible ahora. Se conserva tu ajuste.',
                    style: TextStyle(color: Color(0xFFFBBF24), fontSize: 11),
                  ),
                ],
                if (showApplied && details != null && sourceRate > 0)
                  Theme(
                    data: Theme.of(
                      context,
                    ).copyWith(dividerColor: Colors.transparent),
                    child: ExpansionTile(
                      tilePadding: EdgeInsets.zero,
                      childrenPadding: const EdgeInsets.only(bottom: 4),
                      expandedCrossAxisAlignment: CrossAxisAlignment.start,
                      expandedAlignment: Alignment.centerLeft,
                      iconColor: _muted,
                      collapsedIconColor: _muted,
                      title: const Text(
                        'Ver detalles',
                        style: TextStyle(
                          color: _muted,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      children: [
                        _detail(
                          'Tasa de la fuente: ${formatAdjustmentRate(sourceRate)} $quoteCurrency por 1 $baseCurrency',
                        ),
                        _detail(
                          'Factor de ajuste: ${formatAdjustmentFactor(details)} (${formatAdjustmentPercent(details)})',
                        ),
                        if (referenceValue != null)
                          _detail(
                            'Ajuste configurado desde 1 $referenceFromCode = ${formatAdjustmentReferenceInput(referenceValue!)} $referenceToCode',
                          ),
                      ],
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  static Widget _detail(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text(
        text,
        style: const TextStyle(color: _muted, fontSize: 11, height: 1.35),
      ),
    );
  }
}

/// "50.000 COP → 17.241,38 Bs"; stacked with an arrow on narrow screens.
class _PreviewLine extends StatelessWidget {
  const _PreviewLine({required this.from, required this.to});

  final String from;
  final String to;

  @override
  Widget build(BuildContext context) {
    final narrow = MediaQuery.sizeOf(context).width <= 430;
    const fromStyle = TextStyle(
      color: Color(0xFFCBD5E1),
      fontSize: 13,
      fontWeight: FontWeight.w500,
    );
    const toStyle = TextStyle(
      color: Color(0xFFE0F2FE),
      fontSize: 18,
      fontWeight: FontWeight.w700,
    );
    return Semantics(
      liveRegion: true,
      label: '$from equivalen a $to',
      child: ExcludeSemantics(
        child: narrow
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(from, style: fromStyle),
                  const Text(
                    '↓',
                    style: TextStyle(color: Color(0xFF94A3B8), fontSize: 16),
                  ),
                  Text(to, style: toStyle),
                ],
              )
            : Wrap(
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 8,
                children: [
                  Text(from, style: fromStyle),
                  const Text(
                    '→',
                    style: TextStyle(color: Color(0xFF94A3B8), fontSize: 16),
                  ),
                  Text(to, style: toStyle),
                ],
              ),
      ),
    );
  }
}
