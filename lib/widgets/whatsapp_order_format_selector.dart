import 'package:flutter/material.dart';

class WhatsappOrderFormatSelector extends StatelessWidget {
  const WhatsappOrderFormatSelector({
    super.key,
    this.value,
    this.onChanged,
    this.managementMode = 'platform',
    this.onManagementModeChanged,
    this.showManagementMode = false,
    required this.titleColor,
    required this.descriptionColor,
    required this.activeColor,
  });

  final String? value;
  final ValueChanged<String>? onChanged;
  final String managementMode;
  final ValueChanged<String>? onManagementModeChanged;
  final bool showManagementMode;
  final Color titleColor;
  final Color descriptionColor;
  final Color activeColor;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (showManagementMode) ...[
          Text(
            'Modo de gestión de pedidos',
            style: TextStyle(
              color: titleColor,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          RadioGroup<String>(
            groupValue: managementMode == 'whatsapp_manual'
                ? 'whatsapp_manual'
                : 'platform',
            onChanged: (next) {
              if (next != null) {
                onManagementModeChanged?.call(
                  next == 'whatsapp_manual' ? 'whatsapp_manual' : 'platform',
                );
              }
            },
            child: Column(
              children: [
                RadioListTile<String>(
                  value: 'platform',
                  enabled: onManagementModeChanged != null,
                  activeColor: activeColor,
                  title: Text(
                    'Gestionar desde ElMenúXFA',
                    style: TextStyle(color: titleColor),
                  ),
                  subtitle: Text(
                    'Acepta pedidos y actualiza sus estados desde la plataforma.',
                    style: TextStyle(color: descriptionColor, fontSize: 12),
                  ),
                ),
                RadioListTile<String>(
                  value: 'whatsapp_manual',
                  enabled: onManagementModeChanged != null,
                  activeColor: activeColor,
                  title: Text(
                    'Gestionar manualmente por WhatsApp',
                    style: TextStyle(color: titleColor),
                  ),
                  subtitle: Text(
                    'Recibe la comanda completa y coordina el pedido directamente con el cliente.',
                    style: TextStyle(color: descriptionColor, fontSize: 12),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],
        Text(
          'Pedidos por WhatsApp',
          style: TextStyle(
            color: titleColor,
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Elige cómo quieres recibir los nuevos pedidos.',
          style: TextStyle(color: descriptionColor, fontSize: 12),
        ),
        const SizedBox(height: 8),
        RadioGroup<String>(
          groupValue: managementMode == 'whatsapp_manual' || value == 'detailed'
              ? 'detailed'
              : 'summary',
          onChanged: (next) {
            if (next != null) {
              onChanged?.call(next == 'detailed' ? 'detailed' : 'summary');
            }
          },
          child: Column(
            children: [
              RadioListTile<String>(
                value: 'summary',
                enabled:
                    onChanged != null && managementMode != 'whatsapp_manual',
                activeColor: activeColor,
                title: Text(
                  'Resumen + enlace',
                  style: TextStyle(color: titleColor),
                ),
                subtitle: Text(
                  'Recibe cliente, total, entrega, forma de pago y un enlace para gestionar el pedido.',
                  style: TextStyle(color: descriptionColor, fontSize: 12),
                ),
              ),
              RadioListTile<String>(
                value: 'detailed',
                enabled: onChanged != null,
                activeColor: activeColor,
                title: Text(
                  'Comanda por WhatsApp',
                  style: TextStyle(color: titleColor),
                ),
                subtitle: Text(
                  'Recibe productos, cantidades, opciones y observaciones. El enlace de gestión permanece disponible.',
                  style: TextStyle(color: descriptionColor, fontSize: 12),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
