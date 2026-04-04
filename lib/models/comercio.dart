class ComercioModel {
  final String id;
  final String? slug;
  final String nombre;
  final String? logoUrl;
  final String? whatsapp;
  final String? menuPalette;
  final int? menuPalettePrimaryArgb;
  final int? menuPaletteAccentArgb;
  final int? menuPaletteSurfaceArgb;
  final int? menuPaletteTextArgb;
  final bool enLinea;
  final bool? creadoPorIa;
  final double? confianzaIa;

  const ComercioModel({
    required this.id,
    this.slug,
    required this.nombre,
    this.logoUrl,
    this.whatsapp,
    this.menuPalette,
    this.menuPalettePrimaryArgb,
    this.menuPaletteAccentArgb,
    this.menuPaletteSurfaceArgb,
    this.menuPaletteTextArgb,
    this.enLinea = true,
    this.creadoPorIa,
    this.confianzaIa,
  });

  factory ComercioModel.fromMap(Map<String, dynamic> map) {
    final confianzaValue = map['confianza_ia'];
    final rawSlug = map['slug']?.toString().trim();

    return ComercioModel(
      id: map['id']?.toString() ?? '',
      slug: (rawSlug == null || rawSlug.isEmpty) ? null : rawSlug,
      nombre: map['nombre']?.toString() ?? 'Comercio',
      logoUrl: map['logo_url']?.toString(),
      whatsapp: map['whatsapp']?.toString(),
      menuPalette: map['menu_palette']?.toString(),
        menuPalettePrimaryArgb: _toInt(map['menu_palette_primary']),
        menuPaletteAccentArgb: _toInt(map['menu_palette_accent']),
        menuPaletteSurfaceArgb: _toInt(map['menu_palette_surface']),
        menuPaletteTextArgb: _toInt(map['menu_palette_text']),
      enLinea: map['en_linea'] is bool ? map['en_linea'] as bool : true,
      creadoPorIa: map['creado_por_ia'] as bool?,
      confianzaIa: confianzaValue is num
          ? confianzaValue.toDouble()
          : double.tryParse('${map['confianza_ia']}'),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'slug': slug,
      'nombre': nombre,
      'logo_url': logoUrl,
      'whatsapp': whatsapp,
      'menu_palette': menuPalette,
      'menu_palette_primary': menuPalettePrimaryArgb,
      'menu_palette_accent': menuPaletteAccentArgb,
      'menu_palette_surface': menuPaletteSurfaceArgb,
      'menu_palette_text': menuPaletteTextArgb,
      'en_linea': enLinea,
      'creado_por_ia': creadoPorIa,
      'confianza_ia': confianzaIa,
    };
  }

  static int? _toInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '');
  }
}
