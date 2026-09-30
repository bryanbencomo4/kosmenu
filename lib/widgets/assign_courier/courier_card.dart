import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/services/delivery_courier_service.dart';
import 'package:kosmenu_app/widgets/assign_courier/assign_courier_theme.dart';

class CourierCard extends StatelessWidget {
  const CourierCard({
    super.key,
    required this.courier,
    required this.selected,
    required this.onTap,
  });

  final DeliveryCourier courier;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
          decoration: BoxDecoration(
            color: selected ? AssignCourierTheme.selectedFill : Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected
                  ? AssignCourierTheme.selectedBorder
                  : AssignCourierTheme.border,
              width: selected ? 1.6 : 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AssignCourierTheme.purpleSoft,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(
                  Icons.delivery_dining_rounded,
                  color: AssignCourierTheme.purple,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      courier.alias.trim().isEmpty ? 'Repartidor' : courier.alias,
                      style: GoogleFonts.manrope(
                        color: AssignCourierTheme.text,
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      courier.displayPhone,
                      style: GoogleFonts.manrope(
                        color: AssignCourierTheme.muted,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              if (selected)
                Container(
                  width: 28,
                  height: 28,
                  decoration: const BoxDecoration(
                    color: AssignCourierTheme.purple,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.check_rounded, color: Colors.white, size: 16),
                )
              else
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: AssignCourierTheme.border, width: 1.5),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
