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
        const SnackBar(content: Text('Selecciona un catálogo válido.')),
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
      appBar: AppBar(
        title: Text(widget.isEditing ? 'Editar Producto' : 'Nuevo Producto'),
      ),
      body: Stack(
        children: [
          Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                DropdownButtonFormField<String>(
                  initialValue: _selectedCategoryId,
                  items: widget.categories
                      .map(
                        (category) => DropdownMenuItem<String>(
                          value: category.id,
                          child: Text(category.nombre),
                        ),
                      )
                      .toList(),
                  onChanged: _isSaving
                      ? null
                      : (value) => setState(() => _selectedCategoryId = value),
                  decoration: const InputDecoration(labelText: 'Catálogo'),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _nameController,
                  enabled: !_isSaving,
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
                  controller: _descriptionController,
                  enabled: !_isSaving,
                  decoration: const InputDecoration(labelText: 'Descripción'),
                  minLines: 2,
                  maxLines: 4,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _priceController,
                  enabled: !_isSaving,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
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
                const SizedBox(height: 16),
                if (previewImage != null)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.file(
                      File(previewImage),
                      fit: BoxFit.cover,
                      height: 170,
                    ),
                  )
                else if (_imageUrl != null && _imageUrl!.trim().isNotEmpty)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.network(
                      _imageUrl!,
                      fit: BoxFit.cover,
                      height: 170,
                    ),
                  )
                else
                  Container(
                    height: 140,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      color: Theme.of(context).colorScheme.surfaceContainerHighest,
                    ),
                    alignment: Alignment.center,
                    child: const Text('Sin foto seleccionada'),
                  ),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: _isSaving ? null : _pickImageFromGallery,
                  icon: const Icon(Icons.photo_library_outlined),
                  label: const Text('Seleccionar foto de galería'),
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: _isSaving ? null : _save,
                  icon: const Icon(Icons.save_outlined),
                  label: Text(widget.isEditing ? 'Guardar Cambios' : 'Crear Producto'),
                ),
                if (_isUploadingImage) ...[
                  const SizedBox(height: 14),
                  const Center(child: CircularProgressIndicator()),
                  const SizedBox(height: 8),
                  const Center(child: Text('Subiendo y optimizando imagen...')),
                ],
              ],
            ),
          ),
          if (_isSaving && !_isUploadingImage)
            Container(
              color: Colors.black.withValues(alpha: 0.15),
              alignment: Alignment.center,
              child: const CircularProgressIndicator(),
            ),
        ],
      ),
    );
  }
}
