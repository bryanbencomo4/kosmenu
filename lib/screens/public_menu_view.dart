import 'dart:math';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class PublicMenuView extends StatefulWidget {
  const PublicMenuView({super.key, required this.comercioId});

  final String comercioId;

  @override
  State<PublicMenuView> createState() => _PublicMenuViewState();
}

class _PublicMenuViewState extends State<PublicMenuView> {
  static const List<String> _paymentMethods = <String>[
    'Pago Movil',
    'Efectivo (USD/COP)',
    'Zelle',
  ];

  late Future<_PublicMenuData> _menuFuture;
  final Map<String, int> _cart = <String, int>{};
  String? _selectedCategoryId;

  @override
  void initState() {
    super.initState();
    _menuFuture = _fetchMenuData();
  }

  Future<_PublicMenuData> _fetchMenuData() async {
    final client = Supabase.instance.client;

    final comercioFuture = client
        .from('comercios')
        .select()
        .eq('id', widget.comercioId)
        .limit(1)
        .maybeSingle();

    final categoriesFuture = client
        .from('categorias')
        .select()
        .eq('comercio_id', widget.comercioId)
        .order('orden', ascending: true)
        .order('nombre', ascending: true);

    final productsFuture = client
        .from('productos')
        .select()
        .eq('comercio_id', widget.comercioId)
        .eq('disponible', true)
        .order('nombre', ascending: true);

    final results = await Future.wait<dynamic>([
      comercioFuture,
      categoriesFuture,
      productsFuture,
    ]);

    final comercioMap = Map<String, dynamic>.from(
      (results[0] as Map?) ?? const <String, dynamic>{},
    );

    final categories = (results[1] as List<dynamic>)
        .map(
          (row) =>
              _PublicCategory.fromMap(Map<String, dynamic>.from(row as Map)),
        )
        .toList();

    final products = (results[2] as List<dynamic>)
        .map(
          (row) =>
              _PublicProduct.fromMap(Map<String, dynamic>.from(row as Map)),
        )
        .toList();

    return _PublicMenuData(
      comercioNombre: comercioMap['nombre']?.toString() ?? 'Kosmenu',
      whatsappNumber: _normalizePhone(comercioMap['whatsapp']?.toString()),
      tasaCambioPesos: _parseRate(comercioMap['tasa_cambio_pesos']),
      categories: categories,
      products: products,
    );
  }

  String? _normalizePhone(String? rawValue) {
    if (rawValue == null || rawValue.trim().isEmpty) return null;
    final normalized = rawValue.replaceAll(RegExp(r'[^\d]'), '');
    return normalized.isEmpty ? null : normalized;
  }

  double _parseRate(dynamic value) {
    if (value is num) return value.toDouble();

    final normalized = '$value'.trim();
    if (normalized.isEmpty) return 0.0;

    return double.tryParse(normalized.replaceAll(',', '.')) ?? 0.0;
  }

  void _incrementProduct(String productId) {
    setState(() {
      _cart.update(productId, (value) => value + 1, ifAbsent: () => 1);
    });
  }

  void _decrementProduct(String productId) {
    setState(() {
      final current = _cart[productId] ?? 0;
      if (current <= 1) {
        _cart.remove(productId);
      } else {
        _cart[productId] = current - 1;
      }
    });
  }

  String _generateTrackingCode() {
    final code = 100 + Random().nextInt(900);
    return '#KOS-$code';
  }

  Future<void> _registerShadowOrder({
    required String orderCode,
    required List<_CartLine> items,
    required double totalUsd,
    required double tasaAplicada,
    required String selectedPaymentMethod,
  }) async {
    final carritoItems = items
        .map(
          (item) => <String, dynamic>{
            'nombre': item.product.nombre,
            'cantidad': item.quantity,
            'precio': item.product.precio,
          },
        )
        .toList();

    final details = <String, dynamic>{
      'items': carritoItems,
      'tasa_aplicada': tasaAplicada,
      'codigo_orden': orderCode,
      'metodo_pago': selectedPaymentMethod,
    };

    await Supabase.instance.client.from('pedidos').insert({
      'comercio_id': widget.comercioId,
      'detalles': details,
      'total': totalUsd,
      'estado': 'pendiente',
    });
  }

  String _buildWhatsAppMessage({
    required String comercioNombre,
    required String trackingCode,
    required List<_CartLine> items,
    required double totalUsd,
    required double totalCop,
    required double tasaCambioPesos,
    required String paymentMethod,
  }) {
    final buffer = StringBuffer(
      '$trackingCode\nHola $comercioNombre, quiero pedir:\n',
    );

    for (final item in items) {
      buffer.writeln(
        'x${item.quantity} ${item.product.nombre} (${_formatUsd(item.lineTotalUsd)})',
      );
    }

    final copSection = tasaCambioPesos > 0
        ? ' / ${_formatCop(totalCop)} COP'
        : '';
    buffer.writeln('Metodo de pago: $paymentMethod');
    buffer.write('Total: ${_formatUsd(totalUsd)}$copSection');

    return buffer.toString();
  }

  Future<void> _openOrderSheet(_PublicMenuData data) async {
    final cartItems = data.products
        .where((product) => (_cart[product.id] ?? 0) > 0)
        .map(
          (product) =>
              _CartLine(product: product, quantity: _cart[product.id] ?? 0),
        )
        .toList();

    if (cartItems.isEmpty) return;

    final totalUsd = cartItems.fold<double>(
      0,
      (sum, item) => sum + item.lineTotalUsd,
    );
    final totalCop = data.tasaCambioPesos > 0
        ? totalUsd * data.tasaCambioPesos
        : 0.0;

    var selectedPaymentMethod = _paymentMethods.first;
    var isSubmittingOrder = false;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFFFFFBF5),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(18, 18, 18, 24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        width: 44,
                        height: 5,
                        decoration: BoxDecoration(
                          color: const Color(0xFFD0B7A6),
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'Tu pedido',
                      style: GoogleFonts.manrope(
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                        color: const Color(0xFF24160F),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      data.comercioNombre,
                      style: GoogleFonts.manrope(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: const Color(0xFF775B4E),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Flexible(
                      child: ListView.separated(
                        shrinkWrap: true,
                        itemCount: cartItems.length,
                        separatorBuilder: (_, _) => const Divider(height: 18),
                        itemBuilder: (context, index) {
                          final item = cartItems[index];

                          return Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Text(
                                  'x${item.quantity} ${item.product.nombre}',
                                  style: GoogleFonts.manrope(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w800,
                                    color: const Color(0xFF24160F),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Text(
                                _formatUsd(item.lineTotalUsd),
                                style: GoogleFonts.manrope(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800,
                                  color: const Color(0xFFD65A1F),
                                ),
                              ),
                            ],
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'Metodo de pago',
                      style: GoogleFonts.manrope(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: const Color(0xFF775B4E),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      children: _paymentMethods
                          .map(
                            (method) => ChoiceChip(
                              label: Text(method),
                              selected: selectedPaymentMethod == method,
                              onSelected: isSubmittingOrder
                                  ? null
                                  : (_) {
                                      setModalState(
                                        () => selectedPaymentMethod = method,
                                      );
                                    },
                            ),
                          )
                          .toList(),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF3E6D8),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Column(
                        children: [
                          _SummaryRow(
                            label: 'Total USD',
                            value: _formatUsd(totalUsd),
                          ),
                          if (data.tasaCambioPesos > 0)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: _SummaryRow(
                                label: 'Total COP',
                                value: '${_formatCop(totalCop)} COP',
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: isSubmittingOrder
                            ? null
                            : () async {
                                final whatsappNumber = data.whatsappNumber;
                                if (whatsappNumber == null ||
                                    whatsappNumber.isEmpty) {
                                  if (!mounted || !sheetContext.mounted) return;
                                  Navigator.pop(sheetContext);
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text(
                                        'Este comercio no tiene WhatsApp configurado.',
                                      ),
                                    ),
                                  );
                                  return;
                                }

                                setModalState(() => isSubmittingOrder = true);

                                final orderCode = _generateTrackingCode();
                                final localScaffoldMessenger =
                                    ScaffoldMessenger.of(context);
                                try {
                                  await _registerShadowOrder(
                                    orderCode: orderCode,
                                    items: cartItems,
                                    totalUsd: totalUsd,
                                    tasaAplicada: data.tasaCambioPesos,
                                    selectedPaymentMethod:
                                        selectedPaymentMethod,
                                  );

                                  final message = _buildWhatsAppMessage(
                                    comercioNombre: data.comercioNombre,
                                    trackingCode: orderCode,
                                    items: cartItems,
                                    totalUsd: totalUsd,
                                    totalCop: totalCop,
                                    tasaCambioPesos: data.tasaCambioPesos,
                                    paymentMethod: selectedPaymentMethod,
                                  );
                                  final uri = Uri.parse(
                                    'https://wa.me/$whatsappNumber?text=${Uri.encodeComponent(message)}',
                                  );

                                  final launched = await launchUrl(uri);
                                  if (!mounted) return;

                                  if (launched) {
                                    setState(() => _cart.clear());
                                    if (sheetContext.mounted) {
                                      Navigator.pop(sheetContext);
                                    }
                                  } else {
                                    localScaffoldMessenger.showSnackBar(
                                      const SnackBar(
                                        content: Text(
                                          'Pedido registrado, pero no se pudo abrir WhatsApp.',
                                        ),
                                      ),
                                    );
                                  }
                                } catch (error) {
                                  if (!mounted) return;
                                  localScaffoldMessenger.showSnackBar(
                                    SnackBar(
                                      content: Text(
                                        'No se pudo registrar el pedido: $error',
                                      ),
                                    ),
                                  );
                                } finally {
                                  if (mounted) {
                                    setModalState(
                                      () => isSubmittingOrder = false,
                                    );
                                  }
                                }
                              },
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF1B9C5A),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 18),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(18),
                          ),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            if (isSubmittingOrder) ...[
                              const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.2,
                                  color: Colors.white,
                                ),
                              ),
                              const SizedBox(width: 10),
                            ],
                            Text(
                              isSubmittingOrder
                                  ? 'Registrando pedido...'
                                  : 'Confirmar por WhatsApp',
                              style: GoogleFonts.manrope(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
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
        );
      },
    );
  }

  String _formatUsd(double amount) => '\$${amount.toStringAsFixed(2)}';

  String _formatCop(double amount) => amount.toStringAsFixed(0);

  @override
  Widget build(BuildContext context) {
    const background = Color(0xFFF7F1E8);
    const surface = Color(0xFFFFFBF5);
    const accent = Color(0xFFD65A1F);
    const heading = Color(0xFF24160F);
    const muted = Color(0xFF775B4E);

    return Scaffold(
      backgroundColor: background,
      body: SafeArea(
        child: FutureBuilder<_PublicMenuData>(
          future: _menuFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }

            if (snapshot.hasError) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    'No se pudo cargar el menu: ${snapshot.error}',
                    textAlign: TextAlign.center,
                  ),
                ),
              );
            }

            final data = snapshot.data;
            if (data == null) {
              return const Center(
                child: Text('No se encontro informacion para este menu.'),
              );
            }

            final cartItemCount = _cart.values.fold<int>(
              0,
              (sum, item) => sum + item,
            );
            final cartTotalUsd = data.products.fold<double>(
              0,
              (sum, product) =>
                  sum + ((_cart[product.id] ?? 0) * product.precio),
            );

            final filteredProducts = _selectedCategoryId == null
                ? data.products
                : data.products
                      .where(
                        (product) => product.categoryId == _selectedCategoryId,
                      )
                      .toList();

            return Stack(
              children: [
                RefreshIndicator(
                  color: accent,
                  onRefresh: () async {
                    final future = _fetchMenuData();
                    setState(() => _menuFuture = future);
                    await future;
                  },
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 110),
                    children: [
                      Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(28),
                          gradient: const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [Color(0xFF2F1B12), Color(0xFF7A3115)],
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Menu digital',
                              style: GoogleFonts.manrope(
                                color: Colors.white70,
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              data.comercioNombre,
                              style: GoogleFonts.manrope(
                                color: Colors.white,
                                fontSize: 30,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 18),
                      Text(
                        'Categorias',
                        style: GoogleFonts.manrope(
                          color: heading,
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        height: 48,
                        child: ListView(
                          scrollDirection: Axis.horizontal,
                          children: [
                            Padding(
                              padding: const EdgeInsets.only(right: 10),
                              child: ChoiceChip(
                                label: const Text('Todo'),
                                selected: _selectedCategoryId == null,
                                onSelected: (_) {
                                  setState(() => _selectedCategoryId = null);
                                },
                                selectedColor: accent,
                                labelStyle: GoogleFonts.manrope(
                                  color: _selectedCategoryId == null
                                      ? Colors.white
                                      : heading,
                                  fontWeight: FontWeight.w700,
                                ),
                                side: BorderSide.none,
                                backgroundColor: surface,
                              ),
                            ),
                            ...data.categories.map(
                              (category) => Padding(
                                padding: const EdgeInsets.only(right: 10),
                                child: ChoiceChip(
                                  label: Text(category.nombre),
                                  selected: _selectedCategoryId == category.id,
                                  onSelected: (_) {
                                    setState(
                                      () => _selectedCategoryId = category.id,
                                    );
                                  },
                                  selectedColor: accent,
                                  labelStyle: GoogleFonts.manrope(
                                    color: _selectedCategoryId == category.id
                                        ? Colors.white
                                        : heading,
                                    fontWeight: FontWeight.w700,
                                  ),
                                  side: BorderSide.none,
                                  backgroundColor: surface,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 18),
                      if (filteredProducts.isEmpty)
                        Container(
                          padding: const EdgeInsets.all(24),
                          decoration: BoxDecoration(
                            color: surface,
                            borderRadius: BorderRadius.circular(22),
                          ),
                          child: Column(
                            children: [
                              const Icon(
                                Icons.menu_book_rounded,
                                size: 42,
                                color: muted,
                              ),
                              const SizedBox(height: 12),
                              Text(
                                'No hay productos disponibles en esta categoria.',
                                textAlign: TextAlign.center,
                                style: GoogleFonts.manrope(
                                  color: heading,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        )
                      else
                        ...filteredProducts.map(
                          (product) => _PublicProductCard(
                            product: product,
                            quantity: _cart[product.id] ?? 0,
                            tasaCambioPesos: data.tasaCambioPesos,
                            heading: heading,
                            muted: muted,
                            surface: surface,
                            accent: accent,
                            onIncrement: () => _incrementProduct(product.id),
                            onDecrement: () => _decrementProduct(product.id),
                          ),
                        ),
                    ],
                  ),
                ),
                if (cartItemCount > 0)
                  Positioned(
                    right: 16,
                    left: 16,
                    bottom: 16,
                    child: FilledButton.icon(
                      onPressed: () => _openOrderSheet(data),
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF1B9C5A),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(18),
                        ),
                      ),
                      icon: const Icon(Icons.shopping_bag_outlined),
                      label: Text(
                        'Ver Pedido (${cartItemCount} - ${_formatUsd(cartTotalUsd)})',
                        style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _PublicProductCard extends StatelessWidget {
  const _PublicProductCard({
    required this.product,
    required this.quantity,
    required this.tasaCambioPesos,
    required this.heading,
    required this.muted,
    required this.surface,
    required this.accent,
    required this.onIncrement,
    required this.onDecrement,
  });

  final _PublicProduct product;
  final int quantity;
  final double tasaCambioPesos;
  final Color heading;
  final Color muted;
  final Color surface;
  final Color accent;
  final VoidCallback onIncrement;
  final VoidCallback onDecrement;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: surface,
        borderRadius: BorderRadius.circular(24),
        boxShadow: const [
          BoxShadow(
            color: Color(0x12000000),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (product.imageUrl != null && product.imageUrl!.isNotEmpty)
            AspectRatio(
              aspectRatio: 16 / 9,
              child: Image.network(
                product.imageUrl!,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) {
                  return Container(
                    color: const Color(0xFFF0E4D7),
                    alignment: Alignment.center,
                    child: const Icon(
                      Icons.restaurant,
                      size: 44,
                      color: Color(0xFFB88D77),
                    ),
                  );
                },
              ),
            )
          else
            Container(
              height: 108,
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xFFF1D3BF), Color(0xFFEAB08B)],
                ),
              ),
              alignment: Alignment.center,
              child: const Icon(
                Icons.lunch_dining,
                size: 42,
                color: Color(0xFF8D4320),
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        product.nombre,
                        style: GoogleFonts.manrope(
                          color: heading,
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      if (product.descripcion.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            product.descripcion,
                            style: GoogleFonts.manrope(
                              color: muted,
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 14),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '\$${product.precio.toStringAsFixed(2)}',
                      style: GoogleFonts.manrope(
                        color: accent,
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (tasaCambioPesos > 0)
                      Text(
                        '${(product.precio * tasaCambioPesos).toStringAsFixed(0)} COP',
                        style: GoogleFonts.manrope(
                          color: const Color(0xFF8D8177),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFFF4E0D3),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        onPressed: quantity == 0 ? null : onDecrement,
                        icon: const Icon(Icons.remove_circle_outline),
                        color: const Color(0xFF7A3115),
                      ),
                      SizedBox(
                        width: 28,
                        child: Text(
                          '$quantity',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.manrope(
                            color: heading,
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: onIncrement,
                        icon: const Icon(Icons.add_circle),
                        color: accent,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PublicMenuData {
  const _PublicMenuData({
    required this.comercioNombre,
    required this.whatsappNumber,
    required this.tasaCambioPesos,
    required this.categories,
    required this.products,
  });

  final String comercioNombre;
  final String? whatsappNumber;
  final double tasaCambioPesos;
  final List<_PublicCategory> categories;
  final List<_PublicProduct> products;
}

class _PublicCategory {
  const _PublicCategory({required this.id, required this.nombre});

  final String id;
  final String nombre;

  factory _PublicCategory.fromMap(Map<String, dynamic> map) {
    return _PublicCategory(
      id: map['id']?.toString() ?? '',
      nombre: map['nombre']?.toString() ?? 'Categoria',
    );
  }
}

class _PublicProduct {
  const _PublicProduct({
    required this.id,
    required this.categoryId,
    required this.nombre,
    required this.descripcion,
    required this.precio,
    this.imageUrl,
  });

  final String id;
  final String categoryId;
  final String nombre;
  final String descripcion;
  final double precio;
  final String? imageUrl;

  factory _PublicProduct.fromMap(Map<String, dynamic> map) {
    return _PublicProduct(
      id: map['id']?.toString() ?? '',
      categoryId: map['categoria_id']?.toString() ?? '',
      nombre: map['nombre']?.toString() ?? 'Producto',
      descripcion: map['descripcion']?.toString() ?? '',
      precio: _parsePrice(map['precio']),
      imageUrl: _resolveImageUrl(map),
    );
  }

  static double _parsePrice(dynamic value) {
    if (value is num) return value.toDouble();

    final normalized = '$value'.trim();
    if (normalized.isEmpty) return 0.0;

    return double.tryParse(normalized.replaceAll(',', '.')) ?? 0.0;
  }

  static String? _resolveImageUrl(Map<String, dynamic> map) {
    const candidates = [
      'imagen_url',
      'image_url',
      'foto_url',
      'imagen',
      'foto',
    ];

    for (final key in candidates) {
      final value = map[key]?.toString().trim();
      if (value != null && value.isNotEmpty) {
        return value;
      }
    }

    return null;
  }
}

class _CartLine {
  const _CartLine({required this.product, required this.quantity});

  final _PublicProduct product;
  final int quantity;

  double get lineTotalUsd => quantity * product.precio;
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: GoogleFonts.manrope(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: const Color(0xFF775B4E),
            ),
          ),
        ),
        Text(
          value,
          style: GoogleFonts.manrope(
            fontSize: 17,
            fontWeight: FontWeight.w800,
            color: const Color(0xFF24160F),
          ),
        ),
      ],
    );
  }
}
