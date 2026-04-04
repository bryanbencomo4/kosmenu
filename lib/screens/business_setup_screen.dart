import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flex_color_picker/flex_color_picker.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image/image.dart' as img;
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl_phone_field/countries.dart' as intl_phone_countries;
import 'package:intl_phone_field/country_picker_dialog.dart';
import 'package:intl_phone_field/intl_phone_field.dart';
import 'package:intl_phone_field/phone_number.dart' as intl_phone_number;
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/comercio.dart';
import 'package:kosmenu_app/screens/admin_dashboard_screen.dart';
import 'package:kosmenu_app/screens/category_screen.dart';
import 'package:kosmenu_app/screens/magic_onboarding_screen.dart';
import 'package:kosmenu_app/services/branding_ai_service.dart';
import 'package:kosmenu_app/widgets/branded_loading_screen.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter/services.dart';

class BusinessSetupScreen extends StatefulWidget {
  const BusinessSetupScreen({
    super.key,
    this.initialComercio,
    this.businessConfigOnly = false,
  });

  final ComercioModel? initialComercio;
  final bool businessConfigOnly;

  @override
  State<BusinessSetupScreen> createState() => _BusinessSetupScreenState();
}

enum _SetupStep { identity, style, checkout, operation, scan, finish }

enum _LogoPickAction { gallery, camera, editCurrent, removeCurrent }

const Color _setupTextHigh = Color(0xFFF8F5FF);
const Color _setupTextMedium = Color(0xFFD8D0EE);
const Color _setupTextLow = Color(0xFFB9AED7);
const Color _defaultPalettePrimary = Color(0xFF6D28D9);
const Color _defaultPaletteAccent = Color(0xFF8B5CF6);
const Color _defaultPaletteSurface = Color(0xFF1B1238);
const Color _defaultPaletteText = Color(0xFFF3E8FF);

const Map<String, List<String>>
_fontSuggestionsByCategory = <String, List<String>>{
  'Restaurante': <String>[
    'Playfair Display',
    'Merriweather',
    'Lora',
    'Cormorant Garamond',
    'Libre Baskerville',
  ],
  'Cafe': <String>['Poppins', 'Nunito', 'Quicksand', 'DM Sans', 'Josefin Sans'],
  'Bar': <String>[
    'Bebas Neue',
    'Oswald',
    'Montserrat',
    'Anton',
    'Barlow Condensed',
  ],
  'Pizzeria': <String>[
    'Bree Serif',
    'Merriweather',
    'Rubik',
    'Archivo',
    'Alegreya Sans',
  ],
  'Panaderia': <String>[
    'Lora',
    'Merriweather',
    'Nunito',
    'Crimson Text',
    'Figtree',
  ],
  'Comida Rapida': <String>[
    'Montserrat',
    'Rubik',
    'Poppins',
    'Archivo Black',
    'Urbanist',
  ],
  'Heladeria': <String>['Fredoka', 'Baloo 2', 'Nunito', 'Comfortaa', 'Sora'],
  'Otro': <String>['Poppins', 'Montserrat', 'Nunito', 'DM Sans', 'Manrope'],
};

class _BusinessSetupScreenState extends State<BusinessSetupScreen> {
  static const String _draftKeyPrefix = 'business_setup_draft_v2';
  static const String _paletteAiPrompt =
      'Analiza exclusivamente el logo y propon una paleta fiel a sus tonos dominantes. '
      'Evita reinterpretaciones fuertes y conserva los colores reales de la marca.';

  static const List<String> _categories = <String>[
    'Restaurante',
    'Cafe',
    'Bar',
    'Pizzeria',
    'Panaderia',
    'Comida Rapida',
    'Heladeria',
    'Otro',
  ];

  static const List<String> _currencies = <String>['USD', 'VES', 'COP', 'EUR'];

  static const List<String> _paymentMethods = <String>[
    'Efectivo',
    'Transferencia',
  ];
  static const int _maxTransferAccountsPerCurrency = 5;
  static const int _maxTransferFieldsPerAccount = 8;
  static const int _maxCashTextLength = 280;
  static const int _maxTransferAccountNameLength = 60;
  static const int _maxTransferFieldLabelLength = 40;
  static const int _maxTransferFieldValueLength = 140;

  final List<_LayoutOption> _layouts = const <_LayoutOption>[
    _LayoutOption(
      id: 'cards',
      name: 'Tarjetas',
      icon: Icons.view_agenda_rounded,
    ),
    _LayoutOption(
      id: 'grid',
      name: 'Cuadricula',
      icon: Icons.grid_view_rounded,
    ),
    _LayoutOption(
      id: 'compact',
      name: 'Compacto',
      icon: Icons.view_list_rounded,
    ),
  ];

  final List<_PaletteOption> _legacyPalettes = const <_PaletteOption>[
    _PaletteOption(
      id: 'uva',
      name: 'Uva',
      primary: Color(0xFF6D28D9),
      accent: Color(0xFF8B5CF6),
      surface: Color(0xFF1B1238),
      text: Color(0xFFF3E8FF),
    ),
    _PaletteOption(
      id: 'cafe',
      name: 'Cafe',
      primary: Color(0xFFD97706),
      accent: Color(0xFFF59E0B),
      surface: Color(0xFF2A1A11),
      text: Color(0xFFFFEDD5),
    ),
    _PaletteOption(
      id: 'oliva',
      name: 'Oliva',
      primary: Color(0xFF4D7C0F),
      accent: Color(0xFF84CC16),
      surface: Color(0xFF172413),
      text: Color(0xFFECFCCB),
    ),
    _PaletteOption(
      id: 'oceano',
      name: 'Oceano',
      primary: Color(0xFF0369A1),
      accent: Color(0xFF0EA5E9),
      surface: Color(0xFF0B1E30),
      text: Color(0xFFE0F2FE),
    ),
  ];

  final List<String> _footers = const <String>[
    'Simple',
    'Redes + WhatsApp',
    'Legal',
  ];

  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _slugController = TextEditingController();
  final TextEditingController _exchangeRateController = TextEditingController();
  final TextEditingController _whatsappController = TextEditingController();
  final TextEditingController _addressController = TextEditingController();
  final BrandingAiService _brandingAiService = const BrandingAiService();

  _SetupStep _step = _SetupStep.identity;
  String _selectedCategory = _categories.first;
  final Set<String> _selectedCurrencies = <String>{'USD'};
  String _activeCheckoutCurrency = 'USD';
  String _selectedLayoutId = 'cards';
  String _selectedPaletteId = 'smart';
  _PaletteOption _paletteSuggestion = const _PaletteOption(
    id: 'elmenuxfa',
    name: 'elmenuxfa.com',
    primary: _defaultPalettePrimary,
    accent: _defaultPaletteAccent,
    surface: _defaultPaletteSurface,
    text: _defaultPaletteText,
  );
  List<Color> _logoDetectedColors = const <Color>[
    _defaultPalettePrimary,
    _defaultPaletteAccent,
    _defaultPaletteSurface,
    _defaultPaletteText,
  ];
  bool _isGeminiPaletteLoading = false;
  String? _paletteStatusMessage;
  bool _paletteStatusIsError = false;
  bool _isExchangeRateLoading = false;
  String? _exchangeRateMessage;
  bool _exchangeRateIsError = false;
  String _lastSuggestedRateCurrency = 'USD';
  bool _exchangeRateManuallyEdited = false;
  final Map<String, String> _exchangeRateByCurrency = <String, String>{
    'USD': '1',
  };
  final Map<String, Set<String>> _selectedPaymentsByCurrency =
      <String, Set<String>>{};
  final Map<String, Map<String, _PaymentMethodDraft>>
  _paymentMethodDraftsByCurrency = <String, Map<String, _PaymentMethodDraft>>{};
  String _lastPaletteLogoPath = '';
  String _lastFontLogoPath = '';
  bool _paletteManuallyEdited = false;
  bool _fontManuallyEdited = false;
  String _selectedHeadingFont = 'Poppins';
  bool _showAllFontSuggestions = false;
  String _selectedFooter = 'Simple';
  bool _allowDelivery = false;
  bool _receiveOrdersOnWhatsapp = true;
  String _selectedPhoneCountryIso = 'VE';
  bool _menuScanCompleted = false;
  bool _manualMenuSetupSelected = false;
  int _menuCatalogCount = 0;
  int _scanCreatedCategories = 0;
  int _scanCreatedProducts = 0;
  String _scanCatalogName = '';
  double? _businessLatitude;
  double? _businessLongitude;

  XFile? _selectedLogo;
  String? _editingComercioId;

  Timer? _slugDebounce;
  Timer? _autosaveTimer;
  Timer? _draftRecoveredHintTimer;

  bool _saving = false;
  bool _loadingExisting = true;
  bool _checkingSlug = false;
  bool _isSlugAvailable = false;
  String? _slugAvailabilityMessage;
  bool _showDraftRecoveredHint = false;

  bool get _isEditing => _editingComercioId != null;

  List<_SetupStep> get _activeSteps => widget.businessConfigOnly
      ? const <_SetupStep>[
          _SetupStep.identity,
          _SetupStep.style,
          _SetupStep.checkout,
          _SetupStep.operation,
        ]
      : _SetupStep.values;

  int get _currentStepFlowIndex {
    final index = _activeSteps.indexOf(_step);
    return index < 0 ? 0 : index;
  }

  bool get _isLastStepInFlow =>
      _currentStepFlowIndex == _activeSteps.length - 1;

  void _ensureCurrentStepInFlow() {
    if (_activeSteps.contains(_step)) {
      return;
    }
    _step = _activeSteps.first;
  }

  bool get _hasMenuSetupCompleted =>
      _menuScanCompleted || _menuCatalogCount > 0;

  _PaletteOption get _palette => _paletteSuggestion;

  List<String> get _fontSuggestions =>
      _fontSuggestionsByCategory[_selectedCategory] ??
      _fontSuggestionsByCategory['Otro']!;

  @override
  void initState() {
    super.initState();
    _ensureCurrencyConfig('USD');
    _loadActiveCurrencyIntoController();
    _loadInitialData();
    _autosaveTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!_loadingExisting) {
        unawaited(_saveDraft());
      }
    });
  }

  @override
  void dispose() {
    _autosaveTimer?.cancel();
    _draftRecoveredHintTimer?.cancel();
    unawaited(_saveDraft());
    _nameController.dispose();
    _slugController.dispose();
    _exchangeRateController.dispose();
    _whatsappController.dispose();
    _addressController.dispose();
    _slugDebounce?.cancel();
    super.dispose();
  }

  Future<void> _loadInitialData() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) {
      if (mounted) {
        setState(() => _loadingExisting = false);
      }
      return;
    }

    try {
      final restored = await _restoreDraft(user.id);
      if (restored) {
        if ((_editingComercioId ?? '').trim().isEmpty) {
          await _hydrateEditingComercioId(user.id);
        }
        _showDraftRecoveredHint = true;
        _scheduleDraftRecoveredHintHide();
        return;
      }

      if (widget.initialComercio != null) {
        _applyComercioSeed(widget.initialComercio!);
        return;
      }

      final row = await Supabase.instance.client
          .from('comercios')
          .select(
            'id, slug, nombre, logo_url, whatsapp, en_linea, categoria, moneda, tasa_cambio_pesos',
          )
          .eq('owner_id', user.id)
          .limit(1)
          .maybeSingle();

      if (row != null) {
        final comercio = ComercioModel.fromMap(Map<String, dynamic>.from(row));
        _applyComercioSeed(comercio, raw: Map<String, dynamic>.from(row));
        await _loadStoredPaymentMethods(comercio.id);
      }
    } catch (_) {
      // Keep defaults when loading fails.
    } finally {
      if (mounted) {
        setState(() => _loadingExisting = false);
      }
      final comercioId = (_editingComercioId ?? '').trim();
      if (comercioId.isNotEmpty) {
        unawaited(_refreshMenuCatalogCount(comercioId));
      }
      unawaited(_checkSlugAvailability(_slugController.text));
      final logoPath = _selectedLogo?.path ?? '';
      if (_shouldGeneratePaletteForLogo(logoPath)) {
        unawaited(_refreshSmartStyleSuggestions());
      }
      if (_step.index >= _SetupStep.checkout.index &&
          !_isExchangeRateConfigured()) {
        unawaited(_suggestExchangeRate());
      }
    }
  }

  void _scheduleDraftRecoveredHintHide() {
    _draftRecoveredHintTimer?.cancel();
    _draftRecoveredHintTimer = Timer(const Duration(seconds: 4), () {
      if (!mounted || !_showDraftRecoveredHint) {
        return;
      }
      setState(() => _showDraftRecoveredHint = false);
    });
  }

  void _applyComercioSeed(ComercioModel comercio, {Map<String, dynamic>? raw}) {
    _editingComercioId = comercio.id.trim().isEmpty ? null : comercio.id.trim();
    _nameController.text = comercio.nombre.trim();
    _slugController.text = (comercio.slug ?? '').trim();

    final category = (raw?['categoria']?.toString().trim() ?? '');
    if (_categories.contains(category)) {
      _selectedCategory = category;
    }

    final seedWhatsapp = (raw?['whatsapp']?.toString() ?? '').trim();
    final seedPhone = (raw?['telefono']?.toString() ?? '').trim();
    final parsedPhone = _parsePhoneValue(
      seedWhatsapp.isNotEmpty ? seedWhatsapp : seedPhone,
      fallbackIso: 'VE',
    );
    _selectedPhoneCountryIso = parsedPhone.countryIso;
    _whatsappController.text = parsedPhone.nationalNumber;
    _addressController.text = (raw?['direccion']?.toString() ?? '').trim();
    _businessLatitude = _toDoubleOrNull(
      raw?['latitud'] ?? raw?['direccion_lat'] ?? raw?['latitude'],
    );
    _businessLongitude = _toDoubleOrNull(
      raw?['longitud'] ?? raw?['direccion_lng'] ?? raw?['longitude'],
    );
    _allowDelivery = raw?['permite_delivery'] == true;
    _receiveOrdersOnWhatsapp = raw?['recibe_pedidos_whatsapp'] == true;

    final currency = (raw?['moneda']?.toString().trim().toUpperCase() ?? '');
    if (_currencies.contains(currency)) {
      _selectedCurrencies
        ..clear()
        ..add(currency);
      _activeCheckoutCurrency = currency;
      _ensureCurrencyConfig(currency);
    }

    final rate = _parseExchangeRate(raw?['tasa_cambio_pesos']);
    if (rate > 0) {
      _exchangeRateByCurrency[_activeCheckoutCurrency] = _formatExchangeRate(
        rate,
      );
      _loadActiveCurrencyIntoController();
      _lastSuggestedRateCurrency = _activeCheckoutCurrency;
    }
  }

  String get _currentCurrency {
    if (_selectedCurrencies.contains(_activeCheckoutCurrency)) {
      return _activeCheckoutCurrency;
    }
    return _selectedCurrencies.isNotEmpty ? _selectedCurrencies.first : 'USD';
  }

  void _ensureCurrencyConfig(String currency) {
    _selectedPaymentsByCurrency.putIfAbsent(
      currency,
      () => <String>{'Efectivo'},
    );
    final drafts = _paymentMethodDraftsByCurrency.putIfAbsent(
      currency,
      () => <String, _PaymentMethodDraft>{},
    );
    for (final method in _selectedPaymentsByCurrency[currency]!) {
      drafts.putIfAbsent(method, () => _PaymentMethodDraft(method: method));
    }

    if (currency == 'USD' &&
        (_exchangeRateByCurrency[currency]?.trim().isEmpty ?? true)) {
      _exchangeRateByCurrency[currency] = '1';
    }
  }

  void _ensurePaymentDraftsForSelection(String currency) {
    _ensureCurrencyConfig(currency);
    final selected = _selectedPaymentsByCurrency[currency] ?? <String>{};
    final drafts =
        _paymentMethodDraftsByCurrency[currency] ??
        <String, _PaymentMethodDraft>{};
    for (final method in selected) {
      drafts.putIfAbsent(method, () => _PaymentMethodDraft(method: method));
    }
    _paymentMethodDraftsByCurrency[currency] = drafts;
  }

  Set<String> _selectedPaymentsForCurrency(String currency) {
    _ensureCurrencyConfig(currency);
    return _selectedPaymentsByCurrency[currency]!;
  }

  Map<String, _PaymentMethodDraft> _paymentDraftsForCurrency(String currency) {
    _ensureCurrencyConfig(currency);
    return _paymentMethodDraftsByCurrency[currency]!;
  }

  void _syncActiveCurrencyDataFromController() {
    final currency = _currentCurrency;
    final text = _exchangeRateController.text.trim();
    _exchangeRateByCurrency[currency] = currency == 'USD' ? '1' : text;
  }

  void _loadActiveCurrencyIntoController() {
    final currency = _currentCurrency;
    _ensureCurrencyConfig(currency);
    final value = currency == 'USD'
        ? '1'
        : (_exchangeRateByCurrency[currency] ?? '');
    _exchangeRateController.value = TextEditingValue(
      text: value,
      selection: TextSelection.collapsed(offset: value.length),
    );
  }

  Future<void> _hydrateEditingComercioId(String userId) async {
    try {
      final row = await Supabase.instance.client
          .from('comercios')
          .select('id')
          .eq('owner_id', userId)
          .limit(1)
          .maybeSingle();
      final id = row?['id']?.toString().trim() ?? '';
      if (id.isNotEmpty) {
        _editingComercioId = id;
      }
    } catch (_) {
      // Keep existing value if fetching fails.
    }
  }

  Future<void> _loadStoredPaymentMethods(String comercioId) async {
    try {
      final rows = await Supabase.instance.client
          .from('metodos_pago')
          .select('*')
          .eq('comercio_id', comercioId);

      final mappedByCurrency = <String, Map<String, _PaymentMethodDraft>>{};
      final selectedByCurrency = <String, Set<String>>{};
      for (final row in rows as List<dynamic>) {
        final map = Map<String, dynamic>.from(row as Map);
        final rawType = map['tipo']?.toString().trim().toLowerCase() ?? '';
        final typeParts = rawType.split('__');
        final currency = typeParts.length > 1
            ? typeParts.last.toUpperCase()
            : _currentCurrency;
        if (!_currencies.contains(currency)) {
          continue;
        }
        var method =
            (map['nombre']?.toString().trim() ??
                    map['tipo']?.toString().trim().replaceAll('_', ' ') ??
                    '')
                .trim();
        if (method.toLowerCase().startsWith('transferencia')) {
          method = 'Transferencia';
        }
        if (method.isEmpty) {
          continue;
        }
        selectedByCurrency.putIfAbsent(currency, () => <String>{}).add(method);

        final target = mappedByCurrency.putIfAbsent(
          currency,
          () => <String, _PaymentMethodDraft>{},
        );

        if (method == 'Transferencia') {
          final current =
              target['Transferencia'] ??
              _PaymentMethodDraft(method: 'Transferencia');
          final detailsRaw = map['detalles']?.toString().trim() ?? '';
          _TransferAccountDraft? account;
          if (detailsRaw.isNotEmpty) {
            try {
              final parsed = jsonDecode(detailsRaw);
              if (parsed is Map<String, dynamic>) {
                account = _TransferAccountDraft.fromMap(parsed);
              }
            } catch (_) {
              account = null;
            }
          }

          account ??= _TransferAccountDraft.fromLegacyColumns(
            name: map['nombre']?.toString().trim() ?? '',
            bank: map['banco']?.toString() ?? '',
            owner: map['titular']?.toString() ?? '',
            documentId: map['cedula']?.toString() ?? '',
            number: map['numero']?.toString() ?? '',
            alias: map['alias']?.toString() ?? '',
            description: map['descripcion']?.toString() ?? '',
            notes: detailsRaw,
          );

          final mergedAccounts = <_TransferAccountDraft>[
            ...current.transferAccounts,
            account,
          ];
          target['Transferencia'] = current.copyWith(
            transferAccounts: mergedAccounts,
          );
        } else {
          target[method] = _PaymentMethodDraft(
            method: method,
            description: map['descripcion']?.toString() ?? '',
            extraDetails: map['detalles']?.toString() ?? '',
          );
        }
      }

      if (selectedByCurrency.isEmpty) {
        return;
      }

      _selectedCurrencies
        ..clear()
        ..addAll(selectedByCurrency.keys);
      if (_selectedCurrencies.isEmpty) {
        _selectedCurrencies.add('USD');
      }
      if (!_selectedCurrencies.contains(_activeCheckoutCurrency)) {
        _activeCheckoutCurrency = _selectedCurrencies.first;
      }

      _selectedPaymentsByCurrency
        ..clear()
        ..addEntries(
          selectedByCurrency.entries.map(
            (entry) => MapEntry(
              entry.key,
              entry.value.where(_paymentMethods.contains).toSet(),
            ),
          ),
        );

      _paymentMethodDraftsByCurrency
        ..clear()
        ..addAll(mappedByCurrency);

      for (final currency in _selectedCurrencies) {
        _ensurePaymentDraftsForSelection(currency);
      }
    } catch (_) {
      // Keep local defaults if loading fails.
    }
  }

  String _draftKeyFor(String userId) => '$_draftKeyPrefix:$userId';

  Future<bool> _restoreDraft(String userId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_draftKeyFor(userId));
    if (raw == null || raw.trim().isEmpty) {
      return false;
    }

    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;

      final stepIndex = map['step'] as int?;
      if (stepIndex != null &&
          stepIndex >= 0 &&
          stepIndex < _SetupStep.values.length) {
        _step = _SetupStep.values[stepIndex];
        _ensureCurrentStepInFlow();
      }

      _nameController.text = (map['name'] as String? ?? '').trim();
      _slugController.text = (map['slug'] as String? ?? '').trim();

      final category = (map['category'] as String? ?? '').trim();
      if (_categories.contains(category)) {
        _selectedCategory = category;
      }

      final currency = (map['currency'] as String? ?? '').trim();
      final currencies = (map['currencies'] as List<dynamic>? ?? <dynamic>[])
          .map((item) => item.toString().trim().toUpperCase())
          .where(_currencies.contains)
          .toSet();
      if (currencies.isNotEmpty) {
        _selectedCurrencies
          ..clear()
          ..addAll(currencies);
      } else if (_currencies.contains(currency)) {
        _selectedCurrencies
          ..clear()
          ..add(currency);
      }
      if (_selectedCurrencies.isEmpty) {
        _selectedCurrencies.add('USD');
      }
      final activeCurrency = (map['activeCurrency'] as String? ?? '')
          .trim()
          .toUpperCase();
      _activeCheckoutCurrency = _selectedCurrencies.contains(activeCurrency)
          ? activeCurrency
          : _selectedCurrencies.first;

      final layout = (map['layout'] as String? ?? '').trim();
      if (_layouts.any((item) => item.id == layout)) {
        _selectedLayoutId = layout;
      }

      final palette = (map['palette'] as String? ?? '').trim();
      if (palette.isNotEmpty) {
        _selectedPaletteId = palette;
      }

      final primary = map['palettePrimary'] as int?;
      final accent = map['paletteAccent'] as int?;
      final surface = map['paletteSurface'] as int?;
      final text = map['paletteText'] as int?;
      if (primary != null && surface != null && text != null) {
        _paletteSuggestion = _PaletteOption(
          id: _selectedPaletteId,
          name: 'Sugerida',
          primary: Color(primary),
          accent: Color(accent ?? primary),
          surface: Color(surface),
          text: Color(text),
        );
      } else {
        final legacy = _legacyPalettes.where((item) => item.id == palette);
        if (legacy.isNotEmpty) {
          _paletteSuggestion = legacy.first;
        }
      }

      final headingFont = (map['headingFont'] as String? ?? '').trim();
      if (headingFont.isNotEmpty) {
        _selectedHeadingFont = headingFont;
      }

      final exchangeRate = _parseExchangeRate(map['exchangeRate']);
      if (exchangeRate > 0) {
        _exchangeRateByCurrency[_activeCheckoutCurrency] = _formatExchangeRate(
          exchangeRate,
        );
      }

      final exchangeRates = _toStringDynamicMap(map['exchangeRates']);
      if (exchangeRates.isNotEmpty) {
        for (final entry in exchangeRates.entries) {
          final currencyCode = entry.key.trim().toUpperCase();
          if (!_currencies.contains(currencyCode)) {
            continue;
          }
          _exchangeRateByCurrency[currencyCode] =
              entry.value?.toString().trim() ?? '';
        }
      }

      _lastSuggestedRateCurrency =
          (map['lastSuggestedRateCurrency'] as String? ?? '').trim();
      _exchangeRateManuallyEdited =
          map['exchangeRateManuallyEdited'] as bool? ?? false;

      final editingId = (map['editingComercioId'] as String? ?? '').trim();
      if (editingId.isNotEmpty) {
        _editingComercioId = editingId;
      }

      final draftWhatsapp = (map['whatsapp'] as String? ?? '').trim();
      final legacyPhone = (map['phone'] as String? ?? '').trim();
      final draftCountryIso = (map['whatsappCountryIso'] as String? ?? '')
          .trim()
          .toUpperCase();
      final parsedPhone = _parsePhoneValue(
        draftWhatsapp.isNotEmpty ? draftWhatsapp : legacyPhone,
        fallbackIso: draftCountryIso,
      );
      _selectedPhoneCountryIso = parsedPhone.countryIso;
      _whatsappController.text = parsedPhone.nationalNumber;
      _addressController.text = (map['address'] as String? ?? '').trim();
      _businessLatitude = _toDoubleOrNull(map['businessLatitude']);
      _businessLongitude = _toDoubleOrNull(map['businessLongitude']);
      _allowDelivery = map['allowDelivery'] as bool? ?? false;
      _receiveOrdersOnWhatsapp =
          map['receiveOrdersOnWhatsapp'] as bool? ?? true;
      _menuScanCompleted = map['menuScanCompleted'] as bool? ?? false;
      _manualMenuSetupSelected =
          map['manualMenuSetupSelected'] as bool? ?? false;
      _menuCatalogCount = (map['menuCatalogCount'] as num?)?.toInt() ?? 0;
      _scanCreatedCategories =
          (map['scanCreatedCategories'] as num?)?.toInt() ?? 0;
      _scanCreatedProducts = (map['scanCreatedProducts'] as num?)?.toInt() ?? 0;
      _scanCatalogName = (map['scanCatalogName'] as String? ?? '').trim();

      if (!_menuScanCompleted) {
        _manualMenuSetupSelected = _menuCatalogCount > 0;
      }

      _lastPaletteLogoPath = (map['lastPaletteLogoPath'] as String? ?? '')
          .trim();
      _lastFontLogoPath = (map['lastFontLogoPath'] as String? ?? '').trim();
      _paletteManuallyEdited = map['paletteManuallyEdited'] as bool? ?? false;
      _fontManuallyEdited = map['fontManuallyEdited'] as bool? ?? false;

      final footer = (map['footer'] as String? ?? '').trim();
      if (_footers.contains(footer)) {
        _selectedFooter = footer;
      }

      final payments = (map['payments'] as List<dynamic>? ?? <dynamic>[])
          .map((item) => item.toString())
          .where(_paymentMethods.contains)
          .toSet();
      if (payments.isNotEmpty) {
        _selectedPaymentsByCurrency[_activeCheckoutCurrency] = payments;
      }

      final paymentsByCurrency = _toStringDynamicMap(map['paymentsByCurrency']);
      if (paymentsByCurrency.isNotEmpty) {
        _selectedPaymentsByCurrency.clear();
        for (final entry in paymentsByCurrency.entries) {
          final currencyCode = entry.key.trim().toUpperCase();
          if (!_currencies.contains(currencyCode)) {
            continue;
          }
          final values = (entry.value as List<dynamic>? ?? <dynamic>[])
              .map((item) => item.toString())
              .where(_paymentMethods.contains)
              .toSet();
          if (values.isNotEmpty) {
            _selectedPaymentsByCurrency[currencyCode] = values;
          }
        }
      }

      final paymentDrafts = _toStringDynamicMap(map['paymentDrafts']);
      _paymentMethodDraftsByCurrency.clear();

      final paymentDraftsByCurrency = _toStringDynamicMap(
        map['paymentDraftsByCurrency'],
      );
      if (paymentDraftsByCurrency.isNotEmpty) {
        for (final currencyEntry in paymentDraftsByCurrency.entries) {
          final currencyCode = currencyEntry.key.trim().toUpperCase();
          if (!_currencies.contains(currencyCode)) {
            continue;
          }
          final draftMap = _toStringDynamicMap(currencyEntry.value);
          _paymentMethodDraftsByCurrency[currencyCode] = draftMap.map(
            (method, value) => MapEntry(
              method,
              _PaymentMethodDraft.fromMap(method, _toStringDynamicMap(value)),
            ),
          );
        }
      } else {
        _paymentMethodDraftsByCurrency[_activeCheckoutCurrency] = paymentDrafts
            .map(
              (key, value) => MapEntry(
                key,
                _PaymentMethodDraft.fromMap(key, _toStringDynamicMap(value)),
              ),
            );
      }

      for (final currencyCode in _selectedCurrencies) {
        _ensurePaymentDraftsForSelection(currencyCode);
      }
      _loadActiveCurrencyIntoController();

      final logoPath = (map['logoPath'] as String? ?? '').trim();
      if (logoPath.isNotEmpty && await File(logoPath).exists()) {
        _selectedLogo = XFile(logoPath);
        if (_lastPaletteLogoPath.isEmpty && primary != null) {
          _lastPaletteLogoPath = logoPath;
        }
        if (_lastFontLogoPath.isEmpty && headingFont.isNotEmpty) {
          _lastFontLogoPath = logoPath;
        }
      }

      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> _saveDraft() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) {
      return;
    }

    _syncActiveCurrencyDataFromController();

    final prefs = await SharedPreferences.getInstance();
    final payload = <String, dynamic>{
      'step': _step.index,
      'name': _nameController.text.trim(),
      'slug': _normalizeSlug(_slugController.text),
      'category': _selectedCategory,
      'currency': _currentCurrency,
      'currencies': _selectedCurrencies.toList(),
      'activeCurrency': _currentCurrency,
      'layout': _selectedLayoutId,
      'palette': _selectedPaletteId,
      'palettePrimary': _paletteSuggestion.primary.toARGB32(),
      'paletteAccent': _paletteSuggestion.accent.toARGB32(),
      'paletteSurface': _paletteSuggestion.surface.toARGB32(),
      'paletteText': _paletteSuggestion.text.toARGB32(),
      'headingFont': _selectedHeadingFont,
      'exchangeRate':
          _exchangeRateByCurrency[_currentCurrency] ??
          _exchangeRateController.text.trim(),
      'exchangeRates': _exchangeRateByCurrency,
      'lastSuggestedRateCurrency': _lastSuggestedRateCurrency,
      'exchangeRateManuallyEdited': _exchangeRateManuallyEdited,
      'editingComercioId': _editingComercioId ?? '',
      'whatsapp': _whatsappE164,
      'whatsappCountryIso': _selectedPhoneCountryIso,
      'address': _addressController.text.trim(),
      'businessLatitude': _businessLatitude,
      'businessLongitude': _businessLongitude,
      'allowDelivery': _allowDelivery,
      'receiveOrdersOnWhatsapp': _receiveOrdersOnWhatsapp,
      'menuScanCompleted': _menuScanCompleted,
      'manualMenuSetupSelected': _manualMenuSetupSelected,
      'menuCatalogCount': _menuCatalogCount,
      'scanCreatedCategories': _scanCreatedCategories,
      'scanCreatedProducts': _scanCreatedProducts,
      'scanCatalogName': _scanCatalogName,
      'lastPaletteLogoPath': _lastPaletteLogoPath,
      'lastFontLogoPath': _lastFontLogoPath,
      'paletteManuallyEdited': _paletteManuallyEdited,
      'fontManuallyEdited': _fontManuallyEdited,
      'footer': _selectedFooter,
      'payments': _selectedPaymentsForCurrency(_currentCurrency).toList(),
      'paymentsByCurrency': _selectedPaymentsByCurrency.map(
        (currency, methods) => MapEntry(currency, methods.toList()),
      ),
      'paymentDrafts': _paymentDraftsForCurrency(
        _currentCurrency,
      ).map((key, value) => MapEntry(key, value.toMap())),
      'paymentDraftsByCurrency': _paymentMethodDraftsByCurrency.map(
        (currency, drafts) => MapEntry(
          currency,
          drafts.map((key, value) => MapEntry(key, value.toMap())),
        ),
      ),
      'logoPath': _selectedLogo?.path ?? '',
    };

    await prefs.setString(_draftKeyFor(user.id), jsonEncode(payload));
  }

  Future<void> _clearDraft() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) {
      return;
    }

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_draftKeyFor(user.id));
  }

  String _normalizeSlug(String value) {
    return value
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'\s+'), '-')
        .replaceAll(RegExp(r'[^a-z0-9-]'), '')
        .replaceAll(RegExp(r'-+'), '-')
        .replaceAll(RegExp(r'^-|-$'), '');
  }

  bool _isSlugFormatValid(String value) {
    return RegExp(r'^[a-z0-9]+(?:-[a-z0-9]+)*$').hasMatch(value);
  }

  void _onSlugChanged(String value) {
    final normalized = _normalizeSlug(value);
    if (normalized != value) {
      _slugController.value = TextEditingValue(
        text: normalized,
        selection: TextSelection.collapsed(offset: normalized.length),
      );
    }

    _slugDebounce?.cancel();
    _slugDebounce = Timer(const Duration(milliseconds: 320), () {
      _checkSlugAvailability(_slugController.text);
      unawaited(_saveDraft());
    });
  }

  Future<void> _checkSlugAvailability(String rawValue) async {
    final slug = _normalizeSlug(rawValue);
    final userId =
        Supabase.instance.client.auth.currentUser?.id.toString().trim() ?? '';

    if (slug.length < 3 || !_isSlugFormatValid(slug)) {
      if (!mounted) return;
      setState(() {
        _checkingSlug = false;
        _isSlugAvailable = false;
        _slugAvailabilityMessage = null;
      });
      return;
    }

    if (!mounted) return;
    setState(() {
      _checkingSlug = true;
      _isSlugAvailable = false;
      _slugAvailabilityMessage = null;
    });

    try {
      final row = await Supabase.instance.client
          .from('comercios')
          .select('id, owner_id')
          .eq('slug', slug)
          .limit(1)
          .maybeSingle();

      final existingId = row?['id']?.toString().trim();
      final existingOwnerId = row?['owner_id']?.toString().trim();
      final sameBusiness =
          existingId != null &&
          _editingComercioId != null &&
          existingId == _editingComercioId;
      final sameOwner =
          existingId != null &&
          userId.isNotEmpty &&
          existingOwnerId != null &&
          existingOwnerId == userId;

      if (_editingComercioId == null && sameOwner) {
        _editingComercioId = existingId;
      }

      if (!mounted) return;
      setState(() {
        _checkingSlug = false;
        _isSlugAvailable = row == null || sameBusiness || sameOwner;
        _slugAvailabilityMessage = _isSlugAvailable ? 'Disponible' : 'En uso';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _checkingSlug = false;
        _isSlugAvailable = false;
        _slugAvailabilityMessage = null;
      });
    }
  }

  Future<void> _pickLogo() async {
    try {
      while (mounted) {
        if (!mounted) {
          return;
        }

        final action = await showModalBottomSheet<_LogoPickAction>(
          context: context,
          useSafeArea: false,
          backgroundColor: const Color(0xFF17122E),
          showDragHandle: true,
          builder: (context) {
            return Theme(
              data: Theme.of(context).copyWith(
                listTileTheme: const ListTileThemeData(
                  iconColor: Color(0xFFEDE9FE),
                  textColor: Color(0xFFF8F5FF),
                ),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 2, 16, 6),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Selecciona una opcion',
                        style: TextStyle(
                          color: Color(0xFFD8B4FE),
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  ListTile(
                    leading: const Icon(Icons.photo_library_rounded),
                    title: const Text('Elegir de galeria'),
                    onTap: () =>
                        Navigator.of(context).pop(_LogoPickAction.gallery),
                  ),
                  ListTile(
                    leading: const Icon(Icons.photo_camera_rounded),
                    title: const Text('Tomar foto'),
                    onTap: () =>
                        Navigator.of(context).pop(_LogoPickAction.camera),
                  ),
                  if (_selectedLogo != null)
                    ListTile(
                      leading: const Icon(Icons.crop_rounded),
                      title: const Text('Editar foto actual'),
                      onTap: () => Navigator.of(
                        context,
                      ).pop(_LogoPickAction.editCurrent),
                    ),
                  if (_selectedLogo != null)
                    ListTile(
                      leading: const Icon(Icons.delete_outline_rounded),
                      title: const Text('Eliminar logo'),
                      onTap: () => Navigator.of(
                        context,
                      ).pop(_LogoPickAction.removeCurrent),
                    ),
                  ListTile(
                    leading: const Icon(Icons.close_rounded),
                    title: const Text('Cancelar'),
                    onTap: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            );
          },
        );

        if (!mounted || action == null) {
          return;
        }

        if (action == _LogoPickAction.removeCurrent) {
          setState(() {
            _selectedLogo = null;
            _lastPaletteLogoPath = '';
            _lastFontLogoPath = '';
            _paletteManuallyEdited = false;
            _fontManuallyEdited = false;
          });
          await _saveDraft();
          return;
        }

        if (action == _LogoPickAction.editCurrent) {
          final currentPath = (_selectedLogo?.path ?? '').trim();
          if (currentPath.isEmpty) {
            return;
          }

          if (!await File(currentPath).exists()) {
            if (!mounted) {
              return;
            }
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('No se encontro la foto actual.')),
            );
            return;
          }

          final selectedPath = await _openManualLogoEditor(currentPath);
          if (!mounted || selectedPath == null) {
            return;
          }

          final persistedPath = await _persistLogoToLocalStorage(selectedPath);
          if (!mounted) {
            return;
          }

          setState(() {
            _selectedLogo = XFile(persistedPath);
            _lastPaletteLogoPath = '';
            _lastFontLogoPath = '';
            _paletteManuallyEdited = false;
            _fontManuallyEdited = false;
          });
          await _refreshSmartStyleSuggestions();
          await _saveDraft();
          return;
        }

        final source = action == _LogoPickAction.camera
            ? ImageSource.camera
            : ImageSource.gallery;

        final picked = await ImagePicker().pickImage(
          source: source,
          imageQuality: 92,
          maxWidth: 2200,
          maxHeight: 2200,
        );
        if (!mounted || picked == null) {
          return;
        }

        final selectedPath = await _openManualLogoEditor(picked.path);
        if (!mounted) {
          return;
        }
        if (selectedPath == null) {
          return;
        }

        final persistedPath = await _persistLogoToLocalStorage(selectedPath);
        if (!mounted) {
          return;
        }

        setState(() {
          _selectedLogo = XFile(persistedPath);
          _lastPaletteLogoPath = '';
          _lastFontLogoPath = '';
          _paletteManuallyEdited = false;
          _fontManuallyEdited = false;
        });
        await _refreshSmartStyleSuggestions();
        await _saveDraft();
        return;
      }
    } on PlatformException catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'No se pudo abrir la camara/galeria (${error.code}). Revisa permisos.',
          ),
        ),
      );
    } catch (_) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo seleccionar la imagen.')),
      );
    }
  }

  Future<String?> _openManualLogoEditor(String sourcePath) async {
    try {
      final sourceFile = File(sourcePath);
      if (!await sourceFile.exists()) {
        return null;
      }

      final cropped = await ImageCropper().cropImage(
        sourcePath: sourcePath,
        compressFormat: ImageCompressFormat.jpg,
        compressQuality: 90,
        uiSettings: [
          AndroidUiSettings(
            toolbarTitle: 'Ajustar logo',
            toolbarColor: const Color(0xFF16102A),
            toolbarWidgetColor: Colors.white,
            activeControlsWidgetColor: const Color(0xFF8B5CF6),
            lockAspectRatio: true,
            initAspectRatio: CropAspectRatioPreset.square,
            hideBottomControls: false,
            cropStyle: CropStyle.circle,
          ),
          IOSUiSettings(
            title: 'Ajustar logo',
            aspectRatioLockEnabled: true,
            cropStyle: CropStyle.circle,
          ),
        ],
      );

      final croppedPath = (cropped?.path ?? '').trim();
      return croppedPath.isEmpty ? null : croppedPath;
    } catch (_) {
      return null;
    }
  }

  Future<String> _persistLogoToLocalStorage(String sourcePath) async {
    final docDir = await getApplicationDocumentsDirectory();
    final targetDir = Directory(
      '${docDir.path}${Platform.pathSeparator}setup_logos',
    );
    if (!await targetDir.exists()) {
      await targetDir.create(recursive: true);
    }

    final targetPath =
        '${targetDir.path}${Platform.pathSeparator}logo_${DateTime.now().millisecondsSinceEpoch}.jpg';
    final copied = await File(sourcePath).copy(targetPath);
    return copied.path;
  }

  bool _shouldGeneratePaletteForLogo(String logoPath) {
    final normalized = logoPath.trim();
    if (normalized.isEmpty) {
      return false;
    }
    final paletteReady = _lastPaletteLogoPath == normalized;
    final fontReady = _lastFontLogoPath == normalized;
    return !(paletteReady && fontReady);
  }

  Future<void> _refreshSmartStyleSuggestions({bool force = false}) async {
    if (_isGeminiPaletteLoading) {
      return;
    }

    if (_selectedLogo == null) {
      if (!mounted) {
        return;
      }
      setState(() {
        _applyDefaultPalette();
        _isGeminiPaletteLoading = false;
        _paletteStatusMessage = null;
        _paletteStatusIsError = false;
        if (!_fontSuggestions.contains(_selectedHeadingFont)) {
          _selectedHeadingFont = _fontSuggestions.first;
        }
      });
      return;
    }

    final logoPath = _selectedLogo!.path;
    if (!force && !_shouldGeneratePaletteForLogo(logoPath)) {
      return;
    }

    final localAnalysis = await _analyzeLogoPalette(logoPath);
    if (!mounted) {
      return;
    }

    setState(() {
      final canApplyGeneratedPalette =
          !_paletteManuallyEdited || _lastPaletteLogoPath != logoPath;
      if (canApplyGeneratedPalette) {
        _paletteSuggestion =
            localAnalysis?.palette ??
            const _PaletteOption(
              id: 'elmenuxfa',
              name: 'elmenuxfa.com',
              primary: _defaultPalettePrimary,
              accent: _defaultPaletteAccent,
              surface: _defaultPaletteSurface,
              text: _defaultPaletteText,
            );
        _lastPaletteLogoPath = logoPath;
      }

      _logoDetectedColors =
          localAnalysis?.colors ??
          const <Color>[
            _defaultPalettePrimary,
            _defaultPaletteAccent,
            _defaultPaletteSurface,
            _defaultPaletteText,
          ];
      if (canApplyGeneratedPalette) {
        _selectedPaletteId = localAnalysis == null ? 'elmenuxfa' : 'logo-smart';
      }
      _isGeminiPaletteLoading = true;
      _paletteStatusMessage =
          'Espera unos segundos mientras buscamos la paleta de colores de tu marca.';
      _paletteStatusIsError = false;

      final canApplySuggestedFont =
          !_fontManuallyEdited || _lastFontLogoPath != logoPath;
      if (canApplySuggestedFont &&
          !_fontSuggestions.contains(_selectedHeadingFont)) {
        _selectedHeadingFont = _fontSuggestions.first;
        _lastFontLogoPath = logoPath;
      }
    });

    final geminiAnalysis = await _analyzeLogoPaletteWithGemini(logoPath);
    if (!mounted) {
      return;
    }

    setState(() {
      if (geminiAnalysis != null) {
        final canApplyGeneratedPalette =
            !_paletteManuallyEdited || _lastPaletteLogoPath != logoPath;
        if (canApplyGeneratedPalette) {
          _paletteSuggestion = geminiAnalysis.palette;
          _selectedPaletteId = 'logo-smart';
          _lastPaletteLogoPath = logoPath;
        }
        _logoDetectedColors = geminiAnalysis.colors;
      }

      _isGeminiPaletteLoading = false;
      _paletteStatusMessage = geminiAnalysis == null
          ? 'No pudimos generar la paleta con IA. Igual dejamos una base para que la ajustes manualmente a tu gusto.'
          : null;
      _paletteStatusIsError = geminiAnalysis == null;

      final suggestedFont = geminiAnalysis?.suggestedHeadingFont?.trim() ?? '';
      final canApplySuggestedFont =
          !_fontManuallyEdited || _lastFontLogoPath != logoPath;
      if (canApplySuggestedFont &&
          suggestedFont.isNotEmpty &&
          _fontSuggestions.contains(suggestedFont)) {
        _selectedHeadingFont = suggestedFont;
        _lastFontLogoPath = logoPath;
      } else if (canApplySuggestedFont &&
          !_fontSuggestions.contains(_selectedHeadingFont)) {
        _selectedHeadingFont = _fontSuggestions.first;
        _lastFontLogoPath = logoPath;
      }
    });
    await _saveDraft();
  }

  Future<_LogoPaletteAnalysis?> _analyzeLogoPaletteWithGemini(
    String localLogoPath,
  ) async {
    try {
      final comercioId = await _ensureComercioIdForGemini();
      if (comercioId.isEmpty) {
        return null;
      }

      final imageUrl = await _uploadLogoForPaletteAnalysis(localLogoPath);
      if (imageUrl == null || imageUrl.trim().isEmpty) {
        return null;
      }

      final response = await _brandingAiService.generateBranding(
        comercioId: comercioId,
        promptUsuario: _paletteAiPrompt,
        imageUrl: imageUrl,
      );

      final branding = _toStringDynamicMap(response['branding_ia']);
      if (branding.isEmpty) {
        return null;
      }

      final customColors = _toStringDynamicMap(
        branding['colores_personalizados'],
      );
      final primary = _tryParseHexColor(
        branding['color_principal']?.toString() ?? '',
      );
      final secondary = _tryParseHexColor(
        branding['color_secundario']?.toString() ?? '',
      );
      final background = _tryParseHexColor(
        customColors['background']?.toString() ?? '',
      );
      final cardSurface = _tryParseHexColor(
        customColors['card_surface']?.toString() ?? '',
      );
      final textOnPrimary = _tryParseHexColor(
        customColors['text_on_primary']?.toString() ?? '',
      );

      final List<Color> extractedColors = <Color>[];
      void push(Color? color) {
        if (color == null) {
          return;
        }
        if (extractedColors.any((item) => _colorDistance(item, color) < 12)) {
          return;
        }
        extractedColors.add(color);
      }

      push(primary);
      push(secondary);
      push(background);
      push(cardSurface);
      push(textOnPrimary);

      if (extractedColors.isEmpty) {
        return null;
      }

      final resolvedPrimary = primary ?? extractedColors.first;
      final resolvedAccent =
          secondary ??
          _resolveAccentColor(
            primary: resolvedPrimary,
            candidates: extractedColors,
          );
      final resolvedSurface =
          background ??
          cardSurface ??
          extractedColors.reduce((best, current) {
            return HSLColor.fromColor(current).lightness <
                    HSLColor.fromColor(best).lightness
                ? current
                : best;
          });
      final resolvedText =
          ThemeData.estimateBrightnessForColor(resolvedSurface) ==
              Brightness.dark
          ? const Color(0xFFF8F5FF)
          : const Color(0xFF1D1733);

      return _LogoPaletteAnalysis(
        palette: _PaletteOption(
          id: 'logo-smart',
          name: 'Sugerida por Gemini',
          primary: resolvedPrimary,
          accent: resolvedAccent,
          surface: resolvedSurface,
          text: resolvedText,
        ),
        colors: extractedColors,
        suggestedHeadingFont: branding['fuente_titulos']?.toString(),
      );
    } catch (_) {
      return null;
    }
  }

  Future<String?> _uploadLogoForPaletteAnalysis(String localPath) async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) {
      return null;
    }

    final file = File(localPath);
    if (!await file.exists()) {
      return null;
    }

    final bytes = await file.readAsBytes();
    if (bytes.isEmpty) {
      return null;
    }

    final extMatch = RegExp(r'\.([a-zA-Z0-9]+)$').firstMatch(localPath);
    final ext = (extMatch?.group(1) ?? 'jpg').toLowerCase();
    final contentType = switch (ext) {
      'png' => 'image/png',
      'webp' => 'image/webp',
      'gif' => 'image/gif',
      _ => 'image/jpeg',
    };

    final path =
        '${user.id}/palette_ai_preview_${DateTime.now().millisecondsSinceEpoch}.$ext';
    await Supabase.instance.client.storage
        .from('logos-comercios')
        .uploadBinary(
          path,
          bytes,
          fileOptions: FileOptions(contentType: contentType, upsert: true),
        );

    return Supabase.instance.client.storage
        .from('logos-comercios')
        .getPublicUrl(path);
  }

  void _applyDefaultPalette() {
    _paletteSuggestion = const _PaletteOption(
      id: 'elmenuxfa',
      name: 'elmenuxfa.com',
      primary: _defaultPalettePrimary,
      accent: _defaultPaletteAccent,
      surface: _defaultPaletteSurface,
      text: _defaultPaletteText,
    );
    _logoDetectedColors = const <Color>[
      _defaultPalettePrimary,
      _defaultPaletteAccent,
      _defaultPaletteSurface,
      _defaultPaletteText,
    ];
    _selectedPaletteId = 'elmenuxfa';
  }

  Future<_LogoPaletteAnalysis?> _analyzeLogoPalette(String path) async {
    try {
      final file = File(path);
      if (!await file.exists()) {
        return null;
      }

      final bytes = await file.readAsBytes();
      final decoded = img.decodeImage(bytes);
      if (decoded == null) {
        return null;
      }

      final resized = img.copyResize(
        decoded,
        width: decoded.width > 96 ? 96 : decoded.width,
      );

      final Map<int, int> colorCounts = <int, int>{};
      for (var y = 0; y < resized.height; y += 2) {
        for (var x = 0; x < resized.width; x += 2) {
          final pixel = resized.getPixel(x, y);
          final a = pixel.a;
          if (a < 180) {
            continue;
          }

          final quantized =
              ((pixel.r ~/ 12) << 16) |
              ((pixel.g ~/ 12) << 8) |
              (pixel.b ~/ 12);
          colorCounts.update(
            quantized,
            (value) => value + 1,
            ifAbsent: () => 1,
          );
        }
      }

      if (colorCounts.isEmpty) {
        return null;
      }

      final sorted = colorCounts.entries.toList()
        ..sort((a, b) => b.value.compareTo(a.value));

      final List<Color> extractedColors = <Color>[];
      for (final entry in sorted) {
        final r = (((entry.key >> 16) & 0xFF) * 12).clamp(0, 255);
        final g = (((entry.key >> 8) & 0xFF) * 12).clamp(0, 255);
        final b = ((entry.key & 0xFF) * 12).clamp(0, 255);
        final candidate = Color.fromARGB(255, r, g, b);
        if (extractedColors.any(
          (item) => _colorDistance(item, candidate) < 34,
        )) {
          continue;
        }
        extractedColors.add(candidate);
        if (extractedColors.length == 8) {
          break;
        }
      }

      Color? primary;
      Color? secondary;
      Color? surface;
      for (final candidate in extractedColors) {
        final hsl = HSLColor.fromColor(candidate);
        if (hsl.saturation > 0.28 &&
            hsl.lightness > 0.18 &&
            hsl.lightness < 0.78) {
          primary = candidate;
          break;
        }
      }

      primary ??= extractedColors.first;
      for (final candidate in extractedColors) {
        if (_colorDistance(primary, candidate) < 85) {
          continue;
        }
        final hsl = HSLColor.fromColor(candidate);
        if (hsl.saturation > 0.12 &&
            hsl.lightness > 0.14 &&
            hsl.lightness < 0.9) {
          secondary = candidate;
          break;
        }
      }

      secondary ??= _resolveAccentColor(
        primary: primary,
        candidates: extractedColors,
      );
      for (final candidate in extractedColors) {
        final lightness = HSLColor.fromColor(candidate).lightness;
        if (lightness < 0.28) {
          surface = candidate;
          break;
        }
      }
      surface ??= extractedColors.reduce((best, current) {
        return HSLColor.fromColor(current).lightness <
                HSLColor.fromColor(best).lightness
            ? current
            : best;
      });
      final text =
          ThemeData.estimateBrightnessForColor(surface) == Brightness.dark
          ? const Color(0xFFF8F5FF)
          : const Color(0xFF1D1733);

      return _LogoPaletteAnalysis(
        palette: _PaletteOption(
          id: 'logo-smart',
          name: 'Sugerida por logo',
          primary: primary,
          accent: secondary,
          surface: surface,
          text: text,
        ),
        colors: extractedColors,
      );
    } catch (_) {
      return null;
    }
  }

  double _colorDistance(Color a, Color b) {
    final dr = (a.r - b.r).abs();
    final dg = (a.g - b.g).abs();
    final db = (a.b - b.b).abs();
    return dr * 0.3 + dg * 0.59 + db * 0.11;
  }

  Color _resolveAccentColor({
    required Color primary,
    required List<Color> candidates,
  }) {
    for (final candidate in candidates) {
      if (_colorDistance(primary, candidate) < 72) {
        continue;
      }
      final hsl = HSLColor.fromColor(candidate);
      if (hsl.saturation > 0.1 && hsl.lightness > 0.16 && hsl.lightness < 0.9) {
        return candidate;
      }
    }

    final base = HSLColor.fromColor(primary);
    final shifted = (base.hue + 34.0) % 360.0;
    final derived = base
        .withHue(shifted)
        .withSaturation((base.saturation + 0.08).clamp(0.18, 0.9));
    final lightness = base.lightness < 0.26
        ? 0.44
        : (base.lightness + 0.06).clamp(0.26, 0.78);
    return derived.withLightness(lightness).toColor();
  }

  Future<void> _editPaletteColor(String role) async {
    final initial = switch (role) {
      'primary' => _paletteSuggestion.primary,
      'accent' => _paletteSuggestion.accent,
      'surface' => _paletteSuggestion.surface,
      _ => _paletteSuggestion.text,
    };

    final controller = TextEditingController(text: _colorToHex(initial));
    Color preview = initial;

    final picked = await showDialog<Color>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setInner) {
            return AlertDialog(
              backgroundColor: const Color(0xFF17122E),
              title: Text(
                'Editar color',
                style: GoogleFonts.poppins(color: _setupTextHigh),
              ),
              content: SizedBox(
                width: 320,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        height: 52,
                        decoration: BoxDecoration(
                          color: preview,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.3),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      ColorPicker(
                        color: preview,
                        onColorChanged: (Color color) {
                          controller.text = _colorToHex(color);
                          setInner(() => preview = color);
                        },
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        wheelDiameter: 220,
                        enableOpacity: false,
                        showColorCode: false,
                        pickersEnabled: const <ColorPickerType, bool>{
                          ColorPickerType.wheel: true,
                          ColorPickerType.primary: false,
                          ColorPickerType.accent: false,
                          ColorPickerType.both: false,
                          ColorPickerType.custom: false,
                          ColorPickerType.bw: false,
                        },
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: controller,
                        textCapitalization: TextCapitalization.characters,
                        inputFormatters: <TextInputFormatter>[
                          FilteringTextInputFormatter.allow(
                            RegExp(r'[0-9a-fA-F#]'),
                          ),
                        ],
                        style: const TextStyle(color: _setupTextHigh),
                        decoration: InputDecoration(
                          labelText: 'Hexadecimal',
                          hintText: '#FF6B00',
                          labelStyle: const TextStyle(color: _setupTextLow),
                          hintStyle: const TextStyle(color: _setupTextLow),
                          filled: true,
                          fillColor: const Color(0xFF120E25),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(
                              color: Color(0xFF3B2F63),
                            ),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(
                              color: Color(0xFF3B2F63),
                            ),
                          ),
                        ),
                        onChanged: (value) {
                          final parsed = _tryParseHexColor(value);
                          if (parsed != null) {
                            setInner(() => preview = parsed);
                          }
                        },
                      ),
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          'Estos colores solo aplican a tu menu digital.',
                          style: GoogleFonts.poppins(
                            color: _setupTextLow,
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          'Colores del logo',
                          style: GoogleFonts.poppins(
                            color: _setupTextLow,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: _logoDetectedColors.map((color) {
                          return InkWell(
                            onTap: () {
                              controller.text = _colorToHex(color);
                              setInner(() => preview = color);
                            },
                            borderRadius: BorderRadius.circular(999),
                            child: Container(
                              padding: const EdgeInsets.all(4),
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: Colors.white.withValues(alpha: 0.24),
                                ),
                              ),
                              child: _PaletteDot(color: color),
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  style: TextButton.styleFrom(foregroundColor: _setupTextHigh),
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Cancelar'),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(
                    context,
                  ).pop(_tryParseHexColor(controller.text)),
                  child: const Text('Aplicar'),
                ),
              ],
            );
          },
        );
      },
    );

    if (picked == null || !mounted) {
      return;
    }

    setState(() {
      _paletteSuggestion = _PaletteOption(
        id: 'custom',
        name: 'Paleta personalizada',
        primary: role == 'primary' ? picked : _paletteSuggestion.primary,
        accent: role == 'accent' ? picked : _paletteSuggestion.accent,
        surface: role == 'surface' ? picked : _paletteSuggestion.surface,
        text: role == 'text' ? picked : _paletteSuggestion.text,
      );
      _selectedPaletteId = 'custom';
      _paletteManuallyEdited = true;
      _lastPaletteLogoPath = _selectedLogo?.path ?? '';
    });
    await _saveDraft();
  }

  TextStyle _headingFontStyle({
    required double fontSize,
    required FontWeight fontWeight,
    required Color color,
  }) {
    try {
      return GoogleFonts.getFont(
        _selectedHeadingFont,
        textStyle: TextStyle(
          fontSize: fontSize,
          fontWeight: fontWeight,
          color: color,
        ),
      );
    } catch (_) {
      return GoogleFonts.poppins(
        fontSize: fontSize,
        fontWeight: fontWeight,
        color: color,
      );
    }
  }

  bool _canContinueIdentity() {
    final name = _nameController.text.trim();
    final slug = _normalizeSlug(_slugController.text);
    return name.length >= 3 && slug.length >= 3 && _isSlugAvailable;
  }

  double? _toDoubleOrNull(dynamic value) {
    if (value is num) {
      return value.toDouble();
    }
    return double.tryParse((value ?? '').toString().trim());
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
    final fallbackCountry = hasFallbackCountry
        ? normalizedFallback
        : _selectedPhoneCountryIso;

    if (normalizedDigits.isEmpty) {
      return _ParsedPhoneNumber(
        countryIso: fallbackCountry,
        nationalNumber: '',
      );
    }

    final candidates =
        <intl_phone_countries.Country>[...intl_phone_countries.countries]..sort(
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

  String get _whatsappE164 {
    final local = _whatsappController.text.replaceAll(RegExp(r'\D'), '');
    if (local.isEmpty) {
      return '';
    }
    final country = _countryByIso(_selectedPhoneCountryIso);
    return '+${country.fullCountryCode}$local';
  }

  String? _operationValidationMessage() {
    final whatsapp = _whatsappController.text.trim().replaceAll(
      RegExp(r'\D'),
      '',
    );

    if (_allowDelivery || _receiveOrdersOnWhatsapp) {
      if (whatsapp.isEmpty) {
        return 'Agrega un numero de telefono valido para WhatsApp.';
      }
      final country = _countryByIso(_selectedPhoneCountryIso);
      final phone = intl_phone_number.PhoneNumber(
        countryISOCode: _selectedPhoneCountryIso,
        countryCode: '+${country.fullCountryCode}',
        number: whatsapp,
      );
      try {
        phone.isValidNumber();
      } catch (_) {
        return 'Agrega un numero de telefono valido para WhatsApp.';
      }
    }

    if (_allowDelivery &&
        (_businessLatitude == null || _businessLongitude == null)) {
      return 'Selecciona la ubicacion exacta del negocio en el mapa.';
    }

    return null;
  }

  Future<Map<String, dynamic>> _httpGetJson(Uri uri) async {
    final client = HttpClient();
    try {
      final request = await client.getUrl(uri);
      final response = await request.close();
      final body = await response.transform(utf8.decoder).join();
      final decoded = jsonDecode(body);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
      if (decoded is Map) {
        return Map<String, dynamic>.from(decoded);
      }
      return <String, dynamic>{};
    } finally {
      client.close(force: true);
    }
  }

  String? _componentLongName(
    List<Map<String, dynamic>> components,
    String type,
  ) {
    for (final component in components) {
      final types = (component['types'] as List<dynamic>? ?? <dynamic>[])
          .map((item) => item.toString())
          .toList();
      if (types.contains(type)) {
        final value = component['long_name']?.toString().trim();
        if (value != null && value.isNotEmpty) {
          return value;
        }
      }
    }
    return null;
  }

  String? _toSpecificAddress(Map<String, dynamic> result) {
    final components =
        (result['address_components'] as List<dynamic>? ?? <dynamic>[])
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();
    if (components.isEmpty) {
      return result['formatted_address']?.toString().trim();
    }

    final street = _componentLongName(components, 'route');
    final streetNumber = _componentLongName(components, 'street_number');
    final premise = _componentLongName(components, 'premise');
    final subpremise = _componentLongName(components, 'subpremise');
    final neighborhood =
        _componentLongName(components, 'neighborhood') ??
        _componentLongName(components, 'sublocality') ??
        _componentLongName(components, 'sublocality_level_1');
    final locality =
        _componentLongName(components, 'locality') ??
        _componentLongName(components, 'administrative_area_level_2');
    final region = _componentLongName(
      components,
      'administrative_area_level_1',
    );

    final plusCodeMap = result['plus_code'] is Map
        ? Map<String, dynamic>.from(result['plus_code'] as Map)
        : <String, dynamic>{};
    final plusCodeShort =
        plusCodeMap['compound_code']?.toString().trim().isNotEmpty == true
        ? plusCodeMap['compound_code'].toString().trim()
        : (plusCodeMap['global_code']?.toString().trim() ?? '');

    final firstLineParts = <String>[];
    if (street != null && street.isNotEmpty) {
      firstLineParts.add(street);
      if (streetNumber != null && streetNumber.isNotEmpty) {
        firstLineParts.add(streetNumber);
      }
    } else if (premise != null && premise.isNotEmpty) {
      firstLineParts.add(premise);
      if (subpremise != null && subpremise.isNotEmpty) {
        firstLineParts.add(subpremise);
      }
    }

    final detailParts = <String>[];
    if (neighborhood != null && neighborhood.isNotEmpty) {
      detailParts.add(neighborhood);
    }
    if (locality != null && locality.isNotEmpty) {
      detailParts.add(locality);
    }
    if (region != null && region.isNotEmpty) {
      detailParts.add(region);
    }
    if (plusCodeShort.isNotEmpty) {
      detailParts.add(plusCodeShort);
    }

    final firstLine = firstLineParts.join(' ').trim();
    final detailLine = detailParts.join(', ').trim();
    if (firstLine.isNotEmpty && detailLine.isNotEmpty) {
      return '$firstLine, $detailLine';
    }
    if (firstLine.isNotEmpty) {
      return firstLine;
    }
    if (detailLine.isNotEmpty) {
      return detailLine;
    }
    return result['formatted_address']?.toString().trim();
  }

  Future<String?> _reverseGeocodeFromLatLng(LatLng position) async {
    final apiKey = SupabaseConfig.googleMapsApiKey.trim();
    if (apiKey.isEmpty) {
      return null;
    }

    try {
      final uri = Uri.https('maps.googleapis.com', '/maps/api/geocode/json', {
        'latlng': '${position.latitude},${position.longitude}',
        'language': 'es',
        'key': apiKey,
      });

      final json = await _httpGetJson(uri);
      final status = (json['status']?.toString().trim() ?? '');
      if (status != 'OK') {
        return null;
      }

      final results = (json['results'] as List<dynamic>? ?? <dynamic>[])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
      if (results.isEmpty) {
        return null;
      }

      Map<String, dynamic> best = results.first;
      var bestScore = -1;
      for (final result in results) {
        final types = (result['types'] as List<dynamic>? ?? <dynamic>[])
            .map((item) => item.toString())
            .toList();
        var score = 0;
        if (types.contains('street_address')) score += 5;
        if (types.contains('premise')) score += 4;
        if (types.contains('subpremise')) score += 3;
        if (types.contains('route')) score += 2;
        if (types.contains('plus_code')) score += 1;
        final components = result['address_components'] as List<dynamic>?;
        if ((components?.length ?? 0) >= 4) {
          score += 2;
        }
        if (score > bestScore) {
          bestScore = score;
          best = result;
        }
      }

      final specific = _toSpecificAddress(best);
      if (specific != null && specific.trim().isNotEmpty) {
        return specific.trim();
      }

      final formatted = best['formatted_address']?.toString().trim();
      if (formatted != null && formatted.isNotEmpty) {
        return formatted;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<List<_PlaceSearchSuggestion>> _searchPlaceSuggestions(
    String query, {
    LatLng? near,
  }) async {
    final apiKey = SupabaseConfig.googleMapsApiKey.trim();
    if (apiKey.isEmpty || query.trim().length < 3) {
      return <_PlaceSearchSuggestion>[];
    }

    try {
      final params = <String, String>{
        'input': query.trim(),
        'language': 'es',
        'types': 'geocode',
        'key': apiKey,
      };
      if (near != null) {
        params['location'] = '${near.latitude},${near.longitude}';
        params['radius'] = '30000';
      }

      final uri = Uri.https(
        'maps.googleapis.com',
        '/maps/api/place/autocomplete/json',
        params,
      );
      final json = await _httpGetJson(uri);
      final status = (json['status']?.toString().trim() ?? '');
      if (status != 'OK' && status != 'ZERO_RESULTS') {
        return <_PlaceSearchSuggestion>[];
      }

      final predictions = (json['predictions'] as List<dynamic>? ?? <dynamic>[])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();

      return predictions
          .where((item) => item['place_id'] != null)
          .map(
            (item) => _PlaceSearchSuggestion(
              placeId: item['place_id'].toString(),
              description: item['description']?.toString().trim() ?? '',
            ),
          )
          .where((item) => item.description.isNotEmpty)
          .take(6)
          .toList();
    } catch (_) {
      return <_PlaceSearchSuggestion>[];
    }
  }

  Future<Map<String, dynamic>?> _fetchPlaceDetails(String placeId) async {
    final apiKey = SupabaseConfig.googleMapsApiKey.trim();
    if (apiKey.isEmpty || placeId.trim().isEmpty) {
      return null;
    }

    try {
      final uri = Uri.https(
        'maps.googleapis.com',
        '/maps/api/place/details/json',
        {
          'place_id': placeId.trim(),
          'fields':
              'formatted_address,address_component,geometry/location,plus_code,types',
          'language': 'es',
          'key': apiKey,
        },
      );
      final json = await _httpGetJson(uri);
      final status = (json['status']?.toString().trim() ?? '');
      if (status != 'OK') {
        return null;
      }

      final result = json['result'];
      if (result is Map) {
        return Map<String, dynamic>.from(result);
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<LatLng> _resolveInitialMapCenter() async {
    if (_businessLatitude != null && _businessLongitude != null) {
      return LatLng(_businessLatitude!, _businessLongitude!);
    }

    final servicesEnabled = await Geolocator.isLocationServiceEnabled();
    if (!servicesEnabled) {
      return const LatLng(10.4806, -66.9036);
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return const LatLng(10.4806, -66.9036);
    }

    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      ).timeout(const Duration(seconds: 4));
      return LatLng(position.latitude, position.longitude);
    } catch (_) {
      return const LatLng(10.4806, -66.9036);
    }
  }

  Future<void> _openAddressPlacePicker() async {
    final initial = await _resolveInitialMapCenter();
    if (!mounted) {
      return;
    }
    LatLng selected = initial;
    String previewAddress = _addressController.text.trim();
    final searchController = TextEditingController(text: previewAddress);
    bool resolvingAddress = false;
    bool searchingPlaces = false;
    int geocodeRequestId = 0;
    Timer? geocodeDebounce;
    Timer? searchDebounce;
    LatLng? lastGeocodedPoint;
    List<_PlaceSearchSuggestion> placeSuggestions = <_PlaceSearchSuggestion>[];
    final mapController = Completer<GoogleMapController>();

    final picked = await showModalBottomSheet<_PickedBusinessLocation>(
      context: context,
      isScrollControlled: true,
      enableDrag: false,
      useSafeArea: true,
      backgroundColor: const Color(0xFF0E0A1E),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            bool movedEnough(LatLng from, LatLng to) {
              final meters = Geolocator.distanceBetween(
                from.latitude,
                from.longitude,
                to.latitude,
                to.longitude,
              );
              return meters >= 18;
            }

            Future<void> syncAddress() async {
              final requestId = ++geocodeRequestId;
              setSheetState(() => resolvingAddress = true);
              final resolved = await _reverseGeocodeFromLatLng(selected);
              if (!context.mounted) {
                return;
              }
              if (requestId != geocodeRequestId) {
                return;
              }
              setSheetState(() {
                resolvingAddress = false;
                if (resolved != null && resolved.isNotEmpty) {
                  previewAddress = resolved;
                  searchController.text = resolved;
                }
                lastGeocodedPoint = selected;
              });
            }

            Future<void> searchPlaces(String value) async {
              final query = value.trim();
              if (query.length < 3) {
                if (!context.mounted) {
                  return;
                }
                setSheetState(() {
                  searchingPlaces = false;
                  placeSuggestions = <_PlaceSearchSuggestion>[];
                });
                return;
              }

              setSheetState(() => searchingPlaces = true);
              final suggestions = await _searchPlaceSuggestions(
                query,
                near: selected,
              );
              if (!context.mounted) {
                return;
              }
              setSheetState(() {
                searchingPlaces = false;
                placeSuggestions = suggestions;
              });
            }

            Future<void> selectSuggestion(
              _PlaceSearchSuggestion suggestion,
            ) async {
              final details = await _fetchPlaceDetails(suggestion.placeId);
              if (details == null || !context.mounted) {
                return;
              }

              final geometry = details['geometry'] is Map
                  ? Map<String, dynamic>.from(details['geometry'] as Map)
                  : <String, dynamic>{};
              final location = geometry['location'] is Map
                  ? Map<String, dynamic>.from(geometry['location'] as Map)
                  : <String, dynamic>{};
              final lat = _toDoubleOrNull(location['lat']);
              final lng = _toDoubleOrNull(location['lng']);
              if (lat == null || lng == null) {
                return;
              }

              final controller = await mapController.future;
              selected = LatLng(lat, lng);
              await controller.animateCamera(
                CameraUpdate.newCameraPosition(
                  CameraPosition(target: selected, zoom: 18),
                ),
              );

              final specific =
                  _toSpecificAddress(details) ?? suggestion.description;
              if (!context.mounted) {
                return;
              }
              setSheetState(() {
                previewAddress = specific;
                searchController.text = specific;
                placeSuggestions = <_PlaceSearchSuggestion>[];
              });
              unawaited(syncAddress());
            }

            Future<void> moveToCurrentLocation() async {
              final servicesEnabled =
                  await Geolocator.isLocationServiceEnabled();
              if (!servicesEnabled) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text(
                        'Activa el GPS para usar tu ubicacion actual.',
                      ),
                    ),
                  );
                }
                return;
              }

              var permission = await Geolocator.checkPermission();
              if (permission == LocationPermission.denied) {
                permission = await Geolocator.requestPermission();
              }

              if (permission == LocationPermission.denied ||
                  permission == LocationPermission.deniedForever) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text(
                        'Permiso de ubicacion denegado. Habilitalo para centrar el mapa.',
                      ),
                    ),
                  );
                }
                return;
              }

              try {
                final position = await Geolocator.getCurrentPosition(
                  locationSettings: const LocationSettings(
                    accuracy: LocationAccuracy.high,
                  ),
                );

                final controller = await mapController.future;
                final target = LatLng(position.latitude, position.longitude);
                selected = target;
                await controller.animateCamera(
                  CameraUpdate.newCameraPosition(
                    CameraPosition(target: target, zoom: 18),
                  ),
                );
                await syncAddress();
              } catch (_) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text(
                        'No se pudo obtener tu ubicacion actual en este momento.',
                      ),
                    ),
                  );
                }
              }
            }

            return SizedBox(
              height: MediaQuery.of(context).size.height * 0.86,
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
                    child: Row(
                      children: [
                        IconButton(
                          onPressed: () => Navigator.of(context).pop(),
                          icon: const Icon(
                            Icons.close_rounded,
                            color: _setupTextHigh,
                          ),
                        ),
                        const Expanded(
                          child: Text(
                            'Ubica tu negocio en el mapa',
                            style: TextStyle(
                              color: _setupTextHigh,
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ),
                        const SizedBox(width: 48),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                    child: TextField(
                      controller: searchController,
                      style: const TextStyle(color: _setupTextHigh),
                      decoration: InputDecoration(
                        hintText: 'Buscar direccion o lugar',
                        hintStyle: const TextStyle(color: _setupTextLow),
                        prefixIcon: const Icon(
                          Icons.search_rounded,
                          color: _setupTextLow,
                        ),
                        suffixIcon: searchingPlaces
                            ? const Padding(
                                padding: EdgeInsets.all(12),
                                child: SizedBox(
                                  width: 14,
                                  height: 14,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                ),
                              )
                            : (searchController.text.trim().isEmpty
                                  ? null
                                  : IconButton(
                                      onPressed: () {
                                        searchController.clear();
                                        setSheetState(() {
                                          placeSuggestions =
                                              <_PlaceSearchSuggestion>[];
                                        });
                                      },
                                      icon: const Icon(
                                        Icons.clear_rounded,
                                        color: _setupTextLow,
                                      ),
                                    )),
                        filled: true,
                        fillColor: const Color(0xFF17122E),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(
                            color: Color(0xFF3B2F63),
                          ),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(
                            color: Color(0xFF3B2F63),
                          ),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: _palette.primary),
                        ),
                      ),
                      onChanged: (value) {
                        searchDebounce?.cancel();
                        searchDebounce = Timer(
                          const Duration(milliseconds: 300),
                          () => unawaited(searchPlaces(value)),
                        );
                      },
                    ),
                  ),
                  if (placeSuggestions.isNotEmpty)
                    Container(
                      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                      constraints: const BoxConstraints(maxHeight: 180),
                      decoration: BoxDecoration(
                        color: const Color(0xFF17122E),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFF3B2F63)),
                      ),
                      child: ListView.separated(
                        shrinkWrap: true,
                        itemCount: placeSuggestions.length,
                        separatorBuilder: (_, _) =>
                            const Divider(height: 1, color: Color(0xFF2A2145)),
                        itemBuilder: (context, index) {
                          final item = placeSuggestions[index];
                          return ListTile(
                            dense: true,
                            leading: const Icon(
                              Icons.place_rounded,
                              size: 18,
                              color: _setupTextLow,
                            ),
                            title: Text(
                              item.description,
                              style: const TextStyle(
                                color: _setupTextHigh,
                                fontSize: 12,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            onTap: () {
                              unawaited(selectSuggestion(item));
                            },
                          );
                        },
                      ),
                    ),
                  Expanded(
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        GoogleMap(
                          initialCameraPosition: CameraPosition(
                            target: initial,
                            zoom: _businessLatitude == null ? 14 : 17,
                          ),
                          onMapCreated: (controller) {
                            if (!mapController.isCompleted) {
                              mapController.complete(controller);
                            }
                            unawaited(syncAddress());
                          },
                          myLocationButtonEnabled: false,
                          myLocationEnabled: false,
                          zoomControlsEnabled: false,
                          onCameraMove: (position) {
                            selected = position.target;
                          },
                          onCameraIdle: () {
                            if (lastGeocodedPoint != null &&
                                !movedEnough(lastGeocodedPoint!, selected)) {
                              return;
                            }
                            geocodeDebounce?.cancel();
                            geocodeDebounce = Timer(
                              const Duration(milliseconds: 350),
                              () => unawaited(syncAddress()),
                            );
                          },
                        ),
                        const IgnorePointer(
                          child: Icon(
                            Icons.location_on_rounded,
                            size: 48,
                            color: Color(0xFFEF4444),
                          ),
                        ),
                        Positioned(
                          top: 12,
                          right: 12,
                          child: Material(
                            color: const Color(0xFF17122E),
                            borderRadius: BorderRadius.circular(12),
                            child: IconButton(
                              tooltip: 'Usar mi ubicacion',
                              onPressed: () {
                                unawaited(moveToCurrentLocation());
                              },
                              icon: const Icon(
                                Icons.my_location_rounded,
                                color: _setupTextHigh,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  SafeArea(
                    top: false,
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                      decoration: const BoxDecoration(
                        color: Color(0xFF17122E),
                        border: Border(
                          top: BorderSide(color: Color(0xFF3B2F63)),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            resolvingAddress
                                ? 'Buscando direccion...'
                                : (previewAddress.isEmpty
                                      ? 'Mueve el mapa para elegir el punto exacto'
                                      : previewAddress),
                            style: const TextStyle(
                              color: _setupTextHigh,
                              fontSize: 12,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Coordenadas: ${selected.latitude.toStringAsFixed(6)}, ${selected.longitude.toStringAsFixed(6)}',
                            style: const TextStyle(
                              color: _setupTextLow,
                              fontSize: 11,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              const Icon(
                                Icons.info_outline_rounded,
                                size: 14,
                                color: _setupTextLow,
                              ),
                              const SizedBox(width: 6),
                              const Expanded(
                                child: Text(
                                  'Ajusta el pin al centro antes de confirmar.',
                                  style: TextStyle(
                                    color: _setupTextLow,
                                    fontSize: 11,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton.icon(
                              onPressed: () async {
                                FocusScope.of(context).unfocus();
                                var resolvedAddress = previewAddress.trim();
                                if (resolvedAddress.isEmpty) {
                                  final onDemandAddress =
                                      await _reverseGeocodeFromLatLng(selected);
                                  if (onDemandAddress != null &&
                                      onDemandAddress.trim().isNotEmpty) {
                                    resolvedAddress = onDemandAddress.trim();
                                  }
                                }
                                if (!context.mounted) {
                                  return;
                                }
                                final previousAddress = _addressController.text
                                    .trim();
                                Navigator.of(context).pop(
                                  _PickedBusinessLocation(
                                    latitude: selected.latitude,
                                    longitude: selected.longitude,
                                    address: resolvedAddress.isNotEmpty
                                        ? resolvedAddress
                                        : (previousAddress.isNotEmpty
                                              ? previousAddress
                                              : 'Punto seleccionado en el mapa'),
                                  ),
                                );
                              },
                              icon: const Icon(Icons.check_circle_rounded),
                              label: const Text('Confirmar ubicacion'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );

    geocodeDebounce?.cancel();
    searchDebounce?.cancel();

    if (picked == null || !mounted) {
      return;
    }

    setState(() {
      _businessLatitude = picked.latitude;
      _businessLongitude = picked.longitude;
      _addressController.text = picked.address;
    });
    await _saveDraft();
  }

  Future<void> _openMenuScan() async {
    final comercioId = await _ensureComercioIdForGemini();
    if (!mounted) {
      return;
    }
    if (comercioId.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Completa y guarda los datos base antes de escanear el menu.',
          ),
        ),
      );
      return;
    }

    SupabaseConfig.setCurrentComercioId(
      comercioId,
      slug: _normalizeSlug(_slugController.text),
    );

    final result = await Navigator.of(context).push<MagicOnboardingResult>(
      MaterialPageRoute(builder: (_) => const MagicOnboardingScreen()),
    );

    if (!mounted || result == null) {
      return;
    }

    setState(() {
      _menuScanCompleted = true;
      _manualMenuSetupSelected = false;
      _scanCreatedCategories = result.createdCategories;
      _scanCreatedProducts = result.createdProducts;
      _scanCatalogName = result.catalog.nombre;
      if (_menuCatalogCount <= 0) {
        _menuCatalogCount = 1;
      }
    });
    await _refreshMenuCatalogCount(comercioId);
    await _saveDraft();
  }

  Future<void> _refreshMenuCatalogCount(String comercioId) async {
    final trimmedId = comercioId.trim();
    if (trimmedId.isEmpty) {
      return;
    }

    try {
      final rows = await Supabase.instance.client
          .from('catalogos')
          .select('id')
          .eq('comercio_id', trimmedId);

      final menuCount = (rows as List<dynamic>).length;
      if (!mounted) {
        return;
      }

      setState(() {
        _menuCatalogCount = menuCount;
        if (!_menuScanCompleted) {
          _manualMenuSetupSelected = menuCount > 0;
        }
      });
    } catch (_) {
      // Ignore counting errors to avoid blocking setup flow.
    }
  }

  Future<void> _openManualMenuSetup() async {
    final comercioId = await _ensureComercioIdForGemini();
    if (!mounted) {
      return;
    }
    if (comercioId.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Completa y guarda los datos base antes de crear manualmente.',
          ),
        ),
      );
      return;
    }

    SupabaseConfig.setCurrentComercioId(
      comercioId,
      slug: _normalizeSlug(_slugController.text),
    );

    await Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const CategoryListScreen()));

    await _refreshMenuCatalogCount(comercioId);

    if (!mounted) {
      return;
    }
    setState(() {
      if (!_menuScanCompleted && _menuCatalogCount > 0) {
        _manualMenuSetupSelected = true;
      }
      if (!_menuScanCompleted &&
          _scanCatalogName.isEmpty &&
          _menuCatalogCount > 0) {
        _scanCatalogName = _menuCatalogCount == 1
            ? '1 menu manual'
            : '$_menuCatalogCount menus manuales';
      }
    });

    if (_menuCatalogCount == 0 && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Aun no hay menus creados. Crea al menos 1 para completar este paso.',
          ),
        ),
      );
    }

    await _saveDraft();
  }

  Future<void> _openDraftPreview() async {
    final slug = _normalizeSlug(_slugController.text);
    if (slug.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Define una URL del menu para abrir el preview real.'),
        ),
      );
      return;
    }

    final url = AppLinks.publicMenuByIdentifier(comercioId: slug, slug: slug);
    await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  }

  Future<void> _nextStep() async {
    _ensureCurrentStepInFlow();

    if (_step == _SetupStep.checkout) {
      _syncActiveCurrencyDataFromController();
    }

    if (_step == _SetupStep.identity && !_canContinueIdentity()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Completa nombre y URL disponible.')),
      );
      return;
    }

    if (_step == _SetupStep.checkout && _selectedCurrencies.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Selecciona al menos 1 moneda de cobro.')),
      );
      return;
    }

    if (_step == _SetupStep.checkout && !_isExchangeRateConfigured()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Configura una tasa de cambio antes de continuar.'),
        ),
      );
      return;
    }

    if (_step == _SetupStep.checkout &&
        !_hasPaymentDetailsForSelectedMethods()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Agrega al menos un detalle en cada metodo de pago seleccionado.',
          ),
        ),
      );
      return;
    }

    if (_step == _SetupStep.operation) {
      final operationMessage = _operationValidationMessage();
      if (operationMessage != null) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(operationMessage)));
        return;
      }
    }

    if (!widget.businessConfigOnly &&
        _step == _SetupStep.scan &&
        !_hasMenuSetupCompleted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Completa el escaneo o elige creacion manual antes de continuar.',
          ),
        ),
      );
      return;
    }

    if (_isLastStepInFlow) {
      await _saveBusiness();
      return;
    }

    final nextStep = _activeSteps[_currentStepFlowIndex + 1];
    setState(() {
      _step = nextStep;
    });
    await _saveDraft();

    if (nextStep == _SetupStep.checkout) {
      unawaited(_suggestExchangeRate());
    }
  }

  String _colorToHex(Color color) {
    final argb = color.toARGB32();
    final red = ((argb >> 16) & 0xFF)
        .toRadixString(16)
        .padLeft(2, '0')
        .toUpperCase();
    final green = ((argb >> 8) & 0xFF)
        .toRadixString(16)
        .padLeft(2, '0')
        .toUpperCase();
    final blue = (argb & 0xFF).toRadixString(16).padLeft(2, '0').toUpperCase();
    return '#$red$green$blue';
  }

  Color? _tryParseHexColor(String raw) {
    final normalized = raw.trim().replaceAll('#', '');
    if (!RegExp(r'^[0-9A-Fa-f]{6}$').hasMatch(normalized)) {
      return null;
    }
    return Color(int.parse('FF$normalized', radix: 16));
  }

  Map<String, dynamic> _toStringDynamicMap(dynamic value) {
    if (value is Map<String, dynamic>) {
      return value;
    }
    if (value is Map) {
      return value.map((key, item) => MapEntry('$key', item));
    }
    return <String, dynamic>{};
  }

  Future<String> _ensureComercioIdForGemini() async {
    final current = (_editingComercioId ?? '').trim();
    if (current.isNotEmpty) {
      return current;
    }

    final user = Supabase.instance.client.auth.currentUser;
    if (user == null || !_canContinueIdentity()) {
      return '';
    }

    try {
      final comercio = await _upsertComercio(user: user, logoUrl: null);
      final createdId = comercio.id.trim();
      if (createdId.isEmpty) {
        return '';
      }
      _editingComercioId = createdId;
      return createdId;
    } catch (_) {
      return '';
    }
  }

  double _parseExchangeRate(dynamic value) {
    if (value is num) {
      return value.toDouble();
    }

    final raw = value?.toString().trim() ?? '';
    if (raw.isEmpty) {
      return 0;
    }

    return double.tryParse(raw.replaceAll(',', '.')) ?? 0;
  }

  String _formatExchangeRate(double value) {
    if (value <= 0) {
      return '';
    }
    final text = value.toStringAsFixed(
      value.truncateToDouble() == value ? 0 : 2,
    );
    return text
        .replaceAll(RegExp(r'\.0+$'), '')
        .replaceAll(RegExp(r'(\.\d*?)0+$'), r'$1');
  }

  String _currencyLabel(String code) {
    return switch (code) {
      'USD' => 'Dolares',
      'VES' => 'Bs',
      'COP' => 'Pesos Colombianos',
      'EUR' => 'Euros',
      _ => code,
    };
  }

  IconData _paymentMethodIcon(String method) {
    return switch (method) {
      'Efectivo' => Icons.payments_rounded,
      'Transferencia' => Icons.account_balance_rounded,
      _ => Icons.account_balance_wallet_rounded,
    };
  }

  String _paymentMethodLabel(String method) {
    return switch (method) {
      'Transferencia' => 'Pagos digitales',
      _ => method,
    };
  }

  double _defaultExchangeRateFor(String currency) {
    return switch (currency) {
      'VES' => 110,
      'COP' => 4000,
      'EUR' => 0.92,
      _ => 1,
    };
  }

  bool _isValidEmail(String value) {
    return RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(value);
  }

  String? _cashValidationMessage(String notes) {
    if (notes.trim().isEmpty) {
      return 'Agrega una nota para el pago en efectivo.';
    }
    if (notes.length > _maxCashTextLength) {
      return 'La nota de Efectivo debe tener maximo $_maxCashTextLength caracteres.';
    }
    return null;
  }

  String? _cashNotesError(String notes) {
    if (notes.trim().isEmpty) {
      return 'La nota es obligatoria.';
    }
    if (notes.length > _maxCashTextLength) {
      return 'Maximo $_maxCashTextLength caracteres.';
    }
    return null;
  }

  String? _transferAccountNameError(String name) {
    if (name.trim().isEmpty) {
      return 'El nombre de la cuenta es obligatorio.';
    }
    if (name.trim().length > _maxTransferAccountNameLength) {
      return 'Maximo $_maxTransferAccountNameLength caracteres.';
    }
    return null;
  }

  String? _transferFieldLabelError(String label) {
    if (label.trim().length > _maxTransferFieldLabelLength) {
      return 'Maximo $_maxTransferFieldLabelLength caracteres.';
    }
    return null;
  }

  String? _transferFieldValueError(_TransferFieldDraft field) {
    final value = field.value.trim();
    if (value.isEmpty) {
      return 'Valor obligatorio.';
    }
    if (value.length > _maxTransferFieldValueLength) {
      return 'Maximo $_maxTransferFieldValueLength caracteres.';
    }
    if (field.type == 'correo' && !_isValidEmail(value)) {
      return 'Correo invalido.';
    }
    if (field.type == 'numero_cuenta') {
      if (!RegExp(r'^\d+$').hasMatch(value)) {
        return 'Solo numeros.';
      }
      if (value.length < 6) {
        return 'Debe tener al menos 6 digitos.';
      }
    }
    if (field.type == 'id' && value.length < 4) {
      return 'El ID debe tener al menos 4 caracteres.';
    }
    return null;
  }

  TextInputType _transferFieldKeyboardType(String type) {
    return switch (type) {
      'numero_cuenta' => TextInputType.number,
      'correo' => TextInputType.emailAddress,
      'nota' => TextInputType.multiline,
      _ => TextInputType.text,
    };
  }

  List<TextInputFormatter> _transferFieldInputFormatters(String type) {
    return switch (type) {
      'numero_cuenta' => <TextInputFormatter>[
        FilteringTextInputFormatter.digitsOnly,
      ],
      'correo' => <TextInputFormatter>[
        FilteringTextInputFormatter.deny(RegExp(r'\s')),
      ],
      _ => const <TextInputFormatter>[],
    };
  }

  String? _transferAccountValidationMessage(_TransferAccountDraft account) {
    final nameError = _transferAccountNameError(account.name);
    if (nameError != null) {
      return nameError;
    }
    if (account.fields.isEmpty) {
      return 'Agrega al menos un campo a la cuenta digital.';
    }
    if (account.fields.length > _maxTransferFieldsPerAccount) {
      return 'Cada cuenta permite maximo $_maxTransferFieldsPerAccount campos.';
    }

    for (final field in account.fields) {
      final label = field.label.trim();
      final effectiveLabel = label.isEmpty
          ? _TransferFieldDraft.labelForType(field.type)
          : label;
      final labelError = _transferFieldLabelError(field.label);
      if (labelError != null) {
        return 'Campo "$effectiveLabel": $labelError';
      }
      final valueError = _transferFieldValueError(field);
      if (valueError != null) {
        return 'Campo "$effectiveLabel": $valueError';
      }
    }

    return null;
  }

  bool _isCurrencyExchangeRateConfigured(String currency) {
    if (currency == 'USD') {
      return true;
    }
    final rate = _parseExchangeRate(_exchangeRateByCurrency[currency]);
    return rate > 0;
  }

  bool _hasPaymentDetailsForCurrency(String currency) {
    final selected = _selectedPaymentsForCurrency(currency);
    if (selected.isEmpty) {
      return false;
    }

    final drafts = _paymentDraftsForCurrency(currency);
    for (final method in selected) {
      final draft = drafts[method];
      if (draft == null || !draft.hasAnyDetail) {
        return false;
      }

      if (method == 'Efectivo') {
        final message = _cashValidationMessage(draft.extraDetails);
        if (message != null) {
          return false;
        }
      }

      if (method == 'Transferencia') {
        if (draft.transferAccounts.isEmpty ||
            draft.transferAccounts.length > _maxTransferAccountsPerCurrency) {
          return false;
        }

        for (final account in draft.transferAccounts) {
          if (_transferAccountValidationMessage(account) != null) {
            return false;
          }
        }
      }
    }
    return true;
  }

  bool _isCurrencyCheckoutConfigured(String currency) {
    return _isCurrencyExchangeRateConfigured(currency) &&
        _hasPaymentDetailsForCurrency(currency);
  }

  int _configuredCurrenciesCount() {
    var completed = 0;
    for (final currency in _selectedCurrencies) {
      if (_isCurrencyCheckoutConfigured(currency)) {
        completed += 1;
      }
    }
    return completed;
  }

  bool _isExchangeRateConfigured() {
    if (_selectedCurrencies.isEmpty) {
      return false;
    }

    for (final currency in _selectedCurrencies) {
      if (!_isCurrencyExchangeRateConfigured(currency)) {
        return false;
      }
    }
    return true;
  }

  bool _hasPaymentDetailsForSelectedMethods() {
    if (_selectedCurrencies.isEmpty) {
      return false;
    }

    for (final currency in _selectedCurrencies) {
      if (!_hasPaymentDetailsForCurrency(currency)) {
        return false;
      }
    }
    return true;
  }

  List<String> _paymentSummaryLines(String method, _PaymentMethodDraft draft) {
    if (method == 'Transferencia') {
      if (draft.transferAccounts.isEmpty) {
        return const <String>[];
      }
      return <String>[
        '${draft.transferAccounts.length} cuenta(s) digital(es) configurada(s)',
        ...draft.transferAccounts
            .take(3)
            .map(
              (account) => account.name.trim().isEmpty
                  ? 'Cuenta sin nombre'
                  : account.name.trim(),
            ),
      ];
    }

    final details = <String>[];
    if (draft.description.isNotEmpty) details.add(draft.description);
    if (draft.extraDetails.isNotEmpty) details.add(draft.extraDetails);
    return details;
  }

  Future<void> _openPaymentMethodEditor(
    String method, {
    int? transferIndex,
  }) async {
    if (method == 'Transferencia') {
      await _openTransferAccountEditor(index: transferIndex);
      return;
    }

    await _openCashEditor();
  }

  Future<void> _openCashEditor() async {
    final currency = _currentCurrency;
    final drafts = _paymentDraftsForCurrency(currency);
    final current =
        drafts['Efectivo'] ?? _PaymentMethodDraft(method: 'Efectivo');
    var notes = current.extraDetails.trim().isEmpty
        ? 'Por favor, usa billetes en buen estado.'
        : current.extraDetails;
    var showInlineErrors = false;

    final updated = await showModalBottomSheet<_PaymentMethodDraft>(
      context: context,
      isScrollControlled: true,
      useSafeArea: false,
      backgroundColor: const Color(0xFF17122E),
      showDragHandle: true,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final mediaQuery = MediaQuery.of(context);
            final bottomInset = mediaQuery.viewInsets.bottom > 0
                ? mediaQuery.viewInsets.bottom
                : mediaQuery.viewPadding.bottom;
            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 8,
                bottom: bottomInset + 20,
              ),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Configurar Efectivo',
                      style: GoogleFonts.poppins(
                        color: _setupTextHigh,
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Agrega una nota corta para orientar el cobro en efectivo.',
                      style: const TextStyle(
                        color: _setupTextMedium,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      initialValue: notes,
                      onChanged: (text) {
                        notes = text;
                        if (showInlineErrors) {
                          setModalState(() {});
                        }
                      },
                      maxLength: _maxCashTextLength,
                      style: const TextStyle(color: _setupTextHigh),
                      minLines: 2,
                      maxLines: 4,
                      decoration: InputDecoration(
                        labelText: 'Notas',
                        hintText: 'Ej. Por favor, usa billetes en buen estado.',
                        filled: true,
                        fillColor: const Color(0xFF120E25),
                        labelStyle: const TextStyle(color: _setupTextLow),
                        hintStyle: const TextStyle(color: _setupTextLow),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(
                            color: Color(0xFF3B2F63),
                          ),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(
                            color: Color(0xFF3B2F63),
                          ),
                        ),
                        errorText: showInlineErrors
                            ? _cashNotesError(notes)
                            : null,
                      ),
                    ),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: _setupTextHigh,
                              side: const BorderSide(color: Color(0xFF6B5A9A)),
                            ),
                            onPressed: () => Navigator.of(context).pop(),
                            child: const Text('Cancelar'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: FilledButton(
                            onPressed: () {
                              final message = _cashValidationMessage(notes);
                              if (message != null) {
                                setModalState(() {
                                  showInlineErrors = true;
                                });
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text(message)),
                                );
                                return;
                              }

                              Navigator.of(context).pop(
                                current.copyWith(
                                  description: '',
                                  extraDetails: notes.trim(),
                                ),
                              );
                            },
                            child: const Text('Guardar datos'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (updated == null || !mounted) {
      return;
    }

    setState(() {
      _paymentMethodDraftsByCurrency[currency]!['Efectivo'] = updated;
    });
    await _saveDraft();
  }

  Future<void> _openTransferAccountEditor({int? index}) async {
    final currency = _currentCurrency;
    final drafts = _paymentDraftsForCurrency(currency);
    final current =
        drafts['Transferencia'] ?? _PaymentMethodDraft(method: 'Transferencia');

    if (index == null &&
        current.transferAccounts.length >= _maxTransferAccountsPerCurrency) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Maximo $_maxTransferAccountsPerCurrency cuentas digitales por moneda.',
          ),
        ),
      );
      return;
    }

    final editing =
        index != null && index >= 0 && index < current.transferAccounts.length
        ? current.transferAccounts[index]
        : _TransferAccountDraft.empty();

    var accountName = editing.name;
    final fields = editing.fields.map((item) => item.copyWith()).toList();
    var showInlineErrors = false;

    final updatedAccount = await showModalBottomSheet<_TransferAccountDraft>(
      context: context,
      isScrollControlled: true,
      useSafeArea: false,
      backgroundColor: const Color(0xFF17122E),
      showDragHandle: true,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final mediaQuery = MediaQuery.of(context);
            final bottomInset = mediaQuery.viewInsets.bottom > 0
                ? mediaQuery.viewInsets.bottom
                : mediaQuery.viewPadding.bottom;
            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 8,
                bottom: bottomInset + 20,
              ),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      index == null
                          ? 'Nueva cuenta de pago digital'
                          : 'Editar cuenta de pago digital',
                      style: GoogleFonts.poppins(
                        color: _setupTextHigh,
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Agrega solo los campos que necesites: banco, procesador, pago movil, correo, ID u otros.',
                      style: TextStyle(color: _setupTextMedium, fontSize: 13),
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      initialValue: accountName,
                      onChanged: (text) {
                        accountName = text;
                        if (showInlineErrors) {
                          setModalState(() {});
                        }
                      },
                      maxLength: _maxTransferAccountNameLength,
                      style: const TextStyle(color: _setupTextHigh),
                      decoration: InputDecoration(
                        labelText: 'Nombre de la cuenta',
                        hintText: 'Ej. Banco Principal',
                        filled: true,
                        fillColor: const Color(0xFF120E25),
                        labelStyle: const TextStyle(color: _setupTextLow),
                        hintStyle: const TextStyle(color: _setupTextLow),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(
                            color: Color(0xFF3B2F63),
                          ),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(
                            color: Color(0xFF3B2F63),
                          ),
                        ),
                        errorText: showInlineErrors
                            ? _transferAccountNameError(accountName)
                            : null,
                      ),
                    ),
                    const SizedBox(height: 12),
                    ...List.generate(fields.length, (fieldIndex) {
                      final field = fields[fieldIndex];
                      final effectiveLabel = field.label.trim().isEmpty
                          ? _TransferFieldDraft.labelForType(field.type)
                          : field.label;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: const Color(0xFF120E25),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFF3B2F63)),
                          ),
                          child: Column(
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: DropdownButtonFormField<String>(
                                      initialValue: field.type,
                                      decoration: InputDecoration(
                                        labelText: 'Tipo de campo',
                                        filled: true,
                                        fillColor: const Color(0xFF120E25),
                                        labelStyle: const TextStyle(
                                          color: _setupTextLow,
                                        ),
                                        border: OutlineInputBorder(
                                          borderRadius: BorderRadius.circular(
                                            12,
                                          ),
                                          borderSide: const BorderSide(
                                            color: Color(0xFF3B2F63),
                                          ),
                                        ),
                                        enabledBorder: OutlineInputBorder(
                                          borderRadius: BorderRadius.circular(
                                            12,
                                          ),
                                          borderSide: const BorderSide(
                                            color: Color(0xFF3B2F63),
                                          ),
                                        ),
                                        focusedBorder: OutlineInputBorder(
                                          borderRadius: BorderRadius.circular(
                                            12,
                                          ),
                                          borderSide: const BorderSide(
                                            color: Color(0xFF6B5A9A),
                                          ),
                                        ),
                                      ),
                                      dropdownColor: const Color(0xFF1A1432),
                                      style: const TextStyle(
                                        color: _setupTextHigh,
                                      ),
                                      iconEnabledColor: _setupTextHigh,
                                      iconDisabledColor: _setupTextLow,
                                      items: _TransferFieldDraft.typeOptions
                                          .map(
                                            (
                                              option,
                                            ) => DropdownMenuItem<String>(
                                              value: option,
                                              child: Text(
                                                _TransferFieldDraft.labelForType(
                                                  option,
                                                ),
                                              ),
                                            ),
                                          )
                                          .toList(),
                                      onChanged: (value) {
                                        if (value == null) {
                                          return;
                                        }
                                        setModalState(() {
                                          final currentField =
                                              fields[fieldIndex];
                                          final currentDefaultLabel =
                                              _TransferFieldDraft.labelForType(
                                                currentField.type,
                                              );
                                          final keepAutoLabel =
                                              currentField.label
                                                  .trim()
                                                  .isEmpty ||
                                              currentField.label.trim() ==
                                                  currentDefaultLabel;
                                          final nextValue =
                                              value == 'numero_cuenta'
                                              ? currentField.value.replaceAll(
                                                  RegExp(r'[^0-9]'),
                                                  '',
                                                )
                                              : currentField.value;
                                          fields[fieldIndex] = currentField
                                              .copyWith(
                                                type: value,
                                                label: keepAutoLabel
                                                    ? _TransferFieldDraft.labelForType(
                                                        value,
                                                      )
                                                    : currentField.label,
                                                value: nextValue,
                                              );
                                        });
                                      },
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  IconButton(
                                    onPressed: () {
                                      if (fields.length <= 1) {
                                        ScaffoldMessenger.of(
                                          context,
                                        ).showSnackBar(
                                          const SnackBar(
                                            content: Text(
                                              'Cada cuenta debe tener al menos un campo.',
                                            ),
                                          ),
                                        );
                                        return;
                                      }
                                      setModalState(() {
                                        fields.removeAt(fieldIndex);
                                      });
                                    },
                                    icon: const Icon(
                                      Icons.delete_outline_rounded,
                                      color: Color(0xFFFFD1DC),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              TextFormField(
                                key: ValueKey(
                                  'transfer-label-$fieldIndex-${field.type}-${field.label}',
                                ),
                                initialValue: effectiveLabel,
                                onChanged: (text) {
                                  fields[fieldIndex] = fields[fieldIndex]
                                      .copyWith(label: text);
                                  if (showInlineErrors) {
                                    setModalState(() {});
                                  }
                                },
                                maxLength: _maxTransferFieldLabelLength,
                                style: const TextStyle(color: _setupTextHigh),
                                decoration: InputDecoration(
                                  labelText: 'Etiqueta visible',
                                  hintText:
                                      'Opcional (se autocompleta segun tipo)',
                                  filled: true,
                                  fillColor: const Color(0xFF120E25),
                                  labelStyle: const TextStyle(
                                    color: _setupTextLow,
                                  ),
                                  hintStyle: const TextStyle(
                                    color: _setupTextLow,
                                  ),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide: const BorderSide(
                                      color: Color(0xFF3B2F63),
                                    ),
                                  ),
                                  enabledBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide: const BorderSide(
                                      color: Color(0xFF3B2F63),
                                    ),
                                  ),
                                  focusedBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide: const BorderSide(
                                      color: Color(0xFF6B5A9A),
                                    ),
                                  ),
                                  errorText: showInlineErrors
                                      ? _transferFieldLabelError(
                                          fields[fieldIndex].label,
                                        )
                                      : null,
                                ),
                              ),
                              const SizedBox(height: 8),
                              TextFormField(
                                key: ValueKey(
                                  'transfer-value-$fieldIndex-${field.type}',
                                ),
                                initialValue: field.value,
                                onChanged: (text) {
                                  fields[fieldIndex] = fields[fieldIndex]
                                      .copyWith(value: text);
                                  if (showInlineErrors) {
                                    setModalState(() {});
                                  }
                                },
                                maxLength: _maxTransferFieldValueLength,
                                style: const TextStyle(color: _setupTextHigh),
                                minLines: 1,
                                maxLines: field.type == 'nota' ? 3 : 1,
                                keyboardType: _transferFieldKeyboardType(
                                  field.type,
                                ),
                                inputFormatters: _transferFieldInputFormatters(
                                  field.type,
                                ),
                                decoration: InputDecoration(
                                  labelText: 'Valor',
                                  hintText: 'Dato que verá el cliente',
                                  filled: true,
                                  fillColor: const Color(0xFF120E25),
                                  labelStyle: const TextStyle(
                                    color: _setupTextLow,
                                  ),
                                  hintStyle: const TextStyle(
                                    color: _setupTextLow,
                                  ),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide: const BorderSide(
                                      color: Color(0xFF3B2F63),
                                    ),
                                  ),
                                  enabledBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide: const BorderSide(
                                      color: Color(0xFF3B2F63),
                                    ),
                                  ),
                                  focusedBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide: const BorderSide(
                                      color: Color(0xFF6B5A9A),
                                    ),
                                  ),
                                  errorText: showInlineErrors
                                      ? _transferFieldValueError(
                                          fields[fieldIndex],
                                        )
                                      : null,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: _setupTextHigh,
                        side: const BorderSide(color: Color(0xFF6B5A9A)),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 12,
                        ),
                      ),
                      onPressed: () {
                        if (fields.length >= _maxTransferFieldsPerAccount) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                'Cada cuenta permite maximo $_maxTransferFieldsPerAccount campos.',
                              ),
                            ),
                          );
                          return;
                        }
                        setModalState(() {
                          fields.add(_TransferFieldDraft.defaultField());
                        });
                      },
                      icon: const Icon(Icons.add_rounded),
                      label: const Text('Agregar campo'),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: _setupTextHigh,
                              side: const BorderSide(color: Color(0xFF6B5A9A)),
                            ),
                            onPressed: () => Navigator.of(context).pop(),
                            child: const Text('Cancelar'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: FilledButton(
                            onPressed: () {
                              final cleaned = fields
                                  .map(
                                    (field) => field.copyWith(
                                      label: field.label.trim(),
                                      value: field.value.trim(),
                                    ),
                                  )
                                  .toList();

                              final candidate = _TransferAccountDraft(
                                name: accountName.trim(),
                                fields: cleaned,
                              );
                              final validationMessage =
                                  _transferAccountValidationMessage(candidate);
                              if (validationMessage != null) {
                                setModalState(() {
                                  showInlineErrors = true;
                                });
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text(validationMessage)),
                                );
                                return;
                              }

                              Navigator.of(context).pop(candidate);
                            },
                            child: const Text('Guardar cuenta'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (updatedAccount == null || !mounted) {
      return;
    }

    setState(() {
      final list = current.transferAccounts.toList();
      if (index != null && index >= 0 && index < list.length) {
        list[index] = updatedAccount;
      } else {
        list.add(updatedAccount);
      }
      _paymentMethodDraftsByCurrency[currency]!['Transferencia'] = current
          .copyWith(transferAccounts: list);
    });
    await _saveDraft();
  }

  Future<void> _suggestExchangeRate({bool force = false}) async {
    final currency = _currentCurrency;
    if (_isExchangeRateLoading) {
      return;
    }

    if (currency == 'USD') {
      setState(() {
        _exchangeRateController.text = '1';
        _lastSuggestedRateCurrency = 'USD';
        _exchangeRateManuallyEdited = false;
        _exchangeRateMessage = null;
        _exchangeRateIsError = false;
        _exchangeRateByCurrency['USD'] = '1';
      });
      await _saveDraft();
      return;
    }

    if (!force &&
        _lastSuggestedRateCurrency == currency &&
        _exchangeRateController.text.trim().isNotEmpty) {
      return;
    }

    final fallback = _defaultExchangeRateFor(currency);
    setState(() {
      if (_exchangeRateController.text.trim().isEmpty || force) {
        _exchangeRateController.text = _formatExchangeRate(fallback);
      }
      _isExchangeRateLoading = true;
      _exchangeRateIsError = false;
      _exchangeRateMessage =
          'Aplicando tasa de referencia para ${_currencyLabel(currency)}.';
    });

    if (!mounted) {
      return;
    }

    setState(() {
      if (!_exchangeRateManuallyEdited ||
          force ||
          _lastSuggestedRateCurrency != currency) {
        _exchangeRateController.text = _formatExchangeRate(fallback);
      }
      _exchangeRateByCurrency[currency] = _exchangeRateController.text.trim();
      _lastSuggestedRateCurrency = currency;
      _exchangeRateIsError = false;
      _exchangeRateMessage =
          'Tasa base sugerida. Puedes ajustarla a tu medida.';
      _isExchangeRateLoading = false;
    });
    await _saveDraft();
  }

  Future<void> _syncPaymentMethods(String comercioId) async {
    final rows = <Map<String, dynamic>>[];
    for (final currency in _selectedCurrencies) {
      final selected = _selectedPaymentsForCurrency(currency);
      final drafts = _paymentDraftsForCurrency(currency);
      for (final method in selected) {
        final draft = drafts[method] ?? _PaymentMethodDraft(method: method);
        if (method == 'Transferencia') {
          final accounts = draft.transferAccounts;
          for (var index = 0; index < accounts.length; index += 1) {
            final account = accounts[index];
            rows.add(<String, dynamic>{
              'comercio_id': comercioId,
              'nombre': account.name.trim().isEmpty
                  ? 'Pago digital'
                  : 'Pago digital: ${account.name.trim()}',
              'tipo': 'transferencia__${currency.toLowerCase()}__${index + 1}',
              'descripcion': 'Cuenta de pago digital',
              'detalles': jsonEncode(account.toMap()),
            });
          }
        } else {
          rows.add(<String, dynamic>{
            'comercio_id': comercioId,
            'nombre': method,
            'tipo':
                '${method.toLowerCase().replaceAll(' ', '_')}__${currency.toLowerCase()}',
            if (draft.description.isNotEmpty) 'descripcion': draft.description,
            if (draft.extraDetails.isNotEmpty) 'detalles': draft.extraDetails,
          });
        }
      }
    }

    final client = Supabase.instance.client;
    await client.from('metodos_pago').delete().eq('comercio_id', comercioId);
    if (rows.isNotEmpty) {
      await client.from('metodos_pago').insert(rows);
    }
  }

  void _previousStep() {
    _ensureCurrentStepInFlow();
    if (_currentStepFlowIndex == 0) {
      return;
    }

    setState(() {
      _step = _activeSteps[_currentStepFlowIndex - 1];
    });
    unawaited(_saveDraft());
  }

  Future<ComercioModel> _upsertComercio({
    required User user,
    required String? logoUrl,
  }) async {
    final primaryCurrency = _currentCurrency;
    final primaryExchangeRate = _parseExchangeRate(
      _exchangeRateByCurrency[primaryCurrency],
    );
    final allMethods = _selectedCurrencies
        .expand((currency) => _selectedPaymentsForCurrency(currency))
        .toSet();
    final defaultMethod = allMethods.isNotEmpty ? allMethods.first : 'Efectivo';
    final payload = <String, dynamic>{
      'owner_id': user.id,
      'nombre': _nameController.text.trim(),
      'slug': _normalizeSlug(_slugController.text),
      'categoria': _selectedCategory,
      if (_whatsappE164.isNotEmpty) 'whatsapp': _whatsappE164,
      if (_addressController.text.trim().isNotEmpty)
        'direccion': _addressController.text.trim(),
      if (_businessLatitude != null) 'latitud': _businessLatitude,
      if (_businessLongitude != null) 'longitud': _businessLongitude,
      'permite_delivery': _allowDelivery,
      'recibe_pedidos_whatsapp': _receiveOrdersOnWhatsapp,
      if (logoUrl != null && logoUrl.trim().isNotEmpty) 'logo_url': logoUrl,
      'moneda': primaryCurrency,
      'tasa_cambio_pesos': primaryCurrency == 'COP' && primaryExchangeRate > 0
          ? primaryExchangeRate
          : null,
      'metodo_pago_predeterminado': defaultMethod,
      'metodos_pago': allMethods.toList(),
      'menu_layout': _selectedLayoutId,
      'menu_palette': _selectedPaletteId,
      'menu_palette_primary': _paletteSuggestion.primary.toARGB32(),
      'menu_palette_accent': _paletteSuggestion.accent.toARGB32(),
      'menu_palette_surface': _paletteSuggestion.surface.toARGB32(),
      'menu_palette_text': _paletteSuggestion.text.toARGB32(),
      'menu_font': _selectedHeadingFont,
      'menu_footer': _selectedFooter,
    };

    final removable = <String>{
      'categoria',
      'whatsapp',
      'direccion',
      'latitud',
      'longitud',
      'permite_delivery',
      'recibe_pedidos_whatsapp',
      'slug',
      'logo_url',
      'moneda',
      'tasa_cambio_pesos',
      'metodo_pago_predeterminado',
      'metodos_pago',
      'menu_layout',
      'menu_palette',
      'menu_palette_primary',
      'menu_palette_accent',
      'menu_palette_surface',
      'menu_palette_text',
      'menu_font',
      'menu_footer',
    };

    Future<Map<String, dynamic>> write(Map<String, dynamic> data) async {
      if (_editingComercioId == null) {
        final row = await Supabase.instance.client
            .from('comercios')
            .insert(data)
            .select('id, slug, nombre, logo_url, whatsapp, en_linea')
            .single();
        return Map<String, dynamic>.from(row);
      }

      final row = await Supabase.instance.client
          .from('comercios')
          .update(data)
          .eq('id', _editingComercioId!)
          .select('id, slug, nombre, logo_url, whatsapp, en_linea')
          .single();
      return Map<String, dynamic>.from(row);
    }

    final data = Map<String, dynamic>.from(payload);

    while (true) {
      try {
        final row = await write(data);
        return ComercioModel.fromMap(row);
      } on PostgrestException catch (error) {
        final msg = error.message.toLowerCase();
        String? key;

        for (final candidate in removable) {
          if (data.containsKey(candidate) &&
              msg.contains(candidate.toLowerCase())) {
            key = candidate;
            break;
          }
        }

        if (key == null) {
          rethrow;
        }
        data.remove(key);
      }
    }
  }

  Future<void> _saveBusiness() async {
    if (_saving) {
      return;
    }

    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('No hay sesion activa.')));
      return;
    }

    if (!_canContinueIdentity()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Completa nombre y URL disponible.')),
      );
      return;
    }

    _syncActiveCurrencyDataFromController();

    if (_selectedCurrencies.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Selecciona al menos 1 moneda de cobro.')),
      );
      return;
    }

    if (!_isExchangeRateConfigured()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Configura una tasa de cambio antes de guardar.'),
        ),
      );
      return;
    }

    if (!_hasPaymentDetailsForSelectedMethods()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Completa al menos un detalle en cada metodo de pago seleccionado.',
          ),
        ),
      );
      return;
    }

    final operationMessage = _operationValidationMessage();
    if (operationMessage != null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(operationMessage)));
      return;
    }

    if (!widget.businessConfigOnly && !_hasMenuSetupCompleted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Debes completar el escaneo o usar la opcion manual antes de guardar.',
          ),
        ),
      );
      return;
    }

    setState(() => _saving = true);

    try {
      final logoUrl = await _uploadLogoIfNeeded(user);
      final comercio = await _upsertComercio(user: user, logoUrl: logoUrl);
      await _syncPaymentMethods(comercio.id);

      SupabaseConfig.setCurrentComercioId(comercio.id, slug: comercio.slug);
      await _clearDraft();

      if (!mounted) {
        return;
      }
      await _openCompletionActions();
    } on StorageException catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo subir el logo: ${error.message}')),
      );
    } on PostgrestException catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar: ${error.message}')),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('No se pudo completar: $error')));
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  Future<String?> _uploadLogoIfNeeded(User user) async {
    final logo = _selectedLogo;
    if (logo == null) {
      return null;
    }

    final bytes = await logo.readAsBytes();
    final extMatch = RegExp(r'\.([a-zA-Z0-9]+)$').firstMatch(logo.name);
    final ext = extMatch?.group(1)?.toLowerCase() ?? 'jpg';

    final path = _buildLogoPath(user.id, _nameController.text, ext);

    final contentType = switch (ext) {
      'png' => 'image/png',
      'webp' => 'image/webp',
      'gif' => 'image/gif',
      _ => 'image/jpeg',
    };

    await Supabase.instance.client.storage
        .from('logos-comercios')
        .uploadBinary(
          path,
          bytes,
          fileOptions: FileOptions(contentType: contentType, upsert: true),
        );

    return Supabase.instance.client.storage
        .from('logos-comercios')
        .getPublicUrl(path);
  }

  String _buildLogoPath(String userId, String businessName, String extension) {
    final safeName = businessName
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'-+'), '-')
        .replaceAll(RegExp(r'^-|-$'), '');

    final ext = extension.isEmpty ? 'jpg' : extension;
    final now = DateTime.now().millisecondsSinceEpoch;
    return '$userId/${safeName.isEmpty ? 'logo' : safeName}_$now.$ext';
  }

  Future<void> _openCompletionActions() async {
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Configuracion guardada correctamente.')),
    );

    if (widget.businessConfigOnly) {
      Navigator.of(context).pop(true);
      return;
    }

    await Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const AdminDashboardScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loadingExisting) {
      return const BrandedLoadingScreen(withScaffold: true);
    }

    _ensureCurrentStepInFlow();
    final progress = (_currentStepFlowIndex + 1) / _activeSteps.length;
    final localTheme = Theme.of(context).copyWith(
      textTheme: Theme.of(context).textTheme.apply(
        bodyColor: _setupTextHigh,
        displayColor: _setupTextHigh,
      ),
      iconTheme: const IconThemeData(color: _setupTextHigh),
      listTileTheme: const ListTileThemeData(
        textColor: _setupTextHigh,
        iconColor: _setupTextMedium,
      ),
      dividerColor: const Color(0xFF3B2F63),
    );

    return Theme(
      data: localTheme,
      child: Scaffold(
        backgroundColor: const Color(0xFF0F0B1D),
        appBar: AppBar(
          backgroundColor: const Color(0xFF16102A),
          foregroundColor: _setupTextHigh,
          iconTheme: const IconThemeData(color: _setupTextHigh),
          titleTextStyle: GoogleFonts.poppins(
            color: _setupTextHigh,
            fontSize: 28,
            fontWeight: FontWeight.w700,
          ),
          title: Text(
            widget.businessConfigOnly
                ? 'Configuración del negocio'
                : (_isEditing ? 'Editar menu' : 'Crear menu'),
          ),
        ),
        body: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final compact = constraints.maxWidth < 420;
              return Column(
                children: [
                  LinearProgressIndicator(
                    value: progress,
                    minHeight: 4,
                    backgroundColor: const Color(0xFF281D49),
                    valueColor: AlwaysStoppedAnimation<Color>(_palette.primary),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 10, 14, 6),
                    child: _StepPills(step: _step, steps: _activeSteps),
                  ),
                  if (_showDraftRecoveredHint)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(14, 0, 14, 6),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFF1D1638),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: const Color(0xFF3B2F63)),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.history_rounded,
                                size: 14,
                                color: Color(0xFFD8B4FE),
                              ),
                              SizedBox(width: 6),
                              Text(
                                'Recuperado borrador',
                                style: TextStyle(
                                  color: Color(0xFFEDE9FE),
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  Expanded(
                    child: Padding(
                      key: ValueKey<_SetupStep>(_step),
                      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                      child: _buildStepContent(compact),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 6, 14, 14),
                    child: Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _currentStepFlowIndex == 0
                                ? null
                                : _previousStep,
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.white,
                              disabledForegroundColor: const Color(0xFFB6A9D7),
                              side: const BorderSide(color: Color(0xFF5F4B93)),
                              minimumSize: const Size.fromHeight(50),
                            ),
                            child: const Text('Atras'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          flex: compact ? 1 : 2,
                          child: FilledButton(
                            onPressed: _saving ? null : _nextStep,
                            style: FilledButton.styleFrom(
                              backgroundColor: _palette.primary,
                              minimumSize: const Size.fromHeight(50),
                            ),
                            child: Text(
                              _saving
                                  ? 'Guardando...'
                                  : _isLastStepInFlow
                                  ? (widget.businessConfigOnly
                                        ? 'Guardar cambios'
                                        : (_isEditing
                                              ? 'Guardar'
                                              : 'Crear menu'))
                                  : 'Continuar',
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildStepContent(bool compact) {
    final child = switch (_step) {
      _SetupStep.identity => _buildIdentityStep(compact),
      _SetupStep.style => _buildStyleStep(),
      _SetupStep.checkout => _buildCheckoutStep(),
      _SetupStep.operation => _buildOperationStep(),
      _SetupStep.scan => _buildScanStep(),
      _SetupStep.finish => _buildFinishStep(),
    };

    return SingleChildScrollView(
      padding: EdgeInsets.only(bottom: _step == _SetupStep.finish ? 24 : 12),
      child: child,
    );
  }

  Widget _buildIdentityStep(bool compact) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _UrlBar(
          slugController: _slugController,
          onChanged: _onSlugChanged,
          checkingSlug: _checkingSlug,
          isSlugAvailable: _isSlugAvailable,
          slugMessage: _slugAvailabilityMessage,
        ),
        const SizedBox(height: 12),
        _MenuPreviewNavbar(
          compact: compact,
          nameController: _nameController,
          category: _selectedCategory,
          onNameChanged: (_) => unawaited(_saveDraft()),
          onPickLogo: _pickLogo,
          selectedLogo: _selectedLogo,
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          key: ValueKey<String>('category-$_selectedCategory'),
          initialValue: _selectedCategory,
          decoration: _fieldDecoration(
            'Tipo de menu',
            Icons.storefront_rounded,
          ),
          dropdownColor: const Color(0xFF1A1432),
          style: const TextStyle(color: Colors.white),
          items: _categories
              .map(
                (value) =>
                    DropdownMenuItem<String>(value: value, child: Text(value)),
              )
              .toList(),
          onChanged: (value) {
            if (value == null) return;
            setState(() {
              _selectedCategory = value;
              _showAllFontSuggestions = false;
              if (!_fontSuggestions.contains(_selectedHeadingFont)) {
                _selectedHeadingFont = _fontSuggestions.first;
              }
            });
            unawaited(_saveDraft());
          },
        ),
      ],
    );
  }

  Widget _buildStyleStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Paleta',
          style: GoogleFonts.poppins(
            color: _setupTextHigh,
            fontSize: 19,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        _SmartPaletteCard(
          palette: _paletteSuggestion,
          detectedColors: _logoDetectedColors,
          onEditPrimary: () => _editPaletteColor('primary'),
          onEditAccent: () => _editPaletteColor('accent'),
          onEditSurface: () => _editPaletteColor('surface'),
          onEditText: () => _editPaletteColor('text'),
        ),
        if (_isGeminiPaletteLoading || _paletteStatusMessage != null) ...[
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: _paletteStatusIsError
                  ? const Color(0xFF2A1722)
                  : const Color(0xFF151F33),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: _paletteStatusIsError
                    ? const Color(0xFF7A294E)
                    : const Color(0xFF345A93),
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Icon(
                      _paletteStatusIsError
                          ? Icons.info_outline_rounded
                          : Icons.hourglass_bottom_rounded,
                      size: 18,
                      color: _paletteStatusIsError
                          ? const Color(0xFFFFB4CF)
                          : const Color(0xFFAED3FF),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _paletteStatusMessage ?? '',
                        style: TextStyle(
                          color: _paletteStatusIsError
                              ? const Color(0xFFFFD7E7)
                              : const Color(0xFFD3E8FF),
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
                if (_isGeminiPaletteLoading) ...[
                  const SizedBox(height: 10),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: const LinearProgressIndicator(
                      minHeight: 4,
                      backgroundColor: Color(0xFF233A61),
                      valueColor: AlwaysStoppedAnimation<Color>(
                        Color(0xFFAED3FF),
                      ),
                    ),
                  ),
                ],
                if (_paletteStatusIsError && !_isGeminiPaletteLoading) ...[
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: OutlinedButton.icon(
                      onPressed: _selectedLogo == null
                          ? null
                          : () {
                              unawaited(
                                _refreshSmartStyleSuggestions(force: true),
                              );
                            },
                      icon: const Icon(Icons.refresh_rounded, size: 16),
                      label: const Text('Reintentar con IA'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFFFFD7E7),
                        side: const BorderSide(color: Color(0xFFB85C87)),
                        textStyle: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                        visualDensity: VisualDensity.compact,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
        const SizedBox(height: 14),
        Text(
          'Fuente sugerida',
          style: GoogleFonts.poppins(
            color: _setupTextHigh,
            fontSize: 19,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            ...(_showAllFontSuggestions
                    ? _fontSuggestions
                    : _fontSuggestions.take(2).toList())
                .map((fontName) {
                  final selected = _selectedHeadingFont == fontName;
                  return ChoiceChip(
                    label: Text(
                      fontName,
                      style: _headingFontStyle(
                        fontSize: 14,
                        fontWeight: selected
                            ? FontWeight.w700
                            : FontWeight.w500,
                        color: _setupTextHigh,
                      ),
                    ),
                    selected: selected,
                    onSelected: (_) {
                      setState(() {
                        _selectedHeadingFont = fontName;
                        _fontManuallyEdited = true;
                        _lastFontLogoPath = _selectedLogo?.path ?? '';
                      });
                      unawaited(_saveDraft());
                    },
                    selectedColor: const Color(0xFF2D2152),
                    backgroundColor: const Color(0xFF1A1432),
                    side: BorderSide(
                      color: selected
                          ? _palette.primary
                          : const Color(0xFF3B2F63),
                    ),
                    showCheckmark: false,
                  );
                }),
            if (_fontSuggestions.length > 1)
              ActionChip(
                label: Text(_showAllFontSuggestions ? 'Ver menos' : 'Ver mas'),
                onPressed: () {
                  setState(
                    () => _showAllFontSuggestions = !_showAllFontSuggestions,
                  );
                },
                backgroundColor: const Color(0xFF1A1432),
                side: const BorderSide(color: Color(0xFF3B2F63)),
                labelStyle: const TextStyle(
                  color: _setupTextMedium,
                  fontSize: 14,
                ),
              ),
          ],
        ),
        const SizedBox(height: 14),
        Text(
          'Vista rapida de marca',
          style: GoogleFonts.poppins(
            color: _setupTextHigh,
            fontSize: 19,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        _BrandMiniPreview(
          palette: _paletteSuggestion,
          logoPath: _selectedLogo?.path,
          businessName: _nameController.text.trim().isEmpty
              ? 'Tu menu'
              : _nameController.text.trim(),
          layoutName: _layouts
              .firstWhere((item) => item.id == _selectedLayoutId)
              .name,
          headingStyleBuilder: _headingFontStyle,
        ),
      ],
    );
  }

  Widget _buildCheckoutStep() {
    if (_selectedCurrencies.isEmpty) {
      _selectedCurrencies.add('USD');
    }

    final currentCurrency = _currentCurrency;
    _ensureCurrencyConfig(currentCurrency);
    final currentPayments = _selectedPaymentsForCurrency(currentCurrency);
    final currentDrafts = _paymentDraftsForCurrency(currentCurrency);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Moneda de cobro',
          style: GoogleFonts.poppins(
            color: _setupTextHigh,
            fontSize: 19,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Selecciona una o varias monedas. Cada moneda se configura por separado.',
          style: const TextStyle(color: _setupTextMedium, fontSize: 12),
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _currencies.map((currency) {
            final selected = _selectedCurrencies.contains(currency);
            return FilterChip(
              avatar: Icon(
                selected ? Icons.check_circle_rounded : Icons.circle_outlined,
                size: 16,
                color: selected ? const Color(0xFFA7F3D0) : _setupTextLow,
              ),
              label: Text('${_currencyLabel(currency)} ($currency)'),
              selected: selected,
              onSelected: (active) {
                setState(() {
                  _syncActiveCurrencyDataFromController();
                  if (active) {
                    _selectedCurrencies.add(currency);
                    _activeCheckoutCurrency = currency;
                    _ensureCurrencyConfig(currency);
                    if (currency != 'USD' &&
                        (_exchangeRateByCurrency[currency]?.trim().isEmpty ??
                            true)) {
                      _exchangeRateByCurrency[currency] = _formatExchangeRate(
                        _defaultExchangeRateFor(currency),
                      );
                    }
                  } else {
                    if (_selectedCurrencies.length == 1) {
                      return;
                    }
                    _selectedCurrencies.remove(currency);
                    _selectedPaymentsByCurrency.remove(currency);
                    _paymentMethodDraftsByCurrency.remove(currency);
                    _exchangeRateByCurrency.remove(currency);
                    if (_activeCheckoutCurrency == currency) {
                      _activeCheckoutCurrency = _selectedCurrencies.first;
                    }
                  }
                  _exchangeRateManuallyEdited = false;
                  _exchangeRateMessage = null;
                  _exchangeRateIsError = false;
                  _loadActiveCurrencyIntoController();
                });
                unawaited(_saveDraft());
              },
              selectedColor: const Color(0xFF2D2152),
              backgroundColor: const Color(0xFF1A1432),
              labelStyle: const TextStyle(color: _setupTextHigh, fontSize: 13),
              side: BorderSide(
                color: selected ? _palette.primary : const Color(0xFF3B2F63),
              ),
              showCheckmark: false,
            );
          }).toList(),
        ),
        const SizedBox(height: 10),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: const Color(0xFF17122E),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF3B2F63)),
          ),
          child: Row(
            children: [
              const Icon(
                Icons.checklist_rounded,
                size: 16,
                color: _setupTextMedium,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${_configuredCurrenciesCount()}/${_selectedCurrencies.length} monedas configuradas',
                  style: const TextStyle(
                    color: _setupTextMedium,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
        if (_selectedCurrencies.length > 1) ...[
          const SizedBox(height: 10),
          Text(
            'Moneda en edicion: ${_currencyLabel(currentCurrency)} ($currentCurrency)',
            style: const TextStyle(color: _setupTextMedium, fontSize: 12),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _selectedCurrencies.map((currency) {
              final isActive = currency == currentCurrency;
              final isReady = _isCurrencyCheckoutConfigured(currency);
              return ChoiceChip(
                label: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(currency),
                    if (!isReady) ...[
                      const SizedBox(width: 6),
                      const Icon(
                        Icons.warning_amber_rounded,
                        size: 16,
                        color: Color(0xFFF59E0B),
                      ),
                    ],
                  ],
                ),
                selected: isActive,
                onSelected: (_) {
                  setState(() {
                    _syncActiveCurrencyDataFromController();
                    _activeCheckoutCurrency = currency;
                    _exchangeRateManuallyEdited = false;
                    _exchangeRateMessage = null;
                    _exchangeRateIsError = false;
                    _loadActiveCurrencyIntoController();
                  });
                  unawaited(_saveDraft());
                },
                selectedColor: const Color(0xFF2D2152),
                backgroundColor: const Color(0xFF1A1432),
                labelStyle: const TextStyle(color: _setupTextHigh),
                side: BorderSide(
                  color: isActive ? _palette.primary : const Color(0xFF3B2F63),
                ),
              );
            }).toList(),
          ),
        ],
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFF17122E),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFF3B2F63)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Tasa de referencia - $currentCurrency',
                      style: GoogleFonts.poppins(
                        color: _setupTextHigh,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: _isCurrencyExchangeRateConfigured(currentCurrency)
                          ? const Color(0xFF153222)
                          : const Color(0xFF32151D),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      _isCurrencyExchangeRateConfigured(currentCurrency)
                          ? 'Completa'
                          : 'Pendiente',
                      style: TextStyle(
                        color:
                            _isCurrencyExchangeRateConfigured(currentCurrency)
                            ? const Color(0xFFA7F3D0)
                            : const Color(0xFFFFD1DC),
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                currentCurrency == 'USD'
                    ? 'Tu moneda base es USD. Puedes cobrar sin conversion.'
                    : 'Usa una tasa base sugerida y luego ajustala libremente.',
                style: const TextStyle(color: _setupTextMedium, fontSize: 12),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _exchangeRateController,
                      enabled: currentCurrency != 'USD',
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      inputFormatters: <TextInputFormatter>[
                        FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
                      ],
                      style: const TextStyle(color: _setupTextHigh),
                      decoration: InputDecoration(
                        labelText: currentCurrency == 'USD'
                            ? '1 USD = 1 USD'
                            : '1 USD = ? $currentCurrency',
                        hintText: currentCurrency == 'USD'
                            ? '1'
                            : _formatExchangeRate(
                                _defaultExchangeRateFor(currentCurrency),
                              ),
                        filled: true,
                        fillColor: const Color(0xFF120E25),
                        labelStyle: const TextStyle(color: _setupTextLow),
                        hintStyle: const TextStyle(color: _setupTextLow),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(
                            color: Color(0xFF3B2F63),
                          ),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(
                            color: Color(0xFF3B2F63),
                          ),
                        ),
                      ),
                      onChanged: (_) {
                        _exchangeRateManuallyEdited = true;
                        _exchangeRateByCurrency[currentCurrency] =
                            _exchangeRateController.text.trim();
                        unawaited(_saveDraft());
                      },
                    ),
                  ),
                ],
              ),
              if (_exchangeRateMessage != null) ...[
                const SizedBox(height: 10),
                Text(
                  _exchangeRateMessage!,
                  style: TextStyle(
                    color: _exchangeRateIsError
                        ? const Color(0xFFFFC7D8)
                        : const Color(0xFFD3E8FF),
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ],
          ),
        ),
        Text(
          'Metodos de pago - $currentCurrency',
          style: GoogleFonts.poppins(
            color: _setupTextHigh,
            fontSize: 19,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Usa Efectivo o Pagos digitales. En Pagos digitales puedes crear cuentas para bancos y procesadores (Binance, Zinli, Zelle, pago movil, etc.).',
          style: const TextStyle(color: _setupTextMedium, fontSize: 12),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _paymentMethods.map((method) {
            final selected = currentPayments.contains(method);
            return FilterChip(
              avatar: Icon(_paymentMethodIcon(method), size: 18),
              label: Text(_paymentMethodLabel(method)),
              selected: selected,
              onSelected: (active) async {
                setState(() {
                  if (active) {
                    currentPayments.add(method);
                    currentDrafts.putIfAbsent(
                      method,
                      () => _PaymentMethodDraft(method: method),
                    );
                  } else {
                    currentPayments.remove(method);
                  }
                });
                unawaited(_saveDraft());

                if (active && method == 'Efectivo') {
                  await _openPaymentMethodEditor(method);
                }
                if (active && method == 'Transferencia') {
                  final transferDraft =
                      currentDrafts['Transferencia'] ??
                      const _PaymentMethodDraft(method: 'Transferencia');
                  if (transferDraft.transferAccounts.isEmpty) {
                    await _openPaymentMethodEditor('Transferencia');
                  }
                }
              },
              selectedColor: const Color(0xFF2D2152),
              backgroundColor: const Color(0xFF1A1432),
              labelStyle: const TextStyle(color: _setupTextHigh, fontSize: 14),
              side: BorderSide(
                color: selected ? _palette.primary : const Color(0xFF3B2F63),
              ),
              showCheckmark: false,
            );
          }).toList(),
        ),
        const SizedBox(height: 14),
        ...currentPayments.map((method) {
          final draft =
              currentDrafts[method] ?? _PaymentMethodDraft(method: method);
          final details = _paymentSummaryLines(method, draft);
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFF17122E),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: draft.hasAnyDetail
                      ? _palette.primary.withValues(alpha: 0.5)
                      : const Color(0xFF5A3351),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(_paymentMethodIcon(method), color: _setupTextHigh),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          _paymentMethodLabel(method),
                          style: GoogleFonts.poppins(
                            color: _setupTextHigh,
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: draft.hasAnyDetail
                              ? const Color(0xFF153222)
                              : const Color(0xFF32151D),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          draft.hasAnyDetail ? 'Completo' : 'Pendiente',
                          style: TextStyle(
                            color: draft.hasAnyDetail
                                ? const Color(0xFFA7F3D0)
                                : const Color(0xFFFFD1DC),
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  if (details.isEmpty)
                    const Text(
                      'Aun no has agregado datos para este metodo.',
                      style: TextStyle(color: _setupTextMedium, fontSize: 12),
                    )
                  else
                    ...details
                        .take(4)
                        .map(
                          (line) => Padding(
                            padding: const EdgeInsets.only(bottom: 4),
                            child: Text(
                              line,
                              style: const TextStyle(
                                color: _setupTextMedium,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ),
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: _setupTextHigh,
                        side: const BorderSide(color: Color(0xFF6B5A9A)),
                      ),
                      onPressed: () {
                        if (method == 'Transferencia' &&
                            draft.transferAccounts.length >=
                                _maxTransferAccountsPerCurrency) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                'Maximo $_maxTransferAccountsPerCurrency cuentas por moneda.',
                              ),
                            ),
                          );
                          return;
                        }
                        unawaited(_openPaymentMethodEditor(method));
                      },
                      icon: const Icon(Icons.edit_rounded, size: 16),
                      label: Text(
                        method == 'Transferencia'
                            ? 'Agregar cuenta digital'
                            : details.isEmpty
                            ? 'Agregar datos'
                            : 'Editar datos',
                      ),
                    ),
                  ),
                  if (method == 'Transferencia' &&
                      draft.transferAccounts.isEmpty) ...[
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF120E25),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFF3B2F63)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Aun no tienes cuentas de pago digital.',
                            style: TextStyle(
                              color: _setupTextHigh,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Crea la primera cuenta y agrega solo los campos que necesites.',
                            style: TextStyle(
                              color: _setupTextMedium,
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(height: 10),
                          FilledButton.icon(
                            onPressed: () {
                              if (draft.transferAccounts.length >=
                                  _maxTransferAccountsPerCurrency) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text(
                                      'Maximo $_maxTransferAccountsPerCurrency cuentas por moneda.',
                                    ),
                                  ),
                                );
                                return;
                              }
                              unawaited(
                                _openPaymentMethodEditor('Transferencia'),
                              );
                            },
                            icon: const Icon(Icons.add_rounded, size: 16),
                            label: const Text('Crear primera cuenta'),
                          ),
                        ],
                      ),
                    ),
                  ],
                  if (method == 'Transferencia' &&
                      draft.transferAccounts.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    ...List.generate(draft.transferAccounts.length, (index) {
                      final account = draft.transferAccounts[index];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: const Color(0xFF120E25),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: const Color(0xFF3B2F63)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      account.name.trim().isEmpty
                                          ? 'Cuenta ${index + 1}'
                                          : account.name.trim(),
                                      style: const TextStyle(
                                        color: _setupTextHigh,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                  IconButton(
                                    onPressed: () {
                                      setState(() {
                                        final updated = draft.transferAccounts
                                            .toList();
                                        updated.removeAt(index);
                                        _paymentMethodDraftsByCurrency[currentCurrency]!['Transferencia'] =
                                            draft.copyWith(
                                              transferAccounts: updated,
                                            );
                                      });
                                      unawaited(_saveDraft());
                                    },
                                    icon: const Icon(
                                      Icons.delete_outline_rounded,
                                      size: 18,
                                      color: Color(0xFFFFD1DC),
                                    ),
                                  ),
                                ],
                              ),
                              if (account.fields.isEmpty)
                                const Text(
                                  'Sin campos configurados',
                                  style: TextStyle(
                                    color: _setupTextMedium,
                                    fontSize: 12,
                                  ),
                                )
                              else
                                ...account.fields
                                    .take(3)
                                    .map(
                                      (field) => Padding(
                                        padding: const EdgeInsets.only(
                                          bottom: 2,
                                        ),
                                        child: Text(
                                          '${field.label.trim().isEmpty ? _TransferFieldDraft.labelForType(field.type) : field.label}: ${field.value}',
                                          style: const TextStyle(
                                            color: _setupTextMedium,
                                            fontSize: 12,
                                          ),
                                        ),
                                      ),
                                    ),
                              const SizedBox(height: 6),
                              OutlinedButton.icon(
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: _setupTextHigh,
                                  side: const BorderSide(
                                    color: Color(0xFF6B5A9A),
                                  ),
                                ),
                                onPressed: () {
                                  unawaited(
                                    _openPaymentMethodEditor(
                                      'Transferencia',
                                      transferIndex: index,
                                    ),
                                  );
                                },
                                icon: const Icon(Icons.edit_rounded, size: 15),
                                label: const Text('Editar cuenta'),
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                  ],
                ],
              ),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildOperationStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Operacion del negocio',
          style: GoogleFonts.poppins(
            color: _setupTextHigh,
            fontSize: 19,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Configura como recibir pedidos y como contactarte.',
          style: TextStyle(color: _setupTextMedium, fontSize: 12),
        ),
        const SizedBox(height: 12),
        SwitchListTile.adaptive(
          value: _allowDelivery,
          onChanged: (value) {
            setState(() => _allowDelivery = value);
            unawaited(_saveDraft());
          },
          activeThumbColor: _palette.primary,
          activeTrackColor: _palette.primary.withValues(alpha: 0.45),
          inactiveThumbColor: const Color(0xFFE7E0F9),
          inactiveTrackColor: const Color(0xFF3A305A),
          contentPadding: const EdgeInsets.symmetric(horizontal: 4),
          title: const Text('Permitir delivery'),
          subtitle: const Text(
            'Activa entregas a domicilio para tus clientes.',
            style: TextStyle(color: _setupTextMedium, fontSize: 12),
          ),
        ),
        const SizedBox(height: 8),
        IntlPhoneField(
          controller: _whatsappController,
          initialCountryCode: _selectedPhoneCountryIso.trim().isEmpty
              ? 'VE'
              : _selectedPhoneCountryIso,
          languageCode: 'es',
          style: const TextStyle(color: _setupTextHigh),
          dropdownTextStyle: const TextStyle(
            color: _setupTextHigh,
            fontWeight: FontWeight.w600,
          ),
          pickerDialogStyle: PickerDialogStyle(
            backgroundColor: const Color(0xFF120E25),
            countryNameStyle: const TextStyle(
              color: _setupTextHigh,
              fontWeight: FontWeight.w700,
            ),
            countryCodeStyle: const TextStyle(
              color: _setupTextMedium,
              fontWeight: FontWeight.w600,
            ),
            searchFieldCursorColor: _setupTextHigh,
            searchFieldInputDecoration: InputDecoration(
              labelText: 'Buscar pais',
              labelStyle: const TextStyle(color: _setupTextLow),
              hintText: 'Ej. Venezuela, Colombia',
              hintStyle: const TextStyle(color: _setupTextLow),
              suffixIcon: const Icon(Icons.search, color: _setupTextMedium),
              filled: true,
              fillColor: const Color(0xFF1A1433),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFF3B2F63)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFF3B2F63)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: _palette.primary, width: 1.2),
              ),
            ),
            listTileDivider: const Divider(
              height: 1,
              thickness: 1,
              color: Color(0xFF2A2145),
            ),
          ),
          invalidNumberMessage: 'Numero invalido para ese pais.',
          autovalidateMode: AutovalidateMode.onUserInteraction,
          inputFormatters: <TextInputFormatter>[
            FilteringTextInputFormatter.digitsOnly,
          ],
          decoration: InputDecoration(
            labelText: 'Numero de telefono / WhatsApp',
            hintText: 'Ingresa el numero',
            filled: true,
            fillColor: const Color(0xFF120E25),
            labelStyle: const TextStyle(color: _setupTextLow),
            hintStyle: const TextStyle(color: _setupTextLow),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFF3B2F63)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFF3B2F63)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: _palette.primary, width: 1.4),
            ),
          ),
          onCountryChanged: (country) {
            setState(() => _selectedPhoneCountryIso = country.code);
            unawaited(_saveDraft());
          },
          onChanged: (phone) {
            _selectedPhoneCountryIso = phone.countryISOCode;
            unawaited(_saveDraft());
          },
          validator: (phone) {
            final number = phone?.number.trim() ?? '';
            if ((_allowDelivery || _receiveOrdersOnWhatsapp) &&
                number.isEmpty) {
              return 'Ingresa un numero de WhatsApp.';
            }
            return null;
          },
        ),
        const SizedBox(height: 10),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF120E25),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF3B2F63)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Ubicacion del negocio',
                style: TextStyle(
                  color: _setupTextHigh,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Direccion',
                style: TextStyle(
                  color: _setupTextLow,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                _addressController.text.trim().isEmpty
                    ? 'Sin direccion seleccionada. Abre el mapa y arrastra hasta el punto exacto del negocio.'
                    : _addressController.text.trim(),
                style: const TextStyle(color: _setupTextMedium, fontSize: 12),
              ),
              if (_businessLatitude != null && _businessLongitude != null) ...[
                const SizedBox(height: 4),
                Text(
                  'Coordenadas: ${_businessLatitude!.toStringAsFixed(6)}, ${_businessLongitude!.toStringAsFixed(6)}',
                  style: const TextStyle(color: _setupTextLow, fontSize: 11),
                ),
              ],
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _openAddressPlacePicker,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: _setupTextHigh,
                    side: const BorderSide(color: Color(0xFF6B5A9A)),
                  ),
                  icon: const Icon(Icons.place_rounded, size: 18),
                  label: Text(
                    _addressController.text.trim().isEmpty
                        ? 'Elegir punto en el mapa'
                        : 'Cambiar punto en el mapa',
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        SwitchListTile.adaptive(
          value: _receiveOrdersOnWhatsapp,
          onChanged: (value) {
            setState(() => _receiveOrdersOnWhatsapp = value);
            unawaited(_saveDraft());
          },
          activeThumbColor: _palette.primary,
          activeTrackColor: _palette.primary.withValues(alpha: 0.45),
          inactiveThumbColor: const Color(0xFFE7E0F9),
          inactiveTrackColor: const Color(0xFF3A305A),
          contentPadding: const EdgeInsets.symmetric(horizontal: 4),
          title: const Text('Recibir pedidos por WhatsApp'),
          subtitle: const Text(
            'Muestra WhatsApp como canal principal para tomar pedidos.',
            style: TextStyle(color: _setupTextMedium, fontSize: 12),
          ),
        ),
      ],
    );
  }

  Widget _buildScanStep() {
    return SafeArea(
      top: false,
      bottom: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Escaneo del menu',
            style: GoogleFonts.poppins(
              color: _setupTextHigh,
              fontSize: 19,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Digitaliza tu menu o crea manualmente. Debes completar una de las dos opciones para continuar.',
            style: TextStyle(color: _setupTextMedium, fontSize: 12),
          ),
          const SizedBox(height: 12),
          Text(
            'Layout',
            style: GoogleFonts.poppins(
              color: _setupTextHigh,
              fontSize: 19,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _layouts.map((layout) {
              final selected = _selectedLayoutId == layout.id;
              return ChoiceChip(
                label: Text(layout.name),
                selected: selected,
                avatar: Icon(layout.icon, size: 18),
                onSelected: (_) {
                  setState(() => _selectedLayoutId = layout.id);
                  unawaited(_saveDraft());
                },
                selectedColor: const Color(0xFF2D2152),
                backgroundColor: const Color(0xFF1A1432),
                labelStyle: const TextStyle(
                  color: _setupTextHigh,
                  fontSize: 14,
                ),
                side: BorderSide(
                  color: selected ? _palette.primary : const Color(0xFF3B2F63),
                ),
                showCheckmark: false,
              );
            }).toList(),
          ),
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF17122E),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: _hasMenuSetupCompleted
                    ? const Color(0xFF2C6E49)
                    : const Color(0xFF3B2F63),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      _hasMenuSetupCompleted
                          ? Icons.check_circle_rounded
                          : Icons.document_scanner_rounded,
                      color: _hasMenuSetupCompleted
                          ? const Color(0xFFA7F3D0)
                          : _setupTextMedium,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _menuScanCompleted
                            ? 'Escaneo completado'
                            : _menuCatalogCount > 0
                            ? 'Creacion manual completada'
                            : 'Escaneo pendiente',
                        style: const TextStyle(
                          color: _setupTextHigh,
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  _menuScanCompleted
                      ? 'Catalogo: ${_scanCatalogName.isEmpty ? 'Menú principal' : _scanCatalogName} · $_scanCreatedCategories categorias · $_scanCreatedProducts productos.'
                      : _menuCatalogCount > 0
                      ? _menuCatalogCount == 1
                            ? 'Creacion manual lista: 1 menu detectado.'
                            : 'Creacion manual lista: $_menuCatalogCount menus detectados.'
                      : 'Abre el escaneo y toma una foto clara para procesar tu menu.',
                  style: const TextStyle(color: _setupTextMedium, fontSize: 12),
                ),
                const SizedBox(height: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    FilledButton.icon(
                      onPressed: _openMenuScan,
                      icon: const Icon(Icons.document_scanner_rounded),
                      label: Text(
                        _menuScanCompleted
                            ? 'Reescanear menu'
                            : 'Escanear menu',
                      ),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: _openManualMenuSetup,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: _setupTextHigh,
                        side: const BorderSide(color: Color(0xFF6B5A9A)),
                      ),
                      icon: const Icon(Icons.edit_note_rounded),
                      label: const Text('Crear manualmente'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFinishStep() {
    final base = AppLinks.productionUrl;
    final slug = _normalizeSlug(_slugController.text);
    final previewTextColor = _palette.surface.computeLuminance() > 0.42
        ? const Color(0xFF1E1238)
        : _palette.text;
    final previewMutedColor = previewTextColor.withValues(alpha: 0.72);
    final previewCurrency = _selectedCurrencies.isEmpty
        ? 'USD'
        : _selectedCurrencies.first;
    final featuredItems = <Map<String, String>>[
      {'name': 'Producto destacado', 'price': previewCurrency},
      {'name': 'Especial de la casa', 'price': previewCurrency},
      {'name': 'Recomendacion del dia', 'price': previewCurrency},
    ];

    return SafeArea(
      top: false,
      bottom: true,
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF17122E),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFF3B2F63)),
        ),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Revision final',
              style: GoogleFonts.poppins(
                color: _setupTextHigh,
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Confirma la configuracion antes de guardar. El menu se publicara con esta base inicial.',
              style: TextStyle(color: _setupTextMedium, fontSize: 12),
            ),
            const SizedBox(height: 12),
            Text(
              _nameController.text.trim().isEmpty
                  ? 'Tu menu'
                  : _nameController.text.trim(),
              style: _headingFontStyle(
                color: _setupTextHigh,
                fontSize: 24,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '$base/v/$slug',
              style: GoogleFonts.poppins(color: _setupTextLow, fontSize: 13),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _SummaryTag(label: _selectedCategory),
                _SummaryTag(
                  label: _layouts
                      .firstWhere((item) => item.id == _selectedLayoutId)
                      .name,
                ),
                _SummaryTag(label: _selectedCurrencies.join(' + ')),
                _SummaryTag(
                  label: _allowDelivery ? 'Delivery activo' : 'Sin delivery',
                ),
                _SummaryTag(
                  label: _receiveOrdersOnWhatsapp
                      ? 'Pedidos por WhatsApp'
                      : 'Sin pedidos por WhatsApp',
                ),
              ],
            ),
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF120E25),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFF3B2F63)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Contacto operativo',
                    style: GoogleFonts.poppins(
                      color: _setupTextHigh,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'WhatsApp: ${_whatsappE164.isEmpty ? 'No configurado' : _whatsappE164}',
                    style: const TextStyle(
                      color: _setupTextMedium,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Direccion: ${_addressController.text.trim().isEmpty ? 'No configurada' : _addressController.text.trim()}',
                    style: const TextStyle(
                      color: _setupTextMedium,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              decoration: BoxDecoration(
                color: _palette.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: _palette.primary.withValues(alpha: 0.45),
                ),
              ),
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 34,
                        height: 34,
                        decoration: BoxDecoration(
                          color: _palette.primary.withValues(alpha: 0.18),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(
                          Icons.mobile_friendly_rounded,
                          color: _palette.primary,
                          size: 18,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Preview aproximado del menu publico',
                          style: GoogleFonts.poppins(
                            color: previewTextColor,
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.06),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _nameController.text.trim().isEmpty
                              ? 'Tu menu'
                              : _nameController.text.trim(),
                          style: _headingFontStyle(
                            color: previewTextColor,
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            _PreviewChip(
                              label: _selectedCategory,
                              textColor: previewTextColor,
                            ),
                            _PreviewChip(
                              label: _layouts
                                  .firstWhere(
                                    (item) => item.id == _selectedLayoutId,
                                  )
                                  .name,
                              textColor: previewTextColor,
                            ),
                            _PreviewChip(
                              label: _selectedCurrencies.join(' + '),
                              textColor: previewTextColor,
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        ...featuredItems.map((item) {
                          return Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 8,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.11),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    item['name']!,
                                    style: TextStyle(
                                      color: previewTextColor,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                                Text(
                                  item['price']!,
                                  style: TextStyle(
                                    color: previewMutedColor,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          );
                        }),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.tonalIcon(
                onPressed: _openDraftPreview,
                icon: const Icon(Icons.open_in_browser_rounded),
                label: const Text('Ver preview real'),
                style: FilledButton.styleFrom(
                  foregroundColor: const Color(0xFFF8F5FF),
                  backgroundColor: const Color(0xFF2D2152),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  InputDecoration _fieldDecoration(String label, IconData icon) {
    return InputDecoration(
      labelText: label,
      labelStyle: const TextStyle(color: _setupTextLow, fontSize: 14),
      floatingLabelStyle: const TextStyle(
        color: _setupTextMedium,
        fontSize: 14,
      ),
      prefixIcon: Icon(icon, color: const Color(0xFFD8B4FE)),
      filled: true,
      fillColor: const Color(0xFF1A1432),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFF3B2F63)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFF3B2F63)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: _palette.primary),
      ),
    );
  }
}

class _UrlBar extends StatelessWidget {
  const _UrlBar({
    required this.slugController,
    required this.onChanged,
    required this.checkingSlug,
    required this.isSlugAvailable,
    required this.slugMessage,
  });

  final TextEditingController slugController;
  final ValueChanged<String> onChanged;
  final bool checkingSlug;
  final bool isSlugAvailable;
  final String? slugMessage;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
      decoration: BoxDecoration(
        color: const Color(0xFF17122E),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF3B2F63)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              const Icon(
                Icons.lock_outline_rounded,
                size: 16,
                color: Color(0xFF8B7AB8),
              ),
              const SizedBox(width: 6),
              const Text(
                'kosmenu.vercel.app/v/',
                style: TextStyle(color: _setupTextLow, fontSize: 14),
              ),
              Expanded(
                child: TextField(
                  controller: slugController,
                  onChanged: onChanged,
                  cursorColor: const Color(0xFFE9D5FF),
                  style: const TextStyle(
                    color: _setupTextHigh,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                  decoration: InputDecoration(
                    isDense: true,
                    filled: true,
                    fillColor: const Color(0xFF110D22),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 8,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide.none,
                    ),
                    hintText: 'tu-slug',
                    hintStyle: const TextStyle(
                      color: _setupTextLow,
                      fontSize: 15,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              if (checkingSlug)
                const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else if (slugController.text.trim().isNotEmpty)
                Icon(
                  isSlugAvailable ? Icons.check_circle : Icons.cancel,
                  color: isSlugAvailable
                      ? const Color(0xFF22C55E)
                      : const Color(0xFFEF4444),
                  size: 18,
                ),
            ],
          ),
          if (slugMessage != null)
            Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  slugMessage!,
                  style: TextStyle(
                    color: isSlugAvailable
                        ? const Color(0xFF22C55E)
                        : const Color(0xFFEF4444),
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _MenuPreviewNavbar extends StatelessWidget {
  const _MenuPreviewNavbar({
    required this.compact,
    required this.nameController,
    required this.category,
    required this.onNameChanged,
    required this.onPickLogo,
    required this.selectedLogo,
  });

  final bool compact;
  final TextEditingController nameController;
  final String category;
  final ValueChanged<String> onNameChanged;
  final VoidCallback onPickLogo;
  final XFile? selectedLogo;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF17122E),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF3B2F63)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              InkWell(
                onTap: onPickLogo,
                borderRadius: BorderRadius.circular(999),
                child: _LogoPreview(file: selectedLogo),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextField(
                  controller: nameController,
                  onChanged: onNameChanged,
                  textCapitalization: TextCapitalization.words,
                  cursorColor: const Color(0xFFE9D5FF),
                  style: const TextStyle(
                    color: _setupTextHigh,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                  decoration: InputDecoration(
                    filled: true,
                    fillColor: const Color(0xFF110D22),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                    hintText: 'Nombre del negocio',
                    hintStyle: const TextStyle(
                      color: _setupTextLow,
                      fontSize: 15,
                    ),
                  ),
                ),
              ),
              IconButton(
                onPressed: onPickLogo,
                icon: const Icon(
                  Icons.photo_camera_back_rounded,
                  color: Color(0xFFD8B4FE),
                ),
                tooltip: 'Cambiar logo',
              ),
            ],
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              category,
              style: const TextStyle(
                color: _setupTextLow,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          if (compact) const SizedBox(height: 2),
        ],
      ),
    );
  }
}

class _StepPills extends StatelessWidget {
  const _StepPills({required this.step, required this.steps});

  final _SetupStep step;
  final List<_SetupStep> steps;

  static const List<String> _labels = <String>[
    'Marca',
    'Estilo',
    'Pagos',
    'Operacion',
    'Escaneo',
    'Final',
  ];

  static const List<IconData> _icons = <IconData>[
    Icons.storefront_rounded,
    Icons.palette_rounded,
    Icons.payments_rounded,
    Icons.settings_phone_rounded,
    Icons.document_scanner_rounded,
    Icons.visibility_rounded,
  ];

  @override
  Widget build(BuildContext context) {
    final activeIndex = steps.contains(step) ? steps.indexOf(step) : 0;
    final labels = steps.map((value) => _labels[value.index]).toList();
    final icons = steps.map((value) => _icons[value.index]).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: List.generate(labels.length * 2 - 1, (slotIndex) {
            if (slotIndex.isOdd) {
              final connectorIndex = (slotIndex - 1) ~/ 2;
              final done = connectorIndex < activeIndex;
              return Expanded(
                child: Container(
                  height: 2,
                  color: done
                      ? const Color(0xFF8B5CF6)
                      : const Color(0xFF3B2F63),
                ),
              );
            }

            final index = slotIndex ~/ 2;
            final active = index == activeIndex;
            final done = index < activeIndex;

            return Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: active
                    ? const Color(0xFF6D28D9)
                    : done
                    ? const Color(0xFF2D2152)
                    : const Color(0xFF17122E),
                border: Border.all(
                  color: active
                      ? const Color(0xFFD8B4FE)
                      : const Color(0xFF3B2F63),
                ),
              ),
              child: Icon(
                done ? Icons.check_rounded : icons[index],
                size: 18,
                color: _setupTextHigh,
              ),
            );
          }),
        ),
        const SizedBox(height: 8),
        Text(
          labels[activeIndex],
          style: GoogleFonts.poppins(
            color: _setupTextHigh,
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _LogoPreview extends StatelessWidget {
  const _LogoPreview({required this.file});

  final XFile? file;

  @override
  Widget build(BuildContext context) {
    if (file == null) {
      return Container(
        width: 56,
        height: 56,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: const Color(0xFF241B42),
          border: Border.all(color: const Color(0xFFD8B4FE), width: 1.5),
        ),
        child: const Icon(
          Icons.person_outline_rounded,
          color: Color(0xFFD8B4FE),
        ),
      );
    }

    return FutureBuilder<Uint8List>(
      future: file!.readAsBytes(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xFF241B42),
              border: Border.all(color: const Color(0xFFD8B4FE), width: 1.5),
            ),
            child: const Center(
              child: SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          );
        }

        return Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: const Color(0xFFD8B4FE), width: 1.5),
          ),
          child: ClipOval(
            child: Image.memory(
              snapshot.data!,
              width: 56,
              height: 56,
              fit: BoxFit.cover,
            ),
          ),
        );
      },
    );
  }
}

class _SmartPaletteCard extends StatelessWidget {
  const _SmartPaletteCard({
    required this.palette,
    required this.detectedColors,
    required this.onEditPrimary,
    required this.onEditAccent,
    required this.onEditSurface,
    required this.onEditText,
  });

  final _PaletteOption palette;
  final List<Color> detectedColors;
  final VoidCallback onEditPrimary;
  final VoidCallback onEditAccent;
  final VoidCallback onEditSurface;
  final VoidCallback onEditText;

  @override
  Widget build(BuildContext context) {
    Widget colorItem({
      required String label,
      required Color color,
      required VoidCallback onTap,
    }) {
      return SizedBox(
        width: 118,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFF120E25),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF3B2F63)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    color: _setupTextLow,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    _PaletteDot(color: color),
                    const SizedBox(width: 8),
                    const Icon(
                      Icons.edit_rounded,
                      size: 16,
                      color: Color(0xFFD8B4FE),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF17122E),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: palette.primary.withValues(alpha: 0.85)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                palette.name,
                style: const TextStyle(
                  color: _setupTextHigh,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (detectedColors.isNotEmpty) ...[
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: detectedColors
                  .map((color) => _PaletteDot(color: color))
                  .toList(),
            ),
            const SizedBox(height: 10),
          ],
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              colorItem(
                label: 'Principal',
                color: palette.primary,
                onTap: onEditPrimary,
              ),
              colorItem(
                label: 'Secundario',
                color: palette.accent,
                onTap: onEditAccent,
              ),
              colorItem(
                label: 'Fondo',
                color: palette.surface,
                onTap: onEditSurface,
              ),
              colorItem(label: 'Texto', color: palette.text, onTap: onEditText),
            ],
          ),
        ],
      ),
    );
  }
}

class _BrandMiniPreview extends StatelessWidget {
  const _BrandMiniPreview({
    required this.palette,
    required this.logoPath,
    required this.businessName,
    required this.layoutName,
    required this.headingStyleBuilder,
  });

  final _PaletteOption palette;
  final String? logoPath;
  final String businessName;
  final String layoutName;
  final TextStyle Function({
    required double fontSize,
    required FontWeight fontWeight,
    required Color color,
  })
  headingStyleBuilder;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE7E1F3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 6,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              gradient: LinearGradient(
                colors: [palette.primary, palette.accent],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            businessName,
            style: headingStyleBuilder(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: const Color(0xFF1D1733),
            ),
          ),
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: palette.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: palette.accent.withValues(alpha: 0.5)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _BrandPreviewLogo(logoPath: logoPath, palette: palette),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Producto destacado',
                        style: TextStyle(
                          color: palette.text,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Text(
                      '\$24.90',
                      style: TextStyle(
                        color: palette.accent,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _PreviewPill(label: layoutName, color: palette.primary),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: null,
              style: FilledButton.styleFrom(
                disabledBackgroundColor: palette.primary,
                disabledForegroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: Text('Boton primario • ${layoutName.toLowerCase()}'),
            ),
          ),
        ],
      ),
    );
  }
}

class _PreviewPill extends StatelessWidget {
  const _PreviewPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: Colors.white,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _BrandPreviewLogo extends StatelessWidget {
  const _BrandPreviewLogo({required this.logoPath, required this.palette});

  final String? logoPath;
  final _PaletteOption palette;

  @override
  Widget build(BuildContext context) {
    final path = (logoPath ?? '').trim();
    final hasLogo = path.isNotEmpty && File(path).existsSync();

    if (hasLogo) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Image.file(
          File(path),
          width: 36,
          height: 36,
          fit: BoxFit.cover,
          errorBuilder: (context, error, stackTrace) => _logoFallback(),
        ),
      );
    }

    return _logoFallback();
  }

  Widget _logoFallback() {
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            palette.primary.withValues(alpha: 0.95),
            palette.accent.withValues(alpha: 0.95),
          ],
        ),
        borderRadius: BorderRadius.circular(10),
      ),
      child: const Icon(
        Icons.restaurant_menu_rounded,
        color: Colors.white,
        size: 20,
      ),
    );
  }
}

class _PaletteDot extends StatelessWidget {
  const _PaletteDot({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 18,
      height: 18,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
      ),
    );
  }
}

class _SummaryTag extends StatelessWidget {
  const _SummaryTag({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF241B42),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: _setupTextHigh,
          fontSize: 13,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _PreviewChip extends StatelessWidget {
  const _PreviewChip({required this.label, required this.textColor});

  final String label;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: textColor,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _PaymentMethodDraft {
  const _PaymentMethodDraft({
    required this.method,
    this.description = '',
    this.extraDetails = '',
    this.transferAccounts = const <_TransferAccountDraft>[],
  });

  final String method;
  final String description;
  final String extraDetails;
  final List<_TransferAccountDraft> transferAccounts;

  bool get hasAnyDetail {
    final hasTransfer = transferAccounts.any((item) => item.hasAnyDetail);
    return hasTransfer ||
        description.trim().isNotEmpty ||
        extraDetails.trim().isNotEmpty;
  }

  String valueFor(String key) {
    return switch (key) {
      'description' => description,
      'extraDetails' => extraDetails,
      _ => '',
    };
  }

  _PaymentMethodDraft copyWith({
    String? description,
    String? extraDetails,
    List<_TransferAccountDraft>? transferAccounts,
  }) {
    return _PaymentMethodDraft(
      method: method,
      description: description ?? this.description,
      extraDetails: extraDetails ?? this.extraDetails,
      transferAccounts: transferAccounts ?? this.transferAccounts,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'description': description,
      'extraDetails': extraDetails,
      'transferAccounts': transferAccounts.map((item) => item.toMap()).toList(),
    };
  }

  factory _PaymentMethodDraft.fromMap(String method, Map<String, dynamic> map) {
    final accounts = (map['transferAccounts'] as List<dynamic>? ?? <dynamic>[])
        .whereType<Map>()
        .map(
          (item) => _TransferAccountDraft.fromMap(
            item.map((key, value) => MapEntry('$key', value)),
          ),
        )
        .toList();

    return _PaymentMethodDraft(
      method: method,
      description: map['description']?.toString() ?? '',
      extraDetails: map['extraDetails']?.toString() ?? '',
      transferAccounts: accounts,
    );
  }
}

class _TransferAccountDraft {
  const _TransferAccountDraft({required this.name, required this.fields});

  final String name;
  final List<_TransferFieldDraft> fields;

  bool get hasAnyDetail {
    return name.trim().isNotEmpty ||
        fields.any((item) => item.value.trim().isNotEmpty);
  }

  factory _TransferAccountDraft.empty() {
    return _TransferAccountDraft(
      name: '',
      fields: <_TransferFieldDraft>[_TransferFieldDraft.defaultField()],
    );
  }

  factory _TransferAccountDraft.fromMap(Map<String, dynamic> map) {
    final parsedFields = (map['fields'] as List<dynamic>? ?? <dynamic>[])
        .whereType<Map>()
        .map(
          (item) => _TransferFieldDraft.fromMap(
            item.map((key, value) => MapEntry('$key', value)),
          ),
        )
        .toList();

    return _TransferAccountDraft(
      name: map['name']?.toString() ?? '',
      fields: parsedFields,
    );
  }

  factory _TransferAccountDraft.fromLegacyColumns({
    required String name,
    required String bank,
    required String owner,
    required String documentId,
    required String number,
    required String alias,
    required String description,
    required String notes,
  }) {
    final fields = <_TransferFieldDraft>[];
    if (bank.trim().isNotEmpty) {
      fields.add(
        _TransferFieldDraft(type: 'texto', label: 'Banco', value: bank),
      );
    }
    if (owner.trim().isNotEmpty) {
      fields.add(
        _TransferFieldDraft(type: 'texto', label: 'Titular', value: owner),
      );
    }
    if (documentId.trim().isNotEmpty) {
      fields.add(
        _TransferFieldDraft(type: 'id', label: 'ID', value: documentId),
      );
    }
    if (number.trim().isNotEmpty) {
      fields.add(
        _TransferFieldDraft(
          type: 'numero_cuenta',
          label: 'Numero de cuenta',
          value: number,
        ),
      );
    }
    if (alias.trim().isNotEmpty) {
      fields.add(
        _TransferFieldDraft(type: 'texto', label: 'Alias', value: alias),
      );
    }
    if (description.trim().isNotEmpty) {
      fields.add(
        _TransferFieldDraft(
          type: 'nota',
          label: 'Descripcion',
          value: description,
        ),
      );
    }

    final legacyName = name
        .replaceFirst(RegExp(r'^Transferencia:?\s*'), '')
        .trim();
    return _TransferAccountDraft(
      name: legacyName,
      fields: fields.isEmpty && notes.trim().isNotEmpty
          ? <_TransferFieldDraft>[
              _TransferFieldDraft(type: 'nota', label: 'Nota', value: notes),
            ]
          : fields,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'name': name,
      'fields': fields.map((item) => item.toMap()).toList(),
    };
  }
}

class _TransferFieldDraft {
  const _TransferFieldDraft({
    required this.type,
    required this.label,
    required this.value,
  });

  static const List<String> typeOptions = <String>[
    'texto',
    'numero_cuenta',
    'id',
    'correo',
    'nota',
  ];

  final String type;
  final String label;
  final String value;

  static _TransferFieldDraft defaultField() {
    return const _TransferFieldDraft(
      type: 'numero_cuenta',
      label: 'Numero de cuenta',
      value: '',
    );
  }

  static String labelForType(String type) {
    return switch (type) {
      'numero_cuenta' => 'Numero de cuenta',
      'id' => 'ID',
      'correo' => 'Correo',
      'nota' => 'Nota',
      _ => 'Campo de texto',
    };
  }

  _TransferFieldDraft copyWith({String? type, String? label, String? value}) {
    return _TransferFieldDraft(
      type: type ?? this.type,
      label: label ?? this.label,
      value: value ?? this.value,
    );
  }

  Map<String, dynamic> toMap() {
    return {'type': type, 'label': label, 'value': value};
  }

  factory _TransferFieldDraft.fromMap(Map<String, dynamic> map) {
    final parsedType = map['type']?.toString() ?? 'texto';
    final normalizedType = typeOptions.contains(parsedType)
        ? parsedType
        : 'texto';
    return _TransferFieldDraft(
      type: normalizedType,
      label: map['label']?.toString().trim().isNotEmpty == true
          ? map['label']!.toString()
          : labelForType(normalizedType),
      value: map['value']?.toString() ?? '',
    );
  }
}

class _PickedBusinessLocation {
  const _PickedBusinessLocation({
    required this.latitude,
    required this.longitude,
    required this.address,
  });

  final double latitude;
  final double longitude;
  final String address;
}

class _PlaceSearchSuggestion {
  const _PlaceSearchSuggestion({
    required this.placeId,
    required this.description,
  });

  final String placeId;
  final String description;
}

class _ParsedPhoneNumber {
  const _ParsedPhoneNumber({
    required this.countryIso,
    required this.nationalNumber,
  });

  final String countryIso;
  final String nationalNumber;
}

class _LayoutOption {
  const _LayoutOption({
    required this.id,
    required this.name,
    required this.icon,
  });

  final String id;
  final String name;
  final IconData icon;
}

class _PaletteOption {
  const _PaletteOption({
    required this.id,
    required this.name,
    required this.primary,
    required this.accent,
    required this.surface,
    required this.text,
  });

  final String id;
  final String name;
  final Color primary;
  final Color accent;
  final Color surface;
  final Color text;
}

class _LogoPaletteAnalysis {
  const _LogoPaletteAnalysis({
    required this.palette,
    required this.colors,
    this.suggestedHeadingFont,
  });

  final _PaletteOption palette;
  final List<Color> colors;
  final String? suggestedHeadingFont;
}
