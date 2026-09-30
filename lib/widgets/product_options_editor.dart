import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/models/product_option_group.dart';

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
  });

  final List<ProductOptionGroup> initialGroups;

  /// State of the "Producto con opciones" switch; off for existing products.
  final bool initiallyActive;
  final String currencyCode;
  final bool enabled;

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
    List<_OptionDraft>? opciones,
  }) : nameController = TextEditingController(text: nombre),
       opciones = opciones ?? [];

  final String id;
  final TextEditingController nameController;
  ProductOptionGroupType tipo;
  bool obligatorio;
  int min;
  int max;
  final List<_OptionDraft> opciones;

  bool get isSingle => tipo == ProductOptionGroupType.unica;

  void dispose() {
    nameController.dispose();
    for (final option in opciones) {
      option.dispose();
    }
  }
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

  /// Whether the merchant turned on "Producto con opciones".
  bool get active => _active;

  @override
  void initState() {
    super.initState();
    for (final group in widget.initialGroups) {
      _groups.add(
        _GroupDraft(
          id: group.id,
          nombre: group.nombre,
          tipo: group.tipo,
          obligatorio: group.obligatorio,
          min: group.min,
          max: group.max,
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
                  for (final rule in option.reglasPrecio) rule.opcion: rule.precio,
                },
              ),
          ],
        ),
      );
    }
  }

  @override
  void dispose() {
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
            precio: parseOptionPrice(option.ruleController(parentOption.id).text) ?? 0,
          ),
    ];
  }

  List<_GroupDraft> _parentCandidates(_GroupDraft current) {
    return [
      for (final group in _groups)
        if (group.id != current.id && group.nameController.text.trim().isNotEmpty)
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
      ],
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

    return Container(
      key: ValueKey('option-group-${group.id}'),
      padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
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
              Expanded(
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
              IconButton(
                tooltip: 'Eliminar grupo',
                onPressed: enabled ? () => _removeGroup(group) : null,
                icon: Icon(
                  Icons.delete_outline_rounded,
                  color: colorScheme.error,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text('Tipo', style: labelStyle),
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
      ),
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
    final parentId = parents.any((parent) => parent.id == option.dependsOnGroupId)
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
      onTap: () => RadioGroup.maybeOf<_OptionPriceMode>(context)?.onChanged(value),
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

class _RadioLabel extends StatelessWidget {
  const _RadioLabel({required this.value, required this.label});

  final ProductOptionGroupType value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => RadioGroup.maybeOf<ProductOptionGroupType>(
        context,
      )?.onChanged(value),
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
        Text(
          '$value',
          style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
        ),
        IconButton(
          visualDensity: VisualDensity.compact,
          onPressed: enabled && value < max ? () => onChanged(value + 1) : null,
          icon: const Icon(Icons.add_circle_outline_rounded, size: 20),
        ),
      ],
    );
  }
}
