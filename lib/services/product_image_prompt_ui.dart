import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

enum ProductVisualKind { food, digital, retail, service }

ProductVisualKind detectProductVisualKind({
  required String productName,
  String? description,
  String? categoryName,
  String? businessCategory,
}) {
  final haystack = [
    productName,
    description ?? '',
    categoryName ?? '',
    businessCategory ?? '',
  ].join(' ').toLowerCase();

  const digitalKeywords = [
    'spotify',
    'netflix',
    'amazon prime',
    'disney',
    'hbo',
    'streaming',
    'premium',
    'gaming',
    'free fire',
    'playstation',
    'xbox',
    'steam',
    'discord',
    'recarga',
    'suscripcion',
    'suscripción',
    'digital',
    'software',
    'membresia',
    'membresía',
    'gift card',
    'giftcard',
  ];

  const foodKeywords = [
    'comida',
    'restaur',
    'gastron',
    'pollo',
    'pizza',
    'hamburgues',
    'burger',
    'postre',
    'bebida',
    'cafe',
    'café',
    'pastel',
    'tacos',
    'sushi',
    'marisco',
    'pescado',
    'asado',
    'parrilla',
    'panader',
    'helado',
    'charcutera',
    'charcuterie',
    'embutido',
    'tabla',
    'queso',
    'antipasto',
  ];

  if (digitalKeywords.any(haystack.contains)) {
    return ProductVisualKind.digital;
  }
  if (foodKeywords.any(haystack.contains)) {
    return ProductVisualKind.food;
  }
  if (RegExp(
    r'(servicio|consultor|asesor|reparacion|reparación|mantenimiento|limpieza|instalacion|instalación)',
  ).hasMatch(haystack)) {
    return ProductVisualKind.service;
  }
  return ProductVisualKind.retail;
}

String aiImagePromptInstructions({
  required ProductVisualKind kind,
  required String productName,
}) {
  switch (kind) {
    case ProductVisualKind.food:
      return 'Describe la escena gastronómica para "$productName". '
          'Si lo dejas vacío, la IA generará una foto apetitosa automáticamente.';
    case ProductVisualKind.digital:
      return 'Describe el fondo o escena para "$productName". '
          'Si es marca conocida (Netflix, HBO Max, Spotify, etc.), el logo oficial se agrega automáticamente; no pidas el logo en el texto.';
    case ProductVisualKind.service:
      return 'Describe el ambiente o resultado del servicio "$productName". '
          'Si lo dejas vacío, la IA usará el nombre y la categoría.';
    case ProductVisualKind.retail:
      return 'Describe cómo quieres mostrar "$productName". '
          'Si lo dejas vacío, la IA generará una foto de catálogo automáticamente.';
  }
}

String aiImagePromptHint(ProductVisualKind kind) {
  switch (kind) {
    case ProductVisualKind.food:
      return 'Ej: Tabla de charcutería con quesos y embutidos, fondo oscuro elegante, luz cálida, estilo premium.';
    case ProductVisualKind.digital:
      return 'Ej: Fondo oscuro premium, TV con ambiente de cine, sin audífonos, sin texto, estilo limpio.';
    case ProductVisualKind.service:
      return 'Ej: Ambiente profesional, limpio y confiable, acorde al servicio ofrecido.';
    case ProductVisualKind.retail:
      return 'Ej: Producto centrado, fondo limpio, luz de estudio, estilo ecommerce.';
  }
}

class _ModeCard extends StatelessWidget {
  const _ModeCard({
    required this.selected,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final bool selected;
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Ink(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected ? colorScheme.primary : colorScheme.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: selected ? colorScheme.primary : colorScheme.outlineVariant,
          ),
        ),
        child: Row(
          children: [
            Icon(
              icon,
              color: selected ? colorScheme.onPrimary : colorScheme.primary,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: selected
                          ? colorScheme.onPrimary
                          : colorScheme.onSurface,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: TextStyle(
                      color: selected
                          ? colorScheme.onPrimary.withValues(alpha: 0.8)
                          : colorScheme.onSurfaceVariant,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ImagePreviewEmpty extends StatelessWidget {
  const _ImagePreviewEmpty({required this.colorScheme});

  final ColorScheme colorScheme;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.image_outlined, size: 34, color: colorScheme.primary.withValues(alpha: 0.55)),
          const SizedBox(height: 6),
          Text(
            'Tu imagen se generará aquí',
            style: TextStyle(color: colorScheme.onSurfaceVariant, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 2),
          Text(
            'La vista previa aparecerá después de generar',
            style: TextStyle(color: colorScheme.onSurfaceVariant, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

/// Returns `null` if cancelled, empty string for auto prompt, or custom text.
Future<String?> showAiImagePromptDialog(
  BuildContext context, {
  required String productName,
  String? description,
  String? categoryName,
  String? currentImageUrl,
  double availableCredits = 0,
  VoidCallback? onRecharge,
}) async {
  final kind = detectProductVisualKind(
    productName: productName,
    description: description,
    categoryName: categoryName,
  );
  final controller = TextEditingController();
  final result = await showDialog<String>(
    context: context,
    builder: (dialogContext) {
      final colorScheme = Theme.of(dialogContext).colorScheme;
      var customMode = false;
      final creditsText = availableCredits.toStringAsFixed(
        availableCredits % 1 == 0 ? 0 : 2,
      );
      return StatefulBuilder(
        builder: (context, setDialogState) => Dialog(
          backgroundColor: colorScheme.surface,
          insetPadding: const EdgeInsets.symmetric(
            horizontal: 20,
            vertical: 24,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(26),
          ),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: 860,
              maxHeight: MediaQuery.sizeOf(context).height - 48,
            ),
            child: Scrollbar(
              thumbVisibility: true,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(24, 22, 24, 18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 54,
                          height: 54,
                          decoration: BoxDecoration(
                            color: colorScheme.primary.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Icon(
                            Icons.auto_awesome_rounded,
                            color: colorScheme.primary,
                            size: 28,
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Generar imagen',
                                style: GoogleFonts.manrope(
                                  color: colorScheme.onSurface,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 22,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Crea una imagen para "$productName" con inteligencia artificial.',
                                style: TextStyle(
                                  color: colorScheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: () =>
                              Navigator.of(dialogContext).pop(null),
                          icon: const Icon(Icons.close_rounded),
                          tooltip: 'Cerrar',
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'Vista previa',
                      style: GoogleFonts.manrope(
                        color: colorScheme.onSurface,
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      width: double.infinity,
                      height: 150,
                      decoration: BoxDecoration(
                        color: colorScheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: colorScheme.outlineVariant),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: (currentImageUrl ?? '').trim().isNotEmpty
                          ? Image.network(
                              currentImageUrl!.trim(),
                              fit: BoxFit.cover,
                              errorBuilder: (_, _, _) => _ImagePreviewEmpty(colorScheme: colorScheme),
                            )
                          : _ImagePreviewEmpty(colorScheme: colorScheme),
                    ),
                    const SizedBox(height: 18),
                    Row(
                      children: [
                        Expanded(
                          child: _ModeCard(
                            selected: !customMode,
                            icon: Icons.auto_awesome_rounded,
                            title: 'Generar automáticamente',
                            subtitle: 'La IA crea la imagen por ti',
                            onTap: () =>
                                setDialogState(() => customMode = false),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _ModeCard(
                            selected: customMode,
                            icon: Icons.edit_rounded,
                            title: 'Usar prompt personalizado',
                            subtitle: 'Escribe tu propia descripción',
                            onTap: () =>
                                setDialogState(() => customMode = true),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(13),
                      decoration: BoxDecoration(
                        color: colorScheme.primary.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.info_outline_rounded,
                            color: colorScheme.primary,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              customMode
                                  ? aiImagePromptInstructions(
                                      kind: kind,
                                      productName: productName,
                                    )
                                  : 'La IA usará el nombre, categoría y descripción del producto para crear una imagen atractiva.',
                              style: TextStyle(
                                color: colorScheme.onSurfaceVariant,
                                height: 1.35,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (customMode) ...[
                      const SizedBox(height: 14),
                      TextField(
                        controller: controller,
                        maxLines: 4,
                        minLines: 3,
                        maxLength: 500,
                        decoration: InputDecoration(
                          hintText: aiImagePromptHint(kind),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 11,
                      ),
                      decoration: BoxDecoration(
                        color: colorScheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.account_balance_wallet_outlined,
                            color: colorScheme.primary,
                            size: 20,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Disponibles: $creditsText créditos',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          const Text(
                            'Costo: 1 crédito',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                    ),
                    if (availableCredits < 1) ...[
                      const SizedBox(height: 8),
                      TextButton.icon(
                        onPressed: onRecharge,
                        icon: const Icon(Icons.add_card_rounded),
                        label: const Text('Recargar créditos'),
                      ),
                    ],
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: availableCredits < 1
                            ? null
                            : () => Navigator.of(dialogContext).pop(
                                  customMode ? controller.text.trim() : '',
                                ),
                        icon: const Icon(Icons.auto_awesome_rounded, size: 18),
                        label: const Text('Generar imagen con IA'),
                        style: FilledButton.styleFrom(
                          minimumSize: const Size.fromHeight(48),
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Center(
                      child: TextButton(
                        onPressed: () => Navigator.of(dialogContext).pop(null),
                        child: const Text('Cancelar'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    },
  );
  controller.dispose();
  return result;
}
