import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flex_color_picker/flex_color_picker.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image/image.dart' as img;
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/comercio.dart';
import 'package:kosmenu_app/screens/qr_generator_screen.dart';
import 'package:kosmenu_app/services/branding_ai_service.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter/services.dart';

class BusinessSetupScreen extends StatefulWidget {
  const BusinessSetupScreen({super.key, this.initialComercio});

  final ComercioModel? initialComercio;

  @override
  State<BusinessSetupScreen> createState() => _BusinessSetupScreenState();
}

enum _SetupStep { identity, style, checkout, finish }

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

  static const List<String> _currencies = <String>['USD', 'EUR', 'MXN', 'COP'];

  static const List<String> _paymentMethods = <String>[
    'Efectivo',
    'Tarjeta',
    'Transferencia',
    'Pago movil',
  ];

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
  final BrandingAiService _brandingAiService = const BrandingAiService();

  _SetupStep _step = _SetupStep.identity;
  String _selectedCategory = _categories.first;
  String _selectedCurrency = _currencies.first;
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
  String _lastPaletteLogoPath = '';
  String _lastFontLogoPath = '';
  bool _paletteManuallyEdited = false;
  bool _fontManuallyEdited = false;
  String _selectedHeadingFont = 'Poppins';
  bool _showAllFontSuggestions = false;
  String _selectedFooter = 'Simple';
  final Set<String> _selectedPayments = <String>{'Efectivo'};

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

  _PaletteOption get _palette => _paletteSuggestion;

  List<String> get _fontSuggestions =>
      _fontSuggestionsByCategory[_selectedCategory] ??
      _fontSuggestionsByCategory['Otro']!;

  @override
  void initState() {
    super.initState();
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
          .select('id, slug, nombre, logo_url, whatsapp, en_linea, categoria')
          .eq('owner_id', user.id)
          .limit(1)
          .maybeSingle();

      if (row != null) {
        final comercio = ComercioModel.fromMap(Map<String, dynamic>.from(row));
        _applyComercioSeed(comercio, raw: Map<String, dynamic>.from(row));
      }
    } catch (_) {
      // Keep defaults when loading fails.
    } finally {
      if (mounted) {
        setState(() => _loadingExisting = false);
      }
      unawaited(_checkSlugAvailability(_slugController.text));
      final logoPath = _selectedLogo?.path ?? '';
      if (_shouldGeneratePaletteForLogo(logoPath)) {
        unawaited(_refreshSmartStyleSuggestions());
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
      }

      _nameController.text = (map['name'] as String? ?? '').trim();
      _slugController.text = (map['slug'] as String? ?? '').trim();

      final category = (map['category'] as String? ?? '').trim();
      if (_categories.contains(category)) {
        _selectedCategory = category;
      }

      final currency = (map['currency'] as String? ?? '').trim();
      if (_currencies.contains(currency)) {
        _selectedCurrency = currency;
      }

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

      final editingId = (map['editingComercioId'] as String? ?? '').trim();
      if (editingId.isNotEmpty) {
        _editingComercioId = editingId;
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
        _selectedPayments
          ..clear()
          ..addAll(payments);
      }

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

    final prefs = await SharedPreferences.getInstance();
    final payload = <String, dynamic>{
      'step': _step.index,
      'name': _nameController.text.trim(),
      'slug': _normalizeSlug(_slugController.text),
      'category': _selectedCategory,
      'currency': _selectedCurrency,
      'layout': _selectedLayoutId,
      'palette': _selectedPaletteId,
      'palettePrimary': _paletteSuggestion.primary.toARGB32(),
      'paletteAccent': _paletteSuggestion.accent.toARGB32(),
      'paletteSurface': _paletteSuggestion.surface.toARGB32(),
      'paletteText': _paletteSuggestion.text.toARGB32(),
      'headingFont': _selectedHeadingFont,
      'editingComercioId': _editingComercioId ?? '',
      'lastPaletteLogoPath': _lastPaletteLogoPath,
      'lastFontLogoPath': _lastFontLogoPath,
      'paletteManuallyEdited': _paletteManuallyEdited,
      'fontManuallyEdited': _fontManuallyEdited,
      'footer': _selectedFooter,
      'payments': _selectedPayments.toList(),
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

      if (_editingComercioId == null && sameOwner && existingId != null) {
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
              child: SafeArea(
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
          _applyDefaultPalette();
          await _saveDraft();
          return;
        }

        if (action == _LogoPickAction.editCurrent) {
          final currentPath = _selectedLogo?.path;
          if (currentPath == null || currentPath.trim().isEmpty) {
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

  Future<void> _nextStep() async {
    if (_step == _SetupStep.identity && !_canContinueIdentity()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Completa nombre y URL disponible.')),
      );
      return;
    }

    if (_step == _SetupStep.checkout && _selectedPayments.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Selecciona al menos 1 metodo de pago.')),
      );
      return;
    }

    if (_step == _SetupStep.finish) {
      await _saveBusiness();
      return;
    }

    setState(() {
      _step = _SetupStep.values[_step.index + 1];
    });
    await _saveDraft();
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

  void _previousStep() {
    if (_step == _SetupStep.identity) {
      return;
    }

    setState(() {
      _step = _SetupStep.values[_step.index - 1];
    });
    unawaited(_saveDraft());
  }

  Future<ComercioModel> _upsertComercio({
    required User user,
    required String? logoUrl,
  }) async {
    final payload = <String, dynamic>{
      'owner_id': user.id,
      'nombre': _nameController.text.trim(),
      'slug': _normalizeSlug(_slugController.text),
      'categoria': _selectedCategory,
      if (logoUrl != null && logoUrl.trim().isNotEmpty) 'logo_url': logoUrl,
      'moneda': _selectedCurrency,
      'metodo_pago_predeterminado': _selectedPayments.first,
      'metodos_pago': _selectedPayments.toList(),
      'menu_layout': _selectedLayoutId,
      'menu_palette': _selectedPaletteId,
      'menu_font': _selectedHeadingFont,
      'menu_footer': _selectedFooter,
    };

    final removable = <String>{
      'categoria',
      'slug',
      'logo_url',
      'moneda',
      'metodo_pago_predeterminado',
      'metodos_pago',
      'menu_layout',
      'menu_palette',
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

    if (_selectedPayments.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Selecciona al menos 1 metodo de pago.')),
      );
      return;
    }

    setState(() => _saving = true);

    try {
      final logoUrl = await _uploadLogoIfNeeded(user);
      final comercio = await _upsertComercio(user: user, logoUrl: logoUrl);

      SupabaseConfig.setCurrentComercioId(comercio.id, slug: comercio.slug);
      await _clearDraft();

      if (!mounted) {
        return;
      }
      await _openCompletionActions(comercio);
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

  Future<void> _openCompletionActions(ComercioModel comercio) async {
    final url = getPublicMenuUrl(comercio);

    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: const Color(0xFF151029),
      showDragHandle: true,
      builder: (context) {
        return Theme(
          data: Theme.of(context).copyWith(
            textTheme: Theme.of(context).textTheme.apply(
              bodyColor: const Color(0xFFF8F5FF),
              displayColor: const Color(0xFFF8F5FF),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Listo',
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontSize: 21,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.tonalIcon(
                    onPressed: () => Navigator.of(context).pop('preview'),
                    style: FilledButton.styleFrom(
                      foregroundColor: const Color(0xFFF8F5FF),
                      backgroundColor: const Color(0xFF2D2152),
                    ),
                    icon: const Icon(Icons.open_in_browser_rounded),
                    label: const Text('Ver en navegador'),
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () => Navigator.of(context).pop('qr'),
                    icon: const Icon(Icons.qr_code_2_rounded),
                    label: const Text('Continuar a QR'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );

    if (!mounted) {
      return;
    }

    if (action == 'preview') {
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      if (!mounted) {
        return;
      }
    }

    await Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => QrGeneratorScreen(comercio: comercio)),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loadingExisting) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final progress = (_step.index + 1) / _SetupStep.values.length;
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
          title: Text(_isEditing ? 'Editar menu' : 'Crear menu'),
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
                    child: _StepPills(step: _step),
                  ),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 220),
                    child: _showDraftRecoveredHint
                        ? Padding(
                            key: const ValueKey<String>('draft-restored-hint'),
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
                                  border: Border.all(
                                    color: const Color(0xFF3B2F63),
                                  ),
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
                          )
                        : const SizedBox.shrink(
                            key: ValueKey<String>('no-draft-restored-hint'),
                          ),
                  ),
                  Expanded(
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 240),
                      child: Padding(
                        key: ValueKey<_SetupStep>(_step),
                        padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                        child: _buildStepContent(compact),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 6, 14, 14),
                    child: Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _step == _SetupStep.identity
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
                                  : _step == _SetupStep.finish
                                  ? (_isEditing ? 'Guardar' : 'Crear menu')
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
      _SetupStep.finish => _buildFinishStep(),
    };

    return SingleChildScrollView(
      padding: const EdgeInsets.only(bottom: 12),
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
              labelStyle: const TextStyle(color: _setupTextHigh, fontSize: 14),
              side: BorderSide(
                color: selected ? _palette.primary : const Color(0xFF3B2F63),
              ),
              showCheckmark: false,
            );
          }).toList(),
        ),
        const SizedBox(height: 14),
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DropdownButtonFormField<String>(
          key: ValueKey<String>('currency-$_selectedCurrency'),
          initialValue: _selectedCurrency,
          decoration: _fieldDecoration('Moneda', Icons.attach_money_rounded),
          dropdownColor: const Color(0xFF1A1432),
          style: const TextStyle(color: Colors.white),
          items: _currencies
              .map(
                (item) =>
                    DropdownMenuItem<String>(value: item, child: Text(item)),
              )
              .toList(),
          onChanged: (value) {
            if (value == null) return;
            setState(() => _selectedCurrency = value);
            unawaited(_saveDraft());
          },
        ),
        const SizedBox(height: 14),
        Text(
          'Metodos de pago',
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
          children: _paymentMethods.map((method) {
            final selected = _selectedPayments.contains(method);
            return FilterChip(
              label: Text(method),
              selected: selected,
              onSelected: (active) {
                setState(() {
                  if (active) {
                    _selectedPayments.add(method);
                  } else if (_selectedPayments.length > 1) {
                    _selectedPayments.remove(method);
                  }
                });
                unawaited(_saveDraft());
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
      ],
    );
  }

  Widget _buildFinishStep() {
    final base = AppLinks.productionUrl;
    final slug = _normalizeSlug(_slugController.text);

    return Container(
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
            _nameController.text.trim().isEmpty
                ? 'Tu menu'
                : _nameController.text.trim(),
            style: _headingFontStyle(
              color: _setupTextHigh,
              fontSize: 24,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '$base/v/$slug',
            style: GoogleFonts.poppins(
              color: _palette.text.withValues(alpha: 0.8),
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 14),
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
              _SummaryTag(label: _selectedCurrency),
              _SummaryTag(label: _selectedPayments.join(' + ')),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 240,
            child: Container(
              decoration: BoxDecoration(
                color: _palette.surface,
                borderRadius: BorderRadius.circular(14),
              ),
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 30,
                        height: 30,
                        decoration: BoxDecoration(
                          color: _palette.primary.withValues(alpha: 0.22),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(
                          Icons.menu_book_rounded,
                          color: _palette.primary,
                          size: 18,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Vista previa',
                        style: GoogleFonts.poppins(
                          color: _palette.text,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Expanded(
                    child: GridView.count(
                      crossAxisCount: 2,
                      mainAxisSpacing: 8,
                      crossAxisSpacing: 8,
                      childAspectRatio: 1.18,
                      physics: const NeverScrollableScrollPhysics(),
                      children: List.generate(4, (index) {
                        return Container(
                          decoration: BoxDecoration(
                            color: _palette.primary.withValues(alpha: 0.16),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: _palette.primary.withValues(alpha: 0.38),
                            ),
                          ),
                        );
                      }),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
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
  const _StepPills({required this.step});

  final _SetupStep step;

  static const List<String> _labels = <String>[
    'Marca',
    'Estilo',
    'Pagos',
    'Final',
  ];

  @override
  Widget build(BuildContext context) {
    return Row(
      children: List.generate(_labels.length, (index) {
        final active = index == step.index;
        final done = index < step.index;

        return Expanded(
          child: Container(
            margin: EdgeInsets.only(right: index == _labels.length - 1 ? 0 : 6),
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(
              color: active
                  ? const Color(0xFF6D28D9)
                  : done
                  ? const Color(0xFF2D2152)
                  : const Color(0xFF17122E),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF3B2F63)),
            ),
            child: Center(
              child: Text(
                _labels[index],
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: _setupTextHigh,
                  fontSize: 14,
                  fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ),
          ),
        );
      }),
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
          errorBuilder: (_, __, ___) => _logoFallback(),
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
