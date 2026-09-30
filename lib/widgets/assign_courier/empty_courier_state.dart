import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/widgets/assign_courier/assign_courier_theme.dart';
import 'package:kosmenu_app/widgets/assign_courier/register_courier_button.dart';

class EmptyCourierState extends StatelessWidget {
  const EmptyCourierState({
    super.key,
    required this.onRegister,
  });

  final VoidCallback onRegister;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 24),
      decoration: BoxDecoration(
        color: AssignCourierTheme.purpleSoft.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Column(
        children: [
          SizedBox(
            width: 92,
            height: 92,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Container(
                  width: 92,
                  height: 92,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.7),
                    shape: BoxShape.circle,
                  ),
                ),
                const Icon(
                  Icons.delivery_dining_rounded,
                  size: 42,
                  color: AssignCourierTheme.purple,
                ),
                Positioned(
                  right: 10,
                  bottom: 12,
                  child: Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: AssignCourierTheme.purple,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(
                      Icons.inventory_2_rounded,
                      size: 16,
                      color: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Aún no has registrado un repartidor',
            textAlign: TextAlign.center,
            style: GoogleFonts.manrope(
              color: AssignCourierTheme.text,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Registra repartidores frecuentes para asignarlos más rápido en futuros pedidos.',
            textAlign: TextAlign.center,
            style: GoogleFonts.manrope(
              color: AssignCourierTheme.muted,
              fontSize: 13,
              fontWeight: FontWeight.w600,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 16),
          RegisterCourierButton(
            onPressed: onRegister,
            compact: false,
          ),
        ],
      ),
    );
  }
}
