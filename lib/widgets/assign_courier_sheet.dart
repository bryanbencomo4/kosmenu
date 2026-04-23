import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl_phone_field/countries.dart' as intl_phone_countries;
import 'package:intl_phone_field/country_picker_dialog.dart';
import 'package:intl_phone_field/intl_phone_field.dart';
import 'package:intl_phone_field/phone_number.dart' as intl_phone_number;
import 'package:kosmenu_app/services/delivery_courier_service.dart';

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
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _aliasController = TextEditingController();

  List<DeliveryCourier> _allCouriers = const <DeliveryCourier>[];
  List<DeliveryCourier> _filteredCouriers = const <DeliveryCourier>[];
  DeliveryCourier? _selectedCourier;

  bool _loadingCouriers = false;
  bool _loadingContacts = false;
  bool _sending = false;
  bool _showFrequentCouriers = false;
  String _selectedCountryCode = 'VE';
  String _selectedDialCode = '+58';
  String _statusMessage = '';
  bool _statusIsError = false;

  @override
  void initState() {
    super.initState();
    _hydrateInitialPhone();
    _phoneController.addListener(_handlePhoneChanged);
    _aliasController.addListener(_handleAliasChanged);
    unawaited(_loadCouriers());
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _aliasController.dispose();
    super.dispose();
  }

  bool get _contactsSupported {
    if (kIsWeb) return false;
    return defaultTargetPlatform == TargetPlatform.android ||
        defaultTargetPlatform == TargetPlatform.iOS;
  }

  void _hydrateInitialPhone() {
    final parsed = _parsePhoneValue(widget.initialQuery, fallbackIso: 'VE');
    _selectedCountryCode = parsed.countryIso;
    final country = _countryByIso(parsed.countryIso);
    _selectedDialCode = '+${country.fullCountryCode}';
    _phoneController.text = parsed.nationalNumber;
  }

  void _setStatus(String message, {bool isError = false}) {
    if (!mounted) return;
    setState(() {
      _statusMessage = message;
      _statusIsError = isError;
    });
  }

  intl_phone_countries.Country _countryByIso(String isoCode) {
    return intl_phone_countries.countries.firstWhere(
      (country) => country.code == isoCode,
      orElse: () => intl_phone_countries.countries.firstWhere(
        (country) => country.code == 'VE',
        orElse: () => intl_phone_countries.countries.first,
      ),
    );
  }

  _ParsedPhoneNumber _parsePhoneValue(String value, {String? fallbackIso}) {
    final normalized = value.trim();
    final normalizedDigits = normalized.replaceAll(RegExp(r'\D'), '');
    final normalizedFallback = (fallbackIso ?? '').trim().toUpperCase();
    final hasFallbackCountry = intl_phone_countries.countries.any(
      (country) => country.code == normalizedFallback,
    );
    final fallbackCountry = hasFallbackCountry ? normalizedFallback : 'VE';

    if (normalizedDigits.isEmpty) {
      return _ParsedPhoneNumber(
        countryIso: fallbackCountry,
        nationalNumber: '',
      );
    }

    final candidates = <intl_phone_countries.Country>[
      ...intl_phone_countries.countries,
    ]..sort(
        (a, b) =>
            b.fullCountryCode.length.compareTo(a.fullCountryCode.length),
      );

    String digitsToMatch = normalizedDigits;
    if (normalized.startsWith('+')) {
      digitsToMatch = normalized.substring(1).replaceAll(RegExp(r'\D'), '');
    }

    for (final country in candidates) {
      final dialDigits = country.fullCountryCode;
      if (digitsToMatch.startsWith(dialDigits) &&
          digitsToMatch.length > dialDigits.length) {
        return _ParsedPhoneNumber(
          countryIso: country.code,
          nationalNumber: digitsToMatch.substring(dialDigits.length),
        );
      }
    }

    return _ParsedPhoneNumber(
      countryIso: fallbackCountry,
      nationalNumber: normalizedDigits,
    );
  }

  String _normalizedPhoneDigits() {
    final local = DeliveryCourierService.normalizeDigits(_phoneController.text);
    final dial = DeliveryCourierService.normalizeDigits(_selectedDialCode);
    if (local.isEmpty || dial.isEmpty) return '';

    var normalizedLocal = local;
    if (normalizedLocal.startsWith('0')) {
      normalizedLocal = normalizedLocal.replaceFirst(RegExp(r'^0+'), '');
    }
    if (normalizedLocal.startsWith(dial)) {
      return normalizedLocal;
    }
    return '$dial$normalizedLocal';
  }

  String _phoneE164() {
    final digits = _normalizedPhoneDigits();
    return digits.isEmpty ? '' : '+$digits';
  }

  void _handlePhoneChanged() {
    final exact = _findExactPhoneMatch();
    if (exact == null && _selectedCourier != null) {
      setState(() {
        _selectedCourier = null;
      });
    }
    _applySearchFilter();
  }

  void _handleAliasChanged() {
    if (_selectedCourier != null &&
        _aliasController.text.trim() != _selectedCourier!.alias) {
      setState(() {
        _selectedCourier = null;
      });
    }
  }

  Future<void> _loadCouriers() async {
    if (!mounted) return;
    setState(() => _loadingCouriers = true);
    final list = await DeliveryCourierService.listByComercio(
      comercioId: widget.comercioId,
      query: '',
      limit: 80,
    );
    if (!mounted) return;
    setState(() {
      _allCouriers = list;
      _loadingCouriers = false;
    });
    _applySearchFilter();
  }

  DeliveryCourier? _findExactPhoneMatch() {
    final normalized = _normalizedPhoneDigits();
    if (normalized.length < 10) return null;
    for (final courier in _allCouriers) {
      if (courier.normalizedPhone == normalized) {
        return courier;
      }
    }
    return null;
  }

  int _queryScore(DeliveryCourier courier, String query) {
    if (query.isEmpty) return 0;

    final q = query.toLowerCase().trim();
    final qDigits = DeliveryCourierService.normalizeDigits(query);
    final alias = courier.alias.toLowerCase();
    final phone = courier.normalizedPhone;
    var score = 0;

    if (qDigits.isNotEmpty) {
      if (phone == qDigits) score += 1000;
      if (phone.startsWith(qDigits)) score += 600;
      if (phone.contains(qDigits)) score += 300;
    }
    if (q.isNotEmpty) {
      if (alias == q) score += 800;
      if (alias.startsWith(q)) score += 500;
      if (alias.contains(q)) score += 250;
    }

    return score;
  }

  void _applySearchFilter() {
    final phoneDigits = _normalizedPhoneDigits();
    final query = phoneDigits;
    final sorted = <DeliveryCourier>[..._allCouriers];

    sorted.sort((a, b) {
      final scoreA = _queryScore(a, query);
      final scoreB = _queryScore(b, query);
      if (scoreA != scoreB) return scoreB.compareTo(scoreA);

      final aTime = a.lastUsedAt?.millisecondsSinceEpoch ?? 0;
      final bTime = b.lastUsedAt?.millisecondsSinceEpoch ?? 0;
      if (aTime != bTime) return bTime.compareTo(aTime);

      if (a.completedOrdersCount != b.completedOrdersCount) {
        return b.completedOrdersCount.compareTo(a.completedOrdersCount);
      }

      return a.alias.toLowerCase().compareTo(b.alias.toLowerCase());
    });

    final filtered = query.isEmpty
        ? sorted
        : sorted.where((item) => _queryScore(item, query) > 0).toList(growable: false);

    final exact = _findExactPhoneMatch();
    setState(() {
      _filteredCouriers = filtered;
      if (exact != null) {
        _selectedCourier = exact;
        if (_aliasController.text.trim().isEmpty) {
          _aliasController.text = exact.alias;
        }
      }
    });
  }

  void _selectCourier(DeliveryCourier courier) {
    final parsed = _parsePhoneValue(courier.phoneE164, fallbackIso: 'VE');
    final country = _countryByIso(parsed.countryIso);
    setState(() {
      _selectedCourier = courier;
      _showFrequentCouriers = false;
      _selectedCountryCode = parsed.countryIso;
      _selectedDialCode = '+${country.fullCountryCode}';
      _phoneController.text = parsed.nationalNumber;
      _aliasController.text = courier.alias;
      _statusMessage = '';
      _statusIsError = false;
    });
  }

  Future<Contact?> _pickContact(List<Contact> contacts) {
    return showModalBottomSheet<Contact>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      builder: (context) {
        return _ContactPickerSheet(contacts: contacts);
      },
    );
  }

  Future<String?> _pickPhoneFromContact(Contact contact) async {
    if (contact.phones.isEmpty) return null;
    if (contact.phones.length == 1) {
      final phone = contact.phones.first;
      return phone.normalizedNumber.isNotEmpty
          ? phone.normalizedNumber
          : phone.number;
    }

    return showModalBottomSheet<String>(
      context: context,
      useSafeArea: true,
      builder: (context) {
        return SafeArea(
          top: false,
          child: ListView.separated(
            shrinkWrap: true,
            itemCount: contact.phones.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final phone = contact.phones[index];
              final value = phone.normalizedNumber.isNotEmpty
                  ? phone.normalizedNumber
                  : phone.number;
              return ListTile(
                title: Text(value),
                onTap: () => Navigator.of(context).pop(value),
              );
            },
          ),
        );
      },
    );
  }

  Future<void> _pickFromContacts() async {
    if (_loadingContacts) return;

    if (!_contactsSupported) {
      _setStatus(
        'Seleccionar desde contactos no esta disponible en esta plataforma.',
        isError: true,
      );
      return;
    }

    setState(() {
      _loadingContacts = true;
      _statusMessage = '';
      _statusIsError = false;
    });

    try {
      final granted = await FlutterContacts.requestPermission(readonly: true);
      if (!granted) {
        _setStatus('Concede permiso para seleccionar desde tu agenda.', isError: true);
        return;
      }

      final contacts = await FlutterContacts.getContacts(
        withProperties: true,
        withPhoto: false,
      );
      final validContacts = contacts.where((item) => item.phones.isNotEmpty).toList();
      if (!mounted) return;
      if (validContacts.isEmpty) {
        _setStatus('Este contacto no tiene numeros disponibles.', isError: true);
        return;
      }

      final picked = await _pickContact(validContacts);
      if (!mounted || picked == null) return;

      final phoneValue = await _pickPhoneFromContact(picked);
      if (!mounted || phoneValue == null || phoneValue.trim().isEmpty) return;

      final parsed = _parsePhoneValue(phoneValue, fallbackIso: _selectedCountryCode);
      final country = _countryByIso(parsed.countryIso);
      final normalized = DeliveryCourierService.normalizeDigits(phoneValue);

      setState(() {
        _selectedCountryCode = parsed.countryIso;
        _selectedDialCode = '+${country.fullCountryCode}';
        _phoneController.text = parsed.nationalNumber;
        _aliasController.text = picked.displayName.trim();
      });

      final existing = _allCouriers.where((item) => item.normalizedPhone == normalized);
      if (existing.isNotEmpty) {
        _selectCourier(existing.first);
        _setStatus('Repartidor frecuente encontrado y seleccionado.');
      } else {
        _applySearchFilter();
        _setStatus('Contacto cargado. Puedes usar este numero directamente.');
      }
    } on MissingPluginException {
      _setStatus(
        'No pudimos acceder a tus contactos. Reinicia la app completamente si agregaste el plugin recientemente.',
        isError: true,
      );
    } on PlatformException {
      _setStatus(
        'No pudimos acceder a tus contactos en este dispositivo. Puedes continuar manualmente.',
        isError: true,
      );
    } catch (_) {
      _setStatus(
        'No pudimos acceder a tus contactos. Puedes continuar manualmente.',
        isError: true,
      );
    } finally {
      if (mounted) {
        setState(() => _loadingContacts = false);
      }
    }
  }

  Future<void> _removeCourier(DeliveryCourier courier) async {
    final removed = await DeliveryCourierService.deactivateCourier(courier.id);
    if (!mounted) return;
    if (!removed) {
      _setStatus('No se pudo remover el repartidor. Intenta de nuevo.', isError: true);
      return;
    }

    if (_selectedCourier?.id == courier.id) {
      _selectedCourier = null;
    }
    await _loadCouriers();
    _setStatus('Repartidor removido de frecuentes.');
  }

  Future<void> _submitSelection() async {
    if (_sending) return;

    final normalized = _normalizedPhoneDigits();
    final phoneE164 = _phoneE164();
    if (normalized.length < 10 || phoneE164.isEmpty) {
      _setStatus('Ingresa un numero de telefono valido.', isError: true);
      return;
    }

    final alias = _aliasController.text.trim();
    final selected = _selectedCourier ?? _findExactPhoneMatch();
    if (selected != null) {
      setState(() => _sending = true);
      Navigator.of(context).pop(
        DeliveryCourierSelection(
          courierId: selected.id,
          alias: selected.alias,
          phoneE164: selected.displayPhone,
          normalizedPhone: selected.normalizedPhone,
        ),
      );
      return;
    }

    setState(() => _sending = true);
    final saved = await DeliveryCourierService.upsertCourier(
      comercioId: widget.comercioId,
      alias: alias,
      phoneE164: phoneE164,
      normalizedPhone: normalized,
    );

    if (!mounted) return;
    setState(() => _sending = false);

    if (saved == null) {
      Navigator.of(context).pop(
        DeliveryCourierSelection(
          alias: alias.isEmpty ? 'Repartidor' : alias,
          phoneE164: phoneE164,
          normalizedPhone: normalized,
        ),
      );
      return;
    }

    Navigator.of(context).pop(
      DeliveryCourierSelection(
        courierId: saved.id,
        alias: saved.alias,
        phoneE164: saved.displayPhone,
        normalizedPhone: saved.normalizedPhone,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final text = colorScheme.onSurface;
    final muted = colorScheme.onSurfaceVariant;
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    final maxSheetHeight = MediaQuery.sizeOf(context).height * 0.88;
    final exactMatch = _findExactPhoneMatch();
    final visibleCouriers = _filteredCouriers.take(4).toList(growable: false);
    final shouldShowFrequentToggle = _allCouriers.isNotEmpty;
    final isUsingFrequent = exactMatch != null || _selectedCourier != null;

    return AnimatedPadding(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOut,
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxSheetHeight),
          child: Container(
            decoration: BoxDecoration(
              color: theme.cardColor,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 46,
                      height: 5,
                      decoration: BoxDecoration(
                        color: muted.withValues(alpha: 0.24),
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    'Asignar repartidor',
                    style: GoogleFonts.manrope(
                      color: text,
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Ingresa el numero de telefono del repartidor para asignarlo a este pedido. Si es un repartidor frecuente, aparecera en la lista para seleccionarlo mas rapido.',
                    style: GoogleFonts.manrope(
                      color: muted,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 12),
                  IntlPhoneField(
                    controller: _phoneController,
                    initialCountryCode: _selectedCountryCode.trim().isEmpty
                        ? 'VE'
                        : _selectedCountryCode,
                    languageCode: 'es',
                    disableLengthCheck: true,
                    style: GoogleFonts.manrope(
                      color: text,
                      fontWeight: FontWeight.w700,
                    ),
                    dropdownTextStyle: GoogleFonts.manrope(
                      color: text,
                      fontWeight: FontWeight.w700,
                    ),
                    invalidNumberMessage: 'Numero invalido para ese pais.',
                    autovalidateMode: AutovalidateMode.onUserInteraction,
                    inputFormatters: <TextInputFormatter>[
                      FilteringTextInputFormatter.digitsOnly,
                    ],
                    pickerDialogStyle: PickerDialogStyle(
                      backgroundColor: theme.cardColor,
                      countryNameStyle: GoogleFonts.manrope(
                        color: text,
                        fontWeight: FontWeight.w700,
                      ),
                      countryCodeStyle: GoogleFonts.manrope(
                        color: muted,
                        fontWeight: FontWeight.w600,
                      ),
                      searchFieldCursorColor: text,
                      searchFieldInputDecoration: InputDecoration(
                        labelText: 'Buscar pais',
                        labelStyle: GoogleFonts.manrope(color: muted),
                        hintText: 'Ej. Venezuela, Colombia',
                        hintStyle: GoogleFonts.manrope(color: muted),
                        suffixIcon: Icon(Icons.search, color: muted),
                        filled: true,
                      ),
                    ),
                    decoration: InputDecoration(
                      labelText: 'Numero de telefono',
                      hintText: '4121234567',
                      hintStyle: GoogleFonts.manrope(color: muted),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                      suffixIcon: Tooltip(
                        message: 'Seleccionar desde contactos',
                        child: IconButton(
                          onPressed: _loadingContacts ? null : _pickFromContacts,
                          icon: _loadingContacts
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.contacts_rounded),
                        ),
                      ),
                    ),
                    onCountryChanged: (country) {
                      setState(() {
                        _selectedCountryCode = country.code;
                        _selectedDialCode = '+${country.dialCode}';
                      });
                      _applySearchFilter();
                    },
                    onChanged: (intl_phone_number.PhoneNumber value) {
                      _selectedCountryCode = value.countryISOCode;
                      _selectedDialCode = '+${value.countryCode}';
                      _applySearchFilter();
                    },
                    validator: (value) {
                      final digits = DeliveryCourierService.normalizeDigits(
                        value?.number ?? '',
                      );
                      if (digits.length < 7) {
                        return 'Numero invalido';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _aliasController,
                    decoration: InputDecoration(
                      labelText: 'Alias opcional',
                      hintText: 'Ej. Juan moto',
                      prefixIcon: const Icon(Icons.badge_outlined),
                    ),
                  ),
                  const SizedBox(height: 10),
                  if (isUsingFrequent)
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFF16A34A).withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: const Color(0xFF16A34A).withValues(alpha: 0.24),
                        ),
                      ),
                      child: Text(
                        'Repartidor frecuente detectado. Puedes continuar sin buscar nada mas.',
                        style: GoogleFonts.manrope(
                          color: const Color(0xFF166534),
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  if (shouldShowFrequentToggle) ...[
                    const SizedBox(height: 6),
                    TextButton.icon(
                      onPressed: () {
                        setState(() {
                          _showFrequentCouriers = !_showFrequentCouriers;
                        });
                      },
                      icon: Icon(
                        _showFrequentCouriers
                            ? Icons.expand_less_rounded
                            : Icons.expand_more_rounded,
                      ),
                      label: Text(
                        _showFrequentCouriers
                            ? 'Ocultar frecuentes'
                            : 'Ver frecuentes',
                      ),
                    ),
                  ],
                  if (_showFrequentCouriers) ...[
                    const SizedBox(height: 4),
                    Expanded(
                      child: _loadingCouriers
                          ? const Center(child: CircularProgressIndicator())
                          : visibleCouriers.isEmpty
                              ? Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: colorScheme.surfaceContainerHighest,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Text(
                                    'No hay frecuentes para este numero.',
                                    style: GoogleFonts.manrope(
                                      color: muted,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                )
                              : ListView.separated(
                                  itemCount: visibleCouriers.length,
                                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                                  itemBuilder: (context, index) {
                                    final courier = visibleCouriers[index];
                                    final selected = _selectedCourier?.id == courier.id;
                                    return Material(
                                      color: Colors.transparent,
                                      child: InkWell(
                                        onTap: () => _selectCourier(courier),
                                        borderRadius: BorderRadius.circular(14),
                                        child: Ink(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 12,
                                            vertical: 10,
                                          ),
                                          decoration: BoxDecoration(
                                            borderRadius: BorderRadius.circular(14),
                                            border: Border.all(
                                              color: selected
                                                  ? const Color(0xFF16A34A)
                                                  : text.withValues(alpha: 0.10),
                                            ),
                                            color: selected
                                                ? const Color(0xFF16A34A).withValues(alpha: 0.08)
                                                : Colors.transparent,
                                          ),
                                          child: Row(
                                            children: [
                                              Expanded(
                                                child: Column(
                                                  crossAxisAlignment: CrossAxisAlignment.start,
                                                  children: [
                                                    Text(
                                                      courier.alias,
                                                      style: GoogleFonts.manrope(
                                                        color: text,
                                                        fontSize: 14,
                                                        fontWeight: FontWeight.w800,
                                                      ),
                                                    ),
                                                    const SizedBox(height: 2),
                                                    Text(
                                                      courier.displayPhone,
                                                      style: GoogleFonts.manrope(
                                                        color: muted,
                                                        fontSize: 12,
                                                        fontWeight: FontWeight.w600,
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                              ),
                                              IconButton(
                                                tooltip: 'Remover repartidor',
                                                onPressed: () => _removeCourier(courier),
                                                icon: const Icon(Icons.delete_outline_rounded),
                                              ),
                                            ],
                                          ),
                                        ),
                                      ),
                                    );
                                  },
                                ),
                    ),
                  ] else
                    const Spacer(),
                  if (_statusMessage.trim().isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      _statusMessage,
                      style: GoogleFonts.manrope(
                        color: _statusIsError
                            ? const Color(0xFFB91C1C)
                            : const Color(0xFF155E75),
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: _sending ? null : () => Navigator.of(context).pop(),
                          child: const Text('Cancelar'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: _sending ? null : _submitSelection,
                          icon: _sending
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.send_rounded, size: 18),
                          label: Text(
                            isUsingFrequent
                                ? 'Seleccionar'
                                : 'Asignar',
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

class _ParsedPhoneNumber {
  const _ParsedPhoneNumber({
    required this.countryIso,
    required this.nationalNumber,
  });

  final String countryIso;
  final String nationalNumber;
}

String _contactDisplayName(Contact contact) {
  final value = contact.displayName.trim();
  return value.isEmpty ? 'Contacto sin nombre' : value;
}

String _normalizeSearchText(String value) {
  return value
      .toLowerCase()
      .trim()
      .replaceAll('á', 'a')
      .replaceAll('à', 'a')
      .replaceAll('ä', 'a')
      .replaceAll('â', 'a')
      .replaceAll('é', 'e')
      .replaceAll('è', 'e')
      .replaceAll('ë', 'e')
      .replaceAll('ê', 'e')
      .replaceAll('í', 'i')
      .replaceAll('ì', 'i')
      .replaceAll('ï', 'i')
      .replaceAll('î', 'i')
      .replaceAll('ó', 'o')
      .replaceAll('ò', 'o')
      .replaceAll('ö', 'o')
      .replaceAll('ô', 'o')
      .replaceAll('ú', 'u')
      .replaceAll('ù', 'u')
      .replaceAll('ü', 'u')
      .replaceAll('û', 'u')
      .replaceAll('ñ', 'n');
}

String _contactSectionLetter(String name) {
  final normalized = _normalizeSearchText(name).toUpperCase();
  if (normalized.isEmpty) return '#';
  final first = normalized[0];
  if (RegExp(r'[A-Z]').hasMatch(first)) {
    return first;
  }
  return '#';
}

class _ContactPickerSheet extends StatefulWidget {
  const _ContactPickerSheet({required this.contacts});

  final List<Contact> contacts;

  @override
  State<_ContactPickerSheet> createState() => _ContactPickerSheetState();
}

class _ContactPickerSheetState extends State<_ContactPickerSheet> {
  final TextEditingController _searchController = TextEditingController();

  late final List<Contact> _sortedContacts;
  List<Contact> _filteredContacts = const <Contact>[];
  Map<String, List<Contact>> _sections = const <String, List<Contact>>{};
  List<String> _letters = const <String>[];

  String _query = '';

  @override
  void initState() {
    super.initState();
    _sortedContacts = <Contact>[...widget.contacts]..sort((a, b) {
      final nameA = _normalizeSearchText(_contactDisplayName(a));
      final nameB = _normalizeSearchText(_contactDisplayName(b));
      return nameA.compareTo(nameB);
    });
    _rebuildSections();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _rebuildSections() {
    final normalizedQuery = _normalizeSearchText(_query);
    final queryDigits = DeliveryCourierService.normalizeDigits(_query);

    final filtered = _sortedContacts.where((contact) {
      if (normalizedQuery.isEmpty && queryDigits.isEmpty) {
        return true;
      }

      final displayName = _normalizeSearchText(_contactDisplayName(contact));
      if (normalizedQuery.isNotEmpty && displayName.contains(normalizedQuery)) {
        return true;
      }

      if (queryDigits.isNotEmpty) {
        for (final phone in contact.phones) {
          final digits = DeliveryCourierService.normalizeDigits(
            phone.normalizedNumber.isNotEmpty
                ? phone.normalizedNumber
                : phone.number,
          );
          if (digits.contains(queryDigits)) {
            return true;
          }
        }
      }

      return false;
    }).toList(growable: false);

    final sections = <String, List<Contact>>{};
    for (final contact in filtered) {
      final section = _contactSectionLetter(_contactDisplayName(contact));
      (sections[section] ??= <Contact>[]).add(contact);
    }

    final letters = sections.keys.toList()
      ..sort((a, b) {
        if (a == '#') return 1;
        if (b == '#') return -1;
        return a.compareTo(b);
      });

    setState(() {
      _filteredContacts = filtered;
      _sections = sections;
      _letters = letters;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final text = theme.colorScheme.onSurface;
    final muted = theme.colorScheme.onSurfaceVariant;
    final sectionColor = theme.colorScheme.surfaceContainerHighest;

    return SafeArea(
      top: false,
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.88,
        child: Column(
          children: [
            const SizedBox(height: 8),
            Center(
              child: Container(
                width: 44,
                height: 5,
                decoration: BoxDecoration(
                  color: muted.withValues(alpha: 0.32),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                controller: _searchController,
                onChanged: (value) {
                  _query = value;
                  _rebuildSections();
                },
                decoration: InputDecoration(
                  labelText: 'Buscar contacto',
                  hintText: 'Nombre o telefono',
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: _query.trim().isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Limpiar',
                          onPressed: () {
                            _searchController.clear();
                            _query = '';
                            _rebuildSections();
                          },
                          icon: const Icon(Icons.close_rounded),
                        ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Expanded(
              child: _filteredContacts.isEmpty
                  ? Center(
                      child: Text(
                        _query.trim().isEmpty
                            ? 'No hay contactos disponibles.'
                            : 'No hay contactos para "$_query".',
                        style: GoogleFonts.manrope(
                          color: muted,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    )
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(16, 2, 8, 20),
                      children: [
                        for (final letter in _letters) ...[
                          Container(
                            margin: const EdgeInsets.only(top: 8, bottom: 6),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: sectionColor,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              letter,
                              style: GoogleFonts.manrope(
                                color: text,
                                fontWeight: FontWeight.w800,
                                fontSize: 12,
                              ),
                            ),
                          ),
                          ..._sections[letter]!.map((contact) {
                            final name = _contactDisplayName(contact);
                            return ListTile(
                              dense: true,
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 6,
                              ),
                              title: Text(name),
                              subtitle: Text(
                                '${contact.phones.length} numero${contact.phones.length == 1 ? '' : 's'}',
                              ),
                              trailing: const Icon(Icons.chevron_right_rounded),
                              onTap: () {
                                Navigator.of(context).pop(contact);
                              },
                            );
                          }),
                        ],
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
