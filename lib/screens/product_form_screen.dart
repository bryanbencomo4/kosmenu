import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/category.dart';
import 'package:kosmenu_app/models/product.dart';
import 'package:path_provider/path_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ProductFormScreen extends StatefulWidget {
  const ProductFormScreen({
    super.key,
    required this.categories,
    this.product,
    this.initialCategoryId,
  });

  final List<CategoryModel> categories;
  final ProductModel? product;
  final String? initialCategoryId;

  bool get isEditing => product != null;

  @override
  State<ProductFormScreen> createState() => _ProductFormScreenState();
}

class _ProductFormScreenState extends State<ProductFormScreen> {
  static const _bucketName = 'product-images';
  static const _defaultBrandLogoUrl =
      'https://elmenuxfa.com/branding/isotipo.png';

  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _priceController = TextEditingController();
  final _picker = ImagePicker();

  String? _selectedCategoryId;
  String? _remoteImageUrl;
  String? _businessLogoUrl;
  XFile? _pickedImage;
  bool _isLoadingPricingConfig = false;
  String _baseCurrency = 'USD';
  String _selectedPriceCurrency = 'USD';
  double _usdCopRate = 0;
  Set<String> _availablePriceCurrencies = <String>{'USD'};
  bool _isSaving = false;
  bool _isUploadingImage = false;

  @override
  void initState() {
    super.initState();
    final product = widget.product;

    _nameController.text = product?.nombre ?? '';
    _descriptionController.text = product?.descripcion ?? '';
    _priceController.text = product != null
        ? product.precio.toStringAsFixed(2)
        : '';
    _selectedCategoryId =
        product?.categoriaId ??
        widget.initialCategoryId ??
        (widget.categories.isNotEmpty ? widget.categories.first.id : null);
    _remoteImageUrl = product?.imagenUrl;
    _loadBusinessLogo();
    _loadPricingConfig();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _priceController.dispose();
    super.dispose();
  }

  bool get _hasRemoteImage =>
      _remoteImageUrl != null && _remoteImageUrl!.trim().isNotEmpty;

  bool get _hasLocalImage => _pickedImage != null;

  String get _fallbackImageUrl {
    final businessLogo = _businessLogoUrl?.trim();
    if (businessLogo != null && businessLogo.isNotEmpty) {
      return businessLogo;
    }
    return _defaultBrandLogoUrl;
  }

  Future<void> _loadBusinessLogo() async {
    final comercioId = SupabaseConfig.currentComercioId.trim();
    if (comercioId.isEmpty) return;

    try {
      final row = await Supabase.instance.client
          .from('comercios')
          .select('logo_url')
          .eq('id', comercioId)
          .maybeSingle();

      if (!mounted || row == null) return;
      setState(() => _businessLogoUrl = row['logo_url']?.toString().trim());
    } catch (_) {
      // Keep default fallback image when logo lookup fails.
    }
  }

  Future<void> _loadPricingConfig() async {
    final comercioId = SupabaseConfig.currentComercioId.trim();
    if (comercioId.isEmpty) return;

    setState(() => _isLoadingPricingConfig = true);
    try {
      final comercio = await Supabase.instance.client
          .from('comercios')
          .select('moneda, tasa_cambio_pesos')
          .eq('id', comercioId)
          .maybeSingle();

      final methods = await Supabase.instance.client
          .from('metodos_pago')
          .select('tipo')
          .eq('comercio_id', comercioId);

      final currencies = <String>{};
      final dbBase =
          (comercio?['moneda']?.toString().trim().toUpperCase() ?? 'USD');
      currencies.add(dbBase.isEmpty ? 'USD' : dbBase);

      for (final row in methods as List<dynamic>) {
        final tipo = (row['tipo']?.toString().trim().toLowerCase() ?? '');
        final parts = tipo.split('__');
        if (parts.length > 1) {
          final currency = parts.last.toUpperCase();
          if (currency.length == 3) {
            currencies.add(currency);
          }
        }
      }

      final rateRaw = comercio?['tasa_cambio_pesos'];
      final rate = rateRaw is num
          ? rateRaw.toDouble()
          : double.tryParse(
                  (rateRaw ?? '').toString().trim().replaceAll(',', '.'),
                ) ??
                0;

      if (currencies.isEmpty) {
        currencies.add('USD');
      }

      if (!mounted) return;
      setState(() {
        _baseCurrency = dbBase.isEmpty ? 'USD' : dbBase;
        _usdCopRate = rate;
        _availablePriceCurrencies = currencies;
        if (!_availablePriceCurrencies.contains(_selectedPriceCurrency)) {
          _selectedPriceCurrency = _baseCurrency;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _baseCurrency = 'USD';
        _availablePriceCurrencies = <String>{'USD'};
        _selectedPriceCurrency = 'USD';
      });
    } finally {
      if (mounted) {
        setState(() => _isLoadingPricingConfig = false);
      }
    }
  }

  double _convertToBaseCurrency({
    required double value,
    required String fromCurrency,
  }) {
    if (fromCurrency == _baseCurrency) {
      return value;
    }

    if (fromCurrency == 'COP' && _baseCurrency == 'USD' && _usdCopRate > 0) {
      return value / _usdCopRate;
    }
    if (fromCurrency == 'USD' && _baseCurrency == 'COP' && _usdCopRate > 0) {
      return value * _usdCopRate;
    }

    return value;
  }

  double? _previewBasePrice() {
    final parsed = double.tryParse(
      _priceController.text.trim().replaceAll(',', '.'),
    );
    if (parsed == null) {
      return null;
    }
    return _convertToBaseCurrency(
      value: parsed,
      fromCurrency: _selectedPriceCurrency,
    );
  }

  Future<void> _pickImage(ImageSource source) async {
    final file = await _picker.pickImage(
      source: source,
      imageQuality: 82,
      maxWidth: 1600,
    );
    if (file == null) return;

    if (!mounted) return;
    setState(() => _pickedImage = file);
  }

  void _removeCurrentImageSelection() {
    if (!_hasLocalImage && !_hasRemoteImage) return;
    setState(() {
      _pickedImage = null;
      _remoteImageUrl = null;
    });
  }

  Future<void> _showImageOptions() async {
    if (_isSaving || _isUploadingImage) return;

    final hasImage = _hasLocalImage || _hasRemoteImage;
    final colorScheme = Theme.of(context).colorScheme;
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      backgroundColor: colorScheme.surfaceContainerHigh,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: Icon(
                  Icons.photo_camera_rounded,
                  color: colorScheme.onSurface,
                ),
                title: Text(
                  'Tomar nueva foto',
                  style: TextStyle(color: colorScheme.onSurface),
                ),
                onTap: () => Navigator.of(context).pop('camera'),
              ),
              ListTile(
                leading: Icon(
                  Icons.photo_library_rounded,
                  color: colorScheme.onSurface,
                ),
                title: Text(
                  'Cargar desde galería',
                  style: TextStyle(color: colorScheme.onSurface),
                ),
                onTap: () => Navigator.of(context).pop('gallery'),
              ),
              if (hasImage)
                ListTile(
                  leading: Icon(
                    Icons.delete_outline_rounded,
                    color: colorScheme.error,
                  ),
                  title: Text(
                    'Eliminar imagen',
                    style: TextStyle(color: colorScheme.error),
                  ),
                  onTap: () => Navigator.of(context).pop('remove'),
                ),
            ],
          ),
        );
      },
    );

    switch (action) {
      case 'camera':
        await _pickImage(ImageSource.camera);
        break;
      case 'gallery':
        await _pickImage(ImageSource.gallery);
        break;
      case 'remove':
        _removeCurrentImageSelection();
        break;
      default:
        break;
    }
  }

  String? _validateCategory(String? value) {
    if (value == null || value.isEmpty) {
      return 'Selecciona una categoría';
    }
    return null;
  }

  String? _validateName(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Ingresa un nombre';
    }
    if (value.trim().length < 2) {
      return 'El nombre es muy corto';
    }
    return null;
  }

  String? _validatePrice(String? value) {
    final parsed = double.tryParse((value ?? '').trim().replaceAll(',', '.'));
    if (parsed == null || parsed < 0) {
      return 'Precio inválido';
    }
    return null;
  }

  double _parsePrice() {
    return double.parse(_priceController.text.trim().replaceAll(',', '.'));
  }

  Future<String> _uploadImage(XFile sourceImage) async {
    setState(() => _isUploadingImage = true);

    try {
      final tempDir = await getTemporaryDirectory();
      final compressedPath =
          '${tempDir.path}/product_${DateTime.now().millisecondsSinceEpoch}.jpg';

      final compressedFile = await FlutterImageCompress.compressAndGetFile(
        sourceImage.path,
        compressedPath,
        quality: 72,
        minWidth: 1280,
      );

      final fileToUploadPath = compressedFile?.path ?? sourceImage.path;

      final fileName =
          '${SupabaseConfig.currentComercioId}/product_${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(999999)}.jpg';

      await Supabase.instance.client.storage
          .from(_bucketName)
          .upload(
            fileName,
            File(fileToUploadPath),
            fileOptions: const FileOptions(upsert: true),
          );

      return Supabase.instance.client.storage
          .from(_bucketName)
          .getPublicUrl(fileName);
    } finally {
      if (mounted) {
        setState(() => _isUploadingImage = false);
      }
    }
  }

  Future<void> _save() async {
    if (_isSaving) return;
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSaving = true);

    try {
      var finalImageUrl = _remoteImageUrl;
      if (_pickedImage != null) {
        finalImageUrl = await _uploadImage(_pickedImage!);
      }

      final payload = <String, dynamic>{
        'comercio_id': SupabaseConfig.currentComercioId,
        'categoria_id': _selectedCategoryId,
        'nombre': _nameController.text.trim(),
        'descripcion': _descriptionController.text.trim(),
        'precio': _convertToBaseCurrency(
          value: _parsePrice(),
          fromCurrency: _selectedPriceCurrency,
        ),
        'imagen_url': finalImageUrl,
      };

      if (widget.isEditing) {
        await Supabase.instance.client
            .from('productos')
            .update(payload)
            .eq('id', widget.product!.id);
      } else {
        final maxOrderRows = await Supabase.instance.client
            .from('productos')
            .select('orden')
            .eq('comercio_id', SupabaseConfig.currentComercioId)
            .eq('categoria_id', _selectedCategoryId!);

        var nextOrder = 0;
        for (final row in maxOrderRows as List<dynamic>) {
          final value = row['orden'];
          final parsed = value is int ? value : int.tryParse('$value') ?? 0;
          if (parsed >= nextOrder) nextOrder = parsed + 1;
        }

        payload['orden'] = nextOrder;
        payload['disponible'] = true;

        await Supabase.instance.client.from('productos').insert(payload);
      }

      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar el producto: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final bottomSafePadding = max(media.padding.bottom, 16.0);
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      backgroundColor: colorScheme.surface,
      appBar: AppBar(
        backgroundColor: colorScheme.surfaceContainerHighest,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        foregroundColor: colorScheme.onSurface,
        titleSpacing: 14,
        title: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: colorScheme.primary.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.inventory_2_outlined, size: 18),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                widget.isEditing ? 'Editar Producto' : 'Nuevo Producto',
                style: GoogleFonts.manrope(
                  fontWeight: FontWeight.w800,
                  color: colorScheme.onSurface,
                  fontSize: 22,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        bottom: PreferredSize(
          preferredSize: Size.fromHeight(24),
          child: Padding(
            padding: EdgeInsets.fromLTRB(14, 0, 14, 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Ajusta imagen, categoría, contenido y precio',
                style: GoogleFonts.manrope(
                  color: colorScheme.onSurfaceVariant,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ),
      ),
      body: SafeArea(
        top: false,
        child: Stack(
          children: [
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      colorScheme.surfaceContainerHighest.withValues(
                        alpha: 0.38,
                      ),
                      colorScheme.surface,
                    ],
                  ),
                ),
                child: IgnorePointer(
                  child: Stack(
                    children: [
                      Positioned(
                        top: -90,
                        right: -60,
                        child: Container(
                          width: 220,
                          height: 220,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: colorScheme.primary.withValues(alpha: 0.14),
                          ),
                        ),
                      ),
                      Positioned(
                        bottom: -120,
                        left: -90,
                        child: Container(
                          width: 260,
                          height: 260,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: colorScheme.tertiary.withValues(alpha: 0.12),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            LayoutBuilder(
              builder: (context, constraints) {
                final isWide = constraints.maxWidth >= 880;
                final horizontalPadding = isWide ? 28.0 : 14.0;
                final maxWidth = isWide ? 980.0 : 660.0;

                final imagePanel = _ImagePanel(
                  localImagePath: _pickedImage?.path,
                  remoteImageUrl: _remoteImageUrl,
                  fallbackImageUrl: _fallbackImageUrl,
                  heroTag: widget.product != null
                      ? 'hero-product-image-${widget.product!.id}'
                      : null,
                  isSaving: _isSaving,
                  isUploadingImage: _isUploadingImage,
                  onTapImageAction: _showImageOptions,
                );

                final formPanel = _FormPanel(
                  formKey: _formKey,
                  categories: widget.categories,
                  selectedCategoryId: _selectedCategoryId,
                  isSaving: _isSaving,
                  isLoadingPricingConfig: _isLoadingPricingConfig,
                  availablePriceCurrencies: _availablePriceCurrencies,
                  selectedPriceCurrency: _selectedPriceCurrency,
                  priceHelperText: () {
                    final converted = _previewBasePrice();
                    if (converted == null) {
                      return 'El precio se guardara en $_baseCurrency.';
                    }
                    return 'Se guardara como ${converted.toStringAsFixed(2)} $_baseCurrency.';
                  }(),
                  nameController: _nameController,
                  descriptionController: _descriptionController,
                  priceController: _priceController,
                  isEditing: widget.isEditing,
                  validateCategory: _validateCategory,
                  validateName: _validateName,
                  validatePrice: _validatePrice,
                  onCategoryChanged: (value) =>
                      setState(() => _selectedCategoryId = value),
                  onPriceCurrencyChanged: (value) {
                    if (value == null) return;
                    setState(() => _selectedPriceCurrency = value);
                  },
                  onSave: _save,
                );

                return Center(
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: maxWidth),
                    child: SingleChildScrollView(
                      padding: EdgeInsets.fromLTRB(
                        horizontalPadding,
                        14,
                        horizontalPadding,
                        26 + bottomSafePadding,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const _HeaderIntro(),
                          const SizedBox(height: 14),
                          isWide
                              ? Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Expanded(flex: 10, child: imagePanel),
                                    const SizedBox(width: 14),
                                    Expanded(flex: 14, child: formPanel),
                                  ],
                                )
                              : Column(
                                  children: [
                                    imagePanel,
                                    const SizedBox(height: 14),
                                    formPanel,
                                  ],
                                ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
            if (_isSaving)
              Container(
                color: Colors.black.withValues(alpha: 0.28),
                alignment: Alignment.center,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const CircularProgressIndicator(
                      valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      _isUploadingImage
                          ? 'Subiendo y optimizando imagen...'
                          : 'Guardando producto...',
                      style: TextStyle(color: colorScheme.onSurface),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ImagePanel extends StatelessWidget {
  const _ImagePanel({
    required this.localImagePath,
    required this.remoteImageUrl,
    required this.fallbackImageUrl,
    required this.heroTag,
    required this.isSaving,
    required this.isUploadingImage,
    required this.onTapImageAction,
  });

  final String? localImagePath;
  final String? remoteImageUrl;
  final String fallbackImageUrl;
  final String? heroTag;
  final bool isSaving;
  final bool isUploadingImage;
  final VoidCallback onTapImageAction;

  Widget _wrapHero(Widget child) {
    if (heroTag == null || heroTag!.isEmpty) return child;
    return Hero(tag: heroTag!, child: child);
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final hasLocalImage = localImagePath != null;
    final hasRemoteImage =
        remoteImageUrl != null && remoteImageUrl!.trim().isNotEmpty;
    final hasFallbackImage = fallbackImageUrl.trim().isNotEmpty;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colorScheme.outlineVariant),
        boxShadow: const [
          BoxShadow(
            color: Color(0x22000000),
            blurRadius: 24,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Foto del producto',
            style: GoogleFonts.manrope(
              color: colorScheme.onSurface,
              fontWeight: FontWeight.w700,
              fontSize: 16,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'Toca la imagen para tomar, cargar o eliminar.',
            style: GoogleFonts.manrope(
              color: colorScheme.onSurfaceVariant,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 10),
          GestureDetector(
            onTap: isSaving ? null : onTapImageAction,
            child: Stack(
              children: [
                if (hasLocalImage)
                  _wrapHero(
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.file(
                        File(localImagePath!),
                        fit: BoxFit.cover,
                        height: 230,
                        width: double.infinity,
                      ),
                    ),
                  )
                else if (hasRemoteImage)
                  _wrapHero(
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.network(
                        remoteImageUrl!,
                        fit: BoxFit.cover,
                        height: 230,
                        width: double.infinity,
                      ),
                    ),
                  )
                else if (hasFallbackImage)
                  _wrapHero(
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.network(
                        fallbackImageUrl,
                        fit: BoxFit.cover,
                        height: 200,
                        width: double.infinity,
                        errorBuilder: (_, _, _) => Container(
                          height: 200,
                          width: double.infinity,
                          color: colorScheme.surfaceContainerHighest,
                        ),
                      ),
                    ),
                  )
                else
                  Container(
                    height: 200,
                    width: double.infinity,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      color: colorScheme.surfaceContainerHighest,
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.photo_camera_back_outlined,
                          color: colorScheme.onSurfaceVariant,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Sin foto seleccionada',
                          style: TextStyle(color: colorScheme.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                Positioned(
                  right: 10,
                  bottom: 10,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.48),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Padding(
                      padding: EdgeInsets.all(8),
                      child: Icon(
                        Icons.photo_camera_outlined,
                        color: colorScheme.onPrimary,
                        size: 20,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: isSaving ? null : onTapImageAction,
            icon: const Icon(Icons.photo_camera_rounded),
            label: const Text('Cambiar foto'),
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
              backgroundColor: colorScheme.primary,
              foregroundColor: colorScheme.onPrimary,
              textStyle: GoogleFonts.manrope(
                fontWeight: FontWeight.w800,
                fontSize: 15,
              ),
            ),
          ),
          if (isUploadingImage) ...[
            const SizedBox(height: 10),
            LinearProgressIndicator(
              valueColor: AlwaysStoppedAnimation<Color>(colorScheme.primary),
              backgroundColor: colorScheme.surfaceContainerHighest,
            ),
          ],
        ],
      ),
    );
  }
}

class _FormPanel extends StatelessWidget {
  const _FormPanel({
    required this.formKey,
    required this.categories,
    required this.selectedCategoryId,
    required this.isSaving,
    required this.isLoadingPricingConfig,
    required this.availablePriceCurrencies,
    required this.selectedPriceCurrency,
    required this.priceHelperText,
    required this.nameController,
    required this.descriptionController,
    required this.priceController,
    required this.isEditing,
    required this.validateCategory,
    required this.validateName,
    required this.validatePrice,
    required this.onCategoryChanged,
    required this.onPriceCurrencyChanged,
    required this.onSave,
  });

  final GlobalKey<FormState> formKey;
  final List<CategoryModel> categories;
  final String? selectedCategoryId;
  final bool isSaving;
  final bool isLoadingPricingConfig;
  final Set<String> availablePriceCurrencies;
  final String selectedPriceCurrency;
  final String priceHelperText;
  final TextEditingController nameController;
  final TextEditingController descriptionController;
  final TextEditingController priceController;
  final bool isEditing;
  final FormFieldValidator<String> validateCategory;
  final FormFieldValidator<String> validateName;
  final FormFieldValidator<String> validatePrice;
  final ValueChanged<String?> onCategoryChanged;
  final ValueChanged<String?> onPriceCurrencyChanged;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final categoryIds = categories.map((category) => category.id).toSet();
    final effectiveCategoryId = categoryIds.contains(selectedCategoryId)
        ? selectedCategoryId
        : null;

    Widget fieldLabel(String text) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          text,
          style: GoogleFonts.manrope(
            color: colorScheme.onSurface,
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: colorScheme.outlineVariant),
        boxShadow: const [
          BoxShadow(
            color: Color(0x18000000),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Theme(
        data: Theme.of(context).copyWith(
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: colorScheme.surfaceContainerLowest,
            labelStyle: GoogleFonts.manrope(
              color: colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
            ),
            floatingLabelStyle: TextStyle(
              color: colorScheme.primary,
              fontWeight: FontWeight.w700,
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(
                color: colorScheme.outlineVariant,
                width: 1,
              ),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(
                color: colorScheme.outlineVariant,
                width: 1,
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: colorScheme.primary, width: 1.4),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: colorScheme.error, width: 1.2),
            ),
            focusedErrorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: colorScheme.error, width: 1.4),
            ),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 13,
            ),
          ),
        ),
        child: Form(
          key: formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Datos del producto',
                style: GoogleFonts.manrope(
                  color: colorScheme.onSurface,
                  fontWeight: FontWeight.w800,
                  fontSize: 18,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Completa la información que verá el cliente en el menú.',
                style: GoogleFonts.manrope(
                  color: colorScheme.onSurfaceVariant,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 20),
              fieldLabel('Categoría'),
              DropdownButtonFormField<String>(
                initialValue: effectiveCategoryId,
                isExpanded: true,
                icon: const Icon(Icons.keyboard_arrow_down_rounded),
                style: GoogleFonts.manrope(
                  color: colorScheme.onSurface,
                  fontWeight: FontWeight.w700,
                ),
                dropdownColor: colorScheme.surfaceContainerHigh,
                items: categories
                    .map(
                      (category) => DropdownMenuItem<String>(
                        value: category.id,
                        child: Text(
                          category.nombre,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.manrope(
                            fontWeight: FontWeight.w700,
                            color: colorScheme.onSurface,
                          ),
                        ),
                      ),
                    )
                    .toList(),
                onChanged: isSaving ? null : onCategoryChanged,
                decoration: const InputDecoration(hintText: 'Seleccionar'),
                validator: validateCategory,
              ),
              const SizedBox(height: 16),
              fieldLabel('Nombre'),
              TextFormField(
                controller: nameController,
                enabled: !isSaving,
                textInputAction: TextInputAction.next,
                style: GoogleFonts.manrope(
                  color: colorScheme.onSurface,
                  fontWeight: FontWeight.w700,
                ),
                decoration: const InputDecoration(
                  hintText: 'Ej. Mushroom Swiss Dream',
                ),
                validator: validateName,
              ),
              const SizedBox(height: 16),
              fieldLabel('Descripción'),
              TextFormField(
                controller: descriptionController,
                enabled: !isSaving,
                textInputAction: TextInputAction.newline,
                style: GoogleFonts.manrope(
                  color: colorScheme.onSurface,
                  fontWeight: FontWeight.w600,
                ),
                decoration: const InputDecoration(
                  hintText: 'Ingredientes, sabores o detalles clave',
                ),
                minLines: 2,
                maxLines: 4,
              ),
              const SizedBox(height: 16),
              fieldLabel('Precio'),
              if (isLoadingPricingConfig)
                const Padding(
                  padding: EdgeInsets.only(bottom: 10),
                  child: LinearProgressIndicator(minHeight: 2),
                ),
              DropdownButtonFormField<String>(
                initialValue: selectedPriceCurrency,
                isExpanded: true,
                style: GoogleFonts.manrope(
                  color: colorScheme.onSurface,
                  fontWeight: FontWeight.w700,
                ),
                dropdownColor: colorScheme.surfaceContainerHigh,
                items:
                    (availablePriceCurrencies.toList()
                          ..sort((a, b) => a.compareTo(b)))
                        .map(
                          (currency) => DropdownMenuItem<String>(
                            value: currency,
                            child: Text(
                              currency,
                              style: GoogleFonts.manrope(
                                fontWeight: FontWeight.w700,
                                color: colorScheme.onSurface,
                              ),
                            ),
                          ),
                        )
                        .toList(),
                onChanged: isSaving ? null : onPriceCurrencyChanged,
                decoration: const InputDecoration(
                  labelText: 'Moneda del precio',
                  hintText: 'Seleccionar',
                ),
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: priceController,
                enabled: !isSaving,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                textInputAction: TextInputAction.done,
                style: GoogleFonts.manrope(
                  color: colorScheme.onSurface,
                  fontWeight: FontWeight.w700,
                ),
                decoration: const InputDecoration(
                  hintText: '0.00',
                  prefixText: '\$ ',
                ),
                validator: validatePrice,
              ),
              const SizedBox(height: 18),
              Builder(
                builder: (context) {
                  return Text(
                    priceHelperText,
                    style: GoogleFonts.manrope(
                      color: colorScheme.onSurfaceVariant,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w500,
                    ),
                  );
                },
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: isSaving ? null : onSave,
                  icon: const Icon(Icons.save_outlined),
                  label: Text(isEditing ? 'Guardar Cambios' : 'Crear Producto'),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                    backgroundColor: colorScheme.primary,
                    foregroundColor: colorScheme.onPrimary,
                    textStyle: GoogleFonts.manrope(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeaderIntro extends StatelessWidget {
  const _HeaderIntro();

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Configura tu producto',
            style: GoogleFonts.manrope(
              color: colorScheme.onSurface,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'Define imagen, categoría, descripción y precio.',
            style: GoogleFonts.manrope(
              color: colorScheme.onSurfaceVariant,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
