import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:kosmenu_app/core/theme/app_theme.dart';
import 'package:kosmenu_app/services/web_camera_handoff_service.dart';

class MobileCameraCaptureScreen extends StatefulWidget {
  const MobileCameraCaptureScreen({
    super.key,
    required this.encodedPayload,
  });

  final String encodedPayload;

  @override
  State<MobileCameraCaptureScreen> createState() =>
      _MobileCameraCaptureScreenState();
}

class _MobileCameraCaptureScreenState extends State<MobileCameraCaptureScreen> {
  final ImagePicker _picker = ImagePicker();

  bool _isUploading = false;
  bool _isDone = false;
  String? _errorMessage;
  Uint8List? _previewBytes;

  WebCameraHandoffPayload? get _payload {
    return WebCameraHandoffPayload.tryDecode(widget.encodedPayload);
  }

  Future<void> _captureAndUpload(ImageSource source) async {
    final payload = _payload;
    if (payload == null || _isUploading) {
      return;
    }

    setState(() {
      _isUploading = true;
      _errorMessage = null;
    });

    try {
      final picked = await _picker.pickImage(
        source: source,
        imageQuality: payload.imageQuality,
        maxWidth: payload.maxWidth.toDouble(),
        maxHeight: payload.maxHeight?.toDouble(),
      );
      if (picked == null) {
        if (!mounted) {
          return;
        }
        setState(() => _isUploading = false);
        return;
      }

      final bytes = await picked.readAsBytes();
      final mimeType = picked.mimeType ?? _inferMimeType(picked.name);
      await WebCameraHandoffService.uploadCapturedBytes(
        payload: payload,
        bytes: bytes,
        contentType: mimeType,
      );

      if (!mounted) {
        return;
      }
      setState(() {
        _previewBytes = bytes;
        _isUploading = false;
        _isDone = true;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _isUploading = false;
        _errorMessage = 'No pudimos subir la imagen. Intenta otra vez.';
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error al cargar la imagen: $error')),
      );
    }
  }

  String _inferMimeType(String name) {
    final lowered = name.toLowerCase();
    if (lowered.endsWith('.png')) {
      return 'image/png';
    }
    if (lowered.endsWith('.webp')) {
      return 'image/webp';
    }
    return 'image/jpeg';
  }

  @override
  Widget build(BuildContext context) {
    final payload = _payload;
    final colorScheme = Theme.of(context).colorScheme;

    if (payload == null) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'El código de carga no es válido o ya no está disponible.',
              textAlign: TextAlign.center,
              style: GoogleFonts.manrope(fontSize: 16, fontWeight: FontWeight.w700),
            ),
          ),
        ),
      );
    }

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: <Color>[Color(0xFFFFFBF5), Color(0xFFF8FAFC)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 520),
                child: Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(28),
                    border: Border.all(color: colorScheme.outlineVariant),
                    boxShadow: const <BoxShadow>[
                      BoxShadow(
                        color: Color(0x1F0F172A),
                        blurRadius: 40,
                        offset: Offset(0, 22),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(18),
                          color: AppColors.accent.withValues(alpha: 0.12),
                        ),
                        child: const Icon(
                          Icons.photo_camera_front_rounded,
                          color: Color(0xFF4F46E5),
                          size: 28,
                        ),
                      ),
                      const SizedBox(height: 18),
                      Text(
                        payload.title,
                        style: GoogleFonts.manrope(
                          color: colorScheme.onSurface,
                          fontSize: 28,
                          fontWeight: FontWeight.w800,
                          height: 1.02,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        payload.subtitle,
                        style: GoogleFonts.manrope(
                          color: colorScheme.onSurfaceVariant,
                          fontSize: 15,
                          fontWeight: FontWeight.w500,
                          height: 1.5,
                        ),
                      ),
                      const SizedBox(height: 18),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(22),
                          gradient: const LinearGradient(
                            colors: <Color>[Color(0xFFEEF2FF), Color(0xFFF8FAFC)],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                        ),
                        child: Column(
                          children: <Widget>[
                            ClipRRect(
                              borderRadius: BorderRadius.circular(18),
                              child: _previewBytes == null
                                  ? Container(
                                      height: 220,
                                      width: double.infinity,
                                      color: Colors.white,
                                      child: Column(
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: <Widget>[
                                          Icon(
                                            _isDone
                                                ? Icons.check_circle_rounded
                                                : Icons.center_focus_strong_rounded,
                                            size: 42,
                                            color: _isDone
                                                ? const Color(0xFF16A34A)
                                                : const Color(0xFF4F46E5),
                                          ),
                                          const SizedBox(height: 12),
                                          Text(
                                            _isDone
                                                ? 'Imagen enviada al escritorio'
                                                : 'La foto aparecerá aquí antes de enviarse',
                                            textAlign: TextAlign.center,
                                            style: GoogleFonts.manrope(
                                              color: colorScheme.onSurface,
                                              fontSize: 15,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ],
                                      ),
                                    )
                                  : Image.memory(
                                      _previewBytes!,
                                      width: double.infinity,
                                      height: 220,
                                      fit: BoxFit.cover,
                                    ),
                            ),
                            const SizedBox(height: 16),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(999),
                                color: _isDone
                                    ? const Color(0xFFF0FDF4)
                                    : const Color(0xFFEEF2FF),
                              ),
                              child: Text(
                                _isDone
                                    ? 'Carga completada. Ya puedes volver a tu computadora.'
                                    : _isUploading
                                    ? 'Subiendo imagen… no cierres esta pantalla.'
                                    : 'Lista para capturar y enviar de inmediato.',
                                textAlign: TextAlign.center,
                                style: GoogleFonts.manrope(
                                  color: _isDone
                                      ? const Color(0xFF166534)
                                      : const Color(0xFF3730A3),
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (_errorMessage != null) ...<Widget>[
                        const SizedBox(height: 14),
                        Text(
                          _errorMessage!,
                          style: GoogleFonts.manrope(
                            color: const Color(0xFFBE123C),
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                      const SizedBox(height: 18),
                      FilledButton.icon(
                        onPressed: _isUploading || _isDone
                            ? null
                            : () => _captureAndUpload(ImageSource.camera),
                        icon: _isUploading
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.photo_camera_rounded),
                        label: Text(_isDone ? 'Imagen enviada' : 'Tomar foto ahora'),
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: _isUploading || _isDone
                            ? null
                            : () => _captureAndUpload(ImageSource.gallery),
                        icon: const Icon(Icons.photo_library_rounded),
                        label: const Text('Elegir desde el dispositivo'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}