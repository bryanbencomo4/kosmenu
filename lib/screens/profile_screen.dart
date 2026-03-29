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
  late Future<Map<String, dynamic>?> _businessFuture;
  bool _signingOut = false;

  @override
  void initState() {
    super.initState();
    _businessFuture = _loadBusiness();
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
    return Map<String, dynamic>.from(row as Map);
  }

  String _displayName(User user) {
    final metadata = user.userMetadata ?? const <String, dynamic>{};
    final fullName = (metadata['full_name'] ?? metadata['name'] ?? '').toString().trim();
    if (fullName.isNotEmpty) return fullName;
    final email = user.email?.trim() ?? '';
    return email.isNotEmpty ? email : 'Usuario Kosmenu';
  }

  String _avatarUrl(User user) {
    final metadata = user.userMetadata ?? const <String, dynamic>{};
    return (metadata['avatar_url'] ?? metadata['picture'] ?? '').toString().trim();
  }

  String _avatarInitial(String name) {
    final clean = name.trim();
    if (clean.isEmpty) return 'K';
    return clean.substring(0, 1).toUpperCase();
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
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
      backgroundColor: const Color(0xFF0F0D0B),
      appBar: AppBar(
        backgroundColor: const Color(0xFF17120E),
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('Perfil'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(24),
                gradient: const LinearGradient(
                  colors: [Color(0xFF2A1C12), Color(0xFF15100C)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                border: Border.all(color: const Color(0x33FFFFFF)),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 34,
                    backgroundColor: const Color(0xFF352316),
                    backgroundImage: avatar.isNotEmpty ? NetworkImage(avatar) : null,
                    child: avatar.isEmpty
                        ? Text(
                            _avatarInitial(name),
                            style: GoogleFonts.poppins(
                              color: const Color(0xFFFFD8A7),
                              fontSize: 22,
                              fontWeight: FontWeight.w700,
                            ),
                          )
                        : null,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          email,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.poppins(
                            color: const Color(0xFFE7CCAA),
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            FutureBuilder<Map<String, dynamic>?>(
              future: _businessFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Card(
                    color: Color(0xFF17120E),
                    child: Padding(
                      padding: EdgeInsets.all(16),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  );
                }

                if (snapshot.hasError) {
                  return Card(
                    color: const Color(0xFF17120E),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        'No se pudo cargar el negocio: ${snapshot.error}',
                        style: const TextStyle(color: Colors.white70),
                      ),
                    ),
                  );
                }

                final business = snapshot.data;
                if (business == null) {
                  return const Card(
                    color: Color(0xFF17120E),
                    child: Padding(
                      padding: EdgeInsets.all(16),
                      child: Text(
                        'No se encontro informacion del negocio actual.',
                        style: TextStyle(color: Colors.white70),
                      ),
                    ),
                  );
                }

                return Card(
                  color: const Color(0xFF17120E),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Negocio actual',
                          style: GoogleFonts.poppins(
                            color: const Color(0xFFFFE2BF),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          business['nombre']?.toString() ?? 'Sin nombre',
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Categoria: ${(business['categoria'] ?? 'No definida').toString()}',
                          style: const TextStyle(color: Colors.white70),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'WhatsApp: ${(business['whatsapp'] ?? 'No configurado').toString()}',
                          style: const TextStyle(color: Colors.white70),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'ID: ${(business['id'] ?? '').toString()}',
                          style: const TextStyle(color: Colors.white54, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: _signingOut ? null : _signOut,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFBF2F2F),
                foregroundColor: Colors.white,
                minimumSize: const Size.fromHeight(52),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              icon: _signingOut
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.logout_rounded),
              label: Text(_signingOut ? 'Cerrando sesion...' : 'Cerrar Sesion'),
            ),
          ],
        ),
      ),
    );
  }
}
