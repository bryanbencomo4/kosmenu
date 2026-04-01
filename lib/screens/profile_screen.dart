import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/core/theme/app_theme.dart';
import 'package:kosmenu_app/services/branding_ai_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

enum LayoutType { list, grid, compact }

class BrandingDraft {
  BrandingDraft({
    this.schemaVersion = 2,
    this.colorPrincipal = '#9C6644',
    this.colorSecundario = '#E6B566',
    this.fuenteTitulos = 'Montserrat',
    this.fuenteCuerpo = 'Roboto',
    this.estiloBotones = 'rounded',
    this.moodTags = const <String>[],
    this.descripcionVisual = '',
    this.layoutType = LayoutType.list,
    this.itemsPerRow = 1,
    this.menuSticky = true,
    this.showImages = true,
    this.metodosPago = const <String>['efectivo', 'transferencia'],
    this.monedaDefault = 'COP',
    this.background = '#0F0D0B',
    this.cardSurface = '#1A140E',
    this.textOnPrimary = '#FFFFFF',
  });

  final int schemaVersion;
  final String colorPrincipal;
  final String colorSecundario;
  final String fuenteTitulos;
  final String fuenteCuerpo;
  final String estiloBotones;
  final List<String> moodTags;
  final String descripcionVisual;
  final LayoutType layoutType;
  final int itemsPerRow;
  final bool menuSticky;
  final bool showImages;
  final List<String> metodosPago;
  final String monedaDefault;
  final String background;
  final String cardSurface;
  final String textOnPrimary;

  BrandingDraft copyWith({
    String? colorPrincipal,
    String? colorSecundario,
    String? fuenteTitulos,
    String? fuenteCuerpo,
    String? estiloBotones,
    List<String>? moodTags,
    String? descripcionVisual,
    LayoutType? layoutType,
    int? itemsPerRow,
    bool? menuSticky,
    bool? showImages,
    List<String>? metodosPago,
    String? monedaDefault,
    String? background,
    String? cardSurface,
    String? textOnPrimary,
  }) {
    return BrandingDraft(
      schemaVersion: schemaVersion,
      colorPrincipal: colorPrincipal ?? this.colorPrincipal,
      colorSecundario: colorSecundario ?? this.colorSecundario,
      fuenteTitulos: fuenteTitulos ?? this.fuenteTitulos,
      fuenteCuerpo: fuenteCuerpo ?? this.fuenteCuerpo,
      estiloBotones: estiloBotones ?? this.estiloBotones,
      moodTags: moodTags ?? this.moodTags,
      descripcionVisual: descripcionVisual ?? this.descripcionVisual,
      layoutType: layoutType ?? this.layoutType,
      itemsPerRow: itemsPerRow ?? this.itemsPerRow,
      menuSticky: menuSticky ?? this.menuSticky,
      showImages: showImages ?? this.showImages,
      metodosPago: metodosPago ?? this.metodosPago,
      monedaDefault: monedaDefault ?? this.monedaDefault,
      background: background ?? this.background,
      cardSurface: cardSurface ?? this.cardSurface,
      textOnPrimary: textOnPrimary ?? this.textOnPrimary,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'schema_version': schemaVersion,
      'color_principal': colorPrincipal,
      'color_secundario': colorSecundario,
      'fuente_titulos': fuenteTitulos,
      'fuente_cuerpo': fuenteCuerpo,
      'estilo_botones': estiloBotones,
      'mood_tags': moodTags,
      'descripcion_visual': descripcionVisual,
      'layout_type': layoutType.name,
      'config_visual': {
        'items_per_row': itemsPerRow,
        'menu_sticky': menuSticky,
        'show_images': showImages,
      },
      'config_negocio': {
        'metodos_pago': metodosPago,
        'moneda_default': monedaDefault,
      },
      'colores_personalizados': {
        'background': background,
        'card_surface': cardSurface,
        'text_on_primary': textOnPrimary,
      },
    };
  }

  static BrandingDraft fromDynamic(dynamic value) {
    final map = value is Map<String, dynamic>
        ? value
        : value is Map
        ? value.map((key, item) => MapEntry('$key', item))
        : <String, dynamic>{};

    final visual = _mapValue(map['config_visual']);
    final negocio = _mapValue(map['config_negocio']);
    final colores = _mapValue(map['colores_personalizados']);
    final layoutRaw =
        (map['layout_type']?.toString().trim().toLowerCase() ?? '');

    final layoutType = LayoutType.values.firstWhere(
      (layout) => layout.name == layoutRaw,
      orElse: () => LayoutType.list,
    );

    final items =
        int.tryParse('${visual['items_per_row'] ?? ''}') ??
        (layoutType == LayoutType.grid ? 2 : 1);

    return BrandingDraft(
      schemaVersion: 2,
      colorPrincipal: _hexOrDefault(map['color_principal'], '#9C6644'),
      colorSecundario: _hexOrDefault(map['color_secundario'], '#E6B566'),
      fuenteTitulos: _textOrDefault(map['fuente_titulos'], 'Montserrat'),
      fuenteCuerpo: _textOrDefault(map['fuente_cuerpo'], 'Roboto'),
      estiloBotones: _textOrDefault(map['estilo_botones'], 'rounded'),
      moodTags: _stringList(map['mood_tags']),
      descripcionVisual: _textOrDefault(map['descripcion_visual'], ''),
      layoutType: layoutType,
      itemsPerRow: items.clamp(1, 3),
      menuSticky: _boolOrDefault(visual['menu_sticky'], true),
      showImages: _boolOrDefault(
        visual['show_images'],
        layoutType != LayoutType.compact,
      ),
      metodosPago: _stringList(negocio['metodos_pago']).isEmpty
          ? const <String>['efectivo', 'transferencia']
          : _stringList(negocio['metodos_pago']),
      monedaDefault: _currencyOrDefault(negocio['moneda_default'], 'COP'),
      background: _hexOrDefault(colores['background'], '#0F0D0B'),
      cardSurface: _hexOrDefault(colores['card_surface'], '#1A140E'),
      textOnPrimary: _hexOrDefault(colores['text_on_primary'], '#FFFFFF'),
    );
  }

  static Map<String, dynamic> _mapValue(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) {
      return value.map((key, item) => MapEntry('$key', item));
    }
    return <String, dynamic>{};
  }

  static String _textOrDefault(dynamic value, String fallback) {
    final text = value?.toString().trim() ?? '';
    return text.isEmpty ? fallback : text;
  }

  static String _hexOrDefault(dynamic value, String fallback) {
    final text = _textOrDefault(value, fallback);
    final raw = text.startsWith('#') ? text : '#$text';
    return RegExp(r'^#[0-9A-Fa-f]{6}$').hasMatch(raw)
        ? raw.toUpperCase()
        : fallback;
  }

  static bool _boolOrDefault(dynamic value, bool fallback) {
    if (value is bool) return value;
    return fallback;
  }

  static String _currencyOrDefault(dynamic value, String fallback) {
    final text = _textOrDefault(value, fallback).toUpperCase();
    return RegExp(r'^[A-Z]{3}$').hasMatch(text) ? text : fallback;
  }

  static List<String> _stringList(dynamic value) {
    if (value is! List) return const <String>[];
    return value
        .map((item) => item?.toString().trim().toLowerCase() ?? '')
        .where((item) => item.isNotEmpty)
        .toSet()
        .toList();
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! BrandingDraft) return false;
    return toJson().toString() == other.toJson().toString();
  }

  @override
  int get hashCode => toJson().toString().hashCode;
}

class BrandingEditorController extends ChangeNotifier {
  BrandingDraft _persisted = BrandingDraft();
  BrandingDraft _draft = BrandingDraft();

  BrandingDraft get draft => _draft;
  bool get isDirty => _draft != _persisted;

  void loadFrom(dynamic brandingValue) {
    final loaded = BrandingDraft.fromDynamic(brandingValue);
    _persisted = loaded;
    _draft = loaded;
    notifyListeners();
  }

  void applyAi(dynamic brandingValue) {
    _draft = BrandingDraft.fromDynamic(brandingValue);
    notifyListeners();
  }

  void markSaved() {
    _persisted = _draft;
    notifyListeners();
  }

  void discardChanges() {
    _draft = _persisted;
    notifyListeners();
  }

  void updateLayoutType(LayoutType layout) {
    final suggestedItems = layout == LayoutType.grid ? 2 : 1;
    _draft = _draft.copyWith(
      layoutType: layout,
      itemsPerRow: _draft.itemsPerRow.clamp(1, 3),
      showImages: layout == LayoutType.compact ? false : _draft.showImages,
    );
    if (_draft.itemsPerRow < 1 || _draft.itemsPerRow > 3) {
      _draft = _draft.copyWith(itemsPerRow: suggestedItems);
    }
    notifyListeners();
  }

  void updateItemsPerRow(int value) {
    _draft = _draft.copyWith(itemsPerRow: value.clamp(1, 3));
    notifyListeners();
  }

  void updateMenuSticky(bool value) {
    _draft = _draft.copyWith(menuSticky: value);
    notifyListeners();
  }

  void updateShowImages(bool value) {
    _draft = _draft.copyWith(showImages: value);
    notifyListeners();
  }

  void updateColorPrincipal(String value) {
    _draft = _draft.copyWith(
      colorPrincipal: BrandingDraft._hexOrDefault(value, _draft.colorPrincipal),
    );
    notifyListeners();
  }

  void updateColorSecundario(String value) {
    _draft = _draft.copyWith(
      colorSecundario: BrandingDraft._hexOrDefault(
        value,
        _draft.colorSecundario,
      ),
    );
    notifyListeners();
  }

  void updateBackground(String value) {
    _draft = _draft.copyWith(
      background: BrandingDraft._hexOrDefault(value, _draft.background),
    );
    notifyListeners();
  }

  void updateCardSurface(String value) {
    _draft = _draft.copyWith(
      cardSurface: BrandingDraft._hexOrDefault(value, _draft.cardSurface),
    );
    notifyListeners();
  }

  void updateTextOnPrimary(String value) {
    _draft = _draft.copyWith(
      textOnPrimary: BrandingDraft._hexOrDefault(value, _draft.textOnPrimary),
    );
    notifyListeners();
  }

  void updateMonedaDefault(String value) {
    _draft = _draft.copyWith(
      monedaDefault: BrandingDraft._currencyOrDefault(
        value,
        _draft.monedaDefault,
      ),
    );
    notifyListeners();
  }

  void toggleMetodoPago(String method, bool selected) {
    final normalized = method.trim().toLowerCase();
    if (normalized.isEmpty) return;
    final next = {..._draft.metodosPago};
    if (selected) {
      next.add(normalized);
    } else {
      next.remove(normalized);
    }
    _draft = _draft.copyWith(metodosPago: next.toList());
    notifyListeners();
  }
}

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final BrandingAiService _brandingAiService = const BrandingAiService();
  final BrandingEditorController _brandingEditor = BrandingEditorController();
  final TextEditingController _brandingPromptController =
      TextEditingController();
  late Future<Map<String, dynamic>?> _businessFuture;
  Future<List<void>>? _brandingFontsFuture;
  String _brandingFontsKey = '';
  bool _signingOut = false;
  bool _isGeneratingBranding = false;

  @override
  void initState() {
    super.initState();
    _businessFuture = _loadBusiness();
    _brandingEditor.addListener(_onBrandingDraftChanged);
  }

  void _onBrandingDraftChanged() {
    _registerBrandingFonts(_brandingEditor.draft.toJson());
    if (mounted) {
      setState(() {});
    }
  }

  @override
  void dispose() {
    _brandingEditor.removeListener(_onBrandingDraftChanged);
    _brandingPromptController.dispose();
    _brandingEditor.dispose();
    super.dispose();
  }

  Future<Map<String, dynamic>?> _loadBusiness() async {
    if (!SupabaseConfig.hasCurrentComercioId) return null;

    final row = await Supabase.instance.client
        .from('comercios')
        .select()
        .eq('id', SupabaseConfig.currentComercioId)
        .limit(1)
        .maybeSingle();

    if (row == null) return null;
    final business = Map<String, dynamic>.from(row as Map);
    final comercioId = business['id']?.toString().trim() ?? '';
    final comercioSlug = business['slug']?.toString().trim();
    if (comercioId.isNotEmpty) {
      SupabaseConfig.setCurrentComercioId(comercioId, slug: comercioSlug);
    }
    _brandingEditor.loadFrom(business['branding_ia']);
    _registerBrandingFonts(business['branding_ia']);
    return business;
  }

  String _displayName(User user) {
    final metadata = user.userMetadata ?? const <String, dynamic>{};
    final fullName = (metadata['full_name'] ?? metadata['name'] ?? '')
        .toString()
        .trim();
    if (fullName.isNotEmpty) return fullName;
    final email = user.email?.trim() ?? '';
    return email.isNotEmpty ? email : 'Usuario Kosmenu';
  }

  String _avatarUrl(User user) {
    final metadata = user.userMetadata ?? const <String, dynamic>{};
    return (metadata['avatar_url'] ?? metadata['picture'] ?? '')
        .toString()
        .trim();
  }

  String _avatarInitial(String name) {
    final clean = name.trim();
    if (clean.isEmpty) return 'K';
    return clean.substring(0, 1).toUpperCase();
  }

  Future<void> _signOut() async {
    if (_signingOut) return;

    setState(() => _signingOut = true);
    try {
      await Supabase.instance.client.auth.signOut();
      SupabaseConfig.clearCurrentComercioId();
      if (!mounted) return;
      Navigator.of(context).popUntil((route) => route.isFirst);
    } on AuthException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo cerrar sesion: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _signingOut = false);
      }
    }
  }

  Future<void> _refreshBusiness() async {
    final future = _loadBusiness();
    setState(() {
      _businessFuture = future;
    });
    await future;
  }

  Future<void> _saveBrandingDraft(Map<String, dynamic> business) async {
    final comercioId = business['id']?.toString().trim() ?? '';
    if (comercioId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se encontró el comercio activo.')),
      );
      return;
    }

    try {
      await Supabase.instance.client
          .from('comercios')
          .update({'branding_ia': _brandingEditor.draft.toJson()})
          .eq('id', comercioId);

      _brandingEditor.markSaved();
      await _refreshBusiness();

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Branding guardado correctamente.'),
          backgroundColor: Color(0xFF1E8E5A),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar branding: $error')),
      );
    }
  }

  void _discardBrandingDraft() {
    _brandingEditor.discardChanges();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Se descartaron los cambios locales.')),
    );
  }

  Future<void> _generateBranding(Map<String, dynamic> business) async {
    if (_isGeneratingBranding) return;

    final prompt = _brandingPromptController.text.trim();
    if (prompt.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Describe primero el estilo que quieres para tu negocio.',
          ),
        ),
      );
      return;
    }

    final comercioId = business['id']?.toString().trim() ?? '';
    if (comercioId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No hay un comercio activo para generar el diseño.'),
        ),
      );
      return;
    }

    setState(() => _isGeneratingBranding = true);

    try {
      final response = await _brandingAiService.generateBranding(
        comercioId: comercioId,
        promptUsuario: prompt,
        imageUrl: business['logo_url']?.toString(),
      );

      _brandingEditor.applyAi(response['branding_ia']);
      final pendingFonts = _registerBrandingFonts(
        _brandingEditor.draft.toJson(),
      );
      if (pendingFonts != null) {
        await pendingFonts;
      }
      _brandingPromptController.clear();

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Propuesta IA aplicada al editor. Revisa y guarda cambios.',
          ),
          backgroundColor: Color(0xFF1E8E5A),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo generar el diseño con IA: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _isGeneratingBranding = false);
      }
    }
  }

  Future<List<void>>? _registerBrandingFonts(dynamic brandingValue) {
    final branding = _brandingMap(brandingValue);
    if (branding == null) {
      _brandingFontsKey = '';
      _brandingFontsFuture = null;
      return null;
    }

    final titleFont = (branding['fuente_titulos']?.toString() ?? '').trim();
    final bodyFont = (branding['fuente_cuerpo']?.toString() ?? '').trim();
    final fontStyles = <TextStyle>[];

    if (_isGoogleFontAvailable(titleFont)) {
      fontStyles.add(GoogleFonts.getFont(titleFont));
    }
    if (_isGoogleFontAvailable(bodyFont) &&
        bodyFont.toLowerCase() != titleFont.toLowerCase()) {
      fontStyles.add(GoogleFonts.getFont(bodyFont));
    }

    final nextKey = '${titleFont.toLowerCase()}|${bodyFont.toLowerCase()}';
    if (fontStyles.isEmpty) {
      _brandingFontsKey = nextKey;
      _brandingFontsFuture = null;
      return null;
    }

    if (_brandingFontsKey == nextKey && _brandingFontsFuture != null) {
      return _brandingFontsFuture;
    }

    final pendingFonts = GoogleFonts.pendingFonts(fontStyles);
    _brandingFontsKey = nextKey;
    _brandingFontsFuture = pendingFonts;
    return pendingFonts;
  }

  bool _isGoogleFontAvailable(String fontName) {
    if (fontName.trim().isEmpty) {
      return false;
    }
    return GoogleFonts.asMap().containsKey(fontName.trim());
  }

  TextStyle _previewFontStyle({
    required String fontFamily,
    required TextStyle fallback,
  }) {
    final normalizedFont = fontFamily.trim();
    if (!_isGoogleFontAvailable(normalizedFont)) {
      return fallback;
    }

    try {
      return GoogleFonts.getFont(normalizedFont, textStyle: fallback);
    } catch (_) {
      return fallback;
    }
  }

  Map<String, dynamic>? _brandingMap(dynamic value) {
    if (value is Map<String, dynamic>) {
      return value;
    }
    if (value is Map) {
      return value.map((key, item) => MapEntry('$key', item));
    }
    return null;
  }

  List<String> _brandingMoodTags(dynamic value) {
    if (value is! List) {
      return const <String>[];
    }
    return value
        .map((item) => item?.toString().trim() ?? '')
        .where((item) => item.isNotEmpty)
        .toList();
  }

  Color _parseHexColor(String? value, Color fallback) {
    final raw = (value ?? '').trim();
    if (!RegExp(r'^#?[0-9A-Fa-f]{6}$').hasMatch(raw)) {
      return fallback;
    }
    final hex = raw.startsWith('#') ? raw.substring(1) : raw;
    return Color(int.parse('FF$hex', radix: 16));
  }

  Widget _buildColorSwatch({
    required String label,
    required String value,
    required Color fallback,
  }) {
    final theme = Theme.of(context);
    final color = _parseHexColor(value, fallback);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.borderSubtle),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: theme.textTheme.labelMedium?.copyWith(
                color: AppColors.textSoft,
              ),
            ),
            const SizedBox(height: 10),
            Container(
              height: 42,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              value,
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.textSoft,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBrandingPreview(BrandingDraft branding) {
    final theme = Theme.of(context);
    final colorPrincipal = branding.colorPrincipal;
    final colorSecundario = branding.colorSecundario;
    final fuenteTitulos = branding.fuenteTitulos;
    final fuenteCuerpo = branding.fuenteCuerpo;
    final estiloBotones = branding.estiloBotones;
    final descripcionVisual = branding.descripcionVisual;
    final moodTags = branding.moodTags;
    final titlePreviewStyle = _previewFontStyle(
      fontFamily: fuenteTitulos,
      fallback: GoogleFonts.montserrat(
        color: AppColors.textStrong,
        fontSize: 24,
        fontWeight: FontWeight.w700,
      ),
    );
    final bodyPreviewStyle = _previewFontStyle(
      fontFamily: fuenteCuerpo,
      fallback: GoogleFonts.roboto(
        color: AppColors.textSoft,
        fontSize: 14,
        height: 1.5,
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Vista previa en vivo', style: theme.textTheme.titleMedium),
        const SizedBox(height: 12),
        Row(
          children: [
            _buildColorSwatch(
              label: 'Color principal',
              value: colorPrincipal,
              fallback: const Color(0xFF9C6644),
            ),
            const SizedBox(width: 10),
            _buildColorSwatch(
              label: 'Color secundario',
              value: colorSecundario,
              fallback: const Color(0xFFE6B566),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Text('Titulares: $fuenteTitulos', style: theme.textTheme.bodyMedium),
        const SizedBox(height: 4),
        Text('Cuerpo: $fuenteCuerpo', style: theme.textTheme.bodyMedium),
        const SizedBox(height: 4),
        Text('Botones: $estiloBotones', style: theme.textTheme.bodyMedium),
        const SizedBox(height: 4),
        Text(
          'Layout: ${branding.layoutType.name} | Items por fila: ${branding.itemsPerRow}',
          style: theme.textTheme.bodyMedium,
        ),
        const SizedBox(height: 4),
        Text(
          'Sticky menu: ${branding.menuSticky ? 'si' : 'no'} | Mostrar imagenes: ${branding.showImages ? 'si' : 'no'}',
          style: theme.textTheme.bodyMedium,
        ),
        const SizedBox(height: 4),
        Text(
          'Moneda: ${branding.monedaDefault} | Metodos: ${branding.metodosPago.join(', ')}',
          style: theme.textTheme.bodyMedium,
        ),
        const SizedBox(height: 12),
        FutureBuilder<List<void>>(
          future: _brandingFontsFuture,
          builder: (context, snapshot) {
            final isLoadingFonts =
                snapshot.connectionState != ConnectionState.done &&
                _brandingFontsFuture != null;

            return Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.surfaceMuted,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.borderSubtle),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (isLoadingFonts) ...[
                    Row(
                      children: [
                        const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'Descargando las fuentes elegidas por la IA para mostrarte la vista real...',
                            style: theme.textTheme.bodySmall,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                  ],
                  Text('Sabores con identidad', style: titlePreviewStyle),
                  const SizedBox(height: 8),
                  Text(
                    'Esta es una muestra real de cómo se verán tus títulos y textos cuando la marca se renderice con las fuentes seleccionadas.',
                    style: bodyPreviewStyle,
                  ),
                ],
              ),
            );
          },
        ),
        if (moodTags.isNotEmpty) ...[
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: moodTags
                .map(
                  (tag) => Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.accentSoft,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: AppColors.borderSubtle),
                    ),
                    child: Text(
                      tag,
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: AppColors.textStrong,
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
        ],
        if (descripcionVisual.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(descripcionVisual, style: theme.textTheme.bodyMedium),
        ],
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Perfil')),
        body: const Center(child: Text('No hay sesion activa.')),
      );
    }

    final name = _displayName(user);
    final email = user.email ?? 'Sin correo';
    final avatar = _avatarUrl(user);

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(title: const Text('Perfil')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                gradient: const LinearGradient(
                  colors: [AppColors.surface, AppColors.surfaceMuted],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                border: Border.all(color: AppColors.borderSubtle),
                boxShadow: AppTheme.softShadow,
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 34,
                    backgroundColor: colorScheme.primary.withValues(
                      alpha: 0.12,
                    ),
                    backgroundImage: avatar.isNotEmpty
                        ? NetworkImage(avatar)
                        : null,
                    child: avatar.isEmpty
                        ? Text(
                            _avatarInitial(name),
                            style: theme.textTheme.headlineMedium?.copyWith(
                              color: colorScheme.primary,
                            ),
                          )
                        : null,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleLarge,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          email,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyMedium,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            FutureBuilder<Map<String, dynamic>?>(
              future: _businessFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Card(
                    child: Padding(
                      padding: EdgeInsets.all(16),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  );
                }

                if (snapshot.hasError) {
                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        'No se pudo cargar el negocio: ${snapshot.error}',
                        style: theme.textTheme.bodyMedium,
                      ),
                    ),
                  );
                }

                final business = snapshot.data;
                if (business == null) {
                  return const Card(
                    child: Padding(
                      padding: EdgeInsets.all(16),
                      child: Text(
                        'No se encontro informacion del negocio actual.',
                      ),
                    ),
                  );
                }

                return Card(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Negocio actual',
                          style: theme.textTheme.titleMedium,
                        ),
                        const SizedBox(height: 10),
                        Text(
                          business['nombre']?.toString() ?? 'Sin nombre',
                          style: theme.textTheme.titleLarge,
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Categoria: ${(business['categoria'] ?? 'No definida').toString()}',
                          style: theme.textTheme.bodyMedium,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'WhatsApp: ${(business['whatsapp'] ?? 'No configurado').toString()}',
                          style: theme.textTheme.bodyMedium,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'ID: ${(business['id'] ?? '').toString()}',
                          style: const TextStyle(
                            color: AppColors.textSoft,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 18),
                        TextFormField(
                          controller: _brandingPromptController,
                          enabled: !_isGeneratingBranding,
                          minLines: 2,
                          maxLines: 4,
                          decoration: InputDecoration(
                            labelText: 'Describe el estilo de tu marca',
                            hintText: 'Quiero algo minimalista y elegante',
                          ),
                        ),
                        const SizedBox(height: 12),
                        FilledButton.icon(
                          onPressed: _isGeneratingBranding
                              ? null
                              : () => _generateBranding(business),
                          icon: const Icon(Icons.auto_awesome_rounded),
                          label: const Text('Diseño con IA'),
                        ),
                        if (_isGeneratingBranding) ...[
                          const SizedBox(height: 14),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: AppColors.surfaceMuted,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: AppColors.borderSubtle),
                            ),
                            child: Row(
                              children: [
                                const SizedBox(
                                  width: 22,
                                  height: 22,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2.4,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    'La IA está afinando una identidad visual con más sabor para tu negocio...',
                                    style: theme.textTheme.bodyMedium,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                        const SizedBox(height: 16),
                        AnimatedBuilder(
                          animation: _brandingEditor,
                          builder: (context, _) {
                            final draft = _brandingEditor.draft;
                            final paymentOptions = const <String>[
                              'efectivo',
                              'transferencia',
                              'nequi',
                              'daviplata',
                              'tarjeta',
                            ];

                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Editor de Layout y Estilos',
                                  style: theme.textTheme.titleMedium,
                                ),
                                const SizedBox(height: 12),
                                SegmentedButton<LayoutType>(
                                  segments: const [
                                    ButtonSegment(
                                      value: LayoutType.list,
                                      label: Text('List'),
                                      icon: Icon(Icons.view_agenda_outlined),
                                    ),
                                    ButtonSegment(
                                      value: LayoutType.grid,
                                      label: Text('Grid'),
                                      icon: Icon(Icons.grid_view_rounded),
                                    ),
                                    ButtonSegment(
                                      value: LayoutType.compact,
                                      label: Text('Compact'),
                                      icon: Icon(Icons.view_headline_rounded),
                                    ),
                                  ],
                                  selected: {draft.layoutType},
                                  onSelectionChanged: (selection) {
                                    if (selection.isNotEmpty) {
                                      _brandingEditor.updateLayoutType(
                                        selection.first,
                                      );
                                    }
                                  },
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  'Items por fila: ${draft.itemsPerRow}',
                                  style: const TextStyle(color: Colors.white70),
                                ),
                                Slider(
                                  value: draft.itemsPerRow.toDouble(),
                                  min: 1,
                                  max: 3,
                                  divisions: 2,
                                  label: '${draft.itemsPerRow}',
                                  onChanged: (value) {
                                    _brandingEditor.updateItemsPerRow(
                                      value.round(),
                                    );
                                  },
                                ),
                                SwitchListTile.adaptive(
                                  value: draft.menuSticky,
                                  contentPadding: EdgeInsets.zero,
                                  title: const Text(
                                    'Menu sticky',
                                    style: TextStyle(color: Colors.white),
                                  ),
                                  onChanged: _brandingEditor.updateMenuSticky,
                                ),
                                SwitchListTile.adaptive(
                                  value: draft.showImages,
                                  contentPadding: EdgeInsets.zero,
                                  title: const Text(
                                    'Mostrar imagenes',
                                    style: TextStyle(color: Colors.white),
                                  ),
                                  onChanged: _brandingEditor.updateShowImages,
                                ),
                                const SizedBox(height: 8),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: paymentOptions.map((method) {
                                    final selected = draft.metodosPago.contains(
                                      method,
                                    );
                                    return FilterChip(
                                      selected: selected,
                                      label: Text(method),
                                      onSelected: (value) {
                                        _brandingEditor.toggleMetodoPago(
                                          method,
                                          value,
                                        );
                                      },
                                    );
                                  }).toList(),
                                ),
                                const SizedBox(height: 12),
                                TextFormField(
                                  initialValue: draft.monedaDefault,
                                  onChanged:
                                      _brandingEditor.updateMonedaDefault,
                                  maxLength: 3,
                                  decoration: const InputDecoration(
                                    labelText:
                                        'Moneda por defecto (ISO 3 letras)',
                                    counterText: '',
                                  ),
                                ),
                                const SizedBox(height: 10),
                                Row(
                                  children: [
                                    _buildColorSwatch(
                                      label: 'Fondo',
                                      value: draft.background,
                                      fallback: const Color(0xFF0F0D0B),
                                    ),
                                    const SizedBox(width: 10),
                                    _buildColorSwatch(
                                      label: 'Superficie',
                                      value: draft.cardSurface,
                                      fallback: const Color(0xFF1A140E),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                TextFormField(
                                  initialValue: draft.colorPrincipal,
                                  onChanged:
                                      _brandingEditor.updateColorPrincipal,
                                  decoration: const InputDecoration(
                                    labelText: 'Color principal (HEX)',
                                  ),
                                ),
                                const SizedBox(height: 8),
                                TextFormField(
                                  initialValue: draft.colorSecundario,
                                  onChanged:
                                      _brandingEditor.updateColorSecundario,
                                  decoration: const InputDecoration(
                                    labelText: 'Color secundario (HEX)',
                                  ),
                                ),
                                const SizedBox(height: 8),
                                TextFormField(
                                  initialValue: draft.background,
                                  onChanged: _brandingEditor.updateBackground,
                                  decoration: const InputDecoration(
                                    labelText: 'Background (HEX)',
                                  ),
                                ),
                                const SizedBox(height: 8),
                                TextFormField(
                                  initialValue: draft.cardSurface,
                                  onChanged: _brandingEditor.updateCardSurface,
                                  decoration: const InputDecoration(
                                    labelText: 'Card surface (HEX)',
                                  ),
                                ),
                                const SizedBox(height: 8),
                                TextFormField(
                                  initialValue: draft.textOnPrimary,
                                  onChanged:
                                      _brandingEditor.updateTextOnPrimary,
                                  decoration: const InputDecoration(
                                    labelText: 'Texto sobre primario (HEX)',
                                  ),
                                ),
                                const SizedBox(height: 10),
                                FilledButton.tonalIcon(
                                  onPressed: _brandingEditor.isDirty
                                      ? () => _discardBrandingDraft()
                                      : null,
                                  icon: const Icon(Icons.restore_rounded),
                                  label: const Text('Descartar cambios'),
                                ),
                                const SizedBox(height: 8),
                                FilledButton.icon(
                                  onPressed: _brandingEditor.isDirty
                                      ? () => _saveBrandingDraft(business)
                                      : null,
                                  icon: const Icon(Icons.save_rounded),
                                  label: const Text('Guardar branding'),
                                ),
                                const SizedBox(height: 18),
                                _buildBrandingPreview(draft),
                              ],
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: _signingOut ? null : _signOut,
              style: FilledButton.styleFrom(
                backgroundColor: colorScheme.error,
                foregroundColor: colorScheme.onError,
                minimumSize: const Size.fromHeight(52),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              icon: _signingOut
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.logout_rounded),
              label: Text(_signingOut ? 'Cerrando sesion...' : 'Cerrar Sesion'),
            ),
          ],
        ),
      ),
    );
  }
}
