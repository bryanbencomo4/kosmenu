import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl_phone_field/intl_phone_field.dart';
import 'package:kosmenu_app/services/delivery_courier_service.dart';
import 'package:kosmenu_app/widgets/assign_courier/assign_courier_theme.dart';

class RegisterCourierSheet extends StatefulWidget {
  const RegisterCourierSheet({
    super.key,
    required this.comercioId,
  });

  final String comercioId;

  @override
  State<RegisterCourierSheet> createState() => _RegisterCourierSheetState();
}

class _RegisterCourierSheetState extends State<RegisterCourierSheet> {
  final _aliasController = TextEditingController();
  final _phoneController = TextEditingController();
  String _countryIso = 'VE';
  String _dialCode = '+58';
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _aliasController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  String _normalizedPhone() {
    final local = DeliveryCourierService.normalizeDigits(_phoneController.text);
    final dial = DeliveryCourierService.normalizeDigits(_dialCode);
    if (local.isEmpty || dial.isEmpty) return '';
    var normalizedLocal = local;
    if (normalizedLocal.startsWith('0')) {
      normalizedLocal = normalizedLocal.replaceFirst(RegExp(r'^0+'), '');
    }
    if (normalizedLocal.startsWith(dial)) return normalizedLocal;
    return '$dial$normalizedLocal';
  }

  Future<void> _save() async {
    if (_saving) return;
    final alias = _aliasController.text.trim();
    final digits = _normalizedPhone();
    if (alias.isEmpty) {
      setState(() => _error = 'Escribe un nombre o apodo.');
      return;
    }
    if (digits.length < 10) {
      setState(() => _error = 'Ingresa un teléfono válido.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final saved = await DeliveryCourierService.upsertCourier(
        comercioId: widget.comercioId,
        alias: alias,
        phoneE164: '+$digits',
        normalizedPhone: digits,
      );
      if (!mounted) return;
      if (saved == null) {
        setState(() {
          _saving = false;
          _error = 'No se pudo guardar el repartidor. Intenta de nuevo.';
        });
        return;
      }
      Navigator.of(context).pop(saved);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = 'No se pudo guardar el repartidor. Revisa la conexión.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SafeArea(
        top: false,
        child: Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          ),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
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
                'Registrar repartidor',
                style: GoogleFonts.manrope(
                  color: AssignCourierTheme.text,
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Guárdalo para asignarlo en un toque en los próximos pedidos.',
                style: GoogleFonts.manrope(
                  color: AssignCourierTheme.muted,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _aliasController,
                textCapitalization: TextCapitalization.words,
                style: GoogleFonts.manrope(
                  color: AssignCourierTheme.text,
                  fontWeight: FontWeight.w700,
                ),
                decoration: InputDecoration(
                  labelText: 'Nombre o apodo',
                  hintText: 'Ej. Bryan',
                  prefixIcon: const Icon(Icons.badge_outlined),
                  filled: true,
                  fillColor: AssignCourierTheme.fieldFill,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              IntlPhoneField(
                controller: _phoneController,
                initialCountryCode: _countryIso,
                languageCode: 'es',
                disableLengthCheck: true,
                inputFormatters: <TextInputFormatter>[
                  FilteringTextInputFormatter.digitsOnly,
                ],
                style: GoogleFonts.manrope(
                  color: AssignCourierTheme.text,
                  fontWeight: FontWeight.w700,
                ),
                decoration: InputDecoration(
                  labelText: 'Teléfono',
                  hintText: '4141234567',
                  filled: true,
                  fillColor: AssignCourierTheme.fieldFill,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                onCountryChanged: (country) {
                  setState(() {
                    _countryIso = country.code;
                    _dialCode = '+${country.dialCode}';
                  });
                },
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(
                  _error!,
                  style: GoogleFonts.manrope(
                    color: const Color(0xFFB91C1C),
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _saving ? null : () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                        foregroundColor: AssignCourierTheme.text,
                        side: const BorderSide(color: AssignCourierTheme.border),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: const Text('Cancelar'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton(
                      onPressed: _saving ? null : _save,
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                        backgroundColor: AssignCourierTheme.purple,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: _saving
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.2,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              'Guardar',
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
    );
  }
}
