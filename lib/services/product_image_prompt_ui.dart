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

/// Returns `null` if cancelled, empty string for auto prompt, or custom text.
Future<String?> showAiImagePromptDialog(
  BuildContext context, {
  required String productName,
  String? description,
  String? categoryName,
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
      return AlertDialog(
        backgroundColor: colorScheme.surfaceContainerHigh,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: Text(
          'Describe la imagen',
          style: GoogleFonts.manrope(
            color: colorScheme.onSurface,
            fontWeight: FontWeight.w800,
          ),
        ),
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                aiImagePromptInstructions(kind: kind, productName: productName),
                style: TextStyle(color: colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: controller,
                maxLines: 4,
                minLines: 3,
                maxLength: 500,
                decoration: InputDecoration(
                  hintText: aiImagePromptHint(kind),
                  border: const OutlineInputBorder(),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(null),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(''),
            child: const Text('Generar automáticamente'),
          ),
          FilledButton.icon(
            onPressed: () =>
                Navigator.of(dialogContext).pop(controller.text.trim()),
            icon: const Icon(Icons.auto_awesome_rounded, size: 18),
            label: const Text('Generar imagen'),
          ),
        ],
      );
    },
  );
  controller.dispose();
  return result;
}
