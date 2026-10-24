import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/theme/app_theme.dart';
import 'package:kosmenu_app/models/kit_shipping_draft.dart';
import 'package:kosmenu_app/services/zoom_offices_service.dart';
import 'package:url_launcher/url_launcher.dart';

const String kElmenuxfaSupportWhatsappDigits = '584220451906';
const String kCityOtherOption = 'Otro';

/// Secondary kit delivery step — Zoom / soporte / manual with fail-safe UX.
class BillingKitShippingScreen extends StatefulWidget {
  const BillingKitShippingScreen({super.key, required this.initial});

  final KitShippingDraft initial;

  @override
  State<BillingKitShippingScreen> createState() =>
      _BillingKitShippingScreenState();
}

class _BillingKitShippingScreenState extends State<BillingKitShippingScreen> {
  late KitShippingDraft _draft;
  String? _error;
  bool _loadingOffices = true;
  bool _refreshingOffices = false;
  bool _manualForced = false;
  bool _locating = false;
  String? _nearestHint;
  List<ZoomOffice> _offices = const [];
  String _officeQuery = '';
  String? _selectedCity;
  final _cityController = TextEditingController();
  final _officeSearchController = TextEditingController();
  final _cityFocusNode = FocusNode();

  final _officesService = const ZoomOfficesService();

  @override
  void initState() {
    super.initState();
    _draft = widget.initial;
    _manualForced = widget.initial.manualOfficeEntry;
    if (widget.initial.ciudad.trim().isNotEmpty) {
      _selectedCity = widget.initial.ciudad.trim();
      _cityController.text = _selectedCity!;
    }
    _loadOffices();
  }

  @override
  void dispose() {
    _cityController.dispose();
    _officeSearchController.dispose();
    _cityFocusNode.dispose();
    super.dispose();
  }

  TextStyle get _display => GoogleFonts.montserrat(
        fontWeight: FontWeight.w800,
        color: AppColors.textStrong,
      );

  TextStyle get _body => GoogleFonts.roboto(
        fontWeight: FontWeight.w500,
        color: AppColors.textSoft,
      );

  Future<void> _loadOffices({bool refresh = false}) async {
    // Dismiss city autocomplete so "Otro" overlay can't steal the tap.
    FocusManager.instance.primaryFocus?.unfocus();
    _cityFocusNode.unfocus();

    setState(() {
      if (refresh && _offices.isNotEmpty) {
        // Keep the picker mounted — a full loading swap was causing bad UX
        // and accidental jumps to manual entry.
        _refreshingOffices = true;
      } else {
        _loadingOffices = true;
      }
      _nearestHint = null;
      _error = null;
    });

    final result = await _officesService.load(refresh: refresh);
    if (!mounted) return;

    setState(() {
      _loadingOffices = false;
      _refreshingOffices = false;
      if (result.offices.isNotEmpty) {
        _offices = result.offices;
      } else if (_offices.isEmpty) {
        // Only first load with nothing available → manual form.
        _manualForced = true;
        _draft = _draft.copyWith(manualOfficeEntry: true);
      }
      // Refresh failure with an existing catalog: keep it silently.
    });
  }

  InputDecoration _dec(
    String label, {
    String? hint,
    required IconData icon,
    Widget? suffixIcon,
  }) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      prefixIcon: Icon(icon, size: 20, color: const Color(0xFF9B8FB5)),
      suffixIcon: suffixIcon,
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFE6DFF3)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.accent, width: 1.5),
      ),
      labelStyle: _body.copyWith(fontSize: 14),
      hintStyle: _body.copyWith(fontSize: 14, color: const Color(0xFFB0A4C7)),
    );
  }

  /// Unique cities from Zoom catalog (Zoom ASL rarely has real states).
  List<String> get _cities {
    final set = <String>{};
    for (final o in _offices) {
      final city = o.ciudad.trim().isNotEmpty ? o.ciudad.trim() : o.estado.trim();
      if (city.isNotEmpty) set.add(city);
    }
    final list = set.toList()..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
    return list;
  }

  List<ZoomOffice> get _filteredOffices {
    final q = _fold(_officeQuery);
    final city = _selectedCity;
    return _offices.where((o) {
      if (city != null && city != kCityOtherOption) {
        final officeCity = _fold(
          o.ciudad.trim().isNotEmpty ? o.ciudad : o.estado,
        );
        if (officeCity != _fold(city)) return false;
      }
      if (q.isEmpty) return true;
      final hay = _fold('${o.title} ${o.ciudad} ${o.estado} ${o.address}');
      return hay.contains(q);
    }).toList(growable: false);
  }

  static String _fold(String raw) {
    final lower = raw.trim().toLowerCase();
    return lower
        .replaceAll('á', 'a')
        .replaceAll('é', 'e')
        .replaceAll('í', 'i')
        .replaceAll('ó', 'o')
        .replaceAll('ú', 'u')
        .replaceAll('ü', 'u')
        .replaceAll('ñ', 'n');
  }

  void _goManual({String? cityHint}) {
    setState(() {
      _error = null;
      _manualForced = true;
      _selectedCity = kCityOtherOption;
      _cityController.text = kCityOtherOption;
      _draft = _draft.copyWith(
        manualOfficeEntry: true,
        zoomOfficeId: '',
        ciudad: cityHint?.trim().isNotEmpty == true
            ? cityHint!.trim()
            : (_draft.ciudad.trim().isEmpty ? '' : _draft.ciudad),
      );
    });
  }

  void _selectCity(String? city) {
    if (city == null || city.trim().isEmpty) {
      setState(() {
        _selectedCity = null;
        _cityController.clear();
        _officeQuery = '';
        _officeSearchController.clear();
        _nearestHint = null;
      });
      return;
    }
    if (city == kCityOtherOption || _fold(city) == _fold(kCityOtherOption)) {
      _goManual();
      return;
    }
    setState(() {
      _error = null;
      _manualForced = false;
      _selectedCity = city;
      _cityController.text = city;
      _officeQuery = '';
      _officeSearchController.clear();
      _nearestHint = null;
      _draft = _draft.copyWith(
        manualOfficeEntry: false,
        ciudad: city,
        estado: city,
        zoomOfficeId: '',
        zoomOffice: '',
      );
    });
  }

  void _selectOffice(ZoomOffice office) {
    final city = office.ciudad.trim().isNotEmpty
        ? office.ciudad.trim()
        : office.estado.trim();
    setState(() {
      _error = null;
      _manualForced = false;
      if (city.isNotEmpty) {
        _selectedCity = city;
        _cityController.text = city;
      }
      _draft = _draft.copyWith(
        zoomOfficeId: office.id,
        zoomOffice: office.title,
        estado: office.estado.isNotEmpty
            ? office.estado
            : (city.isNotEmpty ? city : _draft.estado),
        ciudad: city.isNotEmpty ? city : _draft.ciudad,
        manualOfficeEntry: false,
      );
    });
  }

  Future<void> _useNearestOffice() async {
    if (_locating || _offices.isEmpty) return;
    setState(() {
      _locating = true;
      _nearestHint = null;
      _error = null;
    });
    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) {
        if (!mounted) return;
        setState(() {
          _locating = false;
          _error = 'Activa la ubicación del dispositivo para detectar la oficina más cercana.';
        });
        return;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        if (!mounted) return;
        setState(() {
          _locating = false;
          _error =
              'Necesitamos permiso de ubicación para sugerirte la oficina más cercana.';
        });
        return;
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 20),
        ),
      );

      final withCoords = _offices.where((o) => o.hasCoords).toList();
      if (withCoords.isEmpty) {
        if (!mounted) return;
        setState(() {
          _locating = false;
          _error =
              'No hay coordenadas en el listado ahora. Busca tu ciudad o elige “Otro”.';
        });
        return;
      }

      ZoomOffice? best;
      var bestMeters = double.infinity;
      for (final office in withCoords) {
        final meters = Geolocator.distanceBetween(
          position.latitude,
          position.longitude,
          office.lat!,
          office.lng!,
        );
        if (meters < bestMeters) {
          bestMeters = meters;
          best = office;
        }
      }

      if (!mounted || best == null) return;
      _selectOffice(best);
      final km = bestMeters / 1000;
      setState(() {
        _locating = false;
        _nearestHint = km < 1
            ? 'Oficina más cercana · ${(bestMeters).round()} m'
            : 'Oficina más cercana · ${km.toStringAsFixed(km < 10 ? 1 : 0)} km';
        _officeQuery = '';
        _officeSearchController.clear();
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _locating = false;
        _error =
            'No pudimos obtener tu ubicación. Busca tu ciudad o elige “Otro”.';
      });
    }
  }

  Future<void> _openSupportWhatsapp() async {
    final name = _draft.recipientName.trim();
    final msg = Uri.encodeComponent(
      'Hola, quiero acordar el envío del kit Portamenú'
      '${name.isEmpty ? '' : ' ($name)'}. '
      'Negocio en elmenuxfa.com.',
    );
    final uri = Uri.parse(
      'https://wa.me/$kElmenuxfaSupportWhatsappDigits?text=$msg',
    );
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  void _submit() {
    final err = _draft.deliveryValidationError;
    if (err != null) {
      setState(() => _error = err);
      return;
    }
    Navigator.of(context).pop(_draft);
  }

  void _selectMode(KitDeliveryMode mode) {
    setState(() {
      _error = null;
      _draft = _draft.copyWith(deliveryMode: mode);
    });
  }

  @override
  Widget build(BuildContext context) {
    final fieldStyle = _body.copyWith(
      fontSize: 15,
      fontWeight: FontWeight.w600,
      color: AppColors.textStrong,
    );

    return Scaffold(
      backgroundColor: const Color(0xFFFAF8FC),
      appBar: AppBar(
        backgroundColor: const Color(0xFFFAF8FC),
        elevation: 0,
        scrolledUnderElevation: 0,
        title: Text('Entrega del kit', style: _display.copyWith(fontSize: 17)),
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
                    children: [
                      Text(
                        '¿Cómo quieres recibir tu kit?',
                        style: _display.copyWith(fontSize: 20, height: 1.25),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Elige la opción más cómoda para ti.',
                        style: _body.copyWith(fontSize: 14, height: 1.4),
                      ),
                      const SizedBox(height: 16),
                      _ModeCard(
                        selected: _draft.deliveryMode == KitDeliveryMode.zoom,
                        icon: Icons.local_shipping_rounded,
                        title: 'Enviar por Zoom Venezuela',
                        subtitle:
                            'Retiras en la oficina Zoom que elijas. El flete se paga al retirar.',
                        onTap: () => _selectMode(KitDeliveryMode.zoom),
                      ),
                      const SizedBox(height: 10),
                      _ModeCard(
                        selected:
                            _draft.deliveryMode == KitDeliveryMode.support,
                        icon: Icons.support_agent_rounded,
                        title: 'Acordar con soporte',
                        subtitle:
                            'Te escribimos por WhatsApp para coordinar el envío.',
                        onTap: () => _selectMode(KitDeliveryMode.support),
                      ),
                      const SizedBox(height: 10),
                      _ModeCard(
                        selected: _draft.deliveryMode == KitDeliveryMode.manual,
                        icon: Icons.edit_location_alt_rounded,
                        title: 'Indicar datos manualmente',
                        subtitle:
                            'Escribe cómo y dónde prefieres recibir el kit.',
                        onTap: () => _selectMode(KitDeliveryMode.manual),
                      ),
                      if (_error != null) ...[
                        const SizedBox(height: 14),
                        _ErrorBox(message: _error!, style: _body),
                      ],
                      const SizedBox(height: 18),
                      if (_draft.deliveryMode == KitDeliveryMode.zoom)
                        _buildZoomSection(fieldStyle),
                      if (_draft.deliveryMode == KitDeliveryMode.support)
                        _SupportPanel(
                          display: _display,
                          body: _body,
                          onWhatsapp: _openSupportWhatsapp,
                        ),
                      if (_draft.deliveryMode == KitDeliveryMode.manual)
                        TextFormField(
                          initialValue: _draft.deliveryNotes,
                          minLines: 3,
                          maxLines: 5,
                          style: fieldStyle,
                          textCapitalization: TextCapitalization.sentences,
                          decoration: _dec(
                            'Datos de entrega',
                            hint:
                                'Ciudad, referencia, persona que recibe, preferencia de envío…',
                            icon: Icons.notes_rounded,
                          ),
                          onChanged: (v) => setState(() {
                            _error = null;
                            _draft = _draft.copyWith(deliveryNotes: v);
                          }),
                        ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                  child: Column(
                    children: [
                      DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(14),
                          gradient: const LinearGradient(
                            colors: [Color(0xFF7C3AED), Color(0xFF5B21B6)],
                          ),
                        ),
                        child: Material(
                          color: Colors.transparent,
                          child: InkWell(
                            onTap: _submit,
                            borderRadius: BorderRadius.circular(14),
                            child: SizedBox(
                              height: 52,
                              width: double.infinity,
                              child: Center(
                                child: Text(
                                  'Continuar al pago →',
                                  style: _display.copyWith(
                                    color: Colors.white,
                                    fontSize: 15.5,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Luego te pediremos el comprobante según el método elegido.',
                        textAlign: TextAlign.center,
                        style: _body.copyWith(fontSize: 12.5, height: 1.35),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildZoomSection(TextStyle fieldStyle) {
    final cities = _cities;
    final offices = _filteredOffices;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextFormField(
          initialValue: _draft.ci,
          style: fieldStyle,
          decoration: _dec(
            'Cédula / RIF',
            hint: 'Ej. V-12345678',
            icon: Icons.badge_outlined,
          ),
          onChanged: (v) => setState(() {
            _error = null;
            _draft = _draft.copyWith(ci: v);
          }),
        ),
        const SizedBox(height: 12),
        if (_loadingOffices)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (_manualForced) ...[
          _ManualZoomFields(
            draft: _draft,
            fieldStyle: fieldStyle,
            display: _display,
            body: _body,
            dec: _dec,
            showBackToList: _offices.isNotEmpty,
            onBackToList: () {
              setState(() {
                _manualForced = false;
                _selectedCity = null;
                _cityController.clear();
                _draft = _draft.copyWith(manualOfficeEntry: false);
              });
            },
            onChanged: (next) => setState(() {
              _error = null;
              _draft = next;
            }),
          ),
        ] else ...[
          OutlinedButton.icon(
            onPressed: _locating ? null : _useNearestOffice,
            icon: _locating
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.my_location_rounded),
            label: Text(
              _locating
                  ? 'Detectando ubicación…'
                  : 'Usar mi ubicación (oficina más cercana)',
            ),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.accent,
              side: const BorderSide(color: AppColors.accent),
              minimumSize: const Size.fromHeight(48),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          if (_nearestHint != null) ...[
            const SizedBox(height: 8),
            Text(
              _nearestHint!,
              style: _body.copyWith(
                fontSize: 13,
                color: AppColors.accent,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 12),
          _CitySearchField(
            controller: _cityController,
            focusNode: _cityFocusNode,
            cities: cities,
            fieldStyle: fieldStyle,
            decoration: _dec(
              'Ciudad',
              hint: 'Busca tu ciudad…',
              icon: Icons.location_city_outlined,
              suffixIcon: _selectedCity != null
                  ? IconButton(
                      tooltip: 'Limpiar',
                      onPressed: () => _selectCity(null),
                      icon: const Icon(Icons.clear_rounded, size: 20),
                    )
                  : null,
            ),
            onSelected: _selectCity,
            onOther: () => _goManual(
              cityHint: _cityController.text == kCityOtherOption
                  ? null
                  : _cityController.text,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _officeSearchController,
            onChanged: (v) => setState(() => _officeQuery = v),
            style: fieldStyle,
            decoration: _dec(
              'Buscar oficina Zoom',
              hint: _selectedCity == null
                  ? 'Nombre o zona…'
                  : 'En $_selectedCity…',
              icon: Icons.search_rounded,
            ),
          ),
          const SizedBox(height: 10),
          Container(
            constraints: const BoxConstraints(maxHeight: 240),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE6DFF3)),
            ),
            child: offices.isEmpty
                ? Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _selectedCity == null
                              ? 'Elige una ciudad o usa tu ubicación.'
                              : 'No hay oficinas con ese filtro.',
                          style: _body.copyWith(fontSize: 13.5),
                        ),
                        const SizedBox(height: 8),
                        TextButton(
                          onPressed: () => _goManual(cityHint: _selectedCity),
                          child: const Text('Otro — escribir manualmente'),
                        ),
                      ],
                    ),
                  )
                : ListView.separated(
                    shrinkWrap: true,
                    itemCount: offices.length.clamp(0, 80),
                    separatorBuilder: (context, index) =>
                        const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final office = offices[index];
                      final selected = _draft.zoomOfficeId == office.id;
                      return ListTile(
                        dense: true,
                        selected: selected,
                        selectedTileColor: const Color(0xFFF3EEFF),
                        title: Text(
                          office.title,
                          style: _display.copyWith(fontSize: 13.5),
                        ),
                        subtitle: Text(
                          office.subtitle,
                          style: _body.copyWith(fontSize: 12.5),
                        ),
                        trailing: selected
                            ? const Icon(
                                Icons.check_circle,
                                color: AppColors.accent,
                              )
                            : null,
                        onTap: () => _selectOffice(office),
                      );
                    },
                  ),
          ),
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: _refreshingOffices
                  ? null
                  : () => _loadOffices(refresh: true),
              icon: _refreshingOffices
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.refresh_rounded, size: 18),
              label: Text(
                _refreshingOffices
                    ? 'Actualizando…'
                    : 'Actualizar listado',
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _CitySearchField extends StatefulWidget {
  const _CitySearchField({
    required this.controller,
    required this.focusNode,
    required this.cities,
    required this.fieldStyle,
    required this.decoration,
    required this.onSelected,
    required this.onOther,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final List<String> cities;
  final TextStyle fieldStyle;
  final InputDecoration decoration;
  final ValueChanged<String> onSelected;
  final VoidCallback onOther;

  @override
  State<_CitySearchField> createState() => _CitySearchFieldState();
}

class _CitySearchFieldState extends State<_CitySearchField> {
  @override
  void initState() {
    super.initState();
    widget.focusNode.addListener(_onFocusChange);
  }

  @override
  void didUpdateWidget(covariant _CitySearchField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.focusNode != widget.focusNode) {
      oldWidget.focusNode.removeListener(_onFocusChange);
      widget.focusNode.addListener(_onFocusChange);
    }
  }

  @override
  void dispose() {
    widget.focusNode.removeListener(_onFocusChange);
    super.dispose();
  }

  void _onFocusChange() {
    if (mounted) setState(() {});
  }

  static String _fold(String raw) {
    final lower = raw.trim().toLowerCase();
    return lower
        .replaceAll('á', 'a')
        .replaceAll('é', 'e')
        .replaceAll('í', 'i')
        .replaceAll('ó', 'o')
        .replaceAll('ú', 'u')
        .replaceAll('ü', 'u')
        .replaceAll('ñ', 'n');
  }

  Iterable<String> _optionsFor(String query) {
    final q = _fold(query);
    final matches = q.isEmpty
        ? widget.cities
        : widget.cities
            .where((c) => _fold(c).contains(q))
            .toList(growable: false);
    // Always offer "Otro" so missing cities never trap the user.
    return [...matches.take(40), kCityOtherOption];
  }

  @override
  Widget build(BuildContext context) {
    return RawAutocomplete<String>(
      textEditingController: widget.controller,
      focusNode: widget.focusNode,
      optionsBuilder: (textEditingValue) {
        // When unfocused (e.g. after tapping Actualizar), hide suggestions
        // so "Otro" cannot intercept taps on controls below.
        if (!widget.focusNode.hasFocus) {
          return const Iterable<String>.empty();
        }
        return _optionsFor(textEditingValue.text);
      },
      displayStringForOption: (option) => option,
      onSelected: (value) {
        if (value == kCityOtherOption) {
          widget.onOther();
        } else {
          widget.onSelected(value);
        }
      },
      fieldViewBuilder: (context, textController, focusNode, onFieldSubmitted) {
        return TextField(
          controller: textController,
          focusNode: focusNode,
          style: widget.fieldStyle,
          textCapitalization: TextCapitalization.words,
          decoration: widget.decoration,
          onTapOutside: (_) => focusNode.unfocus(),
          onSubmitted: (value) {
            final opts = _optionsFor(value).toList();
            if (opts.isEmpty) {
              widget.onOther();
              return;
            }
            final exact = opts.where(
              (o) => o != kCityOtherOption && _fold(o) == _fold(value),
            );
            if (exact.isNotEmpty) {
              widget.onSelected(exact.first);
            } else if (opts.length == 1 && opts.first == kCityOtherOption) {
              widget.onOther();
            } else if (opts.isNotEmpty && opts.first != kCityOtherOption) {
              widget.onSelected(opts.first);
            } else {
              widget.onOther();
            }
            onFieldSubmitted();
          },
        );
      },
      optionsViewBuilder: (context, onSelectedOption, options) {
        final list = options.toList(growable: false);
        if (list.isEmpty) return const SizedBox.shrink();
        return Align(
          alignment: Alignment.topLeft,
          child: Material(
            elevation: 4,
            borderRadius: BorderRadius.circular(12),
            color: Colors.white,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 240, maxWidth: 520),
              child: ListView.builder(
                padding: EdgeInsets.zero,
                shrinkWrap: true,
                itemCount: list.length,
                itemBuilder: (context, index) {
                  final option = list[index];
                  final isOther = option == kCityOtherOption;
                  return ListTile(
                    dense: true,
                    title: Text(
                      isOther ? 'Otro — escribir manualmente' : option,
                      style: GoogleFonts.roboto(
                        fontWeight: isOther ? FontWeight.w700 : FontWeight.w500,
                        color: isOther
                            ? AppColors.accent
                            : AppColors.textStrong,
                      ),
                    ),
                    onTap: () => onSelectedOption(option),
                  );
                },
              ),
            ),
          ),
        );
      },
    );
  }
}

class _ManualZoomFields extends StatelessWidget {
  const _ManualZoomFields({
    required this.draft,
    required this.fieldStyle,
    required this.display,
    required this.body,
    required this.dec,
    required this.showBackToList,
    required this.onBackToList,
    required this.onChanged,
  });

  final KitShippingDraft draft;
  final TextStyle fieldStyle;
  final TextStyle display;
  final TextStyle body;
  final InputDecoration Function(
    String label, {
    String? hint,
    required IconData icon,
    Widget? suffixIcon,
  }) dec;
  final bool showBackToList;
  final VoidCallback onBackToList;
  final ValueChanged<KitShippingDraft> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Datos de la oficina',
                style: display.copyWith(fontSize: 14),
              ),
            ),
            if (showBackToList)
              TextButton(
                onPressed: onBackToList,
                child: const Text('Volver al listado'),
              ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: TextFormField(
                initialValue: draft.estado,
                textCapitalization: TextCapitalization.words,
                style: fieldStyle,
                decoration: dec(
                  'Estado',
                  hint: 'Ej. Miranda',
                  icon: Icons.map_outlined,
                ),
                onChanged: (v) => onChanged(draft.copyWith(estado: v)),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: TextFormField(
                initialValue: draft.ciudad,
                textCapitalization: TextCapitalization.words,
                style: fieldStyle,
                decoration: dec(
                  'Ciudad',
                  hint: 'Ej. Caracas',
                  icon: Icons.location_city_outlined,
                ),
                onChanged: (v) => onChanged(draft.copyWith(ciudad: v)),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        TextFormField(
          initialValue: draft.zoomOffice,
          textCapitalization: TextCapitalization.sentences,
          style: fieldStyle,
          maxLines: 2,
          decoration: dec(
            'Oficina Zoom',
            hint: 'Ej. Zoom Centro Comercial Sambil',
            icon: Icons.storefront_outlined,
          ),
          onChanged: (v) => onChanged(
            draft.copyWith(zoomOffice: v, manualOfficeEntry: true),
          ),
        ),
      ],
    );
  }
}

class _ModeCard extends StatelessWidget {
  const _ModeCard({
    required this.selected,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final bool selected;
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? const Color(0xFFF3EEFF) : Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected ? AppColors.accent : const Color(0xFFE6DFF3),
              width: selected ? 2 : 1,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                selected ? Icons.radio_button_checked : Icons.radio_button_off,
                color: selected ? AppColors.accent : const Color(0xFF9B8FB5),
              ),
              const SizedBox(width: 10),
              Icon(icon, color: AppColors.accent, size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: GoogleFonts.montserrat(
                        fontWeight: FontWeight.w800,
                        fontSize: 14.5,
                        color: AppColors.textStrong,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: GoogleFonts.roboto(
                        fontSize: 13,
                        height: 1.35,
                        color: AppColors.textSoft,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SupportPanel extends StatelessWidget {
  const _SupportPanel({
    required this.display,
    required this.body,
    required this.onWhatsapp,
  });

  final TextStyle display;
  final TextStyle body;
  final VoidCallback onWhatsapp;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE6DFF3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Coordinación por WhatsApp',
            style: display.copyWith(fontSize: 15),
          ),
          const SizedBox(height: 8),
          Text(
            'Será atendido en horario de oficina en un plazo de 48 h aprox., en función de la demanda.',
            style: body.copyWith(fontSize: 13.5, height: 1.4),
          ),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            onPressed: onWhatsapp,
            icon: const Icon(Icons.chat_rounded),
            label: const Text('Abrir WhatsApp de elmenuxfa'),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.accent,
              side: const BorderSide(color: AppColors.accent),
              minimumSize: const Size.fromHeight(48),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'También puedes continuar y te contactamos con los datos del pedido.',
            style: body.copyWith(fontSize: 12.5, height: 1.35),
          ),
        ],
      ),
    );
  }
}

class _ErrorBox extends StatelessWidget {
  const _ErrorBox({required this.message, required this.style});

  final String message;
  final TextStyle style;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFFECACA)),
      ),
      child: Text(
        message,
        style: style.copyWith(
          color: AppColors.danger,
          fontWeight: FontWeight.w700,
          fontSize: 13.5,
        ),
      ),
    );
  }
}
