/// Canonical Venezuelan federal entities for virtual-business operating areas.
///
/// Slugs are stable DB values (`comercios.estados_operacion`). Display names and
/// aliases are used in the merchant UI and public directory region matching.
class VenezuelaState {
  const VenezuelaState({
    required this.slug,
    required this.name,
    this.aliases = const <String>[],
  });

  final String slug;
  final String name;
  final List<String> aliases;
}

const List<VenezuelaState> venezuelaStates = <VenezuelaState>[
  VenezuelaState(
    slug: 'distrito-capital',
    name: 'Distrito Capital',
    aliases: <String>['Caracas', 'Caracas DC', 'DC', 'Capital'],
  ),
  VenezuelaState(slug: 'amazonas', name: 'Amazonas'),
  VenezuelaState(
    slug: 'anzoategui',
    name: 'Anzoátegui',
    aliases: <String>['Anzoategui'],
  ),
  VenezuelaState(slug: 'apure', name: 'Apure'),
  VenezuelaState(slug: 'aragua', name: 'Aragua'),
  VenezuelaState(slug: 'barinas', name: 'Barinas'),
  VenezuelaState(
    slug: 'bolivar',
    name: 'Bolívar',
    aliases: <String>['Bolivar'],
  ),
  VenezuelaState(slug: 'carabobo', name: 'Carabobo'),
  VenezuelaState(slug: 'cojedes', name: 'Cojedes'),
  VenezuelaState(slug: 'delta-amacuro', name: 'Delta Amacuro'),
  VenezuelaState(
    slug: 'falcon',
    name: 'Falcón',
    aliases: <String>['Falcon'],
  ),
  VenezuelaState(
    slug: 'guarico',
    name: 'Guárico',
    aliases: <String>['Guarico'],
  ),
  VenezuelaState(
    slug: 'la-guaira',
    name: 'La Guaira',
    aliases: <String>['Vargas'],
  ),
  VenezuelaState(slug: 'lara', name: 'Lara'),
  VenezuelaState(
    slug: 'merida',
    name: 'Mérida',
    aliases: <String>['Merida'],
  ),
  VenezuelaState(slug: 'miranda', name: 'Miranda'),
  VenezuelaState(slug: 'monagas', name: 'Monagas'),
  VenezuelaState(slug: 'nueva-esparta', name: 'Nueva Esparta'),
  VenezuelaState(slug: 'portuguesa', name: 'Portuguesa'),
  VenezuelaState(slug: 'sucre', name: 'Sucre'),
  VenezuelaState(
    slug: 'tachira',
    name: 'Táchira',
    aliases: <String>['Tachira'],
  ),
  VenezuelaState(slug: 'trujillo', name: 'Trujillo'),
  VenezuelaState(
    slug: 'yaracuy',
    name: 'Yaracuy',
  ),
  VenezuelaState(slug: 'zulia', name: 'Zulia'),
];

final Map<String, VenezuelaState> _venezuelaStatesBySlug = <String, VenezuelaState>{
  for (final state in venezuelaStates) state.slug: state,
};

VenezuelaState? venezuelaStateBySlug(String? slug) {
  final key = (slug ?? '').trim().toLowerCase();
  if (key.isEmpty) return null;
  return _venezuelaStatesBySlug[key];
}

/// Keeps only known slugs, de-duplicated, in catalog order.
List<String> sanitizeVenezuelaStateSlugs(Iterable<dynamic>? raw) {
  if (raw == null) return const <String>[];
  final selected = <String>{};
  for (final item in raw) {
    final slug = item?.toString().trim().toLowerCase() ?? '';
    if (_venezuelaStatesBySlug.containsKey(slug)) {
      selected.add(slug);
    }
  }
  return venezuelaStates
      .where((state) => selected.contains(state.slug))
      .map((state) => state.slug)
      .toList(growable: false);
}

String venezuelaStateLabel(String slug) {
  return venezuelaStateBySlug(slug)?.name ?? slug;
}

String formatVenezuelaOperatingStates(Iterable<String> slugs) {
  final labels = sanitizeVenezuelaStateSlugs(slugs)
      .map(venezuelaStateLabel)
      .toList(growable: false);
  if (labels.isEmpty) return '';
  if (labels.length == 1) return labels.first;
  if (labels.length == 2) return '${labels[0]} y ${labels[1]}';
  return '${labels.sublist(0, labels.length - 1).join(', ')} y ${labels.last}';
}
