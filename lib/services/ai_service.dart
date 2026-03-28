class AiService {
  const AiService();

  Future<Map<String, dynamic>> analyzeMenuFromImageUrl(String imageUrl) async {
    await Future<void>.delayed(const Duration(seconds: 2));

    return <String, dynamic>{
      'origen': 'mock-ai',
      'imagen_url': imageUrl,
      'comercio_sugerido': 'Hamburgueseria El Barrio',
      'categorias': <Map<String, dynamic>>[
        <String, dynamic>{
          'nombre': 'Hamburguesas',
          'productos': <Map<String, dynamic>>[
            <String, dynamic>{
              'nombre': 'Hamburguesa Clasica',
              'descripcion': 'Carne, queso cheddar, lechuga y tomate.',
              'precio': 8.50,
            },
            <String, dynamic>{
              'nombre': 'Hamburguesa Doble BBQ',
              'descripcion': 'Doble carne, cebolla crispy y salsa BBQ.',
              'precio': 11.90,
            },
          ],
        },
        <String, dynamic>{
          'nombre': 'Acompanamientos y Bebidas',
          'productos': <Map<String, dynamic>>[
            <String, dynamic>{
              'nombre': 'Papas Fritas Rusticas',
              'descripcion': 'Porcion mediana con sal ahumada.',
              'precio': 3.50,
            },
            <String, dynamic>{
              'nombre': 'Gaseosa 500ml',
              'descripcion': 'Sabores surtidos.',
              'precio': 2.00,
            },
          ],
        },
      ],
    };
  }
}
