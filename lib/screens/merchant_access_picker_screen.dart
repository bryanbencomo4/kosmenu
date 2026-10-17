import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/models/merchant_panel.dart';

class MerchantAccessOption {
  const MerchantAccessOption({
    required this.comercioId,
    required this.nombre,
    required this.role,
    required this.isOwner,
    this.slug,
    this.logoUrl,
  });

  final String comercioId;
  final String nombre;
  final String? slug;
  final String? logoUrl;
  final MerchantStaffRole role;
  final bool isOwner;

  String get subtitle => isOwner ? 'Propietario' : role.label;
}

class MerchantAccessPickerScreen extends StatelessWidget {
  const MerchantAccessPickerScreen({
    super.key,
    required this.options,
    required this.onSelected,
  });

  final List<MerchantAccessOption> options;
  final ValueChanged<MerchantAccessOption> onSelected;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F1F8),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Elige un negocio',
                    style: GoogleFonts.poppins(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      color: const Color(0xFF21172D),
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Tu cuenta tiene acceso a más de un restaurante. Selecciona cuál quieres abrir.',
                    style: TextStyle(color: Color(0xFF716779), height: 1.5),
                  ),
                  const SizedBox(height: 20),
                  Expanded(
                    child: ListView.separated(
                      itemCount: options.length,
                      separatorBuilder: (context, index) =>
                          const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final option = options[index];
                        return Material(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(16),
                            onTap: () => onSelected(option),
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Row(
                                children: [
                                  CircleAvatar(
                                    backgroundColor: const Color(0xFFF3E8FF),
                                    backgroundImage:
                                        (option.logoUrl != null &&
                                            option.logoUrl!.trim().isNotEmpty)
                                        ? NetworkImage(option.logoUrl!)
                                        : null,
                                    child:
                                        (option.logoUrl == null ||
                                            option.logoUrl!.trim().isEmpty)
                                        ? const Icon(
                                            Icons.storefront_outlined,
                                            color: Color(0xFF6D28D9),
                                          )
                                        : null,
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          option.nombre,
                                          style: GoogleFonts.poppins(
                                            fontWeight: FontWeight.w700,
                                            fontSize: 15,
                                          ),
                                        ),
                                        Text(
                                          option.subtitle,
                                          style: GoogleFonts.poppins(
                                            fontSize: 12.5,
                                            color: const Color(0xFF6B6F92),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const Icon(
                                    Icons.chevron_right_rounded,
                                    color: Color(0xFF6B6F92),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
