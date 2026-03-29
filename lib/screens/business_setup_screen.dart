import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class BusinessSetupScreen extends StatefulWidget {
  const BusinessSetupScreen({super.key});

  @override
  State<BusinessSetupScreen> createState() => _BusinessSetupScreenState();
}

class _BusinessSetupScreenState extends State<BusinessSetupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();

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

  String _selectedCategory = _categories.first;
  XFile? _selectedLogo;
  bool _saving = false;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _pickLogo() async {
    final picker = ImagePicker();
    final image = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 88,
      maxWidth: 1400,
    );

    if (!mounted || image == null) return;
    setState(() => _selectedLogo = image);
  }

  String _buildLogoPath(String userId, String businessName, String extension) {
    final safeName = businessName
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'-+'), '-')
        .replaceAll(RegExp(r'^-|-$'), '');
    final now = DateTime.now().millisecondsSinceEpoch;
    final normalizedExt = extension.isEmpty ? 'jpg' : extension;
    return '$userId/${safeName.isEmpty ? 'logo' : safeName}_$now.$normalizedExt';
  }

  Future<String?> _uploadLogoIfNeeded(User user) async {
    final logo = _selectedLogo;
    if (logo == null) return null;

    final bytes = await logo.readAsBytes();
    final fileName = logo.name;
    final extMatch = RegExp(r'\.([a-zA-Z0-9]+)$').firstMatch(fileName);
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

    final publicUrl = Supabase.instance.client.storage
        .from('logos-comercios')
        .getPublicUrl(path);
    return publicUrl;
  }

  bool _isMissingColumnError(PostgrestException error, String columnName) {
    final message = error.message.toLowerCase();
    return message.contains(columnName.toLowerCase()) &&
        (message.contains('column') || message.contains('schema cache'));
  }

  Future<String> _insertComercioWithFallback({
    required User user,
    required String logoUrl,
  }) async {
    final payload = <String, dynamic>{
      'owner_id': user.id,
      'nombre': _nameController.text.trim(),
      'categoria': _selectedCategory,
      'logo_url': logoUrl,
    };

    try {
      final row = await Supabase.instance.client
          .from('comercios')
          .insert(payload)
          .select('id')
          .single();
      return row['id'].toString();
    } on PostgrestException catch (error) {
      // Graceful fallback in case older schemas still lack optional columns.
      if (_isMissingColumnError(error, 'categoria')) {
        payload.remove('categoria');
      }
      if (_isMissingColumnError(error, 'logo_url')) {
        payload.remove('logo_url');
      }

      final row = await Supabase.instance.client
          .from('comercios')
          .insert(payload)
          .select('id')
          .single();
      return row['id'].toString();
    }
  }

  Future<void> _saveBusiness() async {
    if (_saving || !_formKey.currentState!.validate()) return;

    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No hay sesion activa. Inicia sesion nuevamente.')),
      );
      return;
    }

    setState(() => _saving = true);

    try {
      final logoUrl = await _uploadLogoIfNeeded(user) ?? '';
      final comercioId = await _insertComercioWithFallback(
        user: user,
        logoUrl: logoUrl,
      );

      SupabaseConfig.setCurrentComercioId(comercioId);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Negocio creado correctamente.')),
      );
      Navigator.of(context).pushNamedAndRemoveUntil('/', (route) => false);
    } on StorageException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo subir el logo: ${error.message}')),
      );
    } on PostgrestException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar el negocio: ${error.message}')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo completar el registro: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  String? _validateBusinessName(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return 'Ingresa el nombre del restaurante.';
    if (text.length < 3) return 'El nombre debe tener al menos 3 caracteres.';
    return null;
  }

  Widget _buildLogoPicker() {
    final logo = _selectedLogo;

    return InkWell(
      onTap: _saving ? null : _pickLogo,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFF17120E),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0x33FFFFFF)),
        ),
        child: Row(
          children: [
            _LogoPreview(file: logo),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Logo del negocio',
                    style: GoogleFonts.poppins(
                      color: const Color(0xFFFFE2BF),
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    logo == null
                        ? 'Selecciona una imagen para tu marca.'
                        : 'Imagen lista: ${logo.name}',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.poppins(
                      color: Colors.white70,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.photo_library_outlined, color: Color(0xFFFFB04A)),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0D0B),
      appBar: AppBar(
        backgroundColor: const Color(0xFF17120E),
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('Configurar Negocio'),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(18),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 620),
              child: Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(24),
                  gradient: const LinearGradient(
                    colors: [Color(0xFF25180F), Color(0xFF13100D)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  border: Border.all(color: const Color(0x33FFFFFF)),
                ),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Primero, cuentanos sobre tu negocio',
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Esta informacion se usara para personalizar tu panel y aislar tus datos por usuario.',
                        style: GoogleFonts.poppins(
                          color: const Color(0xFFE9D2B3),
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 18),
                      TextFormField(
                        controller: _nameController,
                        validator: _validateBusinessName,
                        textCapitalization: TextCapitalization.words,
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          labelText: 'Nombre del Restaurante',
                          labelStyle: const TextStyle(color: Color(0xFFCCB18E)),
                          prefixIcon: const Icon(
                            Icons.storefront_rounded,
                            color: Color(0xFFFFB04A),
                          ),
                          filled: true,
                          fillColor: const Color(0xFF17120E),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        initialValue: _selectedCategory,
                        dropdownColor: const Color(0xFF17120E),
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          labelText: 'Categoria',
                          labelStyle: const TextStyle(color: Color(0xFFCCB18E)),
                          prefixIcon: const Icon(
                            Icons.category_outlined,
                            color: Color(0xFFFFB04A),
                          ),
                          filled: true,
                          fillColor: const Color(0xFF17120E),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                        items: _categories
                            .map(
                              (item) => DropdownMenuItem<String>(
                                value: item,
                                child: Text(item),
                              ),
                            )
                            .toList(),
                        onChanged: _saving
                            ? null
                            : (value) {
                                if (value == null) return;
                                setState(() => _selectedCategory = value);
                              },
                      ),
                      const SizedBox(height: 14),
                      _buildLogoPicker(),
                      const SizedBox(height: 20),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: _saving ? null : _saveBusiness,
                          icon: _saving
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Icon(Icons.check_circle_outline_rounded),
                          label: Text(_saving ? 'Guardando...' : 'Guardar y Continuar'),
                          style: FilledButton.styleFrom(
                            backgroundColor: const Color(0xFFFF6B00),
                            foregroundColor: Colors.white,
                            minimumSize: const Size.fromHeight(54),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                            textStyle: GoogleFonts.poppins(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
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
        width: 58,
        height: 58,
        decoration: BoxDecoration(
          color: const Color(0xFF2A1C12),
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Icon(Icons.image_outlined, color: Color(0xFFFFB04A)),
      );
    }

    return FutureBuilder<Uint8List>(
      future: file!.readAsBytes(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              color: const Color(0xFF2A1C12),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Center(
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          );
        }

        return ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: Image.memory(
            snapshot.data!,
            width: 58,
            height: 58,
            fit: BoxFit.cover,
          ),
        );
      },
    );
  }
}
