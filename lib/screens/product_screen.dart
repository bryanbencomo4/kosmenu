import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/category.dart';
import 'package:kosmenu_app/models/product.dart';
import 'package:kosmenu_app/screens/product_form_screen.dart';
import 'package:kosmenu_app/services/ai_image_service.dart';
import 'package:kosmenu_app/widgets/branded_loading_screen.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ProductListScreen extends StatefulWidget {
  const ProductListScreen({
    super.key,
    required this.category,
    required this.allCategories,
  });

  final CategoryModel category;
  final List<CategoryModel> allCategories;

  @override
  State<ProductListScreen> createState() => _ProductListScreenState();
}

class _ProductListScreenState extends State<ProductListScreen> {
  static const _pageSize = 12;
  static const _bucketName = 'product-images';
  static const _defaultBrandLogoUrl = AppLinks.brandIsotipoUrl;

  bool _loading = true;
  bool _isSavingOrder = false;
  bool _isLoadingMore = false;
  bool _hasMoreProducts = true;
  List<ProductModel> _products = <ProductModel>[];
  final Set<String> _updatingImageProductIds = <String>{};
  String? _businessLogoUrl;
  final TextEditingController _searchController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  String _searchQuery = '';
  bool _showAppBarSearch = false;
  double _headerCollapse = 0;
  _ProductVisibilityFilter _visibilityFilter = _ProductVisibilityFilter.all;
  Timer? _aiImageRefreshTimer;
  final Set<String> _aiRetryPromptProductIds = <String>{};
  final AiImageService _aiImageService = const AiImageService();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _loadBusinessLogo();
    _loadProducts(reset: true);
  }

  void _onScroll() {
    final next =
        (_scrollController.hasClients ? (_scrollController.offset / 170) : 0.0)
            .clamp(0.0, 1.0);
    if ((next - _headerCollapse).abs() < 0.02 || !mounted) return;
    setState(() => _headerCollapse = next);
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
      // Keep defaults on logo read failure.
    }
  }

  @override
  void dispose() {
    _aiImageRefreshTimer?.cancel();
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadProducts({
    bool reset = false,
    bool showLoadingIndicator = true,
  }) async {
    if (!reset && (!_hasMoreProducts || _isLoadingMore)) return;

    if (reset) {
      setState(() {
        if (showLoadingIndicator) {
          _loading = true;
        }
        _hasMoreProducts = true;
      });
    } else {
      setState(() => _isLoadingMore = true);
    }

    try {
      final previousById = {
        for (final product in _products) product.id: product,
      };
      final offset = reset ? 0 : _products.length;
      final rows = await Supabase.instance.client
          .from('productos')
          .select()
          .eq('comercio_id', SupabaseConfig.currentComercioId)
          .eq('categoria_id', widget.category.id)
          .order('orden', ascending: true)
          .order('nombre', ascending: true)
          .range(offset, offset + _pageSize - 1);

      final products = (rows as List<dynamic>)
          .map(
            (row) =>
                ProductModel.fromMap(Map<String, dynamic>.from(row as Map)),
          )
          .toList();
      final completedAiProducts = products.where((product) {
        final previous = previousById[product.id];
        return _aiRetryPromptProductIds.contains(product.id) &&
            previous != null &&
            previous.hasAiImageInProgress &&
            !product.hasAiImageInProgress &&
            product.isAiGeneratedImage;
      }).toList();

      if (!mounted) return;
      setState(() {
        _products = reset ? products : [..._products, ...products];
        _hasMoreProducts = products.length == _pageSize;
      });
      if (completedAiProducts.isNotEmpty) {
        final completedProduct = completedAiProducts.first;
        _aiRetryPromptProductIds.remove(completedProduct.id);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          final messenger = ScaffoldMessenger.of(context);
          messenger.hideCurrentSnackBar();
          messenger.showSnackBar(
            SnackBar(
              content: const Text(
                'Imagen generada correctamente ✨\n¿Quieres probar otra versión?',
              ),
              action: SnackBarAction(
                label: 'Generar otra',
                onPressed: () {
                  final latestProduct = _products
                      .where((item) => item.id == completedProduct.id)
                      .cast<ProductModel?>()
                      .firstWhere((item) => item != null, orElse: () => null);
                  if (latestProduct == null) return;
                  unawaited(_generateAiImageForProduct(latestProduct));
                },
              ),
            ),
          );
        });
      }
      _syncAiImageRefresh(_products);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error cargando productos: $error')),
      );
    } finally {
      if (mounted) {
        setState(() {
          if (showLoadingIndicator || _loading) {
            _loading = false;
          }
          _isLoadingMore = false;
        });
      }
    }
  }

  Future<void> _openProductForm({ProductModel? product}) async {
    final didSave = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ProductFormScreen(
          categories: widget.allCategories,
          product: product,
          initialCategoryId: widget.category.id,
        ),
      ),
    );

    if (didSave == true) {
      await _loadProducts(reset: true);
    }
  }

  Future<void> _toggleVisibility(ProductModel product, bool value) async {
    final originalProducts = List<ProductModel>.from(_products);

    setState(() {
      _products = _products
          .map(
            (item) =>
                item.id == product.id ? item.copyWith(disponible: value) : item,
          )
          .toList();
    });

    try {
      await Supabase.instance.client
          .from('productos')
          .update({'disponible': value})
          .eq('id', product.id);
    } catch (error) {
      if (!mounted) return;
      setState(() => _products = originalProducts);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo actualizar visibilidad: $error')),
      );
    }
  }

  Future<void> _deleteProduct(ProductModel product) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        final colorScheme = Theme.of(dialogContext).colorScheme;
        return AlertDialog(
          backgroundColor: colorScheme.surfaceContainerHigh,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          title: Text(
            'Eliminar producto',
            style: GoogleFonts.manrope(
              color: colorScheme.onSurface,
              fontWeight: FontWeight.w800,
            ),
          ),
          content: Text(
            '¿Seguro que deseas eliminar "${product.nombre}"?',
            style: TextStyle(color: colorScheme.onSurfaceVariant),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: Text(
                'Cancelar',
                style: TextStyle(color: colorScheme.onSurfaceVariant),
              ),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              style: FilledButton.styleFrom(
                backgroundColor: colorScheme.primary,
                foregroundColor: colorScheme.onPrimary,
              ),
              child: const Text('Eliminar'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) return;

    final previous = List<ProductModel>.from(_products);
    if (!mounted) return;
    setState(() {
      _products = _products.where((item) => item.id != product.id).toList();
    });

    try {
      final deletedRows = await Supabase.instance.client
          .from('productos')
          .delete()
          .eq('id', product.id)
          .select('id');

      final deletedCount = (deletedRows as List<dynamic>).length;
      if (deletedCount == 0) {
        throw Exception('No se pudo confirmar el borrado en la base de datos.');
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _products = previous);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo eliminar producto: $error')),
      );
    }
  }

  Future<void> _pickAndUpdateProductImage(
    ProductModel product,
    ImageSource source,
  ) async {
    final picker = ImagePicker();
    final photo = await picker.pickImage(
      source: source,
      imageQuality: 82,
      maxWidth: 1600,
    );
    if (photo == null) return;

    final comercioId = SupabaseConfig.currentComercioId.trim();
    if (comercioId.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se encontró el comercio actual.')),
      );
      return;
    }

    setState(() => _updatingImageProductIds.add(product.id));

    try {
      final sourceName = photo.name.trim().isNotEmpty ? photo.name : photo.path;
      final extensionMatch = RegExp(r'\.([a-zA-Z0-9]+)$').firstMatch(sourceName);
      final extension = (extensionMatch?.group(1) ?? 'jpg').toLowerCase();
      final normalizedExtension = switch (extension) {
        'png' => 'png',
        'webp' => 'webp',
        'gif' => 'gif',
        _ => 'jpg',
      };
      final contentType = switch (normalizedExtension) {
        'png' => 'image/png',
        'webp' => 'image/webp',
        'gif' => 'image/gif',
        _ => 'image/jpeg',
      };
      final fileName =
          '$comercioId/product_${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(999999)}.$normalizedExtension';
      final bytes = await photo.readAsBytes();

      await Supabase.instance.client.storage
          .from(_bucketName)
          .uploadBinary(
            fileName,
            bytes,
            fileOptions: FileOptions(
              upsert: true,
              contentType: contentType,
            ),
          );

      final publicUrl = Supabase.instance.client.storage
          .from(_bucketName)
          .getPublicUrl(fileName);

      await Supabase.instance.client
          .from('productos')
          .update({
            'imagen_url': publicUrl,
            'imagen_source_type': 'manual',
            'ai_image_status': 'completed',
            'ai_image_error_message': null,
          })
          .eq('id', product.id);

      if (!mounted) return;
      setState(() {
        _products = _products
            .map(
              (item) => item.id == product.id
                  ? item.copyWith(
                      imagenUrl: publicUrl,
                      imagenSourceType: 'manual',
                      aiImageStatus: 'completed',
                      clearAiImageErrorMessage: true,
                    )
                  : item,
            )
            .toList();
      });
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo actualizar la foto: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _updatingImageProductIds.remove(product.id));
      }
    }
  }

  Future<void> _removeProductImage(ProductModel product) async {
    setState(() => _updatingImageProductIds.add(product.id));

    try {
      await Supabase.instance.client
          .from('productos')
          .update({
            'imagen_url': null,
            'imagen_source_type': 'manual',
            'ai_image_status': 'none',
            'ai_image_error_message': null,
          })
          .eq('id', product.id);

      if (!mounted) return;
      setState(() {
        _products = _products
            .map(
              (item) => item.id == product.id
                  ? item.copyWith(
                      clearImagenUrl: true,
                      imagenSourceType: 'manual',
                      aiImageStatus: 'none',
                      clearAiImageErrorMessage: true,
                    )
                  : item,
            )
            .toList();
      });
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo eliminar la foto: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _updatingImageProductIds.remove(product.id));
      }
    }
  }

  Future<void> _openProductImageOptions(ProductModel product) async {
    if (_updatingImageProductIds.contains(product.id)) return;

    final hasOwnImage = (product.imagenUrl?.trim().isNotEmpty ?? false);
    final canRequestAiImage = !product.hasAiImageInProgress;
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) {
        final colorScheme = Theme.of(context).colorScheme;
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.photo_camera_rounded),
                title: const Text('Tomar nueva foto'),
                onTap: () => Navigator.of(context).pop('camera'),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_rounded),
                title: const Text('Cargar desde galería'),
                onTap: () => Navigator.of(context).pop('gallery'),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
                child: Material(
                  color: canRequestAiImage
                      ? colorScheme.primary.withValues(alpha: 0.1)
                      : colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(18),
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    leading: Icon(
                      Icons.auto_awesome,
                      color: canRequestAiImage
                          ? colorScheme.primary
                          : colorScheme.outline,
                    ),
                    title: Text(
                      '✨ Generar imagen con IA',
                      style: TextStyle(
                        color: canRequestAiImage
                            ? colorScheme.onSurface
                            : colorScheme.outline,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    subtitle: Text(
                      'Imagen profesional en segundos (1 crédito)',
                      style: TextStyle(
                        color: canRequestAiImage
                            ? colorScheme.onSurfaceVariant
                            : colorScheme.outline,
                      ),
                    ),
                    enabled: canRequestAiImage,
                    onTap: canRequestAiImage
                        ? () => Navigator.of(context).pop('ai')
                        : null,
                  ),
                ),
              ),
              if (hasOwnImage)
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
        await _pickAndUpdateProductImage(product, ImageSource.camera);
        break;
      case 'gallery':
        await _pickAndUpdateProductImage(product, ImageSource.gallery);
        break;
      case 'ai':
        await _generateAiImageForProduct(product);
        break;
      case 'remove':
        await _removeProductImage(product);
        break;
      default:
        break;
    }
  }

  Future<void> _generateAiImageForProduct(ProductModel product) async {
    final comercioId = SupabaseConfig.currentComercioId.trim();
    if (comercioId.isEmpty) {
      _showMessage('No hay comercio activo para generar la imagen IA.');
      return;
    }

    final confirmed = await _confirmAiImageGeneration(product);
    if (confirmed != true) {
      return;
    }

    _aiRetryPromptProductIds.add(product.id);

    setState(() {
      _products = _products
          .map(
            (item) => item.id == product.id
                ? item.copyWith(
                    aiImageStatus: 'pending',
                    clearAiImageErrorMessage: true,
                  )
                : item,
          )
          .toList();
    });
    _syncAiImageRefresh(_products);

    try {
      final response = await _aiImageService.enqueueProductImage(
        comercioId: comercioId,
        productId: product.id,
        productName: product.nombre,
        description: product.descripcion,
        categoryName: widget.category.nombre,
      );

      if (!mounted) return;
      final message = response['message']?.toString().trim();
      _showMessage(
        message?.isNotEmpty == true
            ? message!
            : 'Imagen IA en cola para ${product.nombre}.',
      );
      await _loadProducts(reset: true);
    } catch (error) {
      if (!mounted) return;
      _aiRetryPromptProductIds.remove(product.id);
      final friendlyMessage = _formatAiImageErrorMessage(
        error.toString().replaceFirst('Bad state: ', ''),
      );
      setState(() {
        _products = _products
            .map(
              (item) => item.id == product.id
                  ? item.copyWith(
                      aiImageStatus: 'failed',
                      aiImageErrorMessage: friendlyMessage,
                    )
                  : item,
            )
            .toList();
      });
      _showMessage(friendlyMessage);
    }
  }

  Future<bool?> _confirmAiImageGeneration(ProductModel product) {
    return showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        final colorScheme = Theme.of(dialogContext).colorScheme;
        return AlertDialog(
          backgroundColor: colorScheme.surfaceContainerHigh,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          title: Text(
            'Generar imagen con IA',
            style: GoogleFonts.manrope(
              color: colorScheme.onSurface,
              fontWeight: FontWeight.w800,
            ),
          ),
          content: Text(
            'Se descontará 1 crédito para generar la imagen de "${product.nombre}" y el proceso continuará en segundo plano. ¿Deseas continuar?',
            style: TextStyle(color: colorScheme.onSurfaceVariant),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: Text(
                'Cancelar',
                style: TextStyle(color: colorScheme.onSurfaceVariant),
              ),
            ),
            FilledButton.icon(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              icon: const Icon(Icons.auto_awesome_rounded, size: 18),
              style: FilledButton.styleFrom(
                backgroundColor: colorScheme.primary,
                foregroundColor: colorScheme.onPrimary,
              ),
              label: const Text('Generar'),
            ),
          ],
        );
      },
    );
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _onReorder(int oldIndex, int newIndex) async {
    if (_isSavingOrder) return;

    final originalList = List<ProductModel>.from(_products);
    final updated = List<ProductModel>.from(_products);

    if (newIndex > oldIndex) newIndex -= 1;
    final item = updated.removeAt(oldIndex);
    updated.insert(newIndex, item);

    setState(() {
      _products = updated;
      _isSavingOrder = true;
    });

    try {
      for (var index = 0; index < updated.length; index++) {
        final row = updated[index];
        await Supabase.instance.client
            .from('productos')
            .update({'orden': index})
            .eq('id', row.id);
      }

      if (!mounted) return;
      setState(() {
        _products = updated
            .asMap()
            .entries
            .map((entry) => entry.value.copyWith(orden: entry.key))
            .toList();
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _products = originalList);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar el nuevo orden: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _isSavingOrder = false);
      }
    }
  }

  List<ProductModel> get _filteredProducts {
    final query = _searchQuery.trim().toLowerCase();
    final searched = query.isEmpty
        ? _products
        : _products.where((product) {
            final price = product.precio.toStringAsFixed(2);
            return product.nombre.toLowerCase().contains(query) ||
                product.descripcion.toLowerCase().contains(query) ||
                price.contains(query);
          }).toList();

    if (_visibilityFilter == _ProductVisibilityFilter.all) {
      return searched;
    }

    final showVisible = _visibilityFilter == _ProductVisibilityFilter.visible;
    return searched
        .where((product) => product.disponible == showVisible)
        .toList();
  }

  void _syncAiImageRefresh(List<ProductModel> products) {
    final hasPendingAiImages = products.any(
      (product) => product.hasAiImageInProgress,
    );
    if (!hasPendingAiImages) {
      _aiImageRefreshTimer?.cancel();
      _aiImageRefreshTimer = null;
      return;
    }

    _aiImageRefreshTimer ??= Timer.periodic(const Duration(seconds: 7), (_) {
      if (!mounted) {
        return;
      }
      unawaited(_loadProducts(reset: true, showLoadingIndicator: false));
    });
  }

  int get _visibleCount => _products.where((item) => item.disponible).length;

  int get _hiddenCount => _products.length - _visibleCount;

  void _toggleAppBarSearch() {
    if (!mounted) return;
    if (_showAppBarSearch) {
      _searchController.clear();
      setState(() {
        _showAppBarSearch = false;
        _searchQuery = '';
      });
      return;
    }

    setState(() => _showAppBarSearch = true);
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final headerScale = (1 - (_headerCollapse * 0.2)).clamp(0.82, 1.0);
    final headerOpacity = (1 - (_headerCollapse * 1.55)).clamp(0.0, 1.0);
    final headerHeightFactor = (1 - (_headerCollapse * 1.45)).clamp(0.0, 1.0);

    if (_loading) {
      return const BrandedLoadingScreen(withScaffold: true);
    }

    return Scaffold(
      backgroundColor: colorScheme.surface,
      appBar: AppBar(
        backgroundColor: colorScheme.surfaceContainerHighest,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        foregroundColor: colorScheme.onSurface,
        titleTextStyle: GoogleFonts.manrope(
          color: colorScheme.onSurface,
          fontSize: 22,
          fontWeight: FontWeight.w800,
        ),
        title: _showAppBarSearch
            ? TextField(
                controller: _searchController,
                autofocus: true,
                onChanged: (value) {
                  if (!mounted) return;
                  setState(() => _searchQuery = value);
                },
                style: TextStyle(color: colorScheme.onSurface),
                cursorColor: colorScheme.primary,
                decoration: InputDecoration(
                  hintText: 'Buscar producto...',
                  hintStyle: TextStyle(
                    color: colorScheme.onSurfaceVariant.withValues(alpha: 0.8),
                  ),
                  border: InputBorder.none,
                  isDense: true,
                ),
              )
            : Text(
                widget.category.nombre,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
        actions: [
          IconButton(
            onPressed: _toggleAppBarSearch,
            icon: Icon(
              _showAppBarSearch ? Icons.close_rounded : Icons.search_rounded,
            ),
            tooltip: _showAppBarSearch ? 'Cerrar búsqueda' : 'Buscar producto',
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _loading ? null : () => _openProductForm(),
        backgroundColor: colorScheme.primary,
        foregroundColor: colorScheme.onPrimary,
        icon: const Icon(Icons.add),
        label: const Text('Nuevo Producto'),
      ),
      body: Stack(
        children: [
          Positioned.fill(
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      colorScheme.surfaceContainerHighest.withValues(
                        alpha: 0.34,
                      ),
                      colorScheme.surface,
                    ],
                  ),
                ),
              ),
            ),
          ),
          RefreshIndicator(
            onRefresh: () => _loadProducts(reset: true),
            color: colorScheme.primary,
            child: SafeArea(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final isWide = constraints.maxWidth >= 760;
                  final horizontalPadding = isWide ? 28.0 : 14.0;
                  final maxWidth = isWide ? 980.0 : 680.0;
                  final filteredProducts = _filteredProducts;
                  final hasSearch = _searchQuery.trim().isNotEmpty;

                  return Center(
                    child: ConstrainedBox(
                      constraints: BoxConstraints(maxWidth: maxWidth),
                      child: Stack(
                        children: [
                          Column(
                            children: [
                              ClipRect(
                                child: Align(
                                  alignment: Alignment.topCenter,
                                  heightFactor: headerHeightFactor,
                                  child: AnimatedOpacity(
                                    duration: const Duration(milliseconds: 140),
                                    opacity: headerOpacity,
                                    child: Transform.scale(
                                      scale: headerScale,
                                      alignment: Alignment.topCenter,
                                      child: Container(
                                        margin: EdgeInsets.fromLTRB(
                                          horizontalPadding,
                                          14,
                                          horizontalPadding,
                                          8,
                                        ),
                                        padding: const EdgeInsets.all(16),
                                        decoration: BoxDecoration(
                                          borderRadius: BorderRadius.circular(
                                            18,
                                          ),
                                          color:
                                              colorScheme.surfaceContainerHigh,
                                          border: Border.all(
                                            color: colorScheme.outlineVariant,
                                          ),
                                          boxShadow: const [
                                            BoxShadow(
                                              color: Color(0x1F000000),
                                              blurRadius: 22,
                                              offset: Offset(0, 9),
                                            ),
                                          ],
                                        ),
                                        child: Column(
                                          children: [
                                            Row(
                                              children: [
                                                Container(
                                                  width: 42,
                                                  height: 42,
                                                  decoration: BoxDecoration(
                                                    color: colorScheme.primary
                                                        .withValues(
                                                          alpha: 0.16,
                                                        ),
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                          12,
                                                        ),
                                                  ),
                                                  child: Icon(
                                                    Icons.inventory_2_outlined,
                                                    color: colorScheme.primary,
                                                  ),
                                                ),
                                                const SizedBox(width: 12),
                                                Expanded(
                                                  child: Text(
                                                    'Gestiona productos con orden, visibilidad y búsqueda instantánea.',
                                                    style: GoogleFonts.manrope(
                                                      color: colorScheme
                                                          .onSurfaceVariant,
                                                      fontWeight:
                                                          FontWeight.w600,
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
                              ),
                              SingleChildScrollView(
                                scrollDirection: Axis.horizontal,
                                padding: EdgeInsets.fromLTRB(
                                  horizontalPadding,
                                  0,
                                  horizontalPadding,
                                  8,
                                ),
                                child: Row(
                                  children: _ProductVisibilityFilter.values.map((
                                    filter,
                                  ) {
                                    final selected =
                                        _visibilityFilter == filter;
                                    return Padding(
                                      padding: const EdgeInsets.only(right: 8),
                                      child: ChoiceChip(
                                        selected: selected,
                                        showCheckmark: false,
                                        label: Text(
                                          '${filter.label} (${filter == _ProductVisibilityFilter.all
                                              ? _products.length
                                              : filter == _ProductVisibilityFilter.visible
                                              ? _visibleCount
                                              : _hiddenCount})',
                                        ),
                                        avatar: Icon(filter.icon, size: 16),
                                        onSelected: (_) {
                                          if (!mounted) return;
                                          setState(
                                            () => _visibilityFilter = filter,
                                          );
                                        },
                                      ),
                                    );
                                  }).toList(),
                                ),
                              ),
                              Expanded(
                                child: filteredProducts.isEmpty
                                    ? ListView(
                                        controller: _scrollController,
                                        physics:
                                            const AlwaysScrollableScrollPhysics(),
                                        padding: EdgeInsets.fromLTRB(
                                          horizontalPadding,
                                          56,
                                          horizontalPadding,
                                          126,
                                        ),
                                        children: [
                                          _EmptyProductsCard(
                                            hasSearchOrFilter:
                                                hasSearch ||
                                                _visibilityFilter !=
                                                    _ProductVisibilityFilter
                                                        .all,
                                            onClear: () {
                                              _searchController.clear();
                                              if (!mounted) return;
                                              setState(() {
                                                _searchQuery = '';
                                                _visibilityFilter =
                                                    _ProductVisibilityFilter
                                                        .all;
                                              });
                                            },
                                          ),
                                        ],
                                      )
                                    : NotificationListener<ScrollNotification>(
                                        onNotification: (notification) {
                                          final next =
                                              (notification.metrics.pixels /
                                                      170)
                                                  .clamp(0.0, 1.0);
                                          if ((next - _headerCollapse).abs() >=
                                                  0.02 &&
                                              mounted) {
                                            setState(
                                              () => _headerCollapse = next,
                                            );
                                          }
                                          if (notification.metrics.pixels >=
                                              notification
                                                      .metrics
                                                      .maxScrollExtent -
                                                  180) {
                                            _loadProducts();
                                          }
                                          return false;
                                        },
                                        child: hasSearch
                                            ? ListView.builder(
                                                controller: _scrollController,
                                                physics:
                                                    const AlwaysScrollableScrollPhysics(),
                                                padding: EdgeInsets.fromLTRB(
                                                  horizontalPadding,
                                                  8,
                                                  horizontalPadding,
                                                  126,
                                                ),
                                                itemCount:
                                                    filteredProducts.length,
                                                itemBuilder: (context, index) {
                                                  final product =
                                                      filteredProducts[index];
                                                  return _ProductCard(
                                                    key: ValueKey(product.id),
                                                    product: product,
                                                    fallbackImageUrl:
                                                        (_businessLogoUrl !=
                                                                null &&
                                                            _businessLogoUrl!
                                                                .trim()
                                                                .isNotEmpty)
                                                        ? _businessLogoUrl!
                                                              .trim()
                                                        : _defaultBrandLogoUrl,
                                                    isUpdatingImage:
                                                        _updatingImageProductIds
                                                            .contains(
                                                              product.id,
                                                            ),
                                                    onEditImage: () =>
                                                        _generateAiImageForProduct(
                                                          product,
                                                        ),
                                                    onEdit: () =>
                                                        _openProductForm(
                                                          product: product,
                                                        ),
                                                    onDelete: () =>
                                                        _deleteProduct(product),
                                                    onToggleVisible: (value) =>
                                                        _toggleVisibility(
                                                          product,
                                                          value,
                                                        ),
                                                    dragHandle: Icon(
                                                      Icons.drag_indicator,
                                                      color: colorScheme
                                                          .onSurfaceVariant,
                                                    ),
                                                    onOpenImageOptions: () =>
                                                        _openProductImageOptions(
                                                          product,
                                                        ),
                                                  );
                                                },
                                              )
                                            : ReorderableListView.builder(
                                                padding: EdgeInsets.fromLTRB(
                                                  horizontalPadding,
                                                  8,
                                                  horizontalPadding,
                                                  126,
                                                ),
                                                itemCount:
                                                    filteredProducts.length,
                                                onReorder: _onReorder,
                                                buildDefaultDragHandles: false,
                                                itemBuilder: (context, index) {
                                                  final product =
                                                      filteredProducts[index];
                                                  return TweenAnimationBuilder<
                                                    double
                                                  >(
                                                    key: ValueKey(product.id),
                                                    tween: Tween(
                                                      begin: 0,
                                                      end: 1,
                                                    ),
                                                    duration: Duration(
                                                      milliseconds:
                                                          260 + (index * 18),
                                                    ),
                                                    curve: Curves.easeOut,
                                                    builder: (context, value, child) {
                                                      return Opacity(
                                                        opacity: value,
                                                        child:
                                                            Transform.translate(
                                                              offset: Offset(
                                                                0,
                                                                (1 - value) *
                                                                    10,
                                                              ),
                                                              child: child,
                                                            ),
                                                      );
                                                    },
                                                    child: _ProductCard(
                                                      product: product,
                                                      fallbackImageUrl:
                                                          (_businessLogoUrl !=
                                                                  null &&
                                                              _businessLogoUrl!
                                                                  .trim()
                                                                  .isNotEmpty)
                                                          ? _businessLogoUrl!
                                                                .trim()
                                                          : _defaultBrandLogoUrl,
                                                      isUpdatingImage:
                                                          _updatingImageProductIds
                                                              .contains(
                                                                product.id,
                                                              ),
                                                      onEditImage: () =>
                                                          _generateAiImageForProduct(
                                                            product,
                                                          ),
                                                      onEdit: () =>
                                                          _openProductForm(
                                                            product: product,
                                                          ),
                                                      onDelete: () =>
                                                          _deleteProduct(
                                                            product,
                                                          ),
                                                      onToggleVisible:
                                                          (value) =>
                                                              _toggleVisibility(
                                                                product,
                                                                value,
                                                              ),
                                                      dragHandle:
                                                          ReorderableDragStartListener(
                                                            index: index,
                                                            child: Icon(
                                                              Icons
                                                                  .drag_indicator,
                                                              color: colorScheme
                                                                  .onSurfaceVariant,
                                                            ),
                                                          ),
                                                      onOpenImageOptions: () =>
                                                          _openProductImageOptions(
                                                            product,
                                                          ),
                                                    ),
                                                  );
                                                },
                                              ),
                                      ),
                              ),
                              if (_isLoadingMore)
                                const Padding(
                                  padding: EdgeInsets.symmetric(vertical: 10),
                                  child: CircularProgressIndicator(),
                                ),
                            ],
                          ),
                          if (_isSavingOrder)
                            Positioned.fill(
                              child: Container(
                                color: Colors.black.withValues(alpha: 0.12),
                                alignment: Alignment.center,
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    CircularProgressIndicator(),
                                    SizedBox(height: 10),
                                    Text(
                                      'Guardando nuevo orden...',
                                      style: TextStyle(
                                        color: colorScheme.onSurface,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({
    super.key,
    required this.product,
    required this.fallbackImageUrl,
    required this.isUpdatingImage,
    required this.onEditImage,
    required this.onOpenImageOptions,
    required this.onEdit,
    required this.onDelete,
    required this.onToggleVisible,
    required this.dragHandle,
  });

  final ProductModel product;
  final String fallbackImageUrl;
  final bool isUpdatingImage;
  final VoidCallback onEditImage;
  final VoidCallback onOpenImageOptions;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final ValueChanged<bool> onToggleVisible;
  final Widget dragHandle;

  @override
  Widget build(BuildContext context) {
    final product = this.product;
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: colorScheme.surfaceContainerHigh,
        border: Border.all(color: colorScheme.outlineVariant),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1A000000),
            blurRadius: 16,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              GestureDetector(
                onTap: isUpdatingImage ? null : onOpenImageOptions,
                child: _ProductThumb(
                  imageUrl: product.imagenUrl,
                  fallbackImageUrl: fallbackImageUrl,
                  heroTag: 'hero-product-image-${product.id}',
                  isUpdating: isUpdatingImage,
                  aiImageStatus: product.aiImageStatus,
                  isAiGeneratedImage: product.isAiGeneratedImage,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product.nombre,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.manrope(
                        color: colorScheme.onSurface,
                        fontWeight: FontWeight.w800,
                        fontSize: 17,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Icon(
                          Icons.sell_rounded,
                          size: 16,
                          color: colorScheme.primary,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            'Precio \$${product.precio.toStringAsFixed(2)}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: colorScheme.primary,
                              fontWeight: FontWeight.w800,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              dragHandle,
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              FilledButton.icon(
                onPressed: isUpdatingImage ? null : onEditImage,
                icon: const Icon(Icons.auto_awesome, size: 18),
                label: const Text('Mejorar imagen'),
                style: FilledButton.styleFrom(
                  backgroundColor: colorScheme.primary,
                  foregroundColor: colorScheme.onPrimary,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),
                  minimumSize: const Size(0, 42),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: onEdit,
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(0, 42),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 10,
                  ),
                  side: BorderSide(color: colorScheme.outlineVariant),
                  foregroundColor: colorScheme.onSurface,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text('Editar'),
              ),
              const Spacer(),
              IconButton(
                onPressed: onDelete,
                tooltip: 'Eliminar producto',
                icon: const Icon(Icons.delete_outline, size: 18),
                style: IconButton.styleFrom(
                  minimumSize: const Size(38, 38),
                  padding: EdgeInsets.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  backgroundColor: colorScheme.secondaryContainer,
                  foregroundColor: colorScheme.onSecondaryContainer,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

String _formatAiImageErrorMessage(String? rawMessage) {
  final message = (rawMessage ?? '').trim();
  if (message.isEmpty) {
    return 'No se pudo generar la imagen IA.';
  }

  final normalized = message.toLowerCase();

  if (normalized.contains('resource_exhausted') ||
      normalized.contains('prepayment credits are depleted') ||
      normalized.contains('gemini image generation failed (429)')) {
    return 'Google Gemini no tiene saldo disponible en este momento. Recarga créditos del proyecto e inténtalo de nuevo.';
  }

  if (normalized.contains('not enough credits')) {
    return 'Este comercio no tiene créditos IA suficientes para generar la imagen.';
  }

  if (normalized.contains(
    'ai image generation is only available once during onboarding',
  )) {
    return 'La generación de imágenes IA solo está disponible una vez durante el onboarding.';
  }

  if (normalized.contains('unauthorized request') ||
      normalized.contains('worker secret')) {
    return 'El servicio interno de imágenes IA no está disponible ahora mismo.';
  }

  if (normalized.contains('producto no encontrado')) {
    return 'No se encontró el producto para generar su imagen IA.';
  }

  if (normalized.contains('ya tiene una imagen manual')) {
    return 'Este producto ya tiene una imagen manual.';
  }

  final firstLine = message.split('\n').first.trim();
  return firstLine.isEmpty ? 'No se pudo generar la imagen IA.' : firstLine;
}

class _ProductThumb extends StatelessWidget {
  const _ProductThumb({
    required this.imageUrl,
    required this.fallbackImageUrl,
    required this.aiImageStatus,
    required this.isAiGeneratedImage,
    this.isUpdating = false,
    this.heroTag,
  });

  final String? imageUrl;
  final String fallbackImageUrl;
  final String aiImageStatus;
  final bool isAiGeneratedImage;
  final bool isUpdating;
  final String? heroTag;

  @override
  Widget build(BuildContext context) {
    final primary = imageUrl?.trim();
    final fallback = fallbackImageUrl.trim();
    final hasFallback = fallback.isNotEmpty;
    final isAiPending =
        aiImageStatus == 'pending' || aiImageStatus == 'processing';
    final isAiFailed = aiImageStatus == 'failed';

    Widget iconFallback() => Container(
      width: 100,
      height: 100,
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: const Icon(Icons.fastfood_outlined),
    );

    Widget networkWithFallback(String url, {String? backupUrl}) {
      return Image.network(
        url,
        width: 100,
        height: 100,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stackTrace) {
          if (backupUrl != null &&
              backupUrl.trim().isNotEmpty &&
              backupUrl != url) {
            return Image.network(
              backupUrl,
              width: 100,
              height: 100,
              fit: BoxFit.cover,
              errorBuilder: (context, error, stackTrace) => iconFallback(),
            );
          }
          return iconFallback();
        },
      );
    }

    final thumbChild = primary != null && primary.isNotEmpty
        ? networkWithFallback(primary, backupUrl: hasFallback ? fallback : null)
        : hasFallback
        ? networkWithFallback(fallback)
        : iconFallback();

    final thumb = ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: Stack(
        children: [
          thumbChild,
          if (isAiGeneratedImage && !isAiPending && !isAiFailed)
            Positioned(
              top: 6,
              left: 6,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primary.withValues(
                    alpha: 0.16,
                  ),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  'IA',
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.onSurface,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          Positioned(
            right: 6,
            bottom: 6,
            child: Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.62),
                shape: BoxShape.circle,
              ),
              child: isUpdating || isAiPending
                  ? const Padding(
                      padding: EdgeInsets.all(5),
                      child: CircularProgressIndicator(strokeWidth: 1.8),
                    )
                  : Icon(
                      isAiFailed
                          ? Icons.error_outline_rounded
                          : isAiGeneratedImage
                          ? Icons.auto_awesome_rounded
                          : Icons.camera_alt_rounded,
                      size: 13,
                      color: Colors.white,
                    ),
            ),
          ),
        ],
      ),
    );

    if (heroTag == null || heroTag!.isEmpty) {
      return thumb;
    }

    return Hero(tag: heroTag!, child: thumb);
  }
}

class _EmptyProductsCard extends StatelessWidget {
  const _EmptyProductsCard({
    required this.hasSearchOrFilter,
    required this.onClear,
  });

  final bool hasSearchOrFilter;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: colorScheme.surfaceContainerHigh,
        border: Border.all(color: colorScheme.primary.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          Icon(
            hasSearchOrFilter
                ? Icons.search_off_rounded
                : Icons.inventory_2_outlined,
            size: 32,
            color: colorScheme.primary,
          ),
          const SizedBox(height: 8),
          Text(
            hasSearchOrFilter
                ? 'No encontramos productos con esos filtros'
                : 'Aún no hay productos en esta categoría',
            textAlign: TextAlign.center,
            style: GoogleFonts.manrope(
              color: colorScheme.onSurface,
              fontWeight: FontWeight.w800,
              fontSize: 16,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            hasSearchOrFilter
                ? 'Prueba otro término, cambia el filtro o limpia la búsqueda.'
                : 'Crea tu primer producto para empezar a vender en este menú.',
            textAlign: TextAlign.center,
            style: TextStyle(color: colorScheme.onSurfaceVariant),
          ),
          if (hasSearchOrFilter) ...[
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: onClear,
              icon: const Icon(Icons.filter_alt_off_rounded),
              label: const Text('Limpiar filtros'),
            ),
          ],
        ],
      ),
    );
  }
}

enum _ProductVisibilityFilter { all, visible, hidden }

extension on _ProductVisibilityFilter {
  String get label {
    switch (this) {
      case _ProductVisibilityFilter.all:
        return 'Todos';
      case _ProductVisibilityFilter.visible:
        return 'Visibles';
      case _ProductVisibilityFilter.hidden:
        return 'Ocultos';
    }
  }

  IconData get icon {
    switch (this) {
      case _ProductVisibilityFilter.all:
        return Icons.inventory_2_outlined;
      case _ProductVisibilityFilter.visible:
        return Icons.visibility_rounded;
      case _ProductVisibilityFilter.hidden:
        return Icons.visibility_off_rounded;
    }
  }
}
