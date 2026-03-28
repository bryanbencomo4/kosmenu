import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
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

  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _priceController = TextEditingController();

  String? _selectedCategoryId;
  String? _imageUrl;
  XFile? _pickedImage;
  bool _isSaving = false;
  bool _isUploadingImage = false;

  @override
  void initState() {
    super.initState();
    final product = widget.product;

    _nameController.text = product?.nombre ?? '';
    _descriptionController.text = product?.descripcion ?? '';
    _priceController.text =
        product != null ? product.precio.toStringAsFixed(2) : '';
    _selectedCategoryId =
        product?.categoriaId ??
        widget.initialCategoryId ??
        (widget.categories.isNotEmpty ? widget.categories.first.id : null);
    _imageUrl = product?.imagenUrl;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _priceController.dispose();
    super.dispose();
  }

  Future<void> _pickImageFromGallery() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(source: ImageSource.gallery);
    if (file == null) return;

    setState(() {
      _pickedImage = file;
    });
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

      final fileToUpload = compressedFile ?? XFile(sourceImage.path);

      final fileName =
          '${SupabaseConfig.currentComercioId}/product_${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(999999)}.jpg';

      await Supabase.instance.client.storage.from(_bucketName).upload(
            fileName,
            File(fileToUpload.path),
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

    if (_selectedCategoryId == null || _selectedCategoryId!.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Selecciona una categoría válida.')),
      );
      return;
    }

    setState(() => _isSaving = true);

    try {
      var finalImageUrl = _imageUrl;
      if (_pickedImage != null) {
        finalImageUrl = await _uploadImage(_pickedImage!);
      }

      final payload = <String, dynamic>{
        'comercio_id': SupabaseConfig.currentComercioId,
        'categoria_id': _selectedCategoryId,
        'nombre': _nameController.text.trim(),
        'descripcion': _descriptionController.text.trim(),
        'precio': double.parse(_priceController.text.trim().replaceAll(',', '.')),
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
    final previewImage = _pickedImage?.path;

    return Scaffold(
      backgroundColor: const Color(0xFF0F0D0B),
      appBar: AppBar(
        backgroundColor: const Color(0xFF17120E),
        foregroundColor: Colors.white,
        title: Text(widget.isEditing ? 'Editar Producto' : 'Nuevo Producto'),
      ),
      body: Stack(
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              final isWide = constraints.maxWidth >= 880;
              final horizontalPadding = isWide ? 28.0 : 14.0;
              final maxWidth = isWide ? 980.0 : 660.0;

              final imagePanel = _ImagePanel(
                previewImagePath: previewImage,
                imageUrl: _imageUrl,
                heroTag: widget.product != null
                    ? 'hero-product-image-${widget.product!.id}'
                    : null,
                isSaving: _isSaving,
                isUploadingImage: _isUploadingImage,
                onPickImage: _pickImageFromGallery,
              );

              final formPanel = _FormPanel(
                formKey: _formKey,
                categories: widget.categories,
                selectedCategoryId: _selectedCategoryId,
                isSaving: _isSaving,
                nameController: _nameController,
                descriptionController: _descriptionController,
                priceController: _priceController,
                isEditing: widget.isEditing,
                onCategoryChanged: (value) =>
                    setState(() => _selectedCategoryId = value),
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
                      26,
                    ),
                    child: isWide
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
                  ),
                ),
              );
            },
          ),
          if (_isSaving)
            Container(
              color: Colors.black.withValues(alpha: 0.18),
              alignment: Alignment.center,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const CircularProgressIndicator(),
                  const SizedBox(height: 10),
                  Text(
                    _isUploadingImage
                        ? 'Subiendo y optimizando imagen...'
                        : 'Guardando producto...',
                    style: const TextStyle(color: Colors.white),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _ImagePanel extends StatelessWidget {
  const _ImagePanel({
    required this.previewImagePath,
    required this.imageUrl,
    required this.heroTag,
    required this.isSaving,
    required this.isUploadingImage,
    required this.onPickImage,
  });

  final String? previewImagePath;
  final String? imageUrl;
  final String? heroTag;
  final bool isSaving;
  final bool isUploadingImage;
  final VoidCallback onPickImage;

  Widget _wrapHero(Widget child) {
    if (heroTag == null || heroTag!.isEmpty) return child;
    return Hero(tag: heroTag!, child: child);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF17120E),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0x2AD7A74D)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Foto del producto',
            style: TextStyle(
              color: Colors.amber.shade100,
              fontWeight: FontWeight.w700,
              fontSize: 16,
            ),
          ),
          const SizedBox(height: 10),
          if (previewImagePath != null)
            _wrapHero(
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.file(
                  File(previewImagePath!),
                  fit: BoxFit.cover,
                  height: 230,
                  width: double.infinity,
                ),
              ),
            )
          else if (imageUrl != null && imageUrl!.trim().isNotEmpty)
            _wrapHero(
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.network(
                  imageUrl!,
                  fit: BoxFit.cover,
                  height: 230,
                  width: double.infinity,
                ),
              ),
            )
          else
            Container(
              height: 200,
              width: double.infinity,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                color: const Color(0xFF251B13),
              ),
              child: const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.photo_camera_back_outlined, color: Colors.white54),
                  SizedBox(height: 8),
                  Text('Sin foto seleccionada', style: TextStyle(color: Colors.white70)),
                ],
              ),
            ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: isSaving ? null : onPickImage,
            icon: const Icon(Icons.photo_library_outlined),
            label: const Text('Seleccionar foto de galería'),
          ),
          if (isUploadingImage) ...[
            const SizedBox(height: 10),
            const LinearProgressIndicator(),
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
    required this.nameController,
    required this.descriptionController,
    required this.priceController,
    required this.isEditing,
    required this.onCategoryChanged,
    required this.onSave,
  });

  final GlobalKey<FormState> formKey;
  final List<CategoryModel> categories;
  final String? selectedCategoryId;
  final bool isSaving;
  final TextEditingController nameController;
  final TextEditingController descriptionController;
  final TextEditingController priceController;
  final bool isEditing;
  final ValueChanged<String?> onCategoryChanged;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    final categoryIds = categories.map((category) => category.id).toSet();
    final effectiveCategoryId = categoryIds.contains(selectedCategoryId)
        ? selectedCategoryId
        : null;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF17120E),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0x2AD7A74D)),
      ),
      child: Form(
        key: formKey,
        child: Column(
          children: [
            DropdownButtonFormField<String>(
              initialValue: effectiveCategoryId,
              isExpanded: true,
              items: categories
                  .map(
                    (category) => DropdownMenuItem<String>(
                      value: category.id,
                      child: Text(
                        category.nombre,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  )
                  .toList(),
              onChanged: isSaving ? null : onCategoryChanged,
              decoration: const InputDecoration(labelText: 'Categoría'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: nameController,
              enabled: !isSaving,
              decoration: const InputDecoration(labelText: 'Nombre'),
              validator: (value) {
                if (value == null || value.trim().isEmpty) {
                  return 'Ingresa un nombre';
                }
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: descriptionController,
              enabled: !isSaving,
              decoration: const InputDecoration(labelText: 'Descripción'),
              minLines: 2,
              maxLines: 4,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: priceController,
              enabled: !isSaving,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Precio'),
              validator: (value) {
                final parsed =
                    double.tryParse((value ?? '').trim().replaceAll(',', '.'));
                if (parsed == null || parsed < 0) {
                  return 'Precio inválido';
                }
                return null;
              },
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: isSaving ? null : onSave,
                icon: const Icon(Icons.save_outlined),
                label: Text(
                  isEditing ? 'Guardar Cambios' : 'Crear Producto',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
