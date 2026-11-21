import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/models/merchant_panel.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

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

/// Owned + active staff commerces for the signed-in user.
Future<List<MerchantAccessOption>> loadMerchantAccessOptions({
  String? userId,
  bool acceptPendingInvites = false,
}) async {
  final resolvedUserId =
      (userId ?? Supabase.instance.client.auth.currentUser?.id)?.trim() ?? '';
  if (resolvedUserId.isEmpty) return const [];

  if (acceptPendingInvites) {
    try {
      await Supabase.instance.client.rpc('accept_pending_comercio_invites');
    } catch (_) {}
  }

  final ownedRows = await Supabase.instance.client
      .from('comercios')
      .select('id, slug, nombre, logo_url')
      .eq('owner_id', resolvedUserId);
  final memberRows = await Supabase.instance.client
      .from('comercio_members')
      .select('comercio_id, role, comercios(id, slug, nombre, logo_url)')
      .eq('user_id', resolvedUserId)
      .eq('status', 'active');

  final options = <MerchantAccessOption>[];
  final seen = <String>{};

  for (final raw in ownedRows as List? ?? const []) {
    if (raw is! Map) continue;
    final map = Map<String, dynamic>.from(raw);
    final id = (map['id'] ?? '').toString().trim();
    if (id.isEmpty || !seen.add(id)) continue;
    options.add(
      MerchantAccessOption(
        comercioId: id,
        nombre: (map['nombre'] ?? 'Tu restaurante').toString(),
        slug: map['slug']?.toString(),
        logoUrl: map['logo_url']?.toString(),
        role: MerchantStaffRole.administrador,
        isOwner: true,
      ),
    );
  }

  for (final raw in memberRows as List? ?? const []) {
    if (raw is! Map) continue;
    final map = Map<String, dynamic>.from(raw);
    final nested = map['comercios'];
    final comercio = nested is Map
        ? Map<String, dynamic>.from(nested)
        : <String, dynamic>{'id': map['comercio_id']};
    final id = (comercio['id'] ?? map['comercio_id'] ?? '').toString().trim();
    if (id.isEmpty || !seen.add(id)) continue;
    options.add(
      MerchantAccessOption(
        comercioId: id,
        nombre: (comercio['nombre'] ?? 'Tu restaurante').toString(),
        slug: comercio['slug']?.toString(),
        logoUrl: comercio['logo_url']?.toString(),
        role: MerchantStaffRoleUi.fromRaw(map['role']?.toString()),
        isOwner: false,
      ),
    );
  }

  return options;
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
                    'Elige un menú',
                    style: GoogleFonts.poppins(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      color: const Color(0xFF21172D),
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Tu cuenta tiene más de un menú. Selecciona cuál quieres administrar.',
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
