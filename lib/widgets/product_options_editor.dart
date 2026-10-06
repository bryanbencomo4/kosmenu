import 'package:flutter/foundation.dart' show listEquals;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/search_text.dart';
import 'package:kosmenu_app/models/product_option_group.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// "Opciones del producto" section of the product form. Must be placed inside
/// the form's [Form] so its validators run on save; read the result with
/// [ProductOptionsEditorState.groups].
class ProductOptionsEditor extends StatefulWidget {
  const ProductOptionsEditor({
    super.key,
    required this.initialGroups,
    required this.currencyCode,
    this.initiallyActive = false,
    this.enabled = true,
    this.initialMenuOptions,
    this.productId,
    this.comercioId = '',
    this.descriptionController,
    this.compatibleProductsLoader,
  });

  @visibleForTesting
  final Future<List<CompatibleProductCategory>> Function()?
  compatibleProductsLoader;

  final List<ProductOptionGroup> initialGroups;

  /// Product description field; enables "Tomar de la descripción" for the
  /// removable ingredients.
  final TextEditingController? descriptionController;

  /// State of the "Producto con opciones" switch; off for existing products.
  final bool initiallyActive;
  final String currencyCode;
  final bool enabled;
  final Map<String, dynamic>? initialMenuOptions;
  final String? productId;
  final String comercioId;

  @override
  State<ProductOptionsEditor> createState() => ProductOptionsEditorState();
}

enum _OptionPriceMode { fijo, dependiente }

String _priceFieldText(double precio) =>
    precio > 0 ? precio.toStringAsFixed(2) : '';

class _OptionDraft {
  _OptionDraft({
    required this.id,
    String nombre = '',
    double precio = 0,
    this.activo = true,
    this.predeterminada = false,
    this.textoLibre = false,
    this.dependiente = false,
    this.dependsOnGroupId,
    Map<String, double>? rulePrices,
  }) : nameController = TextEditingController(text: nombre),
       priceController = TextEditingController(text: _priceFieldText(precio)),
       rulePriceControllers = {
         for (final entry in (rulePrices ?? {}).entries)
           entry.key: TextEditingController(text: _priceFieldText(entry.value)),
       };

  final String id;
  final TextEditingController nameController;
  final TextEditingController priceController;
  final Map<String, TextEditingController> rulePriceControllers;
  bool activo;
  bool predeterminada;
  bool textoLibre;
  bool dependiente;
  String? dependsOnGroupId;

  TextEditingController ruleController(String optionId) {
    return rulePriceControllers.putIfAbsent(
      optionId,
      () => TextEditingController(),
    );
  }

  void dispose() {
    nameController.dispose();
    priceController.dispose();
    for (final controller in rulePriceControllers.values) {
      controller.dispose();
    }
  }
}

class _GroupDraft {
  _GroupDraft({
    required this.id,
    String nombre = '',
    this.tipo = ProductOptionGroupType.unica,
    this.obligatorio = false,
    this.min = 0,
    this.max = 1,
    this.preguntaActivada = false,
    String pregunta = '',
    this.preguntaDirecta = false,
    this.collapsed = false,
    List<_OptionDraft>? opciones,
  }) : nameController = TextEditingController(text: nombre),
       questionController = TextEditingController(text: pregunta),
       opciones = opciones ?? [];

  final String id;
  final TextEditingController nameController;
  final TextEditingController questionController;
  ProductOptionGroupType tipo;
  bool obligatorio;
  int min;
  int max;
  bool preguntaActivada;
  bool preguntaDirecta;
  bool collapsed;
  final List<_OptionDraft> opciones;

  bool get isSingle => tipo == ProductOptionGroupType.unica;

  void dispose() {
    nameController.dispose();
    questionController.dispose();
    for (final option in opciones) {
      option.dispose();
    }
  }
}

/// A menu category with the products that can be combined, for the
/// "Productos compatibles" picker.
class CompatibleProductCategory {
  const CompatibleProductCategory({
    required this.id,
    required this.nombre,
    required this.products,
  });

  final String id;
  final String nombre;
  final List<({String id, String nombre})> products;
}

const uncategorizedCompatibleId = '';

/// Groups product rows (`id, nombre, categoria_id, orden`) under their
/// category rows (`id, nombre, orden`), in menu order. Products without a
/// known category go last under "Sin categoría"; empty categories are hidden.
List<CompatibleProductCategory> groupCompatibleProducts({
  required List<Map<String, dynamic>> products,
  required List<Map<String, dynamic>> categories,
}) {
  num order(Object? value) => value is num ? value : double.maxFinite;
  final sortedCategories = List.of(categories)
    ..sort((a, b) => order(a['orden']).compareTo(order(b['orden'])));
  final byCategory = <String, List<Map<String, dynamic>>>{};
  final known = {
    for (final category in sortedCategories)
      if (category['id'] != null) category['id'].toString(),
  };
  for (final product in products) {
    final id = product['id']?.toString() ?? '';
    if (id.isEmpty) continue;
    final categoryId = product['categoria_id']?.toString();
    final key = known.contains(categoryId)
        ? categoryId!
        : uncategorizedCompatibleId;
    byCategory.putIfAbsent(key, () => []).add(product);
  }
  List<({String id, String nombre})> sorted(List<Map<String, dynamic>> rows) {
    final copy = List.of(rows)
      ..sort((a, b) {
        final byOrder = order(a['orden']).compareTo(order(b['orden']));
        if (byOrder != 0) return byOrder;
        return (a['nombre']?.toString() ?? '').toLowerCase().compareTo(
          (b['nombre']?.toString() ?? '').toLowerCase(),
        );
      });
    return [
      for (final row in copy)
        (
          id: row['id'].toString(),
          nombre: row['nombre']?.toString().trim().isNotEmpty == true
              ? row['nombre'].toString().trim()
              : 'Producto',
        ),
    ];
  }

  return [
    for (final category in sortedCategories)
      if (byCategory[category['id']?.toString()] case final rows?)
        CompatibleProductCategory(
          id: category['id'].toString(),
          nombre: category['nombre']?.toString().trim().isNotEmpty == true
              ? category['nombre'].toString().trim()
              : 'Categoría',
          products: sorted(rows),
        ),
    if (byCategory[uncategorizedCompatibleId] case final rows?)
      CompatibleProductCategory(
        id: uncategorizedCompatibleId,
        nombre: byCategory.length == 1 ? 'Productos' : 'Sin categoría',
        products: sorted(rows),
      ),
  ];
}

const removableIngredientsMax = 50;
const removableIngredientMaxLength = 80;

String _ingredientKey(String name) {
  const accents = {'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u'};
  return name
      .trim()
      .toLowerCase()
      .split('')
      .map((char) => accents[char] ?? char)
      .join()
      .replaceAll(RegExp(r'\s+'), ' ');
}

/// Removable ingredients written in a product description separated by
/// commas: "Jamón, queso, maíz." → [Jamón, Queso, Maíz]. Duplicates (ignoring
/// case and accents) and empty pieces are skipped.
List<String> ingredientsFromDescription(String description) {
  final seen = <String>{};
  final result = <String>[];
  for (final piece in description.split(',')) {
    var name = piece
        .replaceAll(RegExp(r'\s+'), ' ')
        .replaceAll(RegExp(r'^[\s.;:·•\-]+|[\s.;:·•\-]+$'), '');
    if (name.isEmpty) continue;
    if (name.length > removableIngredientMaxLength) {
      name = name.substring(0, removableIngredientMaxLength).trimRight();
    }
    name = name[0].toUpperCase() + name.substring(1);
    if (seen.add(_ingredientKey(name))) result.add(name);
  }
  return result;
}

double? parseOptionPrice(String raw) {
  final normalized = raw.trim().replaceAll(',', '.');
  if (normalized.isEmpty) return 0;
  final value = double.tryParse(normalized);
  if (value == null || !value.isFinite || value < 0) return null;
  return (value * 100).roundToDouble() / 100;
}

class ProductOptionsEditorState extends State<ProductOptionsEditor> {
  final List<_GroupDraft> _groups = [];
  late bool _active = widget.initiallyActive;
  bool _combine = false;
  bool _removeIngredients = false;
  bool _ingredientsFromDescription = false;
  bool personalizationChanged = false;
  final _combinationTitle = TextEditingController(text: 'Combina con');
  final _removalTitle = TextEditingController(text: '¿Quieres quitar algo?');
  bool _combineQuestion = false;
  bool _removalQuestion = false;
  final _combineQuestionText = TextEditingController();
  final _removalQuestionText = TextEditingController();

  static const _defaultCombineQuestion = '¿Quieres combinar con otro producto?';
  static const _defaultRemovalQuestion = '¿Quieres quitar algún ingrediente?';

  static Map<String, dynamic> _questionMap(
    bool enabled,
    TextEditingController controller,
  ) {
    final text = controller.text.replaceAll(RegExp(r'\s+'), ' ').trim();
    return {
      if (enabled) 'pregunta_activada': true,
      if (text.isNotEmpty)
        'pregunta': text.length > ProductOptionGroup.preguntaMaxLength
            ? text.substring(0, ProductOptionGroup.preguntaMaxLength)
            : text,
    };
  }
  final Set<String> _compatibleIds = {};
  final Set<String> _expandedCategories = {};
  String _compatibleQuery = '';
  final List<({String id, TextEditingController name})> _ingredients = [];
  Future<List<CompatibleProductCategory>>? _compatibleFuture;

  Map<String, dynamic> get personalization => {
    'version': 1,
    'combinacion': {
      'activada': _combine,
      'titulo': _combinationTitle.text.trim(),
      'productos_compatibles': _compatibleIds.toList(),
      'regla_precio': 'max',
      ..._questionMap(_combineQuestion, _combineQuestionText),
    },
    'exclusiones': {
      'activadas': _removeIngredients,
      'titulo': _removalTitle.text.trim(),
      'ingredientes': [
        for (final ingredient in _ingredients)
          {'id': ingredient.id, 'nombre': ingredient.name.text.trim()},
      ],
      if (_ingredientsFromDescription) 'desde_descripcion': true,
      ..._questionMap(_removalQuestion, _removalQuestionText),
    },
  };

  String? get personalizationError {
    if (_combine && _compatibleIds.isEmpty) {
      return 'Selecciona al menos un producto compatible.';
    }
    if (_removeIngredients && _ingredients.isEmpty) {
      return _ingredientsFromDescription
          ? 'Escribe los ingredientes en la descripción separados por comas.'
          : 'Agrega al menos un ingrediente removible.';
    }
    return null;
  }

  bool get _canUseDescription => widget.descriptionController != null;

  List<String> get _descriptionIngredients =>
      ingredientsFromDescription(widget.descriptionController?.text ?? '');

  void _replaceIngredients(List<({String id, String name})> next) {
    final previous = List.of(_ingredients);
    _ingredients
      ..clear()
      ..addAll([
        for (final entry in next)
          (id: entry.id, name: TextEditingController(text: entry.name)),
      ]);
    // Their fields may still be mounted until the next frame.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      for (final ingredient in previous) {
        ingredient.name.dispose();
      }
    });
  }

  /// Mirrors the description into [_ingredients], keeping the id of every
  /// ingredient that stays so carts and orders keep matching. Returns whether
  /// anything changed.
  bool _syncIngredientsFromDescription() {
    final names = _descriptionIngredients
        .take(removableIngredientsMax)
        .toList();
    final current = [for (final i in _ingredients) i.name.text.trim()];
    if (listEquals(current, names)) return false;
    final idsByKey = {
      for (final ingredient in _ingredients)
        _ingredientKey(ingredient.name.text): ingredient.id,
    };
    _replaceIngredients([
      for (final name in names)
        (
          id: idsByKey[_ingredientKey(name)] ?? generateProductOptionId('r'),
          name: name,
        ),
    ]);
    personalizationChanged = true;
    return true;
  }

  void _onDescriptionChanged() {
    if (!mounted || !_removeIngredients) return;
    setState(() {
      if (_ingredientsFromDescription) _syncIngredientsFromDescription();
    });
  }

  void _setIngredientsFromDescription(bool value) {
    if (!value) {
      setState(() {
        _ingredientsFromDescription = false;
        personalizationChanged = true;
      });
      return;
    }
    final previous = [
      for (final ingredient in _ingredients)
        (id: ingredient.id, name: ingredient.name.text.trim()),
    ];
    final keys = _descriptionIngredients.map(_ingredientKey).toSet();
    final replaced = previous
        .where((entry) => entry.name.isNotEmpty)
        .where((entry) => !keys.contains(_ingredientKey(entry.name)))
        .length;
    setState(() {
      _ingredientsFromDescription = true;
      personalizationChanged = true;
      _syncIngredientsFromDescription();
    });
    if (replaced == 0) return;
    final messenger = ScaffoldMessenger.maybeOf(context);
    messenger?.hideCurrentSnackBar();
    messenger?.showSnackBar(
      SnackBar(
        content: Text(
          replaced == 1
              ? 'Se reemplazó 1 ingrediente que no está en la descripción.'
              : 'Se reemplazaron $replaced ingredientes que no están en la descripción.',
        ),
        action: SnackBarAction(
          label: 'Deshacer',
          onPressed: () {
            if (!mounted) return;
            setState(() {
              _ingredientsFromDescription = false;
              _replaceIngredients(previous);
              personalizationChanged = true;
            });
          },
        ),
      ),
    );
  }

  Future<List<CompatibleProductCategory>> _loadCompatibleProducts() async {
    final groups = await (widget.compatibleProductsLoader ??
        _fetchCompatibleProducts)();
    if (mounted) {
      setState(() {
        // Open the categories that already have something selected.
        _expandedCategories.addAll([
          for (final group in groups)
            if (group.products.any((p) => _compatibleIds.contains(p.id)))
              group.id,
        ]);
      });
    }
    return groups;
  }

  Future<List<CompatibleProductCategory>> _fetchCompatibleProducts() async {
    if (widget.comercioId.isEmpty) return [];
    final client = Supabase.instance.client;
    final results = await Future.wait([
      client
          .from('productos')
          .select('id,nombre,categoria_id,orden')
          .eq('comercio_id', widget.comercioId)
          .or('disponible.is.null,disponible.eq.true')
          .order('nombre')
          .limit(1000),
      client
          .from('categorias')
          .select('id,nombre,orden')
          .eq('comercio_id', widget.comercioId)
          .order('orden')
          .limit(500)
          .then<List<Map<String, dynamic>>>(
            (rows) => rows,
            onError: (_) => <Map<String, dynamic>>[],
          ),
    ]);
    return groupCompatibleProducts(
      products: results[0]
          .where((row) => row['id'] != widget.productId)
          .toList(),
      categories: results[1],
    );
  }

  /// Whether the merchant turned on "Producto con opciones".
  bool get active => _active;

  @override
  void initState() {
    super.initState();
    final raw = widget.initialMenuOptions?['personalizacion'];
    if (raw is Map && raw['version'] == 1) {
      final combination = raw['combinacion'];
      if (combination is Map) {
        final title = combination['titulo']?.toString().trim() ?? '';
        final ids = combination['productos_compatibles'];
        if (ids is List) _compatibleIds.addAll(ids.whereType<String>());
        _combine =
            combination['activada'] == true &&
            combination['regla_precio'] == 'max' &&
            title.isNotEmpty &&
            _compatibleIds.isNotEmpty;
        if (title.isNotEmpty) _combinationTitle.text = title;
        _combineQuestion = combination['pregunta_activada'] == true;
        _combineQuestionText.text =
            combination['pregunta']?.toString().trim() ?? '';
      }
      final removals = raw['exclusiones'];
      if (removals is Map) {
        final title = removals['titulo']?.toString().trim() ?? '';
        final ingredients = removals['ingredientes'];
        if (ingredients is List) {
          for (final entry in ingredients) {
            if (entry is Map &&
                entry['id'] is String &&
                entry['nombre'] is String) {
              _ingredients.add((
                id: entry['id'] as String,
                name: TextEditingController(text: entry['nombre'] as String),
              ));
            }
          }
        }
        _removeIngredients =
            removals['activadas'] == true &&
            title.isNotEmpty &&
            _ingredients.isNotEmpty;
        if (title.isNotEmpty) _removalTitle.text = title;
        _removalQuestion = removals['pregunta_activada'] == true;
        _removalQuestionText.text =
            removals['pregunta']?.toString().trim() ?? '';
        _ingredientsFromDescription =
            _canUseDescription && removals['desde_descripcion'] == true;
      }
    }
    widget.descriptionController?.addListener(_onDescriptionChanged);
    // The description may have been edited since the last save.
    if (_removeIngredients && _ingredientsFromDescription) {
      _syncIngredientsFromDescription();
    }
    if (_combine) _compatibleFuture = _loadCompatibleProducts();
    for (final group in widget.initialGroups) {
      _groups.add(
        _GroupDraft(
          id: group.id,
          nombre: group.nombre,
          tipo: group.tipo,
          obligatorio: group.obligatorio,
          min: group.min,
          max: group.max,
          preguntaActivada: group.preguntaActivada,
          pregunta: group.pregunta,
          preguntaDirecta: group.preguntaDirecta,
          collapsed: true,
          opciones: [
            for (final option in group.opciones)
              _OptionDraft(
                id: option.id,
                nombre: option.nombre,
                precio: option.precio,
                activo: option.activo,
                predeterminada: option.predeterminada,
                textoLibre: option.textoLibre,
                dependiente: option.reglasPrecio.isNotEmpty,
                dependsOnGroupId: option.reglasPrecio.isEmpty
                    ? null
                    : option.reglasPrecio.first.grupo,
                rulePrices: {
                  for (final rule in option.reglasPrecio)
                    rule.opcion: rule.precio,
                },
              ),
          ],
        ),
      );
    }
  }

  @override
  void didUpdateWidget(covariant ProductOptionsEditor oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.descriptionController != widget.descriptionController) {
      oldWidget.descriptionController?.removeListener(_onDescriptionChanged);
      widget.descriptionController?.addListener(_onDescriptionChanged);
    }
  }

  @override
  void dispose() {
    widget.descriptionController?.removeListener(_onDescriptionChanged);
    _combinationTitle.dispose();
    _removalTitle.dispose();
    _combineQuestionText.dispose();
    _removalQuestionText.dispose();
    for (final ingredient in _ingredients) {
      ingredient.name.dispose();
    }
    for (final group in _groups) {
      group.dispose();
    }
    super.dispose();
  }

  /// Current groups, normalized. While the switch is off the fields are not
  /// validated, so unnamed groups/options are dropped instead.
  List<ProductOptionGroup> get groups {
    return [
      for (final group in _groups)
        if (group.nameController.text.trim().isNotEmpty)
          ProductOptionGroup(
            id: group.id,
            nombre: group.nameController.text.trim(),
            tipo: group.tipo,
            obligatorio: group.obligatorio,
            min: group.min,
            max: group.isSingle ? 1 : group.max,
            preguntaActivada: group.preguntaActivada,
            pregunta: group.questionController.text.trim(),
            preguntaDirecta: group.preguntaDirecta,
            opciones: [
              for (final option in group.opciones)
                if (option.nameController.text.trim().isNotEmpty)
                  ProductOptionChoice(
                    id: option.id,
                    nombre: option.nameController.text.trim(),
                    precio: parseOptionPrice(option.priceController.text) ?? 0,
                    activo: option.activo,
                    predeterminada: option.predeterminada,
                    textoLibre: option.textoLibre,
                    reglasPrecio: option.dependiente
                        ? _rulesFor(option)
                        : const [],
                  ),
            ],
          ).normalized(),
    ];
  }

  void _addGroup() {
    setState(() {
      _groups.add(
        _GroupDraft(
          id: generateProductOptionId('g'),
          opciones: [_OptionDraft(id: generateProductOptionId('o'))],
        ),
      );
    });
  }

  void _removeGroup(_GroupDraft group) {
    setState(() => _groups.remove(group));
    WidgetsBinding.instance.addPostFrameCallback((_) => group.dispose());
  }

  void _moveGroup(_GroupDraft group, int delta) {
    final index = _groups.indexOf(group);
    final target = index + delta;
    if (index < 0 || target < 0 || target >= _groups.length) return;
    setState(() {
      final moved = _groups.removeAt(index);
      _groups.insert(target, moved);
    });
  }

  /// Same checks as the open fields, so a folded group still blocks save.
  String? _collapsedGroupIssue(_GroupDraft group) {
    if (group.nameController.text.trim().isEmpty) {
      return 'Escribe el nombre del grupo';
    }
    if (group.opciones.isEmpty) return 'Agrega al menos una opción';
    for (final option in group.opciones) {
      if (option.nameController.text.trim().isEmpty) return 'Escribe un nombre';
      if (!option.dependiente) {
        if (parseOptionPrice(option.priceController.text) == null) {
          return 'Precio inválido';
        }
        continue;
      }
      for (final parent in _parentCandidates(group)) {
        if (parent.id != option.dependsOnGroupId) continue;
        for (final parentOption in parent.opciones) {
          if (parentOption.nameController.text.trim().isEmpty) continue;
          if (parseOptionPrice(option.ruleController(parentOption.id).text) ==
              null) {
            return 'Precio inválido';
          }
        }
      }
    }
    return null;
  }

  String _groupSummary(_GroupDraft group) {
    final kind = group.isSingle
        ? 'Seleccionar una opción'
        : 'Seleccionar varias';
    final count = group.opciones.length;
    final options = count == 1 ? '1 opción' : '$count opciones';
    final required = group.obligatorio ? 'Obligatorio' : 'Opcional';
    return '$kind · $options · $required';
  }

  void _addOption(_GroupDraft group) {
    setState(() {
      group.opciones.add(_OptionDraft(id: generateProductOptionId('o')));
    });
  }

  void _removeOption(_GroupDraft group, _OptionDraft option) {
    setState(() {
      group.opciones.remove(option);
      _clampRules(group);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => option.dispose());
  }

  List<ProductOptionPriceRule> _rulesFor(_OptionDraft option) {
    final parentId = option.dependsOnGroupId;
    if (parentId == null) return const [];
    _GroupDraft? parent;
    for (final group in _groups) {
      if (group.id == parentId) parent = group;
    }
    if (parent == null) return const [];
    return [
      for (final parentOption in parent.opciones)
        if (parentOption.nameController.text.trim().isNotEmpty)
          ProductOptionPriceRule(
            grupo: parent.id,
            opcion: parentOption.id,
            precio:
                parseOptionPrice(option.ruleController(parentOption.id).text) ??
                0,
          ),
    ];
  }

  List<_GroupDraft> _parentCandidates(_GroupDraft current) {
    return [
      for (final group in _groups)
        if (group.id != current.id &&
            group.nameController.text.trim().isNotEmpty)
          group,
    ];
  }

  void _setDefault(_GroupDraft group, _OptionDraft option, bool value) {
    setState(() {
      for (final entry in group.opciones) {
        entry.predeterminada = value && entry.id == option.id;
      }
    });
  }

  void _clampRules(_GroupDraft group) {
    final upper = group.opciones.isEmpty ? 1 : group.opciones.length;
    if (group.max > upper) group.max = upper;
    if (group.max < 1) group.max = 1;
    if (group.min > group.max) group.min = group.max;
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Opciones del producto',
          style: GoogleFonts.manrope(
            color: colorScheme.onSurface,
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Producto con opciones',
                    style: GoogleFonts.manrope(
                      color: colorScheme.onSurface,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    _active
                        ? 'Cada opción puede tener precio fijo o depender '
                              'de otra opción (${widget.currencyCode}).'
                        : 'Actívalo solo si el cliente debe elegir tamaño, '
                              'extras o sabores.',
                    style: GoogleFonts.manrope(
                      color: colorScheme.onSurfaceVariant,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            Switch(
              value: _active,
              onChanged: widget.enabled
                  ? (value) => setState(() => _active = value)
                  : null,
            ),
          ],
        ),
        if (_active) ...[
          const SizedBox(height: 10),
          for (final group in _groups) ...[
            _buildGroupCard(context, group),
            const SizedBox(height: 12),
          ],
          OutlinedButton.icon(
            onPressed: widget.enabled ? _addGroup : null,
            icon: const Icon(Icons.add_rounded, size: 18),
            label: const Text('Crear grupo de opciones'),
            style: OutlinedButton.styleFrom(
              foregroundColor: colorScheme.primary,
              side: BorderSide(color: colorScheme.outlineVariant),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
              textStyle: GoogleFonts.manrope(fontWeight: FontWeight.w700),
            ),
          ),
        ],
        const SizedBox(height: 16),
        Text(
          'Personalización',
          style: GoogleFonts.manrope(fontSize: 13, fontWeight: FontWeight.w800),
        ),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          title: const Text('Permitir combinar'),
          value: _combine,
          onChanged: widget.enabled
              ? (value) => setState(() {
                  _combine = value;
                  personalizationChanged = true;
                  if (value) _compatibleFuture ??= _loadCompatibleProducts();
                })
              : null,
        ),
        if (_combine) ...[
          TextFormField(
            controller: _combinationTitle,
            enabled: widget.enabled,
            maxLength: 120,
            decoration: const InputDecoration(
              labelText: 'Texto para el cliente',
            ),
            onChanged: (_) => personalizationChanged = true,
            validator: (value) =>
                value?.trim().isNotEmpty == true ? null : 'Escribe un título.',
          ),
          _buildQuestionControls(
            context,
            labelStyle: _sectionLabelStyle(context),
            available: true,
            unavailableHint: '',
            hiddenHint:
                'Los productos para combinar quedan ocultos hasta que el cliente marque la pregunta.',
            value: _combineQuestion,
            onChanged: (value) {
              _combineQuestion = value;
              personalizationChanged = true;
            },
            controller: _combineQuestionText,
            fallback: _defaultCombineQuestion,
            countLabel: _compatibleIds.length == 1
                ? '1 producto'
                : '${_compatibleIds.length} productos',
            marksPersonalization: true,
          ),
          const SizedBox(height: 8),
          const Text('Productos compatibles'),
          FutureBuilder<List<CompatibleProductCategory>>(
            future: _compatibleFuture,
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return TextButton.icon(
                  onPressed: () => setState(
                    () => _compatibleFuture = _loadCompatibleProducts(),
                  ),
                  icon: const Icon(Icons.refresh),
                  label: const Text('Reintentar productos'),
                );
              }
              if (!snapshot.hasData) return const LinearProgressIndicator();
              if (snapshot.data!.isEmpty) {
                return const Text(
                  'No hay productos disponibles para combinar.',
                );
              }
              return _buildCompatiblePicker(context, snapshot.data!);
            },
          ),
          const Text('Usar el precio más alto'),
        ],
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          title: const Text('Permitir quitar ingredientes'),
          value: _removeIngredients,
          onChanged: widget.enabled
              ? (value) => setState(() {
                  _removeIngredients = value;
                  personalizationChanged = true;
                  if (!value) return;
                  // First time: a comma list in the description is the
                  // obvious source.
                  if (_ingredients.isEmpty &&
                      _canUseDescription &&
                      _descriptionIngredients.length >= 2) {
                    _ingredientsFromDescription = true;
                  }
                  if (_ingredientsFromDescription) {
                    _syncIngredientsFromDescription();
                  }
                })
              : null,
        ),
        if (_removeIngredients) ...[
          TextFormField(
            controller: _removalTitle,
            enabled: widget.enabled,
            maxLength: 120,
            decoration: const InputDecoration(
              labelText: 'Título de ingredientes',
            ),
            onChanged: (_) => personalizationChanged = true,
            validator: (value) =>
                value?.trim().isNotEmpty == true ? null : 'Escribe un título.',
          ),
          _buildQuestionControls(
            context,
            labelStyle: _sectionLabelStyle(context),
            available: true,
            unavailableHint: '',
            hiddenHint:
                'Los ingredientes quedan ocultos hasta que el cliente marque la pregunta.',
            value: _removalQuestion,
            onChanged: (value) {
              _removalQuestion = value;
              personalizationChanged = true;
            },
            controller: _removalQuestionText,
            fallback: _defaultRemovalQuestion,
            countLabel: _ingredients.length == 1
                ? '1 ingrediente'
                : '${_ingredients.length} ingredientes',
            marksPersonalization: true,
          ),
          if (_canUseDescription) _buildDescriptionSourceToggle(context),
          if (_ingredientsFromDescription)
            _buildDescriptionIngredients(context)
          else ...[
          for (final ingredient in _ingredients)
            Row(
              key: ValueKey(ingredient.id),
              children: [
                Expanded(
                  child: TextFormField(
                    controller: ingredient.name,
                    enabled: widget.enabled,
                    maxLength: 80,
                    decoration: const InputDecoration(
                      labelText: 'Ingrediente removible',
                    ),
                    onChanged: (_) => personalizationChanged = true,
                    validator: (value) => value?.trim().isNotEmpty == true
                        ? null
                        : 'Escribe el ingrediente.',
                  ),
                ),
                IconButton(
                  tooltip: 'Quitar ingrediente',
                  icon: const Icon(Icons.close),
                  onPressed: widget.enabled
                      ? () => setState(() {
                          _ingredients.remove(ingredient);
                          ingredient.name.dispose();
                          personalizationChanged = true;
                        })
                      : null,
                ),
              ],
            ),
          TextButton.icon(
            onPressed: widget.enabled
                ? () => setState(() {
                    _ingredients.add((
                      id: generateProductOptionId('r'),
                      name: TextEditingController(),
                    ));
                    personalizationChanged = true;
                  })
                : null,
            icon: const Icon(Icons.add),
            label: const Text('Agregar ingrediente'),
          ),
          ],
        ],
      ],
    );
  }

  static String _searchKey(String value) => foldSearchText(value);

  void _setCompatible(Iterable<String> ids, bool selected) {
    setState(() {
      if (selected) {
        _compatibleIds.addAll(ids);
      } else {
        _compatibleIds.removeAll(ids);
      }
      personalizationChanged = true;
    });
  }

  Widget _buildCompatiblePicker(
    BuildContext context,
    List<CompatibleProductCategory> categories,
  ) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final enabled = widget.enabled;
    final total = categories.fold<int>(0, (sum, c) => sum + c.products.length);
    final query = _searchKey(_compatibleQuery);
    final searching = query.isNotEmpty;
    final visible = [
      for (final category in categories)
        if (!searching || _searchKey(category.nombre).contains(query))
          category
        else if (category.products
            .where((p) => _searchKey(p.nombre).contains(query))
            .toList()
            case final matches when matches.isNotEmpty)
          CompatibleProductCategory(
            id: category.id,
            nombre: category.nombre,
            products: matches,
          ),
    ];

    return Container(
      margin: const EdgeInsets.only(top: 6, bottom: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colorScheme.outlineVariant),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (total > 8)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
              child: TextField(
                enabled: enabled,
                onChanged: (value) => setState(() => _compatibleQuery = value),
                decoration: InputDecoration(
                  isDense: true,
                  prefixIcon: const Icon(Icons.search, size: 20),
                  hintText: 'Buscar producto o categoría',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),
            ),
          if (visible.isEmpty)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                'Sin resultados para "${_compatibleQuery.trim()}".',
                style: theme.textTheme.bodySmall,
              ),
            ),
          for (final (index, category) in visible.indexed) ...[
            if (index > 0) Divider(height: 1, color: colorScheme.outlineVariant),
            _buildCompatibleCategory(
              context,
              category,
              expanded: searching || _expandedCategories.contains(category.id),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildCompatibleCategory(
    BuildContext context,
    CompatibleProductCategory category, {
    required bool expanded,
  }) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final enabled = widget.enabled;
    final ids = [for (final product in category.products) product.id];
    final selected = ids.where(_compatibleIds.contains).length;
    final bool? state = selected == 0
        ? false
        : selected == ids.length
        ? true
        : null;
    final allSelected = state == true;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Material(
          color: colorScheme.surfaceContainerHighest.withValues(alpha: 0.45),
          child: InkWell(
            onTap: () => setState(() {
              if (!_expandedCategories.remove(category.id)) {
                _expandedCategories.add(category.id);
              }
            }),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              child: Row(
                children: [
                  Tooltip(
                    message: allSelected
                        ? 'Quitar toda la categoría'
                        : 'Seleccionar toda la categoría',
                    child: Checkbox(
                      tristate: true,
                      value: state,
                      onChanged: enabled
                          ? (_) => _setCompatible(ids, !allSelected)
                          : null,
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          category.nombre,
                          style: GoogleFonts.manrope(
                            fontWeight: FontWeight.w800,
                            fontSize: 14,
                          ),
                        ),
                        Text(
                          selected == 0
                              ? (ids.length == 1
                                    ? '1 producto'
                                    : '${ids.length} productos')
                              : '$selected de ${ids.length} seleccionados',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: selected == 0
                                ? colorScheme.onSurfaceVariant
                                : colorScheme.primary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    expanded ? Icons.expand_less : Icons.expand_more,
                    color: colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 8),
                ],
              ),
            ),
          ),
        ),
        if (expanded)
          for (final product in category.products)
            CheckboxListTile(
              key: ValueKey('compatible-${product.id}'),
              dense: true,
              contentPadding: const EdgeInsets.only(left: 48, right: 4),
              controlAffinity: ListTileControlAffinity.trailing,
              title: Text(product.nombre),
              value: _compatibleIds.contains(product.id),
              onChanged: enabled
                  ? (checked) => _setCompatible([product.id], checked == true)
                  : null,
            ),
      ],
    );
  }

  Widget _buildDescriptionSourceToggle(BuildContext context) {
    final detected = _descriptionIngredients;
    final String subtitle;
    if (_ingredientsFromDescription) {
      subtitle = 'Se actualizan solos cuando editas la descripción.';
    } else if (detected.isEmpty) {
      subtitle =
          'Escribe los ingredientes en la descripción separados por comas.';
    } else {
      final preview = detected.take(4).join(', ');
      subtitle = detected.length > 4
          ? 'Encontramos ${detected.length}: $preview…'
          : detected.length == 1
          ? 'Encontramos 1: $preview'
          : 'Encontramos ${detected.length}: $preview';
    }
    return SwitchListTile.adaptive(
      contentPadding: EdgeInsets.zero,
      secondary: const Icon(Icons.notes_rounded),
      title: const Text('Tomar de la descripción'),
      subtitle: Text(subtitle),
      value: _ingredientsFromDescription,
      onChanged: widget.enabled ? _setIngredientsFromDescription : null,
    );
  }

  Widget _buildDescriptionIngredients(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final total = _descriptionIngredients.length;
    final hint = theme.textTheme.bodySmall?.copyWith(
      color: colorScheme.onSurfaceVariant,
    );
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 4, bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_ingredients.isEmpty)
            Text(
              'La descripción aún no tiene ingredientes. Escríbelos separados '
              'por comas, por ejemplo: Jamón, Queso, Maíz.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: colorScheme.error,
              ),
            )
          else ...[
            Text(
              _ingredients.length == 1
                  ? 'El cliente podrá quitar 1 ingrediente:'
                  : 'El cliente podrá quitar ${_ingredients.length} ingredientes:',
              style: hint,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final ingredient in _ingredients)
                  Chip(
                    key: ValueKey(ingredient.id),
                    label: Text(ingredient.name.text),
                    visualDensity: VisualDensity.compact,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
              ],
            ),
            if (total > removableIngredientsMax) ...[
              const SizedBox(height: 8),
              Text(
                'Solo se usan los primeros $removableIngredientsMax.',
                style: hint,
              ),
            ],
            const SizedBox(height: 8),
            Text(
              'Para cambiarlos, edita la descripción o desactiva esta opción '
              'para escribirlos a mano.',
              style: hint,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildGroupCard(BuildContext context, _GroupDraft group) {
    final colorScheme = Theme.of(context).colorScheme;
    final enabled = widget.enabled;
    final labelStyle = GoogleFonts.manrope(
      color: colorScheme.onSurface,
      fontSize: 12.5,
      fontWeight: FontWeight.w700,
    );
    final optionCount = group.opciones.isEmpty ? 1 : group.opciones.length;
    final index = _groups.indexOf(group);
    final name = group.nameController.text.trim();

    return FormField<void>(
      validator: (_) => group.collapsed ? _collapsedGroupIssue(group) : null,
      builder: (field) => Container(
      key: ValueKey('option-group-${group.id}'),
      padding: EdgeInsets.fromLTRB(8, group.collapsed ? 4 : 8, 4, group.collapsed ? 4 : 12),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainer,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconButton(
                tooltip: group.collapsed ? 'Desplegar grupo' : 'Plegar grupo',
                visualDensity: VisualDensity.compact,
                onPressed: () =>
                    setState(() => group.collapsed = !group.collapsed),
                icon: Icon(
                  group.collapsed
                      ? Icons.expand_more_rounded
                      : Icons.expand_less_rounded,
                  color: colorScheme.onSurfaceVariant,
                ),
              ),
              if (group.collapsed)
                Expanded(
                  child: InkWell(
                    onTap: () => setState(() => group.collapsed = false),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name.isEmpty ? 'Grupo sin nombre' : name,
                          style: GoogleFonts.manrope(
                            color: colorScheme.onSurface,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Text(
                          _groupSummary(group),
                          style: GoogleFonts.manrope(
                            color: colorScheme.onSurfaceVariant,
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                )
              else
                const Spacer(),
              IconButton(
                tooltip: 'Subir grupo',
                visualDensity: VisualDensity.compact,
                onPressed: enabled && index > 0
                    ? () => _moveGroup(group, -1)
                    : null,
                icon: const Icon(Icons.arrow_upward_rounded),
              ),
              IconButton(
                tooltip: 'Bajar grupo',
                visualDensity: VisualDensity.compact,
                onPressed: enabled && index >= 0 && index < _groups.length - 1
                    ? () => _moveGroup(group, 1)
                    : null,
                icon: const Icon(Icons.arrow_downward_rounded),
              ),
              IconButton(
                tooltip: 'Eliminar grupo',
                visualDensity: VisualDensity.compact,
                onPressed: enabled ? () => _removeGroup(group) : null,
                icon: Icon(
                  Icons.delete_outline_rounded,
                  color: colorScheme.error,
                ),
              ),
            ],
          ),
          if (field.hasError)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: Text(
                field.errorText ?? '',
                style: GoogleFonts.manrope(
                  color: colorScheme.error,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          if (!group.collapsed) ...[
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            child: TextFormField(
              controller: group.nameController,
              enabled: enabled,
              textInputAction: TextInputAction.next,
              style: GoogleFonts.manrope(
                color: colorScheme.onSurface,
                fontWeight: FontWeight.w700,
              ),
              decoration: const InputDecoration(
                labelText: 'Nombre del grupo',
                hintText: 'Ej. Tamaño, Extras',
              ),
              validator: (value) => (value?.trim().isEmpty ?? true)
                  ? 'Escribe el nombre del grupo'
                  : null,
            ),
          ),
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            child: Text('Tipo', style: labelStyle),
          ),
          RadioGroup<ProductOptionGroupType>(
            groupValue: group.tipo,
            onChanged: (value) {
              if (!enabled || value == null) return;
              setState(() {
                group.tipo = value;
                if (value == ProductOptionGroupType.unica) {
                  group.max = 1;
                  if (group.min > 1) group.min = 1;
                } else if (group.max < 2 && group.opciones.length > 1) {
                  group.max = group.opciones.length;
                }
              });
            },
            child: Wrap(
              spacing: 4,
              children: const [
                _RadioLabel(
                  value: ProductOptionGroupType.unica,
                  label: 'Seleccionar una opción',
                ),
                _RadioLabel(
                  value: ProductOptionGroupType.multiple,
                  label: 'Seleccionar varias',
                ),
              ],
            ),
          ),
          Row(
            children: [
              Expanded(child: Text('Obligatorio', style: labelStyle)),
              Switch(
                value: group.obligatorio,
                onChanged: enabled
                    ? (value) => setState(() {
                        group.obligatorio = value;
                        group.min = value ? (group.min < 1 ? 1 : group.min) : 0;
                      })
                    : null,
              ),
            ],
          ),
          _buildQuestionToggle(context, group, labelStyle),
          if (!group.obligatorio && group.preguntaActivada)
            _buildDirectQuestionToggle(context, group, labelStyle),
          if (!group.isSingle)
            Wrap(
              spacing: 16,
              runSpacing: 4,
              children: [
                if (group.obligatorio)
                  _CountStepper(
                    label: 'Mínimo',
                    value: group.min.clamp(1, optionCount),
                    min: 1,
                    max: group.max,
                    enabled: enabled,
                    onChanged: (value) => setState(() => group.min = value),
                  ),
                _CountStepper(
                  label: 'Máximo',
                  value: group.max.clamp(1, optionCount),
                  min: group.obligatorio ? group.min.clamp(1, optionCount) : 1,
                  max: optionCount,
                  enabled: enabled,
                  onChanged: (value) => setState(() => group.max = value),
                ),
              ],
            ),
          const SizedBox(height: 8),
          Text('Opciones', style: labelStyle),
          const SizedBox(height: 8),
          for (final option in group.opciones)
            _buildOptionCard(context, group, option),
          if (group.opciones.isEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Text(
                'Agrega al menos una opción o el grupo no se mostrará.',
                style: GoogleFonts.manrope(
                  color: colorScheme.error,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          TextButton.icon(
            onPressed: enabled ? () => _addOption(group) : null,
            icon: const Icon(Icons.add_rounded, size: 18),
            label: const Text('Agregar opción'),
            style: TextButton.styleFrom(
              foregroundColor: colorScheme.primary,
              textStyle: GoogleFonts.manrope(fontWeight: FontWeight.w700),
            ),
          ),
          ],
        ],
      ),
      ),
    );
  }

  TextStyle _sectionLabelStyle(BuildContext context) => GoogleFonts.manrope(
    color: Theme.of(context).colorScheme.onSurface,
    fontSize: 12.5,
    fontWeight: FontWeight.w700,
  );

  Widget _buildQuestionToggle(
    BuildContext context,
    _GroupDraft group,
    TextStyle labelStyle,
  ) {
    final groupName = group.nameController.text.trim();
    return _buildQuestionControls(
      context,
      labelStyle: labelStyle,
      available: !group.obligatorio,
      unavailableHint: 'Solo disponible en grupos opcionales.',
      hiddenHint:
          'Las opciones quedan ocultas hasta que el cliente marque la pregunta.',
      value: group.preguntaActivada,
      onChanged: (value) => group.preguntaActivada = value,
      controller: group.questionController,
      fallback: ProductOptionGroup.defaultQuestion(
        groupName.isEmpty ? 'extras' : groupName,
      ),
      countLabel: group.opciones.length == 1
          ? '1 opción'
          : '${group.opciones.length} opciones',
    );
  }

  Widget _buildDirectQuestionToggle(
    BuildContext context,
    _GroupDraft group,
    TextStyle labelStyle,
  ) {
    final colorScheme = Theme.of(context).colorScheme;
    final singleOption = group.opciones.length == 1;
    final available = singleOption && group.opciones.first.textoLibre;
    final active = available && group.preguntaDirecta;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Mostrar la opción directo', style: labelStyle),
                const SizedBox(height: 2),
                Text(
                  available
                      ? 'Al marcar la pregunta se elige sola y aparece su campo de texto y precio, sin un toque extra.'
                      : singleOption
                      ? 'Activa "Texto libre" en la opción para usar esto.'
                      : 'Solo disponible cuando el grupo tiene una sola opción con texto libre.',
                  style: GoogleFonts.manrope(
                    color: colorScheme.onSurfaceVariant,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          Switch(
            value: active,
            onChanged: widget.enabled && available
                ? (value) => setState(() => group.preguntaDirecta = value)
                : null,
          ),
        ],
      ),
    );
  }

  Widget _buildQuestionControls(
    BuildContext context, {
    required TextStyle labelStyle,
    required bool available,
    required String unavailableHint,
    required String hiddenHint,
    required bool value,
    required ValueChanged<bool> onChanged,
    required TextEditingController controller,
    required String fallback,
    required String countLabel,
    bool marksPersonalization = false,
  }) {
    final colorScheme = Theme.of(context).colorScheme;
    final active = available && value;
    final mutedStyle = GoogleFonts.manrope(
      color: colorScheme.onSurfaceVariant,
      fontSize: 11.5,
      fontWeight: FontWeight.w600,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Mostrar con una pregunta', style: labelStyle),
                  const SizedBox(height: 2),
                  Text(
                    available ? hiddenHint : unavailableHint,
                    style: mutedStyle,
                  ),
                ],
              ),
            ),
            Switch(
              value: active,
              onChanged: widget.enabled && available
                  ? (next) => setState(() => onChanged(next))
                  : null,
            ),
          ],
        ),
        if (active) ...[
          const SizedBox(height: 8),
          TextFormField(
            controller: controller,
            enabled: widget.enabled,
            maxLength: ProductOptionGroup.preguntaMaxLength,
            textInputAction: TextInputAction.next,
            style: GoogleFonts.manrope(
              color: colorScheme.onSurface,
              fontWeight: FontWeight.w700,
            ),
            decoration: InputDecoration(
              labelText: 'Pregunta para el cliente',
              hintText: fallback,
              helperText: 'Si la dejas vacía se usa: $fallback',
            ),
            onChanged: (_) => setState(() {
              if (marksPersonalization) personalizationChanged = true;
            }),
          ),
          const SizedBox(height: 4),
          _QuestionPreview(
            question: controller.text.trim().isEmpty
                ? fallback
                : controller.text.trim(),
            countLabel: countLabel,
          ),
        ],
        const SizedBox(height: 4),
      ],
    );
  }

  Widget _buildOptionCard(
    BuildContext context,
    _GroupDraft group,
    _OptionDraft option,
  ) {
    final colorScheme = Theme.of(context).colorScheme;
    final enabled = widget.enabled;
    final parents = _parentCandidates(group);
    final parentId =
        parents.any((parent) => parent.id == option.dependsOnGroupId)
        ? option.dependsOnGroupId
        : null;
    _GroupDraft? parent;
    for (final candidate in parents) {
      if (candidate.id == parentId) parent = candidate;
    }

    return Padding(
      key: ValueKey('option-${option.id}'),
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        padding: const EdgeInsets.fromLTRB(10, 8, 4, 10),
        decoration: BoxDecoration(
          color: colorScheme.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: colorScheme.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TextFormField(
                    controller: option.nameController,
                    enabled: enabled,
                    textInputAction: TextInputAction.next,
                    style: GoogleFonts.manrope(
                      color: option.activo
                          ? colorScheme.onSurface
                          : colorScheme.onSurfaceVariant,
                      fontWeight: FontWeight.w600,
                      decoration: option.activo
                          ? null
                          : TextDecoration.lineThrough,
                    ),
                    decoration: const InputDecoration(
                      hintText: 'Ej. Extra queso',
                      isDense: true,
                    ),
                    validator: (value) => (value?.trim().isEmpty ?? true)
                        ? 'Escribe un nombre'
                        : null,
                  ),
                ),
                IconButton(
                  tooltip: option.activo
                      ? 'Desactivar opción'
                      : 'Activar opción',
                  onPressed: enabled
                      ? () => setState(() => option.activo = !option.activo)
                      : null,
                  icon: Icon(
                    option.activo
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                    color: option.activo
                        ? colorScheme.primary
                        : colorScheme.onSurfaceVariant,
                  ),
                ),
                IconButton(
                  tooltip: 'Eliminar opción',
                  onPressed: enabled
                      ? () => _removeOption(group, option)
                      : null,
                  icon: Icon(
                    Icons.close_rounded,
                    color: colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              dense: true,
              title: Text(
                'Marcar por defecto',
                style: GoogleFonts.manrope(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
              subtitle: Text(
                'Se selecciona sola al abrir el producto.',
                style: GoogleFonts.manrope(fontSize: 11),
              ),
              value: option.predeterminada,
              onChanged: enabled
                  ? (value) => _setDefault(group, option, value)
                  : null,
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              dense: true,
              title: Text(
                'Texto libre',
                style: GoogleFonts.manrope(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
              subtitle: Text(
                'El cliente escribe lo que quiere agregar (ej. Otro).',
                style: GoogleFonts.manrope(fontSize: 11),
              ),
              value: option.textoLibre,
              onChanged: enabled
                  ? (value) => setState(() => option.textoLibre = value)
                  : null,
            ),
            Text(
              'Precio',
              style: GoogleFonts.manrope(
                color: colorScheme.onSurface,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
            RadioGroup<_OptionPriceMode>(
              groupValue: option.dependiente
                  ? _OptionPriceMode.dependiente
                  : _OptionPriceMode.fijo,
              onChanged: (value) {
                if (!enabled || value == null) return;
                setState(() {
                  option.dependiente = value == _OptionPriceMode.dependiente;
                  if (option.dependiente && option.dependsOnGroupId == null) {
                    option.dependsOnGroupId = parents.firstOrNull?.id;
                  }
                });
              },
              child: const Wrap(
                spacing: 4,
                children: [
                  _PriceModeRadio(value: _OptionPriceMode.fijo, label: 'Fijo'),
                  _PriceModeRadio(
                    value: _OptionPriceMode.dependiente,
                    label: 'Dependiente',
                  ),
                ],
              ),
            ),
            if (!option.dependiente)
              TextFormField(
                controller: option.priceController,
                enabled: enabled,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                style: GoogleFonts.manrope(
                  color: colorScheme.onSurface,
                  fontWeight: FontWeight.w600,
                ),
                decoration: const InputDecoration(
                  hintText: '0.00',
                  prefixText: '+\$ ',
                  isDense: true,
                ),
                validator: (value) => parseOptionPrice(value ?? '') == null
                    ? 'Precio inválido'
                    : null,
              )
            else ...[
              if (parents.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    'Crea otro grupo primero (ej. Tamaño) para definir de qué depende el precio.',
                    style: GoogleFonts.manrope(
                      color: colorScheme.onSurfaceVariant,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                )
              else ...[
                const SizedBox(height: 4),
                DropdownButtonFormField<String>(
                  initialValue: parentId,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Depende de',
                    isDense: true,
                  ),
                  items: [
                    for (final candidate in parents)
                      DropdownMenuItem(
                        value: candidate.id,
                        child: Text(candidate.nameController.text.trim()),
                      ),
                  ],
                  onChanged: enabled
                      ? (value) =>
                            setState(() => option.dependsOnGroupId = value)
                      : null,
                ),
                if (parent != null) ...[
                  const SizedBox(height: 8),
                  for (final parentOption in parent.opciones)
                    if (parentOption.nameController.text.trim().isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: TextFormField(
                          controller: option.ruleController(parentOption.id),
                          enabled: enabled,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          style: GoogleFonts.manrope(
                            color: colorScheme.onSurface,
                            fontWeight: FontWeight.w600,
                          ),
                          decoration: InputDecoration(
                            labelText: parentOption.nameController.text.trim(),
                            hintText: '0.00',
                            prefixText: '+\$ ',
                            isDense: true,
                          ),
                          validator: (value) =>
                              parseOptionPrice(value ?? '') == null
                              ? 'Precio inválido'
                              : null,
                        ),
                      ),
                ],
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _PriceModeRadio extends StatelessWidget {
  const _PriceModeRadio({required this.value, required this.label});

  final _OptionPriceMode value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () =>
          RadioGroup.maybeOf<_OptionPriceMode>(context)?.onChanged(value),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Radio<_OptionPriceMode>(value: value),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Text(
              label,
              style: GoogleFonts.manrope(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _QuestionPreview extends StatelessWidget {
  const _QuestionPreview({required this.question, required this.countLabel});

  final String question;
  final String countLabel;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Así lo verá el cliente',
          style: GoogleFonts.manrope(
            color: colorScheme.onSurfaceVariant,
            fontSize: 11,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: colorScheme.outlineVariant),
          ),
          child: Row(
            children: [
              Container(
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: colorScheme.outline, width: 2),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      question,
                      style: GoogleFonts.manrope(
                        color: colorScheme.onSurface,
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      countLabel,
                      style: GoogleFonts.manrope(
                        color: colorScheme.onSurfaceVariant,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _RadioLabel extends StatelessWidget {
  const _RadioLabel({required this.value, required this.label});

  final ProductOptionGroupType value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () =>
          RadioGroup.maybeOf<ProductOptionGroupType>(context)?.onChanged(value),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Radio<ProductOptionGroupType>(value: value),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Text(
              label,
              style: GoogleFonts.manrope(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _CountStepper extends StatelessWidget {
  const _CountStepper({
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.enabled,
    required this.onChanged,
  });

  final String label;
  final int value;
  final int min;
  final int max;
  final bool enabled;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: GoogleFonts.manrope(
            color: colorScheme.onSurfaceVariant,
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
          ),
        ),
        IconButton(
          visualDensity: VisualDensity.compact,
          onPressed: enabled && value > min ? () => onChanged(value - 1) : null,
          icon: const Icon(Icons.remove_circle_outline_rounded, size: 20),
        ),
        Text('$value', style: GoogleFonts.manrope(fontWeight: FontWeight.w800)),
        IconButton(
          visualDensity: VisualDensity.compact,
          onPressed: enabled && value < max ? () => onChanged(value + 1) : null,
          icon: const Icon(Icons.add_circle_outline_rounded, size: 20),
        ),
      ],
    );
  }
}
