import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/widgets/assign_courier/assign_courier_theme.dart';

class CourierSelector extends StatelessWidget {
  const CourierSelector({
    super.key,
    required this.controller,
    required this.onChanged,
    this.enabled = true,
    this.onTap,
  });

  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final bool enabled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      enabled: enabled,
      onTap: onTap,
      onChanged: onChanged,
      style: GoogleFonts.manrope(
        color: AssignCourierTheme.text,
        fontWeight: FontWeight.w700,
        fontSize: 14,
      ),
      decoration: InputDecoration(
        hintText: 'Buscar por nombre o teléfono',
        hintStyle: GoogleFonts.manrope(
          color: AssignCourierTheme.muted,
          fontWeight: FontWeight.w600,
          fontSize: 14,
        ),
        filled: true,
        fillColor: AssignCourierTheme.fieldFill,
        prefixIcon: const Icon(
          Icons.search_rounded,
          color: AssignCourierTheme.muted,
        ),
        suffixIcon: const Icon(
          Icons.keyboard_arrow_down_rounded,
          color: AssignCourierTheme.muted,
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AssignCourierTheme.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AssignCourierTheme.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AssignCourierTheme.purple, width: 1.4),
        ),
      ),
    );
  }
}
