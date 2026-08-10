/// Optional merchant-set badge shown on a product card ("Más pedido",
/// "Mejor valor", "Ahorra"). Always explicitly chosen by the merchant —
/// never inferred from fake popularity or sales data.
class UpsellBadge {
  static const String masPedido = 'mas_pedido';
  static const String mejorValor = 'mejor_valor';
  static const String ahorra = 'ahorra';

  static const List<String> values = <String>[
    masPedido,
    mejorValor,
    ahorra,
  ];

  static String? normalize(dynamic value) {
    final raw = value?.toString().trim().toLowerCase() ?? '';
    if (raw.isEmpty) return null;
    if (values.contains(raw)) return raw;
    return null;
  }

  static String label(String? value) {
    switch (value) {
      case masPedido:
        return 'Más pedido';
      case mejorValor:
        return 'Mejor valor';
      case ahorra:
        return 'Ahorra';
      default:
        return 'Sin badge';
    }
  }
}
