import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/services/branding_ai_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final BrandingAiService _brandingAiService = const BrandingAiService();
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
  }

  @override
  void dispose() {
    _brandingPromptController.dispose();
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

      final pendingFonts = _registerBrandingFonts(response['branding_ia']);
      if (pendingFonts != null) {
        await pendingFonts;
      }

      await _refreshBusiness();
      _brandingPromptController.clear();

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Tu nueva identidad visual ya está lista.'),
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
    final color = _parseHexColor(value, fallback);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFF211912),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0x22FFFFFF)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: GoogleFonts.poppins(
                color: const Color(0xFFE7CCAA),
                fontSize: 12,
                fontWeight: FontWeight.w600,
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
              style: const TextStyle(color: Colors.white70, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBrandingPreview(Map<String, dynamic> business) {
    final branding = _brandingMap(business['branding_ia']);
    if (branding == null) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFF120F0C),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0x22FFFFFF)),
        ),
        child: Text(
          'Todavía no hay una identidad visual generada. Describe tu estilo y deja que la IA proponga una dirección visual.',
          style: GoogleFonts.poppins(
            color: const Color(0xFFCEB89A),
            height: 1.45,
          ),
        ),
      );
    }

    final colorPrincipal = branding['color_principal']?.toString() ?? '';
    final colorSecundario = branding['color_secundario']?.toString() ?? '';
    final fuenteTitulos =
        branding['fuente_titulos']?.toString() ?? 'Sin definir';
    final fuenteCuerpo = branding['fuente_cuerpo']?.toString() ?? 'Sin definir';
    final estiloBotones = branding['estilo_botones']?.toString() ?? 'rounded';
    final descripcionVisual = branding['descripcion_visual']?.toString() ?? '';
    final moodTags = _brandingMoodTags(branding['mood_tags']);
    final titlePreviewStyle = _previewFontStyle(
      fontFamily: fuenteTitulos,
      fallback: GoogleFonts.poppins(
        color: const Color(0xFFFFF2DD),
        fontSize: 24,
        fontWeight: FontWeight.w700,
      ),
    );
    final bodyPreviewStyle = _previewFontStyle(
      fontFamily: fuenteCuerpo,
      fallback: GoogleFonts.poppins(
        color: const Color(0xFFCEB89A),
        fontSize: 14,
        height: 1.5,
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Vista previa del branding IA',
          style: GoogleFonts.poppins(
            color: const Color(0xFFFFE2BF),
            fontWeight: FontWeight.w700,
          ),
        ),
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
        Text(
          'Titulares: $fuenteTitulos',
          style: const TextStyle(color: Colors.white70),
        ),
        const SizedBox(height: 4),
        Text(
          'Cuerpo: $fuenteCuerpo',
          style: const TextStyle(color: Colors.white70),
        ),
        const SizedBox(height: 4),
        Text(
          'Botones: $estiloBotones',
          style: const TextStyle(color: Colors.white70),
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
                color: const Color(0xFF120F0C),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0x22FFFFFF)),
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
                            style: GoogleFonts.poppins(
                              color: const Color(0xFFE7CCAA),
                              fontSize: 12,
                            ),
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
                      color: const Color(0xFF2B2118),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: const Color(0x33FFFFFF)),
                    ),
                    child: Text(
                      tag,
                      style: GoogleFonts.poppins(
                        color: const Color(0xFFFFD8A7),
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
        ],
        if (descripcionVisual.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(
            descripcionVisual,
            style: GoogleFonts.poppins(
              color: const Color(0xFFCEB89A),
              height: 1.45,
            ),
          ),
        ],
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
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
      backgroundColor: const Color(0xFF0F0D0B),
      appBar: AppBar(
        backgroundColor: const Color(0xFF17120E),
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('Perfil'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(24),
                gradient: const LinearGradient(
                  colors: [Color(0xFF2A1C12), Color(0xFF15100C)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                border: Border.all(color: const Color(0x33FFFFFF)),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 34,
                    backgroundColor: const Color(0xFF352316),
                    backgroundImage: avatar.isNotEmpty
                        ? NetworkImage(avatar)
                        : null,
                    child: avatar.isEmpty
                        ? Text(
                            _avatarInitial(name),
                            style: GoogleFonts.poppins(
                              color: const Color(0xFFFFD8A7),
                              fontSize: 22,
                              fontWeight: FontWeight.w700,
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
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          email,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.poppins(
                            color: const Color(0xFFE7CCAA),
                            fontSize: 12,
                          ),
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
                    color: Color(0xFF17120E),
                    child: Padding(
                      padding: EdgeInsets.all(16),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  );
                }

                if (snapshot.hasError) {
                  return Card(
                    color: const Color(0xFF17120E),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        'No se pudo cargar el negocio: ${snapshot.error}',
                        style: const TextStyle(color: Colors.white70),
                      ),
                    ),
                  );
                }

                final business = snapshot.data;
                if (business == null) {
                  return const Card(
                    color: Color(0xFF17120E),
                    child: Padding(
                      padding: EdgeInsets.all(16),
                      child: Text(
                        'No se encontro informacion del negocio actual.',
                        style: TextStyle(color: Colors.white70),
                      ),
                    ),
                  );
                }

                return Card(
                  color: const Color(0xFF17120E),
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
                          style: GoogleFonts.poppins(
                            color: const Color(0xFFFFE2BF),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          business['nombre']?.toString() ?? 'Sin nombre',
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Categoria: ${(business['categoria'] ?? 'No definida').toString()}',
                          style: const TextStyle(color: Colors.white70),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'WhatsApp: ${(business['whatsapp'] ?? 'No configurado').toString()}',
                          style: const TextStyle(color: Colors.white70),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'ID: ${(business['id'] ?? '').toString()}',
                          style: const TextStyle(
                            color: Colors.white54,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 18),
                        TextFormField(
                          controller: _brandingPromptController,
                          enabled: !_isGeneratingBranding,
                          minLines: 2,
                          maxLines: 4,
                          style: GoogleFonts.poppins(color: Colors.white),
                          decoration: InputDecoration(
                            labelText: 'Describe el estilo de tu marca',
                            hintText: 'Quiero algo minimalista y elegante',
                            hintStyle: GoogleFonts.poppins(
                              color: const Color(0xFF8F7B68),
                            ),
                            labelStyle: GoogleFonts.poppins(
                              color: const Color(0xFFE7CCAA),
                            ),
                            filled: true,
                            fillColor: const Color(0xFF120F0C),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: const BorderSide(
                                color: Color(0x33FFFFFF),
                              ),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: const BorderSide(
                                color: Color(0x33FFFFFF),
                              ),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: const BorderSide(
                                color: Color(0xFFFFB45C),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        FilledButton.icon(
                          onPressed: _isGeneratingBranding
                              ? null
                              : () => _generateBranding(business),
                          style: FilledButton.styleFrom(
                            backgroundColor: const Color(0xFFFF8C42),
                            foregroundColor: Colors.white,
                            minimumSize: const Size.fromHeight(50),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          icon: const Icon(Icons.auto_awesome_rounded),
                          label: const Text('Diseño con IA'),
                        ),
                        if (_isGeneratingBranding) ...[
                          const SizedBox(height: 14),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: const Color(0xFF120F0C),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: const Color(0x22FFFFFF),
                              ),
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
                                    style: GoogleFonts.poppins(
                                      color: const Color(0xFFCEB89A),
                                      height: 1.4,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                        const SizedBox(height: 18),
                        _buildBrandingPreview(business),
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
                backgroundColor: const Color(0xFFBF2F2F),
                foregroundColor: Colors.white,
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
