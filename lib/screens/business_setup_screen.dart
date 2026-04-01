import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/comercio.dart';
import 'package:kosmenu_app/screens/qr_generator_screen.dart';
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

class _BusinessSetupScreenState extends State<BusinessSetupScreen> {
  static const String _draftKeyPrefix = 'business_setup_draft_v2';

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

  final List<_PaletteOption> _palettes = const <_PaletteOption>[
    _PaletteOption(
      id: 'uva',
      name: 'Uva',
      primary: Color(0xFF6D28D9),
      surface: Color(0xFF1B1238),
      text: Color(0xFFF3E8FF),
    ),
    _PaletteOption(
      id: 'cafe',
      name: 'Cafe',
      primary: Color(0xFFD97706),
      surface: Color(0xFF2A1A11),
      text: Color(0xFFFFEDD5),
    ),
    _PaletteOption(
      id: 'oliva',
      name: 'Oliva',
      primary: Color(0xFF4D7C0F),
      surface: Color(0xFF172413),
      text: Color(0xFFECFCCB),
    ),
    _PaletteOption(
      id: 'oceano',
      name: 'Oceano',
      primary: Color(0xFF0369A1),
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

  _SetupStep _step = _SetupStep.identity;
  String _selectedCategory = _categories.first;
  String _selectedCurrency = _currencies.first;
  String _selectedLayoutId = 'cards';
  String _selectedPaletteId = 'uva';
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

  _PaletteOption get _palette => _palettes.firstWhere(
    (item) => item.id == _selectedPaletteId,
    orElse: () => _palettes.first,
  );

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
      if (_palettes.any((item) => item.id == palette)) {
        _selectedPaletteId = palette;
      }

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
          .select('id')
          .eq('slug', slug)
          .limit(1)
          .maybeSingle();

      final existingId = row?['id']?.toString().trim();
      final sameBusiness =
          existingId != null &&
          _editingComercioId != null &&
          existingId == _editingComercioId;

      if (!mounted) return;
      setState(() {
        _checkingSlug = false;
        _isSlugAvailable = row == null || sameBusiness;
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
          setState(() => _selectedLogo = null);
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

          setState(() => _selectedLogo = XFile(persistedPath));
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

        setState(() => _selectedLogo = XFile(persistedPath));
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
    return switch (_step) {
      _SetupStep.identity => _buildIdentityStep(compact),
      _SetupStep.style => _buildStyleStep(),
      _SetupStep.checkout => _buildCheckoutStep(),
      _SetupStep.finish => _buildFinishStep(),
    };
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
            setState(() => _selectedCategory = value);
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
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: _palettes.map((palette) {
            final selected = _selectedPaletteId == palette.id;
            return _PaletteChip(
              palette: palette,
              selected: selected,
              onTap: () {
                setState(() => _selectedPaletteId = palette.id);
                unawaited(_saveDraft());
              },
            );
          }).toList(),
        ),
        const SizedBox(height: 14),
        Text(
          'Footer',
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
          children: _footers.map((footer) {
            final selected = _selectedFooter == footer;
            return ChoiceChip(
              label: Text(footer),
              selected: selected,
              onSelected: (_) {
                setState(() => _selectedFooter = footer);
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
            style: GoogleFonts.poppins(
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
              _SummaryTag(label: _selectedFooter),
              _SummaryTag(label: _selectedPayments.join(' + ')),
            ],
          ),
          const SizedBox(height: 16),
          Expanded(
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

class _PaletteChip extends StatelessWidget {
  const _PaletteChip({
    required this.palette,
    required this.selected,
    required this.onTap,
  });

  final _PaletteOption palette;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        width: 128,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: const Color(0xFF17122E),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? palette.primary : const Color(0xFF3B2F63),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              palette.name,
              style: const TextStyle(
                color: _setupTextHigh,
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                _PaletteDot(color: palette.primary),
                const SizedBox(width: 6),
                _PaletteDot(color: palette.surface),
                const SizedBox(width: 6),
                _PaletteDot(color: palette.text),
              ],
            ),
          ],
        ),
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
    required this.surface,
    required this.text,
  });

  final String id;
  final String name;
  final Color primary;
  final Color surface;
  final Color text;
}
