import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/merchant_panel.dart';
import 'package:kosmenu_app/services/merchant_session.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ComercioStaffScreen extends StatefulWidget {
  const ComercioStaffScreen({super.key});

  @override
  State<ComercioStaffScreen> createState() => _ComercioStaffScreenState();
}

class _ComercioStaffScreenState extends State<ComercioStaffScreen> {
  bool _loading = true;
  bool _inviting = false;
  String? _error;
  ComercioTeamMember? _owner;
  List<ComercioTeamMember> _members = const [];
  List<ComercioTeamMember> _invites = const [];
  final _email = TextEditingController();
  MerchantStaffRole _role = MerchantStaffRole.caja;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final payload = await Supabase.instance.client.rpc(
        'list_comercio_team',
        params: {'p_comercio_id': SupabaseConfig.currentComercioId},
      );
      final map = payload is Map
          ? Map<String, dynamic>.from(payload)
          : const <String, dynamic>{};
      if (!mounted) return;
      setState(() {
        _owner = map['owner'] is Map
            ? ComercioTeamMember.fromMap(Map<String, dynamic>.from(map['owner'] as Map))
            : null;
        _members = (map['members'] as List? ?? const [])
            .whereType<Map>()
            .map((row) => ComercioTeamMember.fromMap(Map<String, dynamic>.from(row)))
            .toList(growable: false);
        _invites = (map['invites'] as List? ?? const [])
            .whereType<Map>()
            .map((row) => ComercioTeamMember.fromMap(Map<String, dynamic>.from(row)))
            .toList(growable: false);
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = '$error';
        _loading = false;
      });
    }
  }

  Future<void> _invite() async {
    final email = _email.text.trim();
    if (email.isEmpty) return;
    setState(() => _inviting = true);
    try {
      await Supabase.instance.client.rpc(
        'invite_comercio_member',
        params: {
          'p_comercio_id': SupabaseConfig.currentComercioId,
          'p_email': email,
          'p_role': _role.name,
        },
      );
      _email.clear();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Invitación lista. Esa persona entra al negocio cuando inicie sesión con ese correo.',
          ),
        ),
      );
      await _load();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo invitar: $error')),
      );
    } finally {
      if (mounted) setState(() => _inviting = false);
    }
  }

  Future<void> _revoke({String? memberId, String? inviteId}) async {
    try {
      await Supabase.instance.client.rpc(
        'revoke_comercio_member',
        params: {
          'p_comercio_id': SupabaseConfig.currentComercioId,
          'p_member_id': memberId,
          'p_invite_id': inviteId,
        },
      );
      await _load();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo quitar el acceso: $error')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final canManage = MerchantSession.isAdmin;
    return Scaffold(
      backgroundColor: const Color(0xFFF8F7FC),
      appBar: AppBar(
        title: Text(
          'Usuarios del negocio',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        FilledButton(onPressed: _load, child: const Text('Reintentar')),
                      ],
                    ),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                  children: [
                    if (canManage) ...[
                      Text(
                        'Invitar usuario',
                        style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 16),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                          labelText: 'Email',
                          filled: true,
                          fillColor: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 10),
                      DropdownButtonFormField<MerchantStaffRole>(
                        // ignore: deprecated_member_use
                        value: _role,
                        decoration: const InputDecoration(
                          labelText: 'Rol',
                          filled: true,
                          fillColor: Colors.white,
                        ),
                        items: [
                          for (final role in MerchantStaffRole.values)
                            DropdownMenuItem(
                              value: role,
                              child: Text('${role.label} · ${role.hint}'),
                            ),
                        ],
                        onChanged: (value) {
                          if (value != null) setState(() => _role = value);
                        },
                      ),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: _inviting ? null : _invite,
                        style: FilledButton.styleFrom(backgroundColor: const Color(0xFF6D28D9)),
                        child: Text(_inviting ? 'Enviando…' : 'Enviar invitación'),
                      ),
                      const SizedBox(height: 20),
                    ],
                    Text(
                      'Equipo',
                      style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 16),
                    ),
                    const SizedBox(height: 8),
                    if (_owner != null) _tile(_owner!, canRevoke: false),
                    for (final member in _members)
                      _tile(member, canRevoke: canManage && !member.isOwner),
                    if (_invites.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      Text(
                        'Invitaciones pendientes',
                        style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 16),
                      ),
                      const SizedBox(height: 8),
                      for (final invite in _invites)
                        _tile(invite, canRevoke: canManage),
                    ],
                  ],
                ),
    );
  }

  Widget _tile(ComercioTeamMember member, {required bool canRevoke}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          const CircleAvatar(
            backgroundColor: Color(0xFFF3E8FF),
            child: Icon(Icons.person_outline_rounded, color: Color(0xFF6D28D9)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  member.email.isEmpty ? 'Sin correo' : member.email,
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 13.5),
                ),
                Text(
                  member.isInvite
                      ? '${member.role.label} · pendiente'
                      : member.isOwner
                          ? '${member.role.label} · propietario'
                          : member.role.label,
                  style: GoogleFonts.poppins(fontSize: 12, color: const Color(0xFF6B6F92)),
                ),
              ],
            ),
          ),
          if (canRevoke)
            IconButton(
              tooltip: 'Quitar acceso',
              onPressed: () => _revoke(memberId: member.isInvite ? null : member.id, inviteId: member.isInvite ? member.id : null),
              icon: const Icon(Icons.person_remove_outlined),
            ),
        ],
      ),
    );
  }
}
