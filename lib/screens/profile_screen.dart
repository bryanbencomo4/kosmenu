import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  static const _appVersion = '1.0.0+1';

  late Future<Map<String, dynamic>?> _businessFuture;
  bool _signingOut = false;

  @override
  void initState() {
    super.initState();
    _businessFuture = _loadBusiness();
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

  Future<void> _signOut() async {
    if (_signingOut) return;

    setState(() => _signingOut = true);
    try {
      await Supabase.instance.client.auth.signOut();
      SupabaseConfig.clearCurrentComercioId();
      if (!mounted) return;
      Navigator.of(context).popUntil((route) => route.isFirst);
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
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _buildInfoRow(
                            context,
                            'Negocio',
                            businessName.isEmpty
                                ? 'No configurado'
                                : businessName,
                          ),
                          _buildInfoRow(
                            context,
                            'Comercio activo',
                            SupabaseConfig.currentComercioId.isEmpty
                                ? 'No definido'
                                : SupabaseConfig.currentComercioId,
                          ),
                        ],
                      ),
                    );
                  },
                ),
                const SizedBox(height: 16),
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
                    child: Text(
                      '© elmenuxfa.com · v$_appVersion',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.manrope(
                        color: colorScheme.onSurfaceVariant,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
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
