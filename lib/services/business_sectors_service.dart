import 'package:supabase_flutter/supabase_flutter.dart';

class BusinessSector {
  const BusinessSector({
    required this.id,
    required this.nombre,
    required this.sortOrder,
  });

  final String id;
  final String nombre;
  final int sortOrder;

  factory BusinessSector.fromMap(Map<String, dynamic> map) {
    final sortValue = map['sort_order'];
    return BusinessSector(
      id: map['id']?.toString() ?? '',
      nombre: map['nombre']?.toString().trim() ?? '',
      sortOrder: sortValue is num
          ? sortValue.toInt()
          : int.tryParse(sortValue?.toString() ?? '') ?? 0,
    );
  }
}

class BusinessSectorsService {
  const BusinessSectorsService();

  static const List<String> fallbackSectorNames = <String>[
    'Abastos y minimarket',
    'Abogado',
    'Academia de idiomas',
    'Agencia de marketing',
    'Agencia de viajes',
    'Agricola',
    'Arquitectura',
    'Arte y diseno',
    'Asesoria contable',
    'Autolavado',
    'Automotriz',
    'Bar',
    'Barberia',
    'Belleza',
    'Bienes raices',
    'Boutique',
    'Cafe',
    'Carniceria',
    'Centro educativo',
    'Cerrajeria',
    'Clinica',
    'Cocteleria',
    'Comida rapida',
    'Consultoria',
    'Construccion',
    'Cuidado personal',
    'Delivery y logistica',
    'Deportes',
    'Discoteca',
    'Diseno grafico',
    'E-commerce',
    'Electricidad',
    'Eventos',
    'Farmacia',
    'Ferreteria',
    'Finanzas',
    'Floristeria',
    'Fotografia',
    'Gimnasio',
    'Heladeria',
    'Hospedaje',
    'Imprenta',
    'Informatica y tecnologia',
    'Joyeria',
    'Laboratorio',
    'Lavanderia',
    'Licoreria',
    'Libreria',
    'Mecanica',
    'Medicina',
    'Moda',
    'Muebles y decoracion',
    'Panaderia',
    'Papeleria',
    'Peluqueria',
    'Pizzeria',
    'Pollera',
    'Reparaciones',
    'Reposteria',
    'Restaurante',
    'Salud',
    'Servicios legales',
    'Spa',
    'Supermercado',
    'Taller de motos',
    'Tienda de mascotas',
    'Tienda de ropa',
    'Veterinaria',
    'Videojuegos',
    'Otros',
  ];

  Future<List<String>> fetchActiveSectorNames() async {
    final sectors = await fetchActiveSectors();
    if (sectors.isEmpty) {
      return List<String>.from(fallbackSectorNames);
    }

    final names = sectors
        .map((sector) => sector.nombre.trim())
        .where((name) => name.isNotEmpty)
        .toList();

    if (!names.contains('Otros')) {
      names.add('Otros');
    }

    return names;
  }

  Future<List<BusinessSector>> fetchActiveSectors() async {
    try {
      final rows = await Supabase.instance.client
          .from('sectores_negocio')
          .select('id, nombre, sort_order')
          .eq('is_active', true)
          .order('sort_order', ascending: true)
          .order('nombre', ascending: true);

      return (rows as List<dynamic>)
          .whereType<Map>()
          .map((row) => BusinessSector.fromMap(Map<String, dynamic>.from(row)))
          .where((sector) => sector.nombre.isNotEmpty)
          .toList();
    } catch (_) {
      return const <BusinessSector>[];
    }
  }
}
