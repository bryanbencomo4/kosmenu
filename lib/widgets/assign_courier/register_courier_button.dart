import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/widgets/assign_courier/assign_courier_theme.dart';

class RegisterCourierButton extends StatelessWidget {
  const RegisterCourierButton({
    super.key,
    required this.onPressed,
    this.label = 'Registrar repartidor',
    this.compact = true,
  });

  final VoidCallback? onPressed;
  final String label;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        foregroundColor: AssignCourierTheme.purple,
        backgroundColor: AssignCourierTheme.purpleSoft,
        padding: EdgeInsets.symmetric(
          horizontal: compact ? 10 : 14,
          vertical: compact ? 8 : 10,
        ),
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(999),
        ),
      ),
      icon: Icon(Icons.add_rounded, size: compact ? 16 : 18),
      label: Text(
        label,
        style: GoogleFonts.manrope(
          fontSize: compact ? 12 : 13,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}
