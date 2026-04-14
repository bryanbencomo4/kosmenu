import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flex_color_picker/flex_color_picker.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image/image.dart' as img;
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
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
const Color _rescuePaletteSurface = Color(0xFF000000);
const Color _rescuePalettePrimary = Color(0xFFE63946);
const Color _rescuePaletteAccent = Color(0xFFC12834);
const Color _rescuePaletteText = Color(0xFFFFFFFF);

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
  static const String _exchangeModeAuto = 'auto';
  static const String _exchangeModeManual = 'manual';
  static const String _exchangeSourceBcv = 'bcv';
  static const String _exchangeSourceP2pBinance = 'p2p_binance';
  static const String _exchangeSourceGoogle = 'google';
  static const double _p2pBuyerMarkupRate = 0.0140;
  static const Map<String, double> _defaultGoogleAnchorRates = <String, double>{
    'USD/COP': 4000,
    'USD/EUR': 0.92,
    'VES/USD': 0.0021,
  };
  static const String _paletteAiPrompt =
      'Analiza exclusivamente el logo y propon una paleta fiel a sus tonos dominantes. '
      'Evita reinterpretaciones fuertes y conserva los colores reales de la marca.';

  static const List<String> _sectors = <String>[
    'Abastos y minimarket',
    'Abogado',
    'Academia de idiomas',
    'Agencia de marketing',
    'Agencia de viajes',
    'Agricola',
    'Arquitectura',
    'Arte y diseno',
    'Asesoria contable',
    'Autolavado',
    'Automotriz',
    'Bar',
    'Barberia',
    'Belleza',
    'Bienes raices',
    'Boutique',
    'Cafe',
    'Carniceria',
    'Centro educativo',
    'Cerrajeria',
    'Clinica',
    'Cocteleria',
    'Comida rapida',
    'Consultoria',
    'Construccion',
    'Cuidado personal',
    'Delivery y logistica',
    'Deportes',
    'Discoteca',
    'Diseno grafico',
    'E-commerce',
    'Electricidad',
    'Eventos',
    'Farmacia',
    'Ferreteria',
    'Finanzas',
    'Floristeria',
    'Fotografia',
    'Gimnasio',
    'Heladeria',
    'Hospedaje',
    'Imprenta',
    'Informatica y tecnologia',
    'Joyeria',
    'Laboratorio',
    'Lavanderia',
    'Licoreria',
    'Libreria',
    'Mecanica',
    'Medicina',
    'Moda',
    'Muebles y decoracion',
    'Panaderia',
    'Papeleria',
    'Peluqueria',
    'Pizzeria',
    'Pollera',
    'Reparaciones',
    'Reposteria',
    'Restaurante',
    'Salud',
    'Servicios legales',
    'Spa',
    'Supermercado',
    'Taller de motos',
    'Tienda de mascotas',
    'Tienda de ropa',
    'Veterinaria',
    'Videojuegos',
    'Otros',
  ];

  static const List<String> _currencies = <String>['USD', 'VES', 'COP', 'EUR'];

  static const List<String> _paymentMethods = <String>[
    'Efectivo',
    'Transferencia',
  ];
  static const int _maxTransferAccountsPerCurrency = 5;
  static const int _maxTransferFieldsPerAccount = 8;
  static const int _maxCashTextLength = 280;
  static const String _defaultCashNote =
      'Por favor, usa billetes en buen estado.';
  static const int _maxTransferAccountNameLength = 60;
  static const int _maxTransferFieldLabelLength = 40;
  static const int _maxTransferFieldValueLength = 140;
  static const List<String> _commonEmailDomains = <String>[
    '@gmail.com',
    '@outlook.com',
    '@hotmail.com',
    '@yahoo.com',
    '@icloud.com',
    '@proton.me',
  ];

  final List<_LayoutOption> _layouts = const <_LayoutOption>[
    _LayoutOption(
      id: 'cards',
      name: 'Tarjetas',
      icon: Icons.view_agenda_rounded,
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
  final TextEditingController _locationNoteController = TextEditingController();
  final BrandingAiService _brandingAiService = const BrandingAiService();

  _SetupStep _step = _SetupStep.identity;
  String _selectedCategory = 'Restaurante';
  final Set<String> _selectedCurrencies = <String>{'USD'};
  String _activeCheckoutCurrency = 'USD';
  String _primaryCheckoutCurrency = '';
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
  String _exchangeRateMode = _exchangeModeAuto;
  String _exchangeRateSource = _exchangeSourceBcv;
  final Map<String, String> _exchangeRateModeByCurrency = <String, String>{};
  final Map<String, String> _exchangeRateSourceByCurrency = <String, String>{};
  final Map<String, double> _marketRates = <String, double>{
    _exchangeSourceBcv: 477.1488,
    _exchangeSourceP2pBinance: 630.6,
  };
  final Map<String, double> _googleAnchorRates = Map<String, double>.from(
    _defaultGoogleAnchorRates,
  );
  DateTime? _latestMarketRatesUpdatedAt;
  bool _latestGoogleIsFallback = false;
  final Map<String, DateTime?> _providerLastCheckedAt = <String, DateTime?>{};
  final Map<String, bool> _providerIsFallback = <String, bool>{};
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
  RealtimeChannel? _marketRatesChannel;
  RealtimeChannel? _providerStatusChannel;

  bool _saving = false;
  bool _loadingExisting = true;
  bool _checkingSlug = false;
  bool _isSlugAvailable = false;
  String? _slugAvailabilityMessage;
  bool _slugManuallyEdited = false;
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
      _fontSuggestionsByCategory[_fontSuggestionGroupForSector(
        _selectedCategory,
      )] ??
      _fontSuggestionsByCategory['Otro']!;

  bool get _showBackControls => widget.businessConfigOnly || _isEditing;

  bool get _showStepBackButton => _currentStepFlowIndex > 0;

  List<String> get _sortedSectors {
    final values = <String>{..._sectors}.toList()
      ..sort((a, b) => a.compareTo(b));
    if (!values.contains('Otros')) {
      values.add('Otros');
    }
    return values;
  }

  @override
  void initState() {
    super.initState();
    _exchangeRateController.addListener(_forceExchangeRateCursorAtEnd);
    _ensureCurrencyConfig('USD');
    _loadActiveCurrencyIntoController();
    _subscribeToMarketRatesRealtime();
    _subscribeToProviderStatusRealtime();
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
    if (_marketRatesChannel != null) {
      unawaited(Supabase.instance.client.removeChannel(_marketRatesChannel!));
      _marketRatesChannel = null;
    }
    if (_providerStatusChannel != null) {
      unawaited(Supabase.instance.client.removeChannel(_providerStatusChannel!));
      _providerStatusChannel = null;
    }
    unawaited(_saveDraft());
    _exchangeRateController.removeListener(_forceExchangeRateCursorAtEnd);
    _nameController.dispose();
    _slugController.dispose();
    _exchangeRateController.dispose();
    _whatsappController.dispose();
    _addressController.dispose();
    _locationNoteController.dispose();
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
            'id, slug, nombre, logo_url, whatsapp, en_linea, categoria, moneda, tasa_cambio_pesos, exchange_rate_mode, exchange_rate_source, exchange_rate_value, last_rate_update',
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
      if (_step.index >= _SetupStep.checkout.index) {
        unawaited(_loadMarketRates(applyToCurrentAutoRate: true));
      }
      unawaited(_loadProviderStatuses());
    }
  }

  void _forceExchangeRateCursorAtEnd() {
    final textLength = _exchangeRateController.text.length;
    final selection = _exchangeRateController.selection;
    if (selection.baseOffset == textLength &&
        selection.extentOffset == textLength) {
      return;
    }

    _exchangeRateController.value = _exchangeRateController.value.copyWith(
      selection: TextSelection.collapsed(offset: textLength),
      composing: TextRange.empty,
    );
  }

  void _subscribeToMarketRatesRealtime() {
    final client = Supabase.instance.client;
    if (_marketRatesChannel != null) {
      unawaited(client.removeChannel(_marketRatesChannel!));
      _marketRatesChannel = null;
    }

    final channel = client
        .channel('public:global_market_rates:business_setup')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'global_market_rates',
          callback: (_) {
            unawaited(_loadMarketRates(applyToCurrentAutoRate: true));
          },
        )
        .subscribe();

    _marketRatesChannel = channel;
  }

  void _subscribeToProviderStatusRealtime() {
    final client = Supabase.instance.client;
    if (_providerStatusChannel != null) {
      unawaited(client.removeChannel(_providerStatusChannel!));
      _providerStatusChannel = null;
    }

    final channel = client
        .channel('public:market_rate_provider_status:business_setup')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'market_rate_provider_status',
          callback: (_) {
            unawaited(_loadProviderStatuses());
          },
        )
        .subscribe();

    _providerStatusChannel = channel;
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
    _slugManuallyEdited = _slugController.text.trim().isNotEmpty;

    final category = (raw?['categoria']?.toString().trim() ?? '');
    if (_sectors.contains(category)) {
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
    final seedAddress = (raw?['direccion']?.toString() ?? '').trim();
    _addressController.text = _extractAddressLine(seedAddress);
    _locationNoteController.text = _extractAddressNote(seedAddress);
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
      _primaryCheckoutCurrency = currency;
      _ensureCurrencyConfig(currency);
    }

    final rate = _parseExchangeRate(raw?['tasa_cambio_pesos']);
    final dynamicRate = _parseExchangeRate(raw?['exchange_rate_value']);
    final effectiveRate = dynamicRate > 0 ? dynamicRate : rate;
    if (effectiveRate > 0) {
      _exchangeRateByCurrency[_activeCheckoutCurrency] = _formatExchangeRate(
        effectiveRate,
      );
      _loadActiveCurrencyIntoController();
      _lastSuggestedRateCurrency = _activeCheckoutCurrency;
    }

    final mode =
        (raw?['exchange_rate_mode']?.toString().trim().toLowerCase() ?? '');
    if (mode == _exchangeModeAuto || mode == _exchangeModeManual) {
      _exchangeRateMode = mode;
      _exchangeRateModeByCurrency[_activeCheckoutCurrency] = mode;
    }
    final source =
        (raw?['exchange_rate_source']?.toString().trim().toLowerCase() ?? '');
    if (source == _exchangeSourceBcv ||
        source == _exchangeSourceP2pBinance ||
        source == _exchangeSourceGoogle) {
      _exchangeRateSource = source;
      _exchangeRateSourceByCurrency[_activeCheckoutCurrency] = source;
    }

    if (dynamicRate > 0) {
      _marketRates[_exchangeRateSource] = dynamicRate;
    }
  }

  String get _currentCurrency {
    if (_selectedCurrencies.contains(_activeCheckoutCurrency)) {
      return _activeCheckoutCurrency;
    }
    return _selectedCurrencies.isNotEmpty ? _selectedCurrencies.first : 'USD';
  }

  String get _baseCurrency {
    if (_selectedCurrencies.contains(_primaryCheckoutCurrency)) {
      return _primaryCheckoutCurrency;
    }
    return _selectedCurrencies.isNotEmpty ? _selectedCurrencies.first : 'USD';
  }

  bool get _hasPrimaryCurrencySelected {
    return _currencies.contains(_primaryCheckoutCurrency);
  }

  bool _requiresExchangeRateForCurrency(String currency) {
    return currency != _baseCurrency;
  }

  bool _isTrackedVesPair({
    required String baseCurrency,
    required String quoteCurrency,
  }) {
    final direct =
        quoteCurrency == 'VES' &&
        (baseCurrency == 'USD' || baseCurrency == 'EUR');
    final reverse =
        baseCurrency == 'VES' &&
        (quoteCurrency == 'USD' || quoteCurrency == 'EUR');
    return direct || reverse;
  }

  bool _canUseBcvSourceForPair({
    required String quoteCurrency,
    String? baseCurrency,
  }) {
    final base = baseCurrency ?? _baseCurrency;
    return _isTrackedVesPair(baseCurrency: base, quoteCurrency: quoteCurrency);
  }

  bool _canUseP2pSourceForPair({
    required String quoteCurrency,
    String? baseCurrency,
  }) {
    final base = baseCurrency ?? _baseCurrency;
    return _isTrackedVesPair(baseCurrency: base, quoteCurrency: quoteCurrency);
  }

  bool _isBcvPairAvailable(String quoteCurrency) {
    return _canUseBcvSourceForPair(quoteCurrency: quoteCurrency) &&
        _canDeriveExchangeRateFromSource(
          _exchangeSourceBcv,
          quoteCurrency: quoteCurrency,
        );
  }

  bool _isP2pPairAvailable(String quoteCurrency) {
    return _canUseP2pSourceForPair(quoteCurrency: quoteCurrency) &&
        _canDeriveExchangeRateFromSource(
          _exchangeSourceP2pBinance,
          quoteCurrency: quoteCurrency,
        );
  }

  bool _isGooglePairAvailable(String quoteCurrency) {
    final base = _baseCurrency;
    if (quoteCurrency == base || _isBcvPairAvailable(quoteCurrency)) {
      return false;
    }
    return _googleRateForPair(base, quoteCurrency) > 0;
  }

  List<String> _availableAutoSourcesForCurrency(String quoteCurrency) {
    final sources = <String>[];
    if (_isBcvPairAvailable(quoteCurrency)) {
      sources.add(_exchangeSourceBcv);
    }
    if (_isP2pPairAvailable(quoteCurrency)) {
      sources.add(_exchangeSourceP2pBinance);
    }
    if (_isGooglePairAvailable(quoteCurrency)) {
      sources.add(_exchangeSourceGoogle);
    }
    return sources;
  }

  bool _hasAutoSourcesForCurrency(String quoteCurrency) {
    return _availableAutoSourcesForCurrency(quoteCurrency).isNotEmpty;
  }

  void _syncExchangeConfigForCurrency(String currency) {
    _exchangeRateModeByCurrency[currency] = _exchangeRateMode;
    _exchangeRateSourceByCurrency[currency] = _exchangeRateSource;
  }

  void _loadExchangeConfigForCurrency(String currency) {
    final available = _availableAutoSourcesForCurrency(currency);
    final savedMode = _exchangeRateModeByCurrency[currency];
    final savedSource = _exchangeRateSourceByCurrency[currency];

    _exchangeRateMode =
        (savedMode == _exchangeModeAuto || savedMode == _exchangeModeManual)
        ? savedMode!
        : (_requiresExchangeRateForCurrency(currency) && available.isNotEmpty
              ? _exchangeModeAuto
              : _exchangeModeManual);

    if (savedSource != null && available.contains(savedSource)) {
      _exchangeRateSource = savedSource;
      return;
    }

    if (available.isNotEmpty) {
      _exchangeRateSource = available.first;
      return;
    }

    _exchangeRateSource = _exchangeSourceBcv;
  }

  void _enforceExchangeRulesForCurrency(String currency) {
    if (!_requiresExchangeRateForCurrency(currency)) {
      _exchangeRateMode = _exchangeModeManual;
      _exchangeRateByCurrency[currency] = '1';
      return;
    }

    final available = _availableAutoSourcesForCurrency(currency);
    if (available.isEmpty && _exchangeRateMode == _exchangeModeAuto) {
      _exchangeRateMode = _exchangeModeManual;
    }
    if (available.isNotEmpty && !available.contains(_exchangeRateSource)) {
      _exchangeRateSource = available.first;
    }
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
      drafts.putIfAbsent(
        method,
        () => method == 'Efectivo'
            ? const _PaymentMethodDraft(
                method: 'Efectivo',
                extraDetails: _defaultCashNote,
              )
            : _PaymentMethodDraft(method: method),
      );
    }

    if (!_requiresExchangeRateForCurrency(currency) &&
        (_exchangeRateByCurrency[currency]?.trim().isEmpty ?? true)) {
      _exchangeRateByCurrency[currency] = '1';
    }

    if (_requiresExchangeRateForCurrency(currency)) {
      final availableSources = _availableAutoSourcesForCurrency(currency);
      final savedMode = _exchangeRateModeByCurrency[currency];
      if (savedMode != _exchangeModeAuto && savedMode != _exchangeModeManual) {
        _exchangeRateModeByCurrency[currency] = availableSources.isNotEmpty
            ? _exchangeModeAuto
            : _exchangeModeManual;
      }

      final savedSource = _exchangeRateSourceByCurrency[currency];
      if (availableSources.isNotEmpty &&
          (savedSource == null || !availableSources.contains(savedSource))) {
        _exchangeRateSourceByCurrency[currency] = availableSources.first;
      }
    }
  }

  void _ensurePaymentDraftsForSelection(String currency) {
    _ensureCurrencyConfig(currency);
    final selected = _selectedPaymentsByCurrency[currency] ?? <String>{};
    final drafts =
        _paymentMethodDraftsByCurrency[currency] ??
        <String, _PaymentMethodDraft>{};
    for (final method in selected) {
      drafts.putIfAbsent(
        method,
        () => method == 'Efectivo'
            ? const _PaymentMethodDraft(
                method: 'Efectivo',
                extraDetails: _defaultCashNote,
              )
            : _PaymentMethodDraft(method: method),
      );
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
    _exchangeRateByCurrency[currency] =
        _requiresExchangeRateForCurrency(currency) ? text : '1';
    _syncExchangeConfigForCurrency(currency);
  }

  void _loadActiveCurrencyIntoController() {
    final currency = _currentCurrency;
    _loadExchangeConfigForCurrency(currency);
    _enforceExchangeRulesForCurrency(currency);
    _syncExchangeConfigForCurrency(currency);
    _ensureCurrencyConfig(currency);
    final value = _requiresExchangeRateForCurrency(currency)
        ? (_exchangeRateByCurrency[currency] ?? '')
        : '1';
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
      _primaryCheckoutCurrency = _activeCheckoutCurrency;

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
      _slugManuallyEdited =
          map['slugManuallyEdited'] as bool? ??
          _slugController.text.trim().isNotEmpty;

      final category = (map['category'] as String? ?? '').trim();
      if (_sectors.contains(category)) {
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
      final primaryCurrency = (map['primaryCurrency'] as String? ?? '')
          .trim()
          .toUpperCase();
      _activeCheckoutCurrency = _selectedCurrencies.contains(activeCurrency)
          ? activeCurrency
          : _selectedCurrencies.first;
      _primaryCheckoutCurrency = _selectedCurrencies.contains(primaryCurrency)
          ? primaryCurrency
          : _activeCheckoutCurrency;

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

      final draftMode = (map['exchangeRateMode'] as String? ?? '')
          .trim()
          .toLowerCase();
      if (draftMode == _exchangeModeAuto || draftMode == _exchangeModeManual) {
        _exchangeRateMode = draftMode;
      }
      final draftSource = (map['exchangeRateSource'] as String? ?? '')
          .trim()
          .toLowerCase();
      if (draftSource == _exchangeSourceBcv ||
          draftSource == _exchangeSourceP2pBinance ||
          draftSource == _exchangeSourceGoogle) {
        _exchangeRateSource = draftSource;
      }

      _exchangeRateModeByCurrency.clear();
      final exchangeModes = _toStringDynamicMap(map['exchangeRateModes']);
      if (exchangeModes.isNotEmpty) {
        for (final entry in exchangeModes.entries) {
          final currencyCode = entry.key.trim().toUpperCase();
          final mode = (entry.value?.toString() ?? '').trim().toLowerCase();
          if (!_currencies.contains(currencyCode)) {
            continue;
          }
          if (mode != _exchangeModeAuto && mode != _exchangeModeManual) {
            continue;
          }
          _exchangeRateModeByCurrency[currencyCode] = mode;
        }
      } else {
        _exchangeRateModeByCurrency[_activeCheckoutCurrency] =
            _exchangeRateMode;
      }

      _exchangeRateSourceByCurrency.clear();
      final exchangeSources = _toStringDynamicMap(map['exchangeRateSources']);
      if (exchangeSources.isNotEmpty) {
        for (final entry in exchangeSources.entries) {
          final currencyCode = entry.key.trim().toUpperCase();
          final source = (entry.value?.toString() ?? '').trim().toLowerCase();
          if (!_currencies.contains(currencyCode)) {
            continue;
          }
          if (source != _exchangeSourceBcv &&
              source != _exchangeSourceP2pBinance &&
              source != _exchangeSourceGoogle) {
            continue;
          }
          _exchangeRateSourceByCurrency[currencyCode] = source;
        }
      } else {
        _exchangeRateSourceByCurrency[_activeCheckoutCurrency] =
            _exchangeRateSource;
      }

      final draftBcv = _parseExchangeRate(map['marketRateBcv']);
      if (draftBcv > 0) {
        _marketRates[_exchangeSourceBcv] = draftBcv;
      }
      final draftP2p = _parseExchangeRate(map['marketRateP2p']);
      if (draftP2p > 0) {
        _marketRates[_exchangeSourceP2pBinance] = draftP2p;
      }
      final draftGoogleUsdCop = _parseExchangeRate(
        map['marketRateGoogleUsdCop'],
      );
      if (draftGoogleUsdCop > 0) {
        _googleAnchorRates['USD/COP'] = draftGoogleUsdCop;
      }
      final draftGoogleUsdEur = _parseExchangeRate(
        map['marketRateGoogleUsdEur'],
      );
      if (draftGoogleUsdEur > 0) {
        _googleAnchorRates['USD/EUR'] = draftGoogleUsdEur;
      }
      final draftGoogleVesUsd = _parseExchangeRate(
        map['marketRateGoogleVesUsd'],
      );
      if (draftGoogleVesUsd > 0) {
        _googleAnchorRates['VES/USD'] = draftGoogleVesUsd;
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
      _locationNoteController.text = (map['locationNote'] as String? ?? '')
          .trim();
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
      'slugManuallyEdited': _slugManuallyEdited,
      'category': _selectedCategory,
      'currency': _currentCurrency,
      'currencies': _selectedCurrencies.toList(),
      'activeCurrency': _currentCurrency,
      'primaryCurrency': _baseCurrency,
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
      'exchangeRateMode': _exchangeRateMode,
      'exchangeRateSource': _exchangeRateSource,
      'exchangeRateModes': _exchangeRateModeByCurrency,
      'exchangeRateSources': _exchangeRateSourceByCurrency,
      'marketRateBcv': _marketRates[_exchangeSourceBcv],
      'marketRateP2p': _marketRates[_exchangeSourceP2pBinance],
      'marketRateGoogleUsdCop': _googleAnchorRates['USD/COP'],
      'marketRateGoogleUsdEur': _googleAnchorRates['USD/EUR'],
      'marketRateGoogleVesUsd': _googleAnchorRates['VES/USD'],
      'lastSuggestedRateCurrency': _lastSuggestedRateCurrency,
      'exchangeRateManuallyEdited': _exchangeRateManuallyEdited,
      'editingComercioId': _editingComercioId ?? '',
      'whatsapp': _whatsappE164,
      'whatsappCountryIso': _selectedPhoneCountryIso,
      'address': _addressController.text.trim(),
      'locationNote': _locationNoteController.text.trim(),
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
    var normalized = value
        .trim()
        .toLowerCase()
        .replaceAll('á', 'a')
        .replaceAll('à', 'a')
        .replaceAll('ä', 'a')
        .replaceAll('â', 'a')
        .replaceAll('ã', 'a')
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
        .replaceAll('õ', 'o')
        .replaceAll('ú', 'u')
        .replaceAll('ù', 'u')
        .replaceAll('ü', 'u')
        .replaceAll('û', 'u')
        .replaceAll('ñ', 'n')
        .replaceAll(RegExp(r'\s+'), '-')
        .replaceAll(RegExp(r'[^a-z0-9-]'), '')
        .replaceAll(RegExp(r'-+'), '-')
        .replaceAll(RegExp(r'^-|-$'), '');
    return normalized;
  }

  void _onNameChanged(String value) {
    if (!_slugManuallyEdited) {
      final generated = _normalizeSlug(value);
      if (_slugController.text != generated) {
        _onSlugChanged(generated, markManualEdit: false);
      }
    }
    unawaited(_saveDraft());
  }

  String _fontSuggestionGroupForSector(String sector) {
    final normalized = sector.toLowerCase();
    if (normalized.contains('cafe')) return 'Cafe';
    if (normalized.contains('bar')) return 'Bar';
    if (normalized.contains('pizzer')) return 'Pizzeria';
    if (normalized.contains('panader')) return 'Panaderia';
    if (normalized.contains('rapida')) return 'Comida Rapida';
    if (normalized.contains('helader')) return 'Heladeria';
    if (normalized.contains('restaurant')) return 'Restaurante';
    return 'Otro';
  }

  String _extractAddressLine(String rawAddress) {
    final markerIndex = rawAddress.indexOf('\nReferencia:');
    if (markerIndex <= 0) {
      return rawAddress;
    }
    return rawAddress.substring(0, markerIndex).trim();
  }

  String _extractAddressNote(String rawAddress) {
    final markerIndex = rawAddress.indexOf('\nReferencia:');
    if (markerIndex < 0) {
      return '';
    }
    return rawAddress.substring(markerIndex + '\nReferencia:'.length).trim();
  }

  String _composeAddressWithNote() {
    final address = _addressController.text.trim();
    final note = _locationNoteController.text.trim();
    if (address.isEmpty) {
      return '';
    }
    if (note.isEmpty) {
      return address;
    }
    return '$address\nReferencia: $note';
  }

  bool _isSlugFormatValid(String value) {
    return RegExp(r'^[a-z0-9]+(?:-[a-z0-9]+)*$').hasMatch(value);
  }

  void _onSlugChanged(String value, {bool markManualEdit = true}) {
    final normalized = _normalizeSlug(value);
    if (markManualEdit) {
      _slugManuallyEdited = normalized.isNotEmpty;
    }
    if (_slugController.text != normalized) {
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
          useSafeArea: true,
          backgroundColor: const Color(0xFF17122E),
          showDragHandle: true,
          builder: (context) {
            return SafeArea(
              top: false,
              child: Theme(
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

  Future<void> _openSectorPicker() async {
    final sectors = _sortedSectors;
    var query = '';
    const pageSize = 20;
    var limit = pageSize;

    final selected = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: const Color(0xFF17122E),
      showDragHandle: true,
      builder: (sheetContext) {
        final controller = TextEditingController();
        return SafeArea(
          top: false,
          child: StatefulBuilder(
            builder: (context, setSheetState) {
              final filtered = sectors
                  .where(
                    (item) =>
                        item.toLowerCase().contains(query.toLowerCase().trim()),
                  )
                  .toList();
              final visibleCount = filtered.length < limit
                  ? filtered.length
                  : limit;

              return SizedBox(
                height: MediaQuery.of(context).size.height * 0.78,
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 2, 16, 10),
                      child: TextField(
                        controller: controller,
                        style: const TextStyle(color: _setupTextHigh),
                        decoration: InputDecoration(
                          hintText: 'Buscar sector',
                          hintStyle: const TextStyle(color: _setupTextLow),
                          prefixIcon: const Icon(Icons.search_rounded),
                          filled: true,
                          fillColor: const Color(0xFF120E25),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(
                              color: Color(0xFF3B2F63),
                            ),
                          ),
                        ),
                        onChanged: (value) {
                          setSheetState(() {
                            query = value;
                            limit = pageSize;
                          });
                        },
                      ),
                    ),
                    Expanded(
                      child: NotificationListener<ScrollNotification>(
                        onNotification: (notification) {
                          if (notification.metrics.pixels >=
                                  notification.metrics.maxScrollExtent - 80 &&
                              limit < filtered.length) {
                            setSheetState(() {
                              limit = (limit + pageSize).clamp(
                                0,
                                filtered.length,
                              );
                            });
                          }
                          return false;
                        },
                        child: ListView.builder(
                          itemCount: visibleCount,
                          itemBuilder: (context, index) {
                            final sector = filtered[index];
                            final active = sector == _selectedCategory;
                            return ListTile(
                              title: Text(
                                sector,
                                style: const TextStyle(color: _setupTextHigh),
                              ),
                              trailing: active
                                  ? const Icon(
                                      Icons.check_circle_rounded,
                                      color: Color(0xFFA78BFA),
                                    )
                                  : null,
                              onTap: () => Navigator.of(context).pop(sector),
                            );
                          },
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        );
      },
    );

    if (!mounted || selected == null || selected == _selectedCategory) {
      return;
    }

    setState(() {
      _selectedCategory = selected;
      _showAllFontSuggestions = false;
      if (!_fontSuggestions.contains(_selectedHeadingFont)) {
        _selectedHeadingFont = _fontSuggestions.first;
      }
    });
    await _saveDraft();
  }

  void _showComingSoonImport() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Importar archivo con IA (PDF, imagenes, CSV) estara disponible pronto.',
        ),
      ),
    );
  }

  void _showComingSoonPrompt() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Crear menu desde un prompt de texto estara disponible pronto.',
        ),
      ),
    );
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
      if (geminiAnalysis == null) {
        final canApplyRescuePalette =
            !_paletteManuallyEdited || _lastPaletteLogoPath != logoPath;
        if (canApplyRescuePalette) {
          _paletteSuggestion = const _PaletteOption(
            id: 'rescue-premium',
            name: 'Premium de respaldo',
            primary: _rescuePalettePrimary,
            accent: _rescuePaletteAccent,
            surface: _rescuePaletteSurface,
            text: _rescuePaletteText,
          );
          _selectedPaletteId = 'rescue-premium';
          _lastPaletteLogoPath = logoPath;
        }
        _logoDetectedColors = const <Color>[
          _rescuePalettePrimary,
          _rescuePaletteAccent,
          _rescuePaletteSurface,
          _rescuePaletteText,
        ];
      }

      _paletteStatusMessage = geminiAnalysis == null
          ? 'Hemos seleccionado una paleta Premium para ti. Puedes personalizarla ahora o mas tarde.'
          : null;
      _paletteStatusIsError = false;

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

      final response = await _brandingAiService
          .generateBranding(
            comercioId: comercioId,
            promptUsuario: _paletteAiPrompt,
            imageUrl: imageUrl,
          )
          .timeout(const Duration(seconds: 12));

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

    if (_receiveOrdersOnWhatsapp) {
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

    if (_step == _SetupStep.checkout && !_hasPrimaryCurrencySelected) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Selecciona la moneda principal.')),
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
      unawaited(_loadMarketRates(applyToCurrentAutoRate: true));
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

  DateTime? _parseUtcTimestampToLocal(dynamic value) {
    final raw = value?.toString().trim() ?? '';
    if (raw.isEmpty) {
      return null;
    }
    return DateTime.tryParse(raw)?.toLocal();
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

    final cleaned = raw.replaceAll(RegExp(r'[^0-9,.-]'), '');
    if (cleaned.isEmpty) {
      return 0;
    }

    final lastComma = cleaned.lastIndexOf(',');
    final lastDot = cleaned.lastIndexOf('.');
    final decimalIndex = lastComma > lastDot ? lastComma : lastDot;

    if (decimalIndex >= 0) {
      final integerPart = cleaned
          .substring(0, decimalIndex)
          .replaceAll(RegExp(r'[,.]'), '');
      final fractionalPart = cleaned
          .substring(decimalIndex + 1)
          .replaceAll(RegExp(r'[,.]'), '');
      final normalized =
          '${integerPart.isEmpty ? '0' : integerPart}.${fractionalPart.isEmpty ? '0' : fractionalPart}';
      return double.tryParse(normalized) ?? 0;
    }

    return double.tryParse(cleaned.replaceAll(RegExp(r'[,.]'), '')) ?? 0;
  }

  int _exchangeRateFractionDigits(double value) {
    if (value <= 0) {
      return 2;
    }
    if (value >= 1) {
      return value.truncateToDouble() == value ? 0 : 2;
    }
    if (value >= 0.01) {
      return 4;
    }
    return 6;
  }

  String _trimTrailingFractionZeros(String value) {
    if (!value.contains('.')) {
      return value;
    }
    return value
        .replaceFirst(RegExp(r'0+$'), '')
        .replaceFirst(RegExp(r'\.$'), '');
  }

  String _formatExchangeRate(double value) {
    if (value <= 0) {
      return '';
    }
    final digits = _exchangeRateFractionDigits(value);
    return _trimTrailingFractionZeros(value.toStringAsFixed(digits));
  }

  String _formatExchangeRateMasked(double value) {
    if (value <= 0) {
      return '';
    }
    final fixed = value.toStringAsFixed(_exchangeRateFractionDigits(value));
    final parts = fixed.split('.');
    final integerPart = parts[0].replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => ',',
    );
    if (parts.length == 1) {
      return integerPart;
    }
    final fractionPart = _trimTrailingFractionZeros(parts[1]);
    return fractionPart.isEmpty ? integerPart : '$integerPart.$fractionPart';
  }

  int _exchangeRateInputDecimalDigits(String quoteCurrency) {
    final configured = _parseExchangeRate(_exchangeRateByCurrency[quoteCurrency]);
    if (configured > 0) {
      return _exchangeRateFractionDigits(configured);
    }

    final auto = _rateForSource(_exchangeRateSource, quoteCurrency: quoteCurrency);
    if (auto > 0) {
      return _exchangeRateFractionDigits(auto);
    }

    final fallback = _defaultExchangeRateFor(quoteCurrency);
    return _exchangeRateFractionDigits(fallback);
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
      'Transferencia' => Icons.account_balance_wallet_rounded,
      _ => Icons.payments_outlined,
    };
  }

  String _paymentMethodLabel(String method) {
    return switch (method) {
      'Transferencia' => 'Pagos digitales',
      _ => method,
    };
  }

  double _usdToCurrencyRate(String currency) {
    return switch (currency) {
      'USD' => 1,
      'VES' => 477.1488,
      'COP' => 4000,
      'EUR' => 0.92,
      _ => 1,
    };
  }

  double _defaultExchangeRateForPair({
    required String baseCurrency,
    required String quoteCurrency,
  }) {
    if (baseCurrency == quoteCurrency) {
      return 1;
    }
    final usdToBase = _usdToCurrencyRate(baseCurrency);
    final usdToQuote = _usdToCurrencyRate(quoteCurrency);
    if (usdToBase <= 0 || usdToQuote <= 0) {
      return 1;
    }
    return usdToQuote / usdToBase;
  }

  double _defaultExchangeRateFor(String quoteCurrency, {String? baseCurrency}) {
    return _defaultExchangeRateForPair(
      baseCurrency: baseCurrency ?? _baseCurrency,
      quoteCurrency: quoteCurrency,
    );
  }

  double _adjustP2pRateForBuyer(double rate) {
    if (rate <= 0) {
      return 0;
    }
    return rate * (1 + _p2pBuyerMarkupRate);
  }

  double _usdToCurrencyRateForSource(String source, String currency) {
    return switch (currency) {
      'USD' => 1,
      'VES' => () {
        final liveRate = _marketRates[source] ?? 0;
        if (liveRate > 0) {
          return source == _exchangeSourceP2pBinance
              ? _adjustP2pRateForBuyer(liveRate)
              : liveRate;
        }
        return _usdToCurrencyRate('VES');
      }(),
      'COP' => _googleAnchorRates['USD/COP'] ?? _usdToCurrencyRate('COP'),
      'EUR' => _googleAnchorRates['USD/EUR'] ?? _usdToCurrencyRate('EUR'),
      _ => 0,
    };
  }

  String _pairKey(String baseCurrency, String quoteCurrency) {
    return '$baseCurrency/$quoteCurrency';
  }

  Map<String, double> _googleRatesFromPayload(dynamic payload) {
    final rates = <String, double>{};
    final rawMap = payload is Map ? payload['google_rates'] : null;
    if (rawMap is! Map) {
      return rates;
    }

    for (final entry in rawMap.entries) {
      final key = entry.key.toString().trim().toUpperCase();
      final value = _parseExchangeRate(entry.value);
      if (key.isNotEmpty && value > 0) {
        rates[key] = value;
      }
    }
    return rates;
  }

  double _googleRateForPairFromAnchors(
    String baseCurrency,
    String quoteCurrency,
    Map<String, double> anchors,
  ) {
    if (baseCurrency == quoteCurrency) {
      return 1;
    }

    final direct = anchors[_pairKey(baseCurrency, quoteCurrency)] ?? 0;
    if (direct > 0) {
      return direct;
    }

    final usdCop = anchors['USD/COP'] ?? 0;
    final usdEur = anchors['USD/EUR'] ?? 0;
    final vesUsd = anchors['VES/USD'] ?? 0;

    if (baseCurrency == 'COP' && quoteCurrency == 'USD' && usdCop > 0) {
      return 1 / usdCop;
    }
    if (baseCurrency == 'EUR' && quoteCurrency == 'USD' && usdEur > 0) {
      return 1 / usdEur;
    }
    if (baseCurrency == 'VES' &&
        quoteCurrency == 'COP' &&
        vesUsd > 0 &&
        usdCop > 0) {
      return vesUsd * usdCop;
    }
    if (baseCurrency == 'VES' &&
        quoteCurrency == 'EUR' &&
        vesUsd > 0 &&
        usdEur > 0) {
      return vesUsd * usdEur;
    }
    if (baseCurrency == 'COP' &&
        quoteCurrency == 'VES' &&
        vesUsd > 0 &&
        usdCop > 0) {
      final vesCop = vesUsd * usdCop;
      return vesCop > 0 ? 1 / vesCop : 0;
    }
    if (baseCurrency == 'EUR' &&
        quoteCurrency == 'VES' &&
        vesUsd > 0 &&
        usdEur > 0) {
      final vesEur = vesUsd * usdEur;
      return vesEur > 0 ? 1 / vesEur : 0;
    }
    if (baseCurrency == 'COP' &&
        quoteCurrency == 'EUR' &&
        usdCop > 0 &&
        usdEur > 0) {
      return usdEur / usdCop;
    }
    if (baseCurrency == 'EUR' &&
        quoteCurrency == 'COP' &&
        usdCop > 0 &&
        usdEur > 0) {
      return usdCop / usdEur;
    }

    return 0;
  }

  double _googleRateForPair(String baseCurrency, String quoteCurrency) {
    return _googleRateForPairFromAnchors(
      baseCurrency,
      quoteCurrency,
      _googleAnchorRates,
    );
  }

  double? _calculateHistoricalRateForRow(
    Map<String, dynamic> row, {
    required String baseCurrency,
    required String quoteCurrency,
    required String source,
  }) {
    if (baseCurrency == quoteCurrency) {
      return 1;
    }

    if (source == _exchangeSourceGoogle) {
      final googleRates = _googleRatesFromPayload(row['payload']);
      final derived = _googleRateForPairFromAnchors(
        baseCurrency,
        quoteCurrency,
        googleRates,
      );
      return derived > 0 ? derived : null;
    }

    if (source == _exchangeSourceBcv &&
        !_canUseBcvSourceForPair(
          quoteCurrency: quoteCurrency,
          baseCurrency: baseCurrency,
        )) {
      return null;
    }
    if (source == _exchangeSourceP2pBinance &&
        !_canUseP2pSourceForPair(
          quoteCurrency: quoteCurrency,
          baseCurrency: baseCurrency,
        )) {
      return null;
    }

    final liveRate = switch (source) {
      _exchangeSourceBcv => _parseExchangeRate(row['bcv_rate']),
      _exchangeSourceP2pBinance => _adjustP2pRateForBuyer(
        _parseExchangeRate(row['p2p_binance_rate']),
      ),
      _ => 0,
    };
    if (liveRate <= 0) {
      return null;
    }

    double usdToCurrency(String currency) {
      final usdCop = (_googleAnchorRates['USD/COP'] ?? _usdToCurrencyRate('COP'))
          .toDouble();
      final usdEur = (_googleAnchorRates['USD/EUR'] ?? _usdToCurrencyRate('EUR'))
          .toDouble();
      return switch (currency) {
        'USD' => 1.0,
        'VES' => liveRate.toDouble(),
        'COP' => usdCop,
        'EUR' => usdEur,
        _ => 0.0,
      };
    }

    final usdToBase = usdToCurrency(baseCurrency);
    final usdToQuote = usdToCurrency(quoteCurrency);
    if (usdToBase <= 0 || usdToQuote <= 0) {
      return null;
    }

    final derived = usdToQuote / usdToBase;
    return derived > 0 ? derived : null;
  }

  Future<List<Map<String, dynamic>>> _fetchRateHistoryRows() async {
    final response = await Supabase.instance.client
        .from('global_market_rates')
        .select('updated_at, bcv_rate, p2p_binance_rate, payload')
        .order('updated_at', ascending: false)
        .limit(20);

    return response
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList();
  }

  String _googleReferencePairCode(String baseCurrency, String quoteCurrency) {
    final pair = _pairKey(baseCurrency, quoteCurrency);
    return switch (pair) {
      'USD/COP' || 'COP/USD' => 'USD-COP',
      'USD/EUR' || 'EUR/USD' => 'USD-EUR',
      'VES/USD' || 'USD/VES' => 'VES-USD',
      'VES/COP' || 'COP/VES' => 'USD-COP',
      'VES/EUR' || 'EUR/VES' => 'USD-EUR',
      'COP/EUR' || 'EUR/COP' => 'USD-COP',
      _ => '${baseCurrency.toUpperCase()}-${quoteCurrency.toUpperCase()}',
    };
  }

  bool _isGoogleFallbackPayload(dynamic payload) {
    final map = _toStringDynamicMap(payload);
    if (map['is_fallback'] == true) {
      return true;
    }
    final googleProvider = _toStringDynamicMap(map['google_provider']);
    return googleProvider['is_fallback'] == true;
  }

  Future<void> _loadProviderStatuses() async {
    try {
      final response = await Supabase.instance.client
          .from('market_rate_provider_status')
          .select('provider, last_check_at, payload');
      if (!mounted) {
        return;
      }

      final lastCheckedAtByProvider = <String, DateTime?>{};
      final isFallbackByProvider = <String, bool>{};
      for (final row in response.whereType<Map>()) {
        final provider = row['provider']?.toString().trim().toLowerCase() ?? '';
        if (provider.isEmpty) {
          continue;
        }
        final payload = _toStringDynamicMap(row['payload']);
        lastCheckedAtByProvider[provider] =
            _parseUtcTimestampToLocal(row['last_check_at']) ??
            _parseUtcTimestampToLocal(payload['checked_at']);
        isFallbackByProvider[provider] = payload['is_fallback'] == true;
      }

      setState(() {
        _providerLastCheckedAt
          ..clear()
          ..addAll(lastCheckedAtByProvider);
        _providerIsFallback
          ..clear()
          ..addAll(isFallbackByProvider);
      });
    } catch (_) {
      // Preserve the previous status when loading fails.
    }
  }

  DateTime? _providerLastChecked(String source) {
    return _providerLastCheckedAt[source] ?? _latestMarketRatesUpdatedAt;
  }

  bool _providerFallbackUsed(String source) {
    return _providerIsFallback[source] ??
        (source == _exchangeSourceGoogle && _latestGoogleIsFallback);
  }

  ({Color color, String message}) _getProviderHealth(
    DateTime? lastChecked,
    bool isFallback,
  ) {
    if (lastChecked == null) {
      return (color: const Color(0xFFEF4444), message: 'Fuente desincronizada');
    }

    final diff = DateTime.now().difference(lastChecked);
    if (diff.inMinutes >= 60) {
      return (color: const Color(0xFFEF4444), message: 'Fuente desincronizada');
    }
    if (diff.inMinutes >= 20) {
      return (color: const Color(0xFFFBBF24), message: 'Latencia detectada');
    }
    if (isFallback) {
      return (color: const Color(0xFFFBBF24), message: 'Usando respaldo');
    }
    return (color: const Color(0xFF22C55E), message: 'Conexion estable');
  }

  String? _providerFreshnessText(String source) {
    final updatedAt = _providerLastChecked(source);
    if (updatedAt == null) {
      return null;
    }

    final diff = DateTime.now().difference(updatedAt);
    if (diff.inSeconds < 60) {
      return 'Verificado hace unos segundos';
    }
    if (diff.inMinutes < 60) {
      return 'Verificado hace ${diff.inMinutes} min';
    }
    if (diff.inHours < 24) {
      return 'Verificado hace ${diff.inHours} h';
    }
    return 'Verificado hace ${diff.inDays} d';
  }

  Uri _exchangeSourceReferenceUri(
    String source, {
    String? baseCurrency,
    String? quoteCurrency,
  }) {
    final base = baseCurrency ?? _baseCurrency;
    final quote = quoteCurrency ?? _currentCurrency;
    return switch (source) {
      _exchangeSourceBcv => Uri.parse('https://www.bcv.org.ve/'),
      _exchangeSourceP2pBinance => Uri.parse(
        'https://p2p.binance.com/en/trade/buy/USDT?fiat=VES&payment=ALL',
      ),
      _exchangeSourceGoogle => Uri.parse(
        'https://www.google.com/finance/quote/${_googleReferencePairCode(base, quote)}',
      ),
      _ => Uri.parse('https://www.bcv.org.ve/'),
    };
  }

  String _exchangeSourceReferenceLabel(String source) {
    return switch (source) {
      _exchangeSourceBcv => 'BCV • sitio oficial',
      _exchangeSourceP2pBinance => 'Binance P2P • referencia web',
      _exchangeSourceGoogle => 'Google Finance • referencia web',
      _ => _exchangeSourceLabel(source),
    };
  }

  Future<void> _showRateHistorySheet() async {
    final baseCurrency = _baseCurrency;
    final quoteCurrency = _currentCurrency;
    final source = _exchangeRateSource;
    final pairLabel = '$baseCurrency/$quoteCurrency';
    final future = _fetchRateHistoryRows();
    final health = _getProviderHealth(
      _providerLastChecked(source),
      _providerFallbackUsed(source),
    );
    final freshnessText =
        _providerFreshnessText(source) ?? 'Verificacion no disponible';

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: const Color(0xFF17122E),
      showDragHandle: true,
      builder: (sheetContext) {
        return SafeArea(
          top: false,
          child: Padding(
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              top: 8,
              bottom: MediaQuery.of(sheetContext).viewPadding.bottom + 20,
            ),
            child: FutureBuilder<List<Map<String, dynamic>>>(
              future: future,
              builder: (context, snapshot) {
                final formatter = DateFormat('dd/MM HH:mm');

                return Column(
                  mainAxisSize: MainAxisSize.min,
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
                                'Historial de tasas',
                                style: GoogleFonts.poppins(
                                  color: Colors.white,
                                  fontSize: 20,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '$pairLabel • ${_exchangeSourceReferenceLabel(source)}',
                                style: const TextStyle(
                                  color: Colors.white54,
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          tooltip: 'Abrir referencia web',
                          onPressed: () async {
                            await launchUrl(
                              _exchangeSourceReferenceUri(
                                source,
                                baseCurrency: baseCurrency,
                                quoteCurrency: quoteCurrency,
                              ),
                              mode: LaunchMode.externalApplication,
                            );
                          },
                          icon: const Icon(
                            Icons.open_in_new_rounded,
                            color: Colors.white70,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFF120E25),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFF3B2F63)),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 10,
                            height: 10,
                            decoration: BoxDecoration(
                              color: health.color,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              '${health.message} • $freshnessText',
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 12,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    if (snapshot.connectionState == ConnectionState.waiting)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 24),
                        child: Center(
                          child: CircularProgressIndicator(),
                        ),
                      )
                    else if (snapshot.hasError)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 12),
                        child: Text(
                          'No se pudo cargar el historial de tasas.',
                          style: TextStyle(color: Colors.white70, fontSize: 13),
                        ),
                      )
                    else ...[
                      Builder(
                        builder: (_) {
                          bool sameRate(double left, double right) {
                            return (left - right).abs() < 0.000001;
                          }

                          final rows = snapshot.data ?? const <Map<String, dynamic>>[];
                          final derivedEntries = rows
                              .map((row) {
                                final rate = _calculateHistoricalRateForRow(
                                  row,
                                  baseCurrency: baseCurrency,
                                  quoteCurrency: quoteCurrency,
                                  source: source,
                                );
                                if (rate == null || rate <= 0) {
                                  return null;
                                }
                                final updatedAtRaw = row['updated_at']?.toString();
                                final updatedAt = updatedAtRaw == null
                                    ? null
                                    : DateTime.tryParse(updatedAtRaw)?.toLocal();
                                return (rate: rate, updatedAt: updatedAt);
                              })
                              .whereType<({double rate, DateTime? updatedAt})>()
                              .toList();

                          final items = <({
                            double rate,
                            DateTime? updatedAt,
                            IconData? trendIcon,
                            Color? trendColor,
                          })>[];

                          for (var index = 0; index < derivedEntries.length; index++) {
                            final current = derivedEntries[index];
                            final previousRaw = index > 0
                                ? derivedEntries[index - 1]
                                : null;
                            if (previousRaw != null &&
                                sameRate(current.rate, previousRaw.rate)) {
                              continue;
                            }

                            ({double rate, DateTime? updatedAt})? nextDistinct;
                            for (var nextIndex = index + 1;
                                nextIndex < derivedEntries.length;
                                nextIndex++) {
                              final candidate = derivedEntries[nextIndex];
                              if (!sameRate(candidate.rate, current.rate)) {
                                nextDistinct = candidate;
                                break;
                              }
                            }

                            IconData? trendIcon;
                            Color? trendColor;
                            if (nextDistinct != null) {
                              if (current.rate > nextDistinct.rate) {
                                trendIcon = Icons.trending_up_rounded;
                                trendColor = Colors.greenAccent.shade400;
                              } else if (current.rate < nextDistinct.rate) {
                                trendIcon = Icons.trending_down_rounded;
                                trendColor = const Color(0xFFFF6B6B);
                              } else {
                                trendIcon = Icons.remove_rounded;
                                trendColor = Colors.white38;
                              }
                            } else {
                              trendIcon = Icons.remove_rounded;
                              trendColor = Colors.white38;
                            }

                            items.add((
                              rate: current.rate,
                              updatedAt: current.updatedAt,
                              trendIcon: trendIcon,
                              trendColor: trendColor,
                            ));
                          }

                          if (items.isEmpty) {
                            return const Padding(
                              padding: EdgeInsets.symmetric(vertical: 12),
                              child: Text(
                                'No hay historial disponible para esta fuente y este par.',
                                style: TextStyle(
                                  color: Colors.white70,
                                  fontSize: 13,
                                ),
                              ),
                            );
                          }

                          return Flexible(
                            child: ListView.separated(
                              shrinkWrap: true,
                              itemCount: items.length,
                              separatorBuilder: (_, index) => const Divider(
                                color: Color(0xFF3B2F63),
                                height: 16,
                              ),
                              itemBuilder: (context, index) {
                                final item = items[index];
                                final timestamp = item.updatedAt == null
                                    ? 'Fecha no disponible'
                                    : formatter.format(item.updatedAt!);
                                return ListTile(
                                  contentPadding: EdgeInsets.zero,
                                  title: Text(
                                    timestamp,
                                    style: const TextStyle(
                                      color: Colors.white54,
                                      fontSize: 13,
                                    ),
                                  ),
                                  trailing: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        _formatExchangeRate(item.rate),
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 15,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      if (item.trendIcon != null) ...[
                                        const SizedBox(width: 8),
                                        Icon(
                                          item.trendIcon,
                                          size: 18,
                                          color: item.trendColor,
                                        ),
                                      ],
                                    ],
                                  ),
                                );
                              },
                            ),
                          );
                        },
                      ),
                    ],
                  ],
                );
              },
            ),
          ),
        );
      },
    );
  }

  bool _canDeriveExchangeRateFromSource(
    String source, {
    required String quoteCurrency,
    String? baseCurrency,
  }) {
    final base = baseCurrency ?? _baseCurrency;
    if (quoteCurrency == base) {
      return false;
    }

    final usdToBase = _usdToCurrencyRateForSource(source, base);
    final usdToQuote = _usdToCurrencyRateForSource(source, quoteCurrency);
    return usdToBase > 0 && usdToQuote > 0;
  }

  String _exchangeSourceLabel(String source) {
    return switch (source) {
      _exchangeSourceBcv => 'Tasa Oficial (BCV)',
      _exchangeSourceGoogle => 'Google',
      _exchangeSourceP2pBinance => 'Tasa Mercado (Paralelo/P2P)',
      _ => source.toUpperCase(),
    };
  }

  String _formatConversionRateText({
    required double rate,
    required String baseCurrency,
    required String quoteCurrency,
  }) {
    if (rate <= 0) {
      return '--';
    }
    return '${_formatExchangeRateMasked(rate)} $quoteCurrency por 1 $baseCurrency';
  }

  String _formatConversionEquivalenceText({
    required double rate,
    required String baseCurrency,
    required String quoteCurrency,
  }) {
    if (rate <= 0) {
      return '--';
    }

    final direct = _formatConversionRateText(
      rate: rate,
      baseCurrency: baseCurrency,
      quoteCurrency: quoteCurrency,
    );
    final inverse =
        '${_formatExchangeRateMasked(1 / rate)} $baseCurrency por 1 $quoteCurrency';
    return '$direct  |  $inverse';
  }

  double _rateForSource(String source, {String? quoteCurrency}) {
    final base = _baseCurrency;
    final currency = quoteCurrency ?? _currentCurrency;
    if (source == _exchangeSourceGoogle) {
      return _googleRateForPair(base, currency);
    }
    if (source == _exchangeSourceBcv &&
        !_canUseBcvSourceForPair(quoteCurrency: currency, baseCurrency: base)) {
      return 0;
    }
    if (source == _exchangeSourceP2pBinance &&
        !_canUseP2pSourceForPair(quoteCurrency: currency, baseCurrency: base)) {
      return 0;
    }
    if (!_canDeriveExchangeRateFromSource(
      source,
      quoteCurrency: currency,
      baseCurrency: base,
    )) {
      return 0;
    }

    final usdToBase = _usdToCurrencyRateForSource(source, base);
    final usdToQuote = _usdToCurrencyRateForSource(source, currency);
    if (usdToBase <= 0 || usdToQuote <= 0) {
      return 0;
    }

    final derived = usdToQuote / usdToBase;
    if (derived > 0) {
      return derived;
    }

    final fallback = _defaultExchangeRateFor(currency, baseCurrency: base);
    return fallback > 0 ? fallback : 0;
  }

  String _rateBadgeText(String source, {String? quoteCurrency}) {
    final currency = quoteCurrency ?? _currentCurrency;
    final rate = _rateForSource(source, quoteCurrency: currency);
    if (rate <= 0) {
      return '--';
    }
    return _formatConversionRateText(
      rate: rate,
      baseCurrency: _baseCurrency,
      quoteCurrency: currency,
    );
  }

  Future<void> _loadMarketRates({bool applyToCurrentAutoRate = false}) async {
    try {
      final row = await Supabase.instance.client
          .from('global_market_rates')
          .select('updated_at, bcv_rate, p2p_binance_rate, payload')
          .order('updated_at', ascending: false)
          .limit(1)
          .maybeSingle();
      if (row == null || !mounted) {
        return;
      }

      final bcvRate = _parseExchangeRate(row['bcv_rate']);
      final p2pRate = _parseExchangeRate(row['p2p_binance_rate']);
      final payload = row['payload'];
      final updatedAt = _parseUtcTimestampToLocal(row['updated_at']);
      setState(() {
        if (bcvRate > 0) {
          _marketRates[_exchangeSourceBcv] = bcvRate;
        }
        if (p2pRate > 0) {
          _marketRates[_exchangeSourceP2pBinance] = p2pRate;
        }
        final googleRatesMap = _googleRatesFromPayload(payload);
        for (final entry in googleRatesMap.entries) {
          if (entry.value > 0) {
            _googleAnchorRates[entry.key] = entry.value;
          }
        }
        _latestMarketRatesUpdatedAt = updatedAt;
        _latestGoogleIsFallback = _isGoogleFallbackPayload(payload);

        final shouldApplyAutoRate =
            applyToCurrentAutoRate &&
            _exchangeRateMode == _exchangeModeAuto &&
            _requiresExchangeRateForCurrency(_currentCurrency) &&
            _hasAutoSourcesForCurrency(_currentCurrency);
        if (shouldApplyAutoRate) {
          _enforceExchangeRulesForCurrency(_currentCurrency);
          final synced = _rateForSource(_exchangeRateSource);
          if (synced > 0) {
            final formatted = _formatExchangeRateMasked(synced);
            _exchangeRateByCurrency[_currentCurrency] = formatted;
            _exchangeRateController.text = formatted;
            _exchangeRateMessage = null;
            _exchangeRateIsError = false;
            _lastSuggestedRateCurrency = _currentCurrency;
          }
        }
      });

      if (applyToCurrentAutoRate) {
        await _saveDraft();
      }
    } catch (_) {
      // Ignore market rates fetch failures to keep setup usable.
    }
  }

  bool _isValidEmail(String value) {
    return RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(value);
  }

  Iterable<String> _emailAutocompleteOptions(String input) {
    final raw = input.trim();
    if (raw.isEmpty) {
      return const <String>[];
    }

    final atIndex = raw.indexOf('@');
    final localPart = atIndex == -1 ? raw : raw.substring(0, atIndex);
    final domainQuery = atIndex == -1 ? '' : raw.substring(atIndex + 1);
    if (localPart.trim().isEmpty) {
      return const <String>[];
    }

    final normalizedDomainQuery = domainQuery.toLowerCase();
    return _commonEmailDomains
        .where(
          (domain) =>
              normalizedDomainQuery.isEmpty ||
              domain.substring(1).startsWith(normalizedDomainQuery),
        )
        .map((domain) => '${localPart.toLowerCase()}$domain')
        .take(6);
  }

  String? _cashValidationMessage(String notes) {
    if (notes.length > _maxCashTextLength) {
      return 'La nota de Efectivo debe tener maximo $_maxCashTextLength caracteres.';
    }
    return null;
  }

  String? _cashNotesError(String notes) {
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
    if (field.type == 'id') {
      final parsed = _parseIdentityValue(value);
      final prefix = parsed.prefix.trim();
      final identifier = parsed.document.trim();

      if (prefix.isEmpty || identifier.isEmpty) {
        return 'Completa el DNI/Cedula (ej. V-12345678).';
      }

      if (!RegExp(r'^[A-Z0-9]+$').hasMatch(prefix)) {
        return 'Prefijo invalido.';
      }
      if (prefix.length > 6) {
        return 'Prefijo demasiado largo.';
      }

      if (!RegExp(r'^[A-Z0-9]+(?:-[A-Z0-9])?$').hasMatch(identifier)) {
        return 'Documento invalido. Formato permitido: 12345678 o 26679415-7.';
      }

      if (identifier.endsWith('-')) {
        return 'Falta el digito verificador.';
      }

      final baseDocument = identifier.split('-').first;
      if (baseDocument.length < 3) {
        return 'Agrega al menos 3 caracteres en el numero/documento.';
      }
    }
    if (field.type == 'telefono') {
      final parsed = _parsePhoneValue(
        value,
        fallbackIso: _selectedPhoneCountryIso,
      );
      final local = parsed.nationalNumber.replaceAll(RegExp(r'\D'), '');
      if (local.isEmpty) {
        return 'Ingresa un numero de telefono.';
      }
      final country = _countryByIso(parsed.countryIso);
      final phone = intl_phone_number.PhoneNumber(
        countryISOCode: parsed.countryIso,
        countryCode: '+${country.fullCountryCode}',
        number: local,
      );
      final isValid = phone.isValidNumber();
      if (!isValid) {
        return 'Numero invalido para ese pais.';
      }
    }
    return null;
  }

  TextInputType _transferFieldKeyboardType(String type) {
    return switch (type) {
      'numero_cuenta' => TextInputType.number,
      'telefono' => TextInputType.phone,
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
      'telefono' => <TextInputFormatter>[
        FilteringTextInputFormatter.digitsOnly,
      ],
      'id' => <TextInputFormatter>[
        FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9-]')),
        _UpperCaseTextFormatter(),
      ],
      'correo' => <TextInputFormatter>[
        FilteringTextInputFormatter.deny(RegExp(r'\s')),
      ],
      _ => const <TextInputFormatter>[],
    };
  }

  String _normalizeIdentityValue(String value) {
    final cleaned = value
        .toUpperCase()
        .replaceAll(RegExp(r'\s+'), '')
        .replaceAll(RegExp(r'[^A-Z0-9-]'), '');
    if (cleaned.isEmpty) {
      return '';
    }

    final dashIndex = cleaned.indexOf('-');
    if (dashIndex <= 0) {
      return cleaned.replaceAll('-', '');
    }

    final prefix = cleaned.substring(0, dashIndex).replaceAll('-', '');
    final document = _normalizeIdentityDocument(
      cleaned.substring(dashIndex + 1),
    );
    if (document.isEmpty) {
      return prefix;
    }
    return '$prefix-$document';
  }

  _ParsedIdentityValue _parseIdentityValue(String value) {
    final normalized = _normalizeIdentityValue(value);
    if (normalized.isEmpty) {
      return const _ParsedIdentityValue(prefix: 'V', document: '');
    }

    final dashIndex = normalized.indexOf('-');
    if (dashIndex <= 0) {
      return _ParsedIdentityValue(
        prefix: normalized.replaceAll('-', ''),
        document: '',
      );
    }

    final prefix = normalized.substring(0, dashIndex).replaceAll('-', '');
    final document = _normalizeIdentityDocument(
      normalized.substring(dashIndex + 1),
    );
    return _ParsedIdentityValue(
      prefix: prefix.isEmpty ? 'V' : prefix,
      document: document,
    );
  }

  String _normalizeIdentityDocument(String value) {
    final cleaned = value
        .toUpperCase()
        .replaceAll(RegExp(r'\s+'), '')
        .replaceAll(RegExp(r'[^A-Z0-9-]'), '');
    if (cleaned.isEmpty) {
      return '';
    }

    final firstDash = cleaned.indexOf('-');
    if (firstDash < 0) {
      return cleaned.replaceAll('-', '');
    }

    final base = cleaned.substring(0, firstDash).replaceAll('-', '');
    if (base.isEmpty) {
      return '';
    }

    final verifier = cleaned.substring(firstDash + 1).replaceAll('-', '');
    if (verifier.isEmpty) {
      return '$base-';
    }
    return '$base-${verifier[0]}';
  }

  String _identityDocumentRaw(String value) {
    return _normalizeIdentityDocument(value);
  }

  String _formatIdentityDocumentForDisplay(String rawValue) {
    final raw = _normalizeIdentityDocument(rawValue);
    if (raw.isEmpty) {
      return '';
    }

    final hasVerifier = raw.contains('-');
    final verifierIndex = raw.indexOf('-');
    final base = hasVerifier ? raw.substring(0, verifierIndex) : raw;
    final verifier = hasVerifier ? raw.substring(verifierIndex + 1) : '';

    final hasLetters = RegExp(r'[A-Z]').hasMatch(base);
    String formattedBase;
    if (!hasLetters) {
      formattedBase = base.replaceAllMapped(
        RegExp(r'\B(?=(\d{3})+(?!\d))'),
        (_) => '.',
      );
    } else {
      final chunks = <String>[];
      for (var i = 0; i < base.length; i += 4) {
        final end = (i + 4 < base.length) ? i + 4 : base.length;
        chunks.add(base.substring(i, end));
      }
      formattedBase = chunks.join(' ');
    }

    if (!hasVerifier) {
      return formattedBase;
    }

    return verifier.isEmpty ? '$formattedBase-' : '$formattedBase-$verifier';
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

  double _effectiveExchangeRateForCurrency(String currency) {
    if (!_requiresExchangeRateForCurrency(currency)) {
      return 1;
    }

    final mode = _exchangeRateModeByCurrency[currency] ?? _exchangeRateMode;
    if (mode == _exchangeModeAuto && _hasAutoSourcesForCurrency(currency)) {
      final availableSources = _availableAutoSourcesForCurrency(currency);
      final selectedSource = _exchangeRateSourceByCurrency[currency];
      final source = availableSources.contains(selectedSource)
          ? selectedSource!
          : availableSources.first;
      return _rateForSource(source, quoteCurrency: currency);
    }

    return _parseExchangeRate(_exchangeRateByCurrency[currency]);
  }

  bool _isCurrencyExchangeRateConfigured(String currency) {
    final rate = _effectiveExchangeRateForCurrency(currency);
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
    if (method == 'Efectivo') {
      details.add(
        draft.extraDetails.trim().isEmpty
            ? _defaultCashNote
            : draft.extraDetails,
      );
    } else if (draft.extraDetails.isNotEmpty) {
      details.add(draft.extraDetails);
    }
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
        ? _defaultCashNote
        : current.extraDetails;
    var showInlineErrors = false;

    final updated = await showModalBottomSheet<_PaymentMethodDraft>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
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
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
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
    final currencyLabel = _currencyLabel(currency);
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
    final phoneCountryByField = <int, String>{};
    final emailControllerByField = <int, TextEditingController>{};
    final emailFocusByField = <int, FocusNode>{};
    final emailAnchorByField = <int, GlobalKey>{};
    final idPrefixControllerByField = <int, TextEditingController>{};
    final idPrefixFocusByField = <int, FocusNode>{};
    final idDocumentControllerByField = <int, TextEditingController>{};
    final allEmailControllers = <TextEditingController>{};
    final allEmailFocusNodes = <FocusNode>{};
    final allIdPrefixControllers = <TextEditingController>{};
    final allIdPrefixFocusNodes = <FocusNode>{};
    final allIdDocumentControllers = <TextEditingController>{};

    TextEditingController ensureEmailController(int fieldIndex, String value) {
      final existing = emailControllerByField[fieldIndex];
      if (existing != null) {
        return existing;
      }
      final created = TextEditingController(text: value);
      emailControllerByField[fieldIndex] = created;
      allEmailControllers.add(created);
      return created;
    }

    FocusNode ensureEmailFocusNode(int fieldIndex) {
      final existing = emailFocusByField[fieldIndex];
      if (existing != null) {
        return existing;
      }
      final created = FocusNode();
      emailFocusByField[fieldIndex] = created;
      allEmailFocusNodes.add(created);
      return created;
    }

    TextEditingController ensureIdPrefixController(
      int fieldIndex,
      String value,
    ) {
      final existing = idPrefixControllerByField[fieldIndex];
      if (existing != null) {
        return existing;
      }
      final created = TextEditingController(text: value.isEmpty ? 'V' : value);
      idPrefixControllerByField[fieldIndex] = created;
      allIdPrefixControllers.add(created);
      return created;
    }

    FocusNode ensureIdPrefixFocusNode(int fieldIndex) {
      final existing = idPrefixFocusByField[fieldIndex];
      if (existing != null) {
        return existing;
      }
      final created = FocusNode();
      idPrefixFocusByField[fieldIndex] = created;
      allIdPrefixFocusNodes.add(created);
      return created;
    }

    TextEditingController ensureIdDocumentController(
      int fieldIndex,
      String value,
    ) {
      final existing = idDocumentControllerByField[fieldIndex];
      if (existing != null) {
        return existing;
      }
      final created = TextEditingController(text: value);
      idDocumentControllerByField[fieldIndex] = created;
      allIdDocumentControllers.add(created);
      return created;
    }

    void scrollEmailIntoView(int fieldIndex) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        try {
          final anchorContext = emailAnchorByField[fieldIndex]?.currentContext;
          if (anchorContext == null) {
            return;
          }
          Scrollable.ensureVisible(
            anchorContext,
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            alignment: 0.72,
          );
        } catch (_) {
          // Ignore scroll failures in transient modal rebuilds.
        }
      });
    }

    for (var i = 0; i < fields.length; i++) {
      if (fields[i].type == 'telefono') {
        phoneCountryByField[i] = _parsePhoneValue(
          fields[i].value,
          fallbackIso: _selectedPhoneCountryIso,
        ).countryIso;
      }
      if (fields[i].type == 'correo') {
        ensureEmailController(i, fields[i].value);
        ensureEmailFocusNode(i);
        emailAnchorByField[i] = GlobalKey();
      }
      if (fields[i].type == 'id') {
        final parsedIdentity = _parseIdentityValue(fields[i].value);
        ensureIdPrefixController(i, parsedIdentity.prefix);
        ensureIdPrefixFocusNode(i);
        ensureIdDocumentController(i, parsedIdentity.document);
      }
    }
    var showInlineErrors = false;

    final updatedAccount = await showModalBottomSheet<_TransferAccountDraft>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
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
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
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
                    const SizedBox(height: 10),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFF120E25),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFF3B2F63)),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(
                            Icons.currency_exchange_rounded,
                            color: Color(0xFFD3E8FF),
                            size: 18,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'IMPORTANTE: Solo para cobros en $currencyLabel.',
                              style: const TextStyle(
                                color: Color.fromARGB(255, 255, 211, 211),
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
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
                                              : value == 'telefono'
                                              ? () {
                                                  final parsed = _parsePhoneValue(
                                                    currentField.value,
                                                    fallbackIso:
                                                        _selectedPhoneCountryIso,
                                                  );
                                                  phoneCountryByField[fieldIndex] =
                                                      parsed.countryIso;
                                                  final digits = parsed
                                                      .nationalNumber
                                                      .replaceAll(
                                                        RegExp(r'\D'),
                                                        '',
                                                      );
                                                  if (digits.isEmpty) {
                                                    return '';
                                                  }
                                                  final country = _countryByIso(
                                                    parsed.countryIso,
                                                  );
                                                  return '+${country.fullCountryCode}$digits';
                                                }()
                                              : value == 'id'
                                              ? (currentField.value
                                                        .trim()
                                                        .isEmpty
                                                    ? 'V-'
                                                    : _normalizeIdentityValue(
                                                        currentField.value,
                                                      ))
                                              : currentField.value;
                                          if (value != 'telefono') {
                                            phoneCountryByField.remove(
                                              fieldIndex,
                                            );
                                          }
                                          if (value == 'correo') {
                                            ensureEmailController(
                                              fieldIndex,
                                              nextValue,
                                            );
                                            ensureEmailFocusNode(fieldIndex);
                                            emailAnchorByField.putIfAbsent(
                                              fieldIndex,
                                              GlobalKey.new,
                                            );
                                          } else {
                                            emailControllerByField.remove(
                                              fieldIndex,
                                            );
                                            emailFocusByField.remove(
                                              fieldIndex,
                                            );
                                            emailAnchorByField.remove(
                                              fieldIndex,
                                            );
                                          }
                                          if (value == 'id') {
                                            ensureIdPrefixController(
                                              fieldIndex,
                                              'V',
                                            );
                                            ensureIdPrefixFocusNode(fieldIndex);
                                            ensureIdDocumentController(
                                              fieldIndex,
                                              '',
                                            );
                                          } else {
                                            idPrefixControllerByField.remove(
                                              fieldIndex,
                                            );
                                            idPrefixFocusByField.remove(
                                              fieldIndex,
                                            );
                                            idDocumentControllerByField.remove(
                                              fieldIndex,
                                            );
                                          }
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
                                        emailControllerByField.remove(
                                          fieldIndex,
                                        );
                                        emailFocusByField.remove(fieldIndex);

                                        fields.removeAt(fieldIndex);

                                        final shiftedControllers =
                                            <int, TextEditingController>{};
                                        for (final entry
                                            in emailControllerByField.entries) {
                                          final nextIndex =
                                              entry.key > fieldIndex
                                              ? entry.key - 1
                                              : entry.key;
                                          shiftedControllers[nextIndex] =
                                              entry.value;
                                        }
                                        emailControllerByField
                                          ..clear()
                                          ..addAll(shiftedControllers);

                                        final shiftedFocusNodes =
                                            <int, FocusNode>{};
                                        for (final entry
                                            in emailFocusByField.entries) {
                                          final nextIndex =
                                              entry.key > fieldIndex
                                              ? entry.key - 1
                                              : entry.key;
                                          shiftedFocusNodes[nextIndex] =
                                              entry.value;
                                        }
                                        emailFocusByField
                                          ..clear()
                                          ..addAll(shiftedFocusNodes);

                                        final shiftedAnchors =
                                            <int, GlobalKey>{};
                                        for (final entry
                                            in emailAnchorByField.entries) {
                                          final nextIndex =
                                              entry.key > fieldIndex
                                              ? entry.key - 1
                                              : entry.key;
                                          shiftedAnchors[nextIndex] =
                                              entry.value;
                                        }
                                        emailAnchorByField
                                          ..clear()
                                          ..addAll(shiftedAnchors);

                                        final shiftedIdPrefixControllers =
                                            <int, TextEditingController>{};
                                        for (final entry
                                            in idPrefixControllerByField
                                                .entries) {
                                          final nextIndex =
                                              entry.key > fieldIndex
                                              ? entry.key - 1
                                              : entry.key;
                                          shiftedIdPrefixControllers[nextIndex] =
                                              entry.value;
                                        }
                                        idPrefixControllerByField
                                          ..clear()
                                          ..addAll(shiftedIdPrefixControllers);

                                        final shiftedIdPrefixFocusNodes =
                                            <int, FocusNode>{};
                                        for (final entry
                                            in idPrefixFocusByField.entries) {
                                          final nextIndex =
                                              entry.key > fieldIndex
                                              ? entry.key - 1
                                              : entry.key;
                                          shiftedIdPrefixFocusNodes[nextIndex] =
                                              entry.value;
                                        }
                                        idPrefixFocusByField
                                          ..clear()
                                          ..addAll(shiftedIdPrefixFocusNodes);

                                        final shiftedIdDocumentControllers =
                                            <int, TextEditingController>{};
                                        for (final entry
                                            in idDocumentControllerByField
                                                .entries) {
                                          final nextIndex =
                                              entry.key > fieldIndex
                                              ? entry.key - 1
                                              : entry.key;
                                          shiftedIdDocumentControllers[nextIndex] =
                                              entry.value;
                                        }
                                        idDocumentControllerByField
                                          ..clear()
                                          ..addAll(
                                            shiftedIdDocumentControllers,
                                          );
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
                              if (field.type == 'telefono')
                                Builder(
                                  builder: (context) {
                                    final parsedPhone = _parsePhoneValue(
                                      field.value,
                                      fallbackIso:
                                          phoneCountryByField[fieldIndex] ??
                                          _selectedPhoneCountryIso,
                                    );
                                    final currentIso =
                                        phoneCountryByField[fieldIndex] ??
                                        parsedPhone.countryIso;
                                    return IntlPhoneField(
                                      key: ValueKey(
                                        'transfer-phone-$fieldIndex-${field.value}-$currentIso',
                                      ),
                                      initialCountryCode:
                                          currentIso.trim().isEmpty
                                          ? 'VE'
                                          : currentIso,
                                      initialValue: parsedPhone.nationalNumber,
                                      languageCode: 'es',
                                      style: const TextStyle(
                                        color: _setupTextHigh,
                                      ),
                                      dropdownTextStyle: const TextStyle(
                                        color: _setupTextHigh,
                                        fontWeight: FontWeight.w600,
                                      ),
                                      invalidNumberMessage:
                                          'Numero invalido para ese pais.',
                                      autovalidateMode:
                                          AutovalidateMode.onUserInteraction,
                                      inputFormatters: <TextInputFormatter>[
                                        FilteringTextInputFormatter.digitsOnly,
                                      ],
                                      decoration: InputDecoration(
                                        labelText: 'Numero de telefono',
                                        hintText: 'Ej. 4140821633',
                                        filled: true,
                                        fillColor: const Color(0xFF120E25),
                                        labelStyle: const TextStyle(
                                          color: _setupTextLow,
                                        ),
                                        hintStyle: const TextStyle(
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
                                      onCountryChanged: (country) {
                                        setModalState(() {
                                          phoneCountryByField[fieldIndex] =
                                              country.code;
                                        });
                                      },
                                      onChanged: (phone) {
                                        final localDigits = phone.number
                                            .replaceAll(RegExp(r'\D'), '');
                                        final country = _countryByIso(
                                          phone.countryISOCode,
                                        );
                                        final e164 = localDigits.isEmpty
                                            ? ''
                                            : '+${country.fullCountryCode}$localDigits';
                                        fields[fieldIndex] = fields[fieldIndex]
                                            .copyWith(value: e164);
                                        phoneCountryByField[fieldIndex] =
                                            phone.countryISOCode;
                                        if (showInlineErrors) {
                                          setModalState(() {});
                                        }
                                      },
                                      validator: (phone) {
                                        if (!showInlineErrors) {
                                          return null;
                                        }
                                        final raw =
                                            phone?.number.replaceAll(
                                              RegExp(r'\D'),
                                              '',
                                            ) ??
                                            '';
                                        final iso =
                                            phone?.countryISOCode ?? currentIso;
                                        final country = _countryByIso(iso);
                                        final value = raw.isEmpty
                                            ? ''
                                            : '+${country.fullCountryCode}$raw';
                                        return _transferFieldValueError(
                                          fields[fieldIndex].copyWith(
                                            type: 'telefono',
                                            value: value,
                                          ),
                                        );
                                      },
                                    );
                                  },
                                )
                              else if (field.type == 'correo')
                                Builder(
                                  builder: (context) {
                                    final emailController =
                                        ensureEmailController(
                                          fieldIndex,
                                          field.value,
                                        );
                                    final emailFocus = ensureEmailFocusNode(
                                      fieldIndex,
                                    );
                                    final emailAnchor = emailAnchorByField
                                        .putIfAbsent(fieldIndex, GlobalKey.new);

                                    if (!emailFocus.hasFocus &&
                                        emailController.text != field.value) {
                                      emailController.value = TextEditingValue(
                                        text: field.value,
                                        selection: TextSelection.collapsed(
                                          offset: field.value.length,
                                        ),
                                      );
                                    }

                                    final suggestions =
                                        _emailAutocompleteOptions(
                                          emailController.text,
                                        ).toList();
                                    return Container(
                                      key: emailAnchor,
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          TextFormField(
                                            key: ValueKey(
                                              'transfer-email-$fieldIndex',
                                            ),
                                            controller: emailController,
                                            focusNode: emailFocus,
                                            onChanged: (text) {
                                              fields[fieldIndex] =
                                                  fields[fieldIndex].copyWith(
                                                    value: text,
                                                  );
                                              setModalState(() {});
                                              if (text.trim().isNotEmpty) {
                                                scrollEmailIntoView(fieldIndex);
                                              }
                                            },
                                            maxLength:
                                                _maxTransferFieldValueLength,
                                            style: const TextStyle(
                                              color: _setupTextHigh,
                                            ),
                                            keyboardType:
                                                TextInputType.emailAddress,
                                            inputFormatters: <TextInputFormatter>[
                                              FilteringTextInputFormatter.deny(
                                                RegExp(r'\s'),
                                              ),
                                            ],
                                            decoration: InputDecoration(
                                              labelText: 'Correo',
                                              hintText: 'usuario@dominio.com',
                                              helperText:
                                                  'Puedes usar sugerencias o escribir otro dominio.',
                                              filled: true,
                                              fillColor: const Color(
                                                0xFF120E25,
                                              ),
                                              labelStyle: const TextStyle(
                                                color: _setupTextLow,
                                              ),
                                              hintStyle: const TextStyle(
                                                color: _setupTextLow,
                                              ),
                                              helperStyle: const TextStyle(
                                                color: _setupTextLow,
                                                fontSize: 11,
                                              ),
                                              border: OutlineInputBorder(
                                                borderRadius:
                                                    BorderRadius.circular(12),
                                                borderSide: const BorderSide(
                                                  color: Color(0xFF3B2F63),
                                                ),
                                              ),
                                              enabledBorder: OutlineInputBorder(
                                                borderRadius:
                                                    BorderRadius.circular(12),
                                                borderSide: const BorderSide(
                                                  color: Color(0xFF3B2F63),
                                                ),
                                              ),
                                              focusedBorder: OutlineInputBorder(
                                                borderRadius:
                                                    BorderRadius.circular(12),
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
                                          if (suggestions.isNotEmpty) ...[
                                            const SizedBox(height: 6),
                                            Wrap(
                                              spacing: 6,
                                              runSpacing: 6,
                                              children: suggestions
                                                  .map(
                                                    (option) => ActionChip(
                                                      backgroundColor:
                                                          const Color(
                                                            0xFF1A1432,
                                                          ),
                                                      side: const BorderSide(
                                                        color: Color(
                                                          0xFF3B2F63,
                                                        ),
                                                      ),
                                                      label: Text(
                                                        option,
                                                        style: const TextStyle(
                                                          color: _setupTextHigh,
                                                          fontSize: 12,
                                                        ),
                                                      ),
                                                      onPressed: () {
                                                        emailController.value =
                                                            TextEditingValue(
                                                              text: option,
                                                              selection:
                                                                  TextSelection.collapsed(
                                                                    offset: option
                                                                        .length,
                                                                  ),
                                                            );
                                                        fields[fieldIndex] =
                                                            fields[fieldIndex]
                                                                .copyWith(
                                                                  value: option,
                                                                );
                                                        setModalState(() {});
                                                        emailFocus
                                                            .requestFocus();
                                                        scrollEmailIntoView(
                                                          fieldIndex,
                                                        );
                                                      },
                                                    ),
                                                  )
                                                  .toList(),
                                            ),
                                          ],
                                        ],
                                      ),
                                    );
                                  },
                                )
                              else if (field.type == 'id')
                                Builder(
                                  builder: (context) {
                                    final parsedIdentity = _parseIdentityValue(
                                      fields[fieldIndex].value,
                                    );
                                    final prefixController =
                                        ensureIdPrefixController(
                                          fieldIndex,
                                          parsedIdentity.prefix,
                                        );
                                    final prefixFocus = ensureIdPrefixFocusNode(
                                      fieldIndex,
                                    );
                                    final documentController =
                                        ensureIdDocumentController(
                                          fieldIndex,
                                          parsedIdentity.document,
                                        );

                                    if (!prefixFocus.hasFocus &&
                                        prefixController.text !=
                                            parsedIdentity.prefix) {
                                      prefixController.value = TextEditingValue(
                                        text: parsedIdentity.prefix,
                                        selection: TextSelection.collapsed(
                                          offset: parsedIdentity.prefix.length,
                                        ),
                                      );
                                    }
                                    final maskedDocument =
                                        _formatIdentityDocumentForDisplay(
                                          parsedIdentity.document,
                                        );
                                    if (documentController.text !=
                                        maskedDocument) {
                                      documentController.value =
                                          TextEditingValue(
                                            text: maskedDocument,
                                            selection: TextSelection.collapsed(
                                              offset: maskedDocument.length,
                                            ),
                                          );
                                    }

                                    final idError = showInlineErrors
                                        ? _transferFieldValueError(
                                            fields[fieldIndex],
                                          )
                                        : null;
                                    return Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            SizedBox(
                                              width: 110,
                                              child: TextFormField(
                                                controller: prefixController,
                                                focusNode: prefixFocus,
                                                maxLength: 6,
                                                style: const TextStyle(
                                                  color: _setupTextHigh,
                                                  fontWeight: FontWeight.w600,
                                                ),
                                                textCapitalization:
                                                    TextCapitalization
                                                        .characters,
                                                inputFormatters:
                                                    <TextInputFormatter>[
                                                      FilteringTextInputFormatter.allow(
                                                        RegExp(r'[a-zA-Z0-9]'),
                                                      ),
                                                      _UpperCaseTextFormatter(),
                                                    ],
                                                decoration: InputDecoration(
                                                  labelText: 'Prefijo',
                                                  counterText: '',
                                                  hintText: 'V',
                                                  filled: true,
                                                  fillColor: const Color(
                                                    0xFF120E25,
                                                  ),
                                                  labelStyle: const TextStyle(
                                                    color: _setupTextLow,
                                                  ),
                                                  hintStyle: const TextStyle(
                                                    color: _setupTextMedium,
                                                  ),
                                                  border: OutlineInputBorder(
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                          12,
                                                        ),
                                                    borderSide:
                                                        const BorderSide(
                                                          color: Color(
                                                            0xFF3B2F63,
                                                          ),
                                                        ),
                                                  ),
                                                  enabledBorder:
                                                      OutlineInputBorder(
                                                        borderRadius:
                                                            BorderRadius.circular(
                                                              12,
                                                            ),
                                                        borderSide:
                                                            const BorderSide(
                                                              color: Color(
                                                                0xFF3B2F63,
                                                              ),
                                                            ),
                                                      ),
                                                  focusedBorder:
                                                      OutlineInputBorder(
                                                        borderRadius:
                                                            BorderRadius.circular(
                                                              12,
                                                            ),
                                                        borderSide:
                                                            const BorderSide(
                                                              color: Color(
                                                                0xFF6B5A9A,
                                                              ),
                                                            ),
                                                      ),
                                                ),
                                                onChanged: (text) {
                                                  final typedPrefix = text
                                                      .trim()
                                                      .toUpperCase();
                                                  final nextPrefix =
                                                      typedPrefix.isEmpty
                                                      ? 'V'
                                                      : typedPrefix;
                                                  final rawDocument =
                                                      _identityDocumentRaw(
                                                        documentController.text,
                                                      );
                                                  fields[fieldIndex] =
                                                      fields[fieldIndex].copyWith(
                                                        value:
                                                            '$nextPrefix-$rawDocument',
                                                      );
                                                  if (showInlineErrors) {
                                                    setModalState(() {});
                                                  }
                                                },
                                              ),
                                            ),
                                            const SizedBox(width: 8),
                                            Expanded(
                                              child: TextFormField(
                                                controller: documentController,
                                                maxLength: 24,
                                                style: const TextStyle(
                                                  color: _setupTextHigh,
                                                  fontWeight: FontWeight.w600,
                                                ),
                                                textCapitalization:
                                                    TextCapitalization
                                                        .characters,
                                                inputFormatters:
                                                    <TextInputFormatter>[
                                                      _UpperCaseTextFormatter(),
                                                      _IdentityDocumentFormatter(),
                                                    ],
                                                decoration: InputDecoration(
                                                  labelText: 'Documento',
                                                  hintText:
                                                      '12345678, 12345678-7 o AB123456',
                                                  counterText: '',
                                                  filled: true,
                                                  fillColor: const Color(
                                                    0xFF120E25,
                                                  ),
                                                  labelStyle: const TextStyle(
                                                    color: _setupTextLow,
                                                  ),
                                                  hintStyle: const TextStyle(
                                                    color: _setupTextMedium,
                                                  ),
                                                  border: OutlineInputBorder(
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                          12,
                                                        ),
                                                    borderSide:
                                                        const BorderSide(
                                                          color: Color(
                                                            0xFF3B2F63,
                                                          ),
                                                        ),
                                                  ),
                                                  enabledBorder:
                                                      OutlineInputBorder(
                                                        borderRadius:
                                                            BorderRadius.circular(
                                                              12,
                                                            ),
                                                        borderSide:
                                                            const BorderSide(
                                                              color: Color(
                                                                0xFF3B2F63,
                                                              ),
                                                            ),
                                                      ),
                                                  focusedBorder:
                                                      OutlineInputBorder(
                                                        borderRadius:
                                                            BorderRadius.circular(
                                                              12,
                                                            ),
                                                        borderSide:
                                                            const BorderSide(
                                                              color: Color(
                                                                0xFF6B5A9A,
                                                              ),
                                                            ),
                                                      ),
                                                ),
                                                onChanged: (_) {
                                                  final nextPrefix =
                                                      prefixController.text
                                                          .trim()
                                                          .isEmpty
                                                      ? 'V'
                                                      : prefixController.text
                                                            .trim()
                                                            .toUpperCase();
                                                  final rawDocument =
                                                      _identityDocumentRaw(
                                                        documentController.text,
                                                      );
                                                  fields[fieldIndex] =
                                                      fields[fieldIndex].copyWith(
                                                        value:
                                                            '$nextPrefix-$rawDocument',
                                                      );
                                                  if (showInlineErrors) {
                                                    setModalState(() {});
                                                  }
                                                },
                                              ),
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 4),
                                        const Text(
                                          'Formato: PREFIJO-DOCUMENTO (ej. V-12345678 o J-26679415-7).',
                                          style: TextStyle(
                                            color: _setupTextMedium,
                                            fontSize: 11,
                                          ),
                                        ),
                                        if (idError != null) ...[
                                          const SizedBox(height: 4),
                                          Text(
                                            idError,
                                            style: const TextStyle(
                                              color: Color(0xFFFFD1DC),
                                              fontSize: 11,
                                            ),
                                          ),
                                        ],
                                      ],
                                    );
                                  },
                                )
                              else
                                TextFormField(
                                  key: ValueKey(
                                    'transfer-value-$fieldIndex-${field.type}',
                                  ),
                                  initialValue: field.value,
                                  onChanged: (text) {
                                    final normalizedText = field.type == 'id'
                                        ? _normalizeIdentityValue(text)
                                        : text;
                                    fields[fieldIndex] = fields[fieldIndex]
                                        .copyWith(value: normalizedText);
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
                                  inputFormatters:
                                      _transferFieldInputFormatters(field.type),
                                  decoration: InputDecoration(
                                    labelText: field.type == 'id'
                                        ? 'DNI / Cedula'
                                        : 'Valor',
                                    hintText: field.type == 'id'
                                        ? 'Ej. V-12345678, E-98765432, PAS-AB1234'
                                        : 'Dato que vera el cliente',
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

    unawaited(
      Future<void>.delayed(const Duration(milliseconds: 280), () {
        for (final controller in allEmailControllers) {
          controller.dispose();
        }
        for (final focusNode in allEmailFocusNodes) {
          focusNode.dispose();
        }
        for (final controller in allIdPrefixControllers) {
          controller.dispose();
        }
        for (final focusNode in allIdPrefixFocusNodes) {
          focusNode.dispose();
        }
        for (final controller in allIdDocumentControllers) {
          controller.dispose();
        }
      }),
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

    if (!_requiresExchangeRateForCurrency(currency)) {
      setState(() {
        _exchangeRateController.text = '1';
        _lastSuggestedRateCurrency = currency;
        _exchangeRateManuallyEdited = false;
        _exchangeRateMessage = null;
        _exchangeRateIsError = false;
        _exchangeRateByCurrency[currency] = '1';
      });
      await _saveDraft();
      return;
    }

    if (!force &&
        _lastSuggestedRateCurrency == currency &&
        _exchangeRateController.text.trim().isNotEmpty) {
      return;
    }

    _enforceExchangeRulesForCurrency(currency);
    final canUseAuto =
        _exchangeRateMode == _exchangeModeAuto &&
        _hasAutoSourcesForCurrency(currency);
    final fallback = canUseAuto
        ? _rateForSource(_exchangeRateSource)
        : _defaultExchangeRateFor(currency);
    final formattedFallback = canUseAuto
        ? _formatExchangeRateMasked(fallback)
        : _formatExchangeRate(fallback);
    setState(() {
      if (_exchangeRateController.text.trim().isEmpty || force) {
        _exchangeRateController.text = formattedFallback;
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
        _exchangeRateController.text = formattedFallback;
      }
      _exchangeRateByCurrency[currency] = _exchangeRateController.text.trim();
      _lastSuggestedRateCurrency = currency;
      _exchangeRateIsError = false;
      _exchangeRateMessage = canUseAuto
          ? null
          : 'Tasa manual configurada para tu negocio.';
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
    final primaryCurrency = _baseCurrency;
    final quotedCurrency = _selectedCurrencies.firstWhere(
      (currency) => currency != primaryCurrency,
      orElse: () => primaryCurrency,
    );
    final manualRate = _parseExchangeRate(
      _exchangeRateByCurrency[quotedCurrency],
    );
    final autoRate = _rateForSource(
      _exchangeRateSource,
      quoteCurrency: quotedCurrency,
    );
    final primaryExchangeRate = _exchangeRateMode == _exchangeModeAuto
        ? autoRate
        : manualRate;
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
      if (_composeAddressWithNote().isNotEmpty)
        'direccion': _composeAddressWithNote(),
      if (_businessLatitude != null) 'latitud': _businessLatitude,
      if (_businessLongitude != null) 'longitud': _businessLongitude,
      'permite_delivery': _allowDelivery,
      'recibe_pedidos_whatsapp': _receiveOrdersOnWhatsapp,
      if (logoUrl != null && logoUrl.trim().isNotEmpty) 'logo_url': logoUrl,
      'moneda': primaryCurrency,
      'tasa_cambio_pesos': primaryCurrency == 'COP' && primaryExchangeRate > 0
          ? primaryExchangeRate
          : null,
      'exchange_rate_mode': _exchangeRateMode,
      'exchange_rate_source': _exchangeRateSource,
      'exchange_rate_quote_currency': quotedCurrency == primaryCurrency
          ? null
          : quotedCurrency,
      'exchange_rate_value': primaryExchangeRate > 0
          ? primaryExchangeRate
          : null,
      'last_rate_update': primaryExchangeRate > 0
          ? DateTime.now().toUtc().toIso8601String()
          : null,
      'metodo_pago_predeterminado': defaultMethod,
      'metodos_pago': allMethods.toList(),
      'menu_layout': 'cards',
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
      'exchange_rate_mode',
      'exchange_rate_source',
      'exchange_rate_quote_currency',
      'exchange_rate_value',
      'last_rate_update',
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

    if (!_hasPrimaryCurrencySelected) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Selecciona la moneda principal.')),
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
          automaticallyImplyLeading: _showBackControls,
          backgroundColor: const Color(0xFF16102A),
          foregroundColor: _setupTextHigh,
          iconTheme: const IconThemeData(color: _setupTextHigh),
          titleTextStyle: GoogleFonts.poppins(
            color: _setupTextHigh,
            fontSize: 28,
            fontWeight: FontWeight.w700,
          ),
          title: const Text('Mi Negocio'),
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
                        if (_showStepBackButton)
                          Expanded(
                            child: OutlinedButton(
                              onPressed: _previousStep,
                              style: OutlinedButton.styleFrom(
                                foregroundColor: Colors.white,
                                disabledForegroundColor: const Color(
                                  0xFFB6A9D7,
                                ),
                                side: const BorderSide(
                                  color: Color(0xFF5F4B93),
                                ),
                                minimumSize: const Size.fromHeight(50),
                              ),
                              child: const Text('Atras'),
                            ),
                          ),
                        if (_showStepBackButton) const SizedBox(width: 10),
                        Expanded(
                          flex: _showStepBackButton ? (compact ? 1 : 2) : 1,
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
        _MenuPreviewNavbar(
          compact: compact,
          nameController: _nameController,
          category: _selectedCategory,
          onNameChanged: _onNameChanged,
          onPickLogo: _pickLogo,
          selectedLogo: _selectedLogo,
        ),
        const SizedBox(height: 12),
        _UrlBar(
          slugController: _slugController,
          onChanged: _onSlugChanged,
          checkingSlug: _checkingSlug,
          isSlugAvailable: _isSlugAvailable,
          slugMessage: _slugAvailabilityMessage,
        ),
        const SizedBox(height: 12),
        TextFormField(
          key: ValueKey<String>('sector-$_selectedCategory'),
          readOnly: true,
          onTap: _openSectorPicker,
          initialValue: _selectedCategory,
          decoration: _fieldDecoration(
            'Sector',
            Icons.storefront_rounded,
          ).copyWith(suffixIcon: const Icon(Icons.keyboard_arrow_down_rounded)),
        ),
        const SizedBox(height: 6),
        const Text(
          'Selecciona el sector de tu negocio. Incluye gastronomia y otros rubros.',
          style: TextStyle(color: _setupTextLow, fontSize: 12),
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
          layoutName: 'Tarjetas',
          headingStyleBuilder: _headingFontStyle,
        ),
      ],
    );
  }

  Widget _buildCheckoutStep() {
    if (_selectedCurrencies.isEmpty) {
      _selectedCurrencies.add('USD');
    }
    final hasPrimary = _hasPrimaryCurrencySelected;
    if (hasPrimary && !_selectedCurrencies.contains(_primaryCheckoutCurrency)) {
      _selectedCurrencies.add(_primaryCheckoutCurrency);
    }

    final currentCurrency = _currentCurrency;
    final baseCurrency = _baseCurrency;
    final currentPairLabel = '$baseCurrency/$currentCurrency';
    final requiresRate = _requiresExchangeRateForCurrency(currentCurrency);
    final canUseAuto =
        requiresRate && _hasAutoSourcesForCurrency(currentCurrency);
    final selectedProviderLastChecked = _providerLastChecked(_exchangeRateSource);
    final selectedProviderFallback = _providerFallbackUsed(_exchangeRateSource);
    final providerHealth = _getProviderHealth(
      selectedProviderLastChecked,
      selectedProviderFallback,
    );
    final marketRatesFreshnessText = _providerFreshnessText(_exchangeRateSource);
    final currentDisplayedRate = requiresRate
      ? (_exchangeRateMode == _exchangeModeAuto
          ? _rateForSource(
            _exchangeRateSource,
            quoteCurrency: currentCurrency,
          )
          : _parseExchangeRate(_exchangeRateByCurrency[currentCurrency]))
      : 1.0;
    final allowBcv = _isBcvPairAvailable(currentCurrency);
    final allowP2p = _isP2pPairAvailable(currentCurrency);
    final allowGoogle = _isGooglePairAvailable(currentCurrency);
    final currenciesForEditing = <String>[
      if (_selectedCurrencies.contains(baseCurrency)) baseCurrency,
      ..._selectedCurrencies.where((currency) => currency != baseCurrency),
    ];
    _ensureCurrencyConfig(currentCurrency);
    _enforceExchangeRulesForCurrency(currentCurrency);
    final currentPayments = _selectedPaymentsForCurrency(currentCurrency);
    final currentDrafts = _paymentDraftsForCurrency(currentCurrency);
    final isExchangeRateEditable =
        requiresRate && _exchangeRateMode == _exchangeModeManual;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Moneda principal',
          style: GoogleFonts.poppins(
            color: _setupTextHigh,
            fontSize: 19,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Elige primero la moneda base de tu negocio.',
          style: const TextStyle(color: _setupTextMedium, fontSize: 12),
        ),
        const SizedBox(height: 14),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(
            color: const Color(0xFF17122E),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF3B2F63)),
          ),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _currencies.map((currency) {
                final selected = _primaryCheckoutCurrency == currency;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text('${_currencyLabel(currency)} ($currency)'),
                    selected: selected,
                    onSelected: (_) {
                      setState(() {
                        _syncActiveCurrencyDataFromController();
                        _primaryCheckoutCurrency = currency;
                        _selectedCurrencies.add(currency);
                        _activeCheckoutCurrency = currency;
                        _ensureCurrencyConfig(currency);
                        _exchangeRateManuallyEdited = false;
                        _exchangeRateMessage = null;
                        _exchangeRateIsError = false;
                        _loadActiveCurrencyIntoController();
                      });
                      unawaited(_saveDraft());
                    },
                    selectedColor: const Color(0xFF2D2152),
                    backgroundColor: const Color(0xFF1A1432),
                    labelStyle: const TextStyle(
                      color: _setupTextHigh,
                      fontSize: 13,
                    ),
                    side: BorderSide(
                      color: selected
                          ? _palette.primary
                          : const Color(0xFF3B2F63),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ),
        if (!hasPrimary) ...[
          const SizedBox(height: 10),
          const Text(
            'Selecciona la moneda principal para continuar con la configuracion de cobros.',
            style: TextStyle(color: _setupTextMedium, fontSize: 12),
          ),
        ],
        if (!hasPrimary) const SizedBox(height: 14),
        if (hasPrimary) ...[
          const SizedBox(height: 10),
          Text(
            'Tambien aceptamos',
            style: GoogleFonts.poppins(
              color: _setupTextHigh,
              fontSize: 19,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Selecciona monedas adicionales para configurar sus pares con $baseCurrency.',
            style: const TextStyle(color: _setupTextMedium, fontSize: 12),
          ),
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFF17122E),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF3B2F63)),
            ),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _currencies
                    .where((currency) => currency != baseCurrency)
                    .map((currency) {
                      final selected = _selectedCurrencies.contains(currency);
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: FilterChip(
                          avatar: Icon(
                            selected
                                ? Icons.check_circle_rounded
                                : Icons.circle_outlined,
                            size: 16,
                            color: selected
                                ? const Color(0xFFA7F3D0)
                                : _setupTextLow,
                          ),
                          label: Text(
                            '${_currencyLabel(currency)} ($currency)',
                          ),
                          selected: selected,
                          onSelected: (active) {
                            setState(() {
                              _syncActiveCurrencyDataFromController();
                              if (active) {
                                _selectedCurrencies.add(currency);
                                _activeCheckoutCurrency = currency;
                                _ensureCurrencyConfig(currency);
                              } else {
                                _selectedCurrencies.remove(currency);
                                _selectedPaymentsByCurrency.remove(currency);
                                _paymentMethodDraftsByCurrency.remove(currency);
                                _exchangeRateByCurrency.remove(currency);
                                if (_activeCheckoutCurrency == currency) {
                                  _activeCheckoutCurrency = baseCurrency;
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
                          labelStyle: const TextStyle(
                            color: _setupTextHigh,
                            fontSize: 13,
                          ),
                          side: BorderSide(
                            color: selected
                                ? _palette.primary
                                : const Color(0xFF3B2F63),
                          ),
                          showCheckmark: false,
                        ),
                      );
                    })
                    .toList(),
              ),
            ),
          ),
        ],
        if (hasPrimary) ...[
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
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFF17122E),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFF3B2F63)),
              ),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: currenciesForEditing.map((currency) {
                    final isActive = currency == currentCurrency;
                    final isReady = _isCurrencyCheckoutConfigured(currency);
                    return Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
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
                          color: isActive
                              ? _palette.primary
                              : const Color(0xFF3B2F63),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),
          ],
        ],
        if (hasPrimary && requiresRate) const SizedBox(height: 12),
        if (hasPrimary && requiresRate)
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
                        'Par de conversion: $currentPairLabel',
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
                        color:
                            _isCurrencyExchangeRateConfigured(currentCurrency)
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
                  requiresRate
                      ? 'Define como convertir desde $baseCurrency hacia $currentCurrency.'
                      : 'Esta es tu moneda principal. No requiere tasa de conversion.',
                  style: const TextStyle(color: _setupTextMedium, fontSize: 12),
                ),
                if (requiresRate && currentDisplayedRate > 0) ...[
                  const SizedBox(height: 8),
                  Text(
                    _formatConversionEquivalenceText(
                      rate: currentDisplayedRate,
                      baseCurrency: baseCurrency,
                      quoteCurrency: currentCurrency,
                    ),
                    style: const TextStyle(
                      color: Color(0xFFD3E8FF),
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
                if (!requiresRate) ...[
                  const SizedBox(height: 8),
                  const Text(
                    'Selecciona otra moneda para crear su par de conversion.',
                    style: TextStyle(color: _setupTextLow, fontSize: 11),
                  ),
                ],
                if (requiresRate && !canUseAuto) ...[
                  const SizedBox(height: 8),
                  const Text(
                    'Este par no tiene fuente automatica disponible. Configuralo manualmente.',
                    style: TextStyle(color: Color(0xFFFBBF24), fontSize: 11),
                  ),
                ],
                if (requiresRate) ...[
                  const SizedBox(height: 12),
                  SwitchListTile.adaptive(
                    contentPadding: EdgeInsets.zero,
                    value: canUseAuto && _exchangeRateMode == _exchangeModeAuto,
                    onChanged: !canUseAuto
                        ? null
                        : (enabled) async {
                            setState(() {
                              _exchangeRateMode = enabled
                                  ? _exchangeModeAuto
                                  : _exchangeModeManual;
                              if (enabled) {
                                final synced = _rateForSource(
                                  _exchangeRateSource,
                                );
                                if (synced > 0) {
                                  final masked = _formatExchangeRateMasked(
                                    synced,
                                  );
                                  _exchangeRateByCurrency[currentCurrency] =
                                      masked;
                                  _exchangeRateController.text = masked;
                                  _exchangeRateManuallyEdited = false;
                                }
                              }
                            });
                            await _saveDraft();
                          },
                    activeThumbColor: _palette.primary,
                    activeTrackColor: _palette.primary.withValues(alpha: 0.45),
                    inactiveThumbColor: const Color(0xFFE7E0F9),
                    inactiveTrackColor: const Color(0xFF3A305A),
                    title: Text(
                      'Actualizar tasa automaticamente',
                      style: TextStyle(
                        color: canUseAuto ? _setupTextHigh : _setupTextMedium,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    subtitle: Text(
                      _exchangeRateMode == _exchangeModeAuto
                          ? 'El sistema sincroniza la tasa segun la fuente seleccionada.'
                          : 'La tasa se mantiene fija hasta que la cambies.',
                      style: const TextStyle(
                        color: _setupTextMedium,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
                if (requiresRate &&
                    canUseAuto &&
                    _exchangeRateMode == _exchangeModeAuto) ...[
                  const SizedBox(height: 8),
                  RadioGroup<String>(
                    groupValue: _exchangeRateSource,
                    onChanged: (value) async {
                      if (value == null) {
                        return;
                      }
                      setState(() {
                        _exchangeRateSource = value;
                        final synced = _rateForSource(value);
                        final masked = _formatExchangeRateMasked(synced);
                        _exchangeRateByCurrency[currentCurrency] = masked;
                        _exchangeRateController.text = masked;
                      });
                      await _saveDraft();
                    },
                    child: Row(
                      children: [
                        if (allowBcv)
                          Expanded(
                            child: RadioListTile<String>(
                              contentPadding: EdgeInsets.zero,
                              dense: true,
                              value: _exchangeSourceBcv,
                              activeColor: _palette.primary,
                              title: const Text(
                                'Tasa Oficial (BCV)',
                                style: TextStyle(
                                  color: _setupTextHigh,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              subtitle: Text(
                                'BCV: ${_rateBadgeText(_exchangeSourceBcv, quoteCurrency: currentCurrency)}',
                                style: const TextStyle(
                                  color: _setupTextMedium,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                          ),
                        if (allowP2p)
                          Expanded(
                            child: RadioListTile<String>(
                              contentPadding: EdgeInsets.zero,
                              dense: true,
                              value: _exchangeSourceP2pBinance,
                              activeColor: _palette.primary,
                              title: const Text(
                                'Tasa Mercado (P2P)',
                                style: TextStyle(
                                  color: _setupTextHigh,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              subtitle: Text(
                                'Binance: ${_rateBadgeText(_exchangeSourceP2pBinance, quoteCurrency: currentCurrency)}',
                                style: const TextStyle(
                                  color: _setupTextMedium,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                          ),
                        if (allowGoogle)
                          Expanded(
                            child: RadioListTile<String>(
                              contentPadding: EdgeInsets.zero,
                              dense: true,
                              value: _exchangeSourceGoogle,
                              activeColor: _palette.primary,
                              title: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Text(
                                    'Google',
                                    style: TextStyle(
                                      color: _setupTextHigh,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  if (_latestGoogleIsFallback) ...[
                                    const SizedBox(width: 6),
                                    const Icon(
                                      Icons.warning_amber_rounded,
                                      size: 16,
                                      color: Color(0xFFFBBF24),
                                    ),
                                  ],
                                ],
                              ),
                              subtitle: Text(
                                'Google: ${_rateBadgeText(_exchangeSourceGoogle, quoteCurrency: currentCurrency)}',
                                style: const TextStyle(
                                  color: _setupTextMedium,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Fuente: ${_exchangeSourceLabel(_exchangeRateSource)}',
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                      TextButton.icon(
                        onPressed: _showRateHistorySheet,
                        icon: const Icon(Icons.history_rounded, size: 18),
                        label: const Text('Ver historial'),
                        style: TextButton.styleFrom(
                          foregroundColor: Colors.white,
                          textStyle: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (marketRatesFreshnessText != null) ...[
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Container(
                          width: 10,
                          height: 10,
                          decoration: BoxDecoration(
                            color: providerHealth.color,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          marketRatesFreshnessText,
                          style: const TextStyle(
                            color: Colors.white54,
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ],
                  if (_exchangeRateSource == _exchangeSourceGoogle &&
                      selectedProviderFallback) ...[
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        const Icon(
                          Icons.warning_amber_rounded,
                          size: 16,
                          color: Color(0xFFFBBF24),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            providerHealth.message == 'Usando respaldo'
                                ? 'Google esta usando un valor recuperado por fallo de conexion o parseo.'
                                : providerHealth.message,
                            style: const TextStyle(
                              color: Color(0xFFFBBF24),
                              fontSize: 11,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
                if (isExchangeRateEditable)
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _exchangeRateController,
                          enabled: true,
                          enableInteractiveSelection: false,
                          onTap: _forceExchangeRateCursorAtEnd,
                          textAlign: TextAlign.right,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          inputFormatters: <TextInputFormatter>[
                            _MoneyAmountInputFormatter(
                              decimalDigits: _exchangeRateInputDecimalDigits(
                                currentCurrency,
                              ),
                              maxIntegerDigits: 7,
                            ),
                          ],
                          style: const TextStyle(color: _setupTextHigh),
                          decoration: InputDecoration(
                            labelText: 'Tasa manual',
                            prefixText: '1 $baseCurrency = ',
                            suffixText: ' $currentCurrency',
                            hintText: _formatExchangeRateMasked(
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
        if (hasPrimary) ...[
          const SizedBox(height: 18),
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
                  if (!active && selected && currentPayments.length == 1) {
                    if (!mounted) {
                      return;
                    }
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Selecciona al menos un metodo de pago.'),
                      ),
                    );
                    return;
                  }
                  setState(() {
                    if (active) {
                      currentPayments.add(method);
                      currentDrafts.putIfAbsent(
                        method,
                        () => method == 'Efectivo'
                            ? const _PaymentMethodDraft(
                                method: 'Efectivo',
                                extraDetails: _defaultCashNote,
                              )
                            : _PaymentMethodDraft(method: method),
                      );
                    } else {
                      currentPayments.remove(method);
                    }
                  });
                  unawaited(_saveDraft());

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
                              border: Border.all(
                                color: const Color(0xFF3B2F63),
                              ),
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
                                  icon: const Icon(
                                    Icons.edit_rounded,
                                    size: 15,
                                  ),
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
            if (_whatsappE164.isEmpty && _receiveOrdersOnWhatsapp) {
              setState(() => _receiveOrdersOnWhatsapp = false);
            }
            unawaited(_saveDraft());
          },
          validator: (phone) {
            final number = phone?.number.trim() ?? '';
            if (_receiveOrdersOnWhatsapp && number.isEmpty) {
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
              const SizedBox(height: 10),
              TextField(
                controller: _locationNoteController,
                onChanged: (_) => unawaited(_saveDraft()),
                style: const TextStyle(color: _setupTextHigh),
                maxLines: 2,
                decoration: InputDecoration(
                  labelText: 'Referencia (opcional)',
                  hintText: 'Ej. Frente a la plaza, local esquina, piso 2',
                  labelStyle: const TextStyle(color: _setupTextLow),
                  hintStyle: const TextStyle(color: _setupTextLow),
                  filled: true,
                  fillColor: const Color(0xFF120E25),
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
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
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
        SwitchListTile.adaptive(
          value: _receiveOrdersOnWhatsapp,
          onChanged: _whatsappE164.isEmpty
              ? null
              : (value) {
                  setState(() => _receiveOrdersOnWhatsapp = value);
                  unawaited(_saveDraft());
                },
          activeThumbColor: _palette.primary,
          activeTrackColor: _palette.primary.withValues(alpha: 0.45),
          inactiveThumbColor: const Color(0xFFE7E0F9),
          inactiveTrackColor: const Color(0xFF3A305A),
          contentPadding: const EdgeInsets.symmetric(horizontal: 4),
          title: const Text('Mostrar boton de contacto por WhatsApp'),
          subtitle: Text(
            _whatsappE164.isEmpty
                ? 'Agrega un numero para habilitar esta opcion.'
                : 'Muestra un boton para que el cliente te contacte por WhatsApp.',
            style: const TextStyle(color: _setupTextMedium, fontSize: 12),
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
            'Menu',
            style: GoogleFonts.poppins(
              color: _setupTextHigh,
              fontSize: 19,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Digitaliza tu menu o crea manualmente. Debes completar una opcion para continuar.',
            style: TextStyle(color: _setupTextMedium, fontSize: 12),
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
                            ? 'Menu creado con IA'
                            : _menuCatalogCount > 0
                            ? 'Creacion manual completada'
                            : 'Menu pendiente',
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
                      : 'Usa IA o crealo manualmente para completar este paso.',
                  style: const TextStyle(color: _setupTextMedium, fontSize: 12),
                ),
                const SizedBox(height: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    FilledButton.icon(
                      onPressed: _openMenuScan,
                      icon: const Icon(Icons.auto_awesome_rounded),
                      label: Text(
                        _menuScanCompleted
                            ? 'Reescanear con IA'
                            : 'Escanear con IA',
                      ),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: _showComingSoonImport,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: _setupTextHigh,
                        side: const BorderSide(color: Color(0xFF6B5A9A)),
                      ),
                      icon: const Icon(Icons.upload_file_rounded),
                      label: const Text(
                        'Importar archivo (PDF, imagen, CSV, etc.)',
                      ),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: _showComingSoonPrompt,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: _setupTextHigh,
                        side: const BorderSide(color: Color(0xFF6B5A9A)),
                      ),
                      icon: const Icon(Icons.chat_rounded),
                      label: const Text('Crear desde prompt de texto'),
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
                _SummaryTag(label: 'Tarjetas'),
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
                  if (_locationNoteController.text.trim().isNotEmpty)
                    Text(
                      'Referencia: ${_locationNoteController.text.trim()}',
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
                              label: 'Tarjetas',
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

class _MoneyAmountInputFormatter extends TextInputFormatter {
  _MoneyAmountInputFormatter({
    this.decimalDigits = 2,
    this.maxIntegerDigits = 7,
  });

  final int decimalDigits;
  final int maxIntegerDigits;

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final rawDigits = newValue.text.replaceAll(RegExp(r'\D'), '');
    if (rawDigits.isEmpty) {
      return const TextEditingValue(text: '');
    }

    final digits = BigInt.parse(rawDigits);
    final divisor = BigInt.from(10).pow(decimalDigits);
    final integerPart = digits ~/ divisor;
    if (integerPart.toString().length > maxIntegerDigits) {
      return oldValue;
    }
    final decimalPart = (digits % divisor).toString().padLeft(
      decimalDigits,
      '0',
    );

    final integerWithSeparators = integerPart.toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => ',',
    );

    final text = decimalDigits > 0
        ? '$integerWithSeparators.$decimalPart'
        : integerWithSeparators;

    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

class _UpperCaseTextFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final upper = newValue.text.toUpperCase();
    return TextEditingValue(
      text: upper,
      selection: TextSelection.collapsed(offset: upper.length),
      composing: TextRange.empty,
    );
  }
}

class _IdentityDocumentFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final cleaned = newValue.text.toUpperCase().replaceAll(
      RegExp(r'[^A-Z0-9-]'),
      '',
    );
    if (cleaned.isEmpty) {
      return const TextEditingValue(text: '');
    }

    final firstDash = cleaned.indexOf('-');
    final base = (firstDash < 0 ? cleaned : cleaned.substring(0, firstDash))
        .replaceAll('-', '');
    if (base.isEmpty) {
      return const TextEditingValue(text: '');
    }

    final hasVerifierSeparator = firstDash >= 0;
    final verifier = hasVerifierSeparator
        ? cleaned.substring(firstDash + 1).replaceAll('-', '')
        : '';
    final verifierChar = verifier.isEmpty ? '' : verifier[0];

    final hasLetters = RegExp(r'[A-Z]').hasMatch(base);
    final formattedBase = hasLetters
        ? _formatAlphaNumeric(base)
        : _formatNumericWithDots(base);
    final formatted = hasVerifierSeparator
        ? verifierChar.isEmpty
              ? '$formattedBase-'
              : '$formattedBase-$verifierChar'
        : formattedBase;

    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
      composing: TextRange.empty,
    );
  }

  static String _formatNumericWithDots(String digits) {
    return digits.replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '.');
  }

  static String _formatAlphaNumeric(String raw) {
    final chunks = <String>[];
    for (var i = 0; i < raw.length; i += 4) {
      final end = (i + 4 < raw.length) ? i + 4 : raw.length;
      chunks.add(raw.substring(i, end));
    }
    return chunks.join(' ');
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
    'Menu',
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
  static const String _defaultBrandLogoAsset = 'assets/branding/isotipo.png';

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
        child: ClipOval(
          child: Image.asset(
            _defaultBrandLogoAsset,
            width: 56,
            height: 56,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) {
              return const Icon(
                Icons.storefront_rounded,
                color: Color(0xFFD8B4FE),
              );
            },
          ),
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
    if (method == 'Efectivo') {
      return true;
    }
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
    'telefono',
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
      'telefono' => 'Numero de telefono',
      'id' => 'DNI / Cedula',
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

class _ParsedIdentityValue {
  const _ParsedIdentityValue({required this.prefix, required this.document});

  final String prefix;
  final String document;
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
