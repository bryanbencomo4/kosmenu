import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/screens/auth_screen.dart';
import 'package:kosmenu_app/screens/billing_plan_screen.dart';
import 'package:kosmenu_app/screens/merchant_access_picker_screen.dart';
import 'package:kosmenu_app/services/app_update_service.dart';
import 'package:kosmenu_app/services/merchant_presence.dart';
import 'package:kosmenu_app/services/merchant_session.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  late Future<Map<String, dynamic>?> _businessFuture;
  late final Future<String> _versionLabelFuture;
  late Future<List<MerchantAccessOption>> _accessOptionsFuture;
  bool _signingOut = false;
  bool _switchingAccess = false;

  @override
  void initState() {
    super.initState();
    _businessFuture = _loadBusiness();
    _versionLabelFuture = AppUpdateService.installedVersionLabel();
    _accessOptionsFuture = loadMerchantAccessOptions();
  }

  @override
  void dispose() {
    super.dispose();
  }

  Future<Map<String, dynamic>?> _loadBusiness() async {
    if (!SupabaseConfig.hasCurrentComercioId) return null;

    final row = await Supabase.instance.client
        .from('comercios')
        .select()
        .eq('id', SupabaseConfig.currentComercioId)
        .limit(1)
        .maybeSingle();

    if (row == null) return null;
    final business = Map<String, dynamic>.from(row as Map);
    final comercioId = business['id']?.toString().trim() ?? '';
    final comercioSlug = business['slug']?.toString().trim();
    if (comercioId.isNotEmpty) {
      SupabaseConfig.setCurrentComercioId(comercioId, slug: comercioSlug);
    }
    return business;
  }

  Future<void> _selectAccess(MerchantAccessOption option) async {
    if (_switchingAccess || _signingOut) return;
    if (option.comercioId == SupabaseConfig.currentComercioId) return;

    setState(() => _switchingAccess = true);
    try {
      await enterMerchantAccess(context, option);
    } catch (error) {
      if (!mounted) return;
      setState(() => _switchingAccess = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo cambiar de menú: $error')),
      );
    }
  }

  String _displayName(User user) {
    final metadata = user.userMetadata ?? const <String, dynamic>{};
    final fullName = (metadata['full_name'] ?? metadata['name'] ?? '')
        .toString()
        .trim();
    if (fullName.isNotEmpty) return fullName;
    final email = user.email?.trim() ?? '';
    return email.isNotEmpty ? email : 'Usuario elmenuxfa.com';
  }

  String _avatarUrl(User user) {
    final metadata = user.userMetadata ?? const <String, dynamic>{};
    return (metadata['avatar_url'] ?? metadata['picture'] ?? '')
        .toString()
        .trim();
  }

  String _avatarInitial(String name) {
    final clean = name.trim();
    if (clean.isEmpty) return 'K';
    return clean.substring(0, 1).toUpperCase();
  }

  Widget _buildInfoRow(BuildContext context, String label, String value) {
    final colorScheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: GoogleFonts.manrope(
              color: colorScheme.onSurfaceVariant,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: GoogleFonts.manrope(
              color: colorScheme.onSurface,
              fontSize: 15,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMenuOptionTile({
    required MerchantAccessOption option,
    required bool selected,
    required bool enabled,
  }) {
    final colorScheme = Theme.of(context).colorScheme;
    final hasLogo =
        option.logoUrl != null && option.logoUrl!.trim().isNotEmpty;
    return Material(
      color: selected
          ? colorScheme.primary.withValues(alpha: 0.08)
          : colorScheme.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: enabled ? () => _selectAccess(option) : null,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected
                  ? colorScheme.primary.withValues(alpha: 0.45)
                  : colorScheme.outlineVariant,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 20,
                backgroundColor: const Color(0xFFF3E8FF),
                backgroundImage: hasLogo ? NetworkImage(option.logoUrl!) : null,
                child: hasLogo
                    ? null
                    : const Icon(
                        Icons.storefront_outlined,
                        color: Color(0xFF6D28D9),
                        size: 20,
                      ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      option.nombre,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.manrope(
                        fontWeight: FontWeight.w800,
                        fontSize: 14.5,
                        color: colorScheme.onSurface,
                      ),
                    ),
                    Text(
                      selected ? 'Menú activo' : option.subtitle,
                      style: GoogleFonts.manrope(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: selected
                            ? colorScheme.primary
                            : colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              if (selected)
                Icon(Icons.check_circle_rounded, color: colorScheme.primary)
              else
                Icon(
                  Icons.radio_button_unchecked_rounded,
                  color: colorScheme.outline,
                ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _signOut() async {
    if (_signingOut) return;

    setState(() => _signingOut = true);
    try {
      await Supabase.instance.client.auth.signOut();
      SupabaseConfig.clearCurrentComercioId();
      MerchantSession.clear();
      clearMerchantPresence();
      if (!mounted) return;
      returnToAuthGate(context);
    } on AuthException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo cerrar sesion: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _signingOut = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Perfil')),
        body: const Center(child: Text('No hay sesion activa.')),
      );
    }

    final name = _displayName(user);
    final email = user.email ?? 'Sin correo';
    final avatar = _avatarUrl(user);

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(
        title: Text(
          'Perfil',
          style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 620),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: colorScheme.surfaceContainerHigh,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: colorScheme.outlineVariant),
                  ),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 28,
                        backgroundColor: colorScheme.primary.withValues(
                          alpha: 0.14,
                        ),
                        backgroundImage: avatar.isNotEmpty
                            ? NetworkImage(avatar)
                            : null,
                        child: avatar.isEmpty
                            ? Text(
                                _avatarInitial(name),
                                style: GoogleFonts.manrope(
                                  color: colorScheme.primary,
                                  fontSize: 22,
                                  fontWeight: FontWeight.w800,
                                ),
                              )
                            : null,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.manrope(
                                color: colorScheme.onSurface,
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              email,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.manrope(
                                color: colorScheme.onSurfaceVariant,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                FutureBuilder<Map<String, dynamic>?>(
                  future: _businessFuture,
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: colorScheme.surfaceContainerHigh,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: colorScheme.outlineVariant),
                        ),
                        child: const Center(child: CircularProgressIndicator()),
                      );
                    }

                    final businessName =
                        snapshot.data?['nombre']?.toString().trim() ?? '';

                    return Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: colorScheme.surfaceContainerHigh,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: colorScheme.outlineVariant),
                      ),
                      child: _buildInfoRow(
                        context,
                        'Negocio activo',
                        businessName.isEmpty
                            ? 'No configurado'
                            : businessName,
                      ),
                    );
                  },
                ),
                FutureBuilder<List<MerchantAccessOption>>(
                  future: _accessOptionsFuture,
                  builder: (context, snapshot) {
                    final options = snapshot.data ?? const [];
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const SizedBox.shrink();
                    }
                    // Only Parche (or any future multi-menu account) sees this.
                    if (options.length < 2) return const SizedBox.shrink();

                    final currentId = SupabaseConfig.currentComercioId;
                    return Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: colorScheme.surfaceContainerHigh,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: colorScheme.outlineVariant,
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Tus menús',
                              style: GoogleFonts.manrope(
                                fontWeight: FontWeight.w800,
                                fontSize: 15,
                                color: colorScheme.onSurface,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _switchingAccess
                                  ? 'Cambiando de menú...'
                                  : 'Toca otro menú para administrarlo.',
                              style: GoogleFonts.manrope(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w600,
                                color: colorScheme.onSurfaceVariant,
                              ),
                            ),
                            const SizedBox(height: 12),
                            for (var i = 0; i < options.length; i++) ...[
                              if (i > 0) const SizedBox(height: 8),
                              _buildMenuOptionTile(
                                option: options[i],
                                selected:
                                    options[i].comercioId == currentId,
                                enabled: !_switchingAccess && !_signingOut,
                              ),
                            ],
                          ],
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const BillingPlanScreen(),
                      ),
                    );
                  },
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(50),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  icon: const Icon(Icons.payments_outlined),
                  label: Text(
                    'Plan y facturación',
                    style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
                  ),
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: _signingOut ? null : _signOut,
                  style: FilledButton.styleFrom(
                    backgroundColor: colorScheme.error,
                    foregroundColor: colorScheme.onError,
                    minimumSize: const Size.fromHeight(50),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  icon: _signingOut
                      ? SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: colorScheme.onError,
                          ),
                        )
                      : const Icon(Icons.logout_rounded),
                  label: Text(
                    _signingOut ? 'Cerrando sesion...' : 'Cerrar sesion',
                    style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
                  ),
                ),
                const SizedBox(height: 20),
                Center(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: FutureBuilder<String>(
                      future: _versionLabelFuture,
                      builder: (context, snapshot) {
                        final version = snapshot.data?.trim() ?? '';
                        final label = version.isEmpty
                            ? '© elmenuxfa.com'
                            : '© elmenuxfa.com · $version';
                        return Text(
                          label,
                          textAlign: TextAlign.center,
                          style: GoogleFonts.manrope(
                            color: colorScheme.onSurfaceVariant,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        );
                      },
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
