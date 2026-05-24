import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:pretty_qr_code/pretty_qr_code.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'web_browser_platform_stub.dart'
  if (dart.library.html) 'web_browser_platform_web.dart';

class WebCameraHandoffPayload {
  const WebCameraHandoffPayload({
    required this.bucketName,
    required this.objectPath,
    required this.uploadToken,
    required this.title,
    required this.subtitle,
    required this.imageQuality,
    required this.maxWidth,
    this.maxHeight,
    this.expiresAtMillis,
  });

  final String bucketName;
  final String objectPath;
  final String uploadToken;
  final String title;
  final String subtitle;
  final int imageQuality;
  final int maxWidth;
  final int? maxHeight;
  final int? expiresAtMillis;

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'bucketName': bucketName,
      'objectPath': objectPath,
      'uploadToken': uploadToken,
      'title': title,
      'subtitle': subtitle,
      'imageQuality': imageQuality,
      'maxWidth': maxWidth,
      'maxHeight': maxHeight,
      'expiresAtMillis': expiresAtMillis,
    };
  }

  String toEncodedPathSegment() {
    return Uri.encodeComponent(base64Url.encode(utf8.encode(jsonEncode(toJson()))));
  }

  static WebCameraHandoffPayload? tryDecode(String encoded) {
    try {
      final decoded = utf8.decode(base64Url.decode(Uri.decodeComponent(encoded)));
      final raw = jsonDecode(decoded);
      if (raw is! Map<String, dynamic>) {
        return null;
      }

      final bucketName = raw['bucketName']?.toString().trim() ?? '';
      final objectPath = raw['objectPath']?.toString().trim() ?? '';
      final uploadToken = raw['uploadToken']?.toString().trim() ?? '';
      if (bucketName.isEmpty || objectPath.isEmpty || uploadToken.isEmpty) {
        return null;
      }

      return WebCameraHandoffPayload(
        bucketName: bucketName,
        objectPath: objectPath,
        uploadToken: uploadToken,
        title: raw['title']?.toString().trim() ?? 'Tomar foto',
        subtitle:
            raw['subtitle']?.toString().trim() ??
            'Captura la imagen desde tu celular y se enviará automáticamente.',
        imageQuality: (raw['imageQuality'] as num?)?.toInt() ?? 90,
        maxWidth: (raw['maxWidth'] as num?)?.toInt() ?? 1600,
        maxHeight: (raw['maxHeight'] as num?)?.toInt(),
        expiresAtMillis: (raw['expiresAtMillis'] as num?)?.toInt(),
      );
    } catch (_) {
      return null;
    }
  }
}

class _DesktopCameraHandoffSession {
  const _DesktopCameraHandoffSession({
    required this.bucketName,
    required this.objectPath,
    required this.mobileUrl,
    required this.expiresAt,
  });

  final String bucketName;
  final String objectPath;
  final String mobileUrl;
  final DateTime expiresAt;
}

enum _DesktopCameraHandoffDialogAction { cancel, regenerate }

class _DesktopCameraHandoffDialogResult {
  const _DesktopCameraHandoffDialogResult._({
    required this.action,
    this.file,
  });

  const _DesktopCameraHandoffDialogResult.file(XFile file)
    : this._(action: null, file: file);

  const _DesktopCameraHandoffDialogResult.cancel()
    : this._(action: _DesktopCameraHandoffDialogAction.cancel);

  const _DesktopCameraHandoffDialogResult.regenerate()
    : this._(action: _DesktopCameraHandoffDialogAction.regenerate);

  final _DesktopCameraHandoffDialogAction? action;
  final XFile? file;
}

class WebCameraHandoffService {
  const WebCameraHandoffService();

  static const Duration _pollInterval = Duration(seconds: 2);
  static const Duration _sessionLifetime = Duration(minutes: 2);

  static Duration get sessionLifetime => _sessionLifetime;

  static bool get isDesktopWebCameraBridgeRequired {
    if (!kIsWeb) {
      return false;
    }

    return !isLikelyMobileWebBrowser();
  }

  static const String defaultHandoffBucket = 'logos-comercios';

  static String handoffObjectPathPrefix(String feature) {
    final userId =
        Supabase.instance.client.auth.currentUser?.id.trim() ?? 'anon';
    final normalizedFeature = feature
        .trim()
        .replaceAll(RegExp(r'[^a-z0-9_]+'), '_')
        .replaceAll(RegExp(r'_+'), '_');
    return '$userId/camera_handoff/${normalizedFeature.isEmpty ? 'capture' : normalizedFeature}';
  }

  Future<XFile?> pickCameraImage(
    BuildContext context, {
    required String feature,
    required String waitingTitle,
    required String waitingSubtitle,
    String bucketName = defaultHandoffBucket,
    int imageQuality = 90,
    int maxWidth = 1600,
    int? maxHeight,
  }) async {
    if (isDesktopWebCameraBridgeRequired) {
      return pickImage(
        context,
        bucketName: bucketName,
        objectPathPrefix: handoffObjectPathPrefix(feature),
        waitingTitle: waitingTitle,
        waitingSubtitle: waitingSubtitle,
        imageQuality: imageQuality,
        maxWidth: maxWidth,
        maxHeight: maxHeight,
      );
    }

    return ImagePicker().pickImage(
      source: ImageSource.camera,
      imageQuality: imageQuality,
      maxWidth: maxWidth.toDouble(),
      maxHeight: maxHeight?.toDouble(),
    );
  }

  Future<XFile?> pickImage(
    BuildContext context, {
    required String bucketName,
    required String objectPathPrefix,
    required String waitingTitle,
    required String waitingSubtitle,
    int imageQuality = 90,
    int maxWidth = 1600,
    int? maxHeight,
  }) async {
    final normalizedPrefix = objectPathPrefix.trim().replaceAll(RegExp(r'/+$'), '');
    if (normalizedPrefix.isEmpty) {
      throw ArgumentError('objectPathPrefix cannot be empty');
    }

    if (!context.mounted) {
      return null;
    }

    while (context.mounted) {
      final session = await _createSession(
        bucketName: bucketName,
        objectPathPrefix: normalizedPrefix,
        waitingTitle: waitingTitle,
        waitingSubtitle: waitingSubtitle,
        imageQuality: imageQuality,
        maxWidth: maxWidth,
        maxHeight: maxHeight,
      );

      if (!context.mounted) {
        unawaited(_disposeSession(session));
        return null;
      }

      final result = await showDialog<_DesktopCameraHandoffDialogResult>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) {
          return _DesktopCameraHandoffDialog(
            session: session,
            title: waitingTitle,
            subtitle: waitingSubtitle,
          );
        },
      );

      if (result?.file != null) {
        return result!.file;
      }

      if (result?.action == _DesktopCameraHandoffDialogAction.regenerate) {
        unawaited(_disposeSession(session));
        continue;
      }

      unawaited(_disposeSession(session));
      return null;
    }

    return null;
  }

  static Future<_DesktopCameraHandoffSession> _createSession({
    required String bucketName,
    required String objectPathPrefix,
    required String waitingTitle,
    required String waitingSubtitle,
    required int imageQuality,
    required int maxWidth,
    int? maxHeight,
  }) async {
    final objectPath =
        '$objectPathPrefix/${DateTime.now().millisecondsSinceEpoch}_camera.jpg';
    final expiresAt = DateTime.now().add(_sessionLifetime);
    final storage = Supabase.instance.client.storage.from(bucketName);
    final signedUpload = await storage.createSignedUploadUrl(objectPath);
    final payload = WebCameraHandoffPayload(
      bucketName: bucketName,
      objectPath: signedUpload.path,
      uploadToken: signedUpload.token,
      title: waitingTitle,
      subtitle: waitingSubtitle,
      imageQuality: imageQuality,
      maxWidth: maxWidth,
      maxHeight: maxHeight,
      expiresAtMillis: expiresAt.millisecondsSinceEpoch,
    );

    final mobileUrl = '${Uri.base.origin}/capture/${payload.toEncodedPathSegment()}';

    return _DesktopCameraHandoffSession(
      bucketName: bucketName,
      objectPath: signedUpload.path,
      mobileUrl: mobileUrl,
      expiresAt: expiresAt,
    );
  }

  static Future<XFile?> waitForUploadedImage({
    required String bucketName,
    required String objectPath,
    required DateTime expiresAt,
    required void Function(Duration remaining)? onProgress,
    bool Function()? shouldStop,
  }) async {
    final storage = Supabase.instance.client.storage.from(bucketName);

    while (true) {
      if (shouldStop?.call() ?? false) {
        return null;
      }

      final remaining = expiresAt.difference(DateTime.now());
      if (remaining <= Duration.zero) {
        onProgress?.call(Duration.zero);
        return null;
      }

      onProgress?.call(remaining);
      try {
        final bytes = await storage.download(objectPath);
        if (bytes.isNotEmpty) {
          final mimeType = _inferMimeTypeFromPath(objectPath);
          final fileName = objectPath.split('/').last;
          unawaited(_cleanupRemoteObject(storage, objectPath));
          return XFile.fromData(bytes, mimeType: mimeType, name: fileName);
        }
      } catch (_) {
        // Poll until the mobile upload is ready or the token expires.
      }

      final sleepFor = remaining < _pollInterval ? remaining : _pollInterval;
      await Future<void>.delayed(sleepFor);
    }
  }

  static Future<void> uploadCapturedBytes({
    required WebCameraHandoffPayload payload,
    required Uint8List bytes,
    required String contentType,
  }) {
    return Supabase.instance.client.storage
        .from(payload.bucketName)
        .uploadBinaryToSignedUrl(
          payload.objectPath,
          payload.uploadToken,
          bytes,
          FileOptions(contentType: contentType, upsert: true),
        );
  }

  static String _inferMimeTypeFromPath(String path) {
    final lowered = path.toLowerCase();
    if (lowered.endsWith('.png')) {
      return 'image/png';
    }
    if (lowered.endsWith('.webp')) {
      return 'image/webp';
    }
    if (lowered.endsWith('.gif')) {
      return 'image/gif';
    }
    return 'image/jpeg';
  }

  static Future<void> _cleanupRemoteObject(dynamic storage, String objectPath) async {
    try {
      await storage.remove(<String>[objectPath]);
    } catch (_) {
      // Best effort cleanup only.
    }
  }

  static Future<void> _disposeSession(_DesktopCameraHandoffSession session) {
    final storage = Supabase.instance.client.storage.from(session.bucketName);
    return _cleanupRemoteObject(storage, session.objectPath);
  }
}

class _DesktopCameraHandoffDialog extends StatefulWidget {
  const _DesktopCameraHandoffDialog({
    required this.session,
    required this.title,
    required this.subtitle,
  });

  final _DesktopCameraHandoffSession session;
  final String title;
  final String subtitle;

  @override
  State<_DesktopCameraHandoffDialog> createState() =>
      _DesktopCameraHandoffDialogState();
}

class _DesktopCameraHandoffDialogState
    extends State<_DesktopCameraHandoffDialog> {
  bool _isBusy = true;
  bool _expired = false;
  bool _copied = false;
  late Duration _remaining;
  Timer? _countdownTimer;

  @override
  void initState() {
    super.initState();
    _remaining = widget.session.expiresAt.difference(DateTime.now());
    _startCountdown();
    unawaited(_waitForImage());
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    super.dispose();
  }

  Future<void> _waitForImage() async {
    final file = await WebCameraHandoffService.waitForUploadedImage(
      bucketName: widget.session.bucketName,
      objectPath: widget.session.objectPath,
      expiresAt: widget.session.expiresAt,
      onProgress: (remaining) {
        if (!mounted) {
          return;
        }
        setState(() => _remaining = remaining);
      },
      shouldStop: () => !mounted,
    );
    if (!mounted) {
      return;
    }

    _countdownTimer?.cancel();
    if (file == null) {
      setState(() {
        _isBusy = false;
        _expired = true;
        _remaining = Duration.zero;
      });
      return;
    }

    setState(() {
      _isBusy = false;
    });

    await Future<void>.delayed(const Duration(milliseconds: 180));
    if (!mounted) {
      return;
    }
    Navigator.of(context).pop(_DesktopCameraHandoffDialogResult.file(file));
  }

  Future<void> _copyLink() async {
    await Clipboard.setData(ClipboardData(text: widget.session.mobileUrl));
    if (!mounted) {
      return;
    }
    setState(() => _copied = true);
  }

  void _startCountdown() {
    _countdownTimer?.cancel();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) {
        return;
      }

      final remaining = widget.session.expiresAt.difference(DateTime.now());
      if (remaining <= Duration.zero) {
        _countdownTimer?.cancel();
        if (_remaining != Duration.zero) {
          setState(() => _remaining = Duration.zero);
        }
        return;
      }

      setState(() => _remaining = remaining);
    });
  }

  String _formatCountdown(Duration duration) {
    final totalSeconds = duration.inSeconds < 0 ? 0 : duration.inSeconds;
    final minutes = totalSeconds ~/ 60;
    final seconds = totalSeconds % 60;
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }

  double get _progressValue {
    final totalSeconds = WebCameraHandoffService.sessionLifetime.inSeconds;
    if (totalSeconds <= 0) {
      return 0;
    }

    final remainingSeconds = _remaining.inSeconds.clamp(0, totalSeconds);
    return remainingSeconds / totalSeconds;
  }

  Future<void> _cancel() async {
    Navigator.of(context).pop(const _DesktopCameraHandoffDialogResult.cancel());
  }

  Future<void> _regenerate() async {
    Navigator.of(
      context,
    ).pop(const _DesktopCameraHandoffDialogResult.regenerate());
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final viewportSize = MediaQuery.sizeOf(context);
    final dialogMaxHeight =
        (viewportSize.height - 56).clamp(380.0, 820.0).toDouble();
    final compactLayout = viewportSize.width < 900;
    final titleStyle = GoogleFonts.manrope(
      color: colorScheme.onSurface,
      fontWeight: FontWeight.w800,
      fontSize: 26,
      height: 1.02,
    );
    final bodyStyle = GoogleFonts.manrope(
      color: colorScheme.onSurfaceVariant,
      fontSize: 14,
      fontWeight: FontWeight.w500,
      height: 1.45,
    );
    final statusCard = Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 12,
        vertical: 7,
      ),
      decoration: BoxDecoration(
        color: _expired
            ? const Color(0xFFFFF1F2)
            : const Color(0xFFF0FDF4),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: _expired
              ? const Color(0xFFFDA4AF)
              : const Color(0xFF86EFAC),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (_isBusy)
            Container(
              width: 10,
              height: 10,
              decoration: const BoxDecoration(
                color: Color(0xFF16A34A),
                shape: BoxShape.circle,
              ),
            )
          else
            Icon(
              _expired ? Icons.schedule_rounded : Icons.check_circle_rounded,
              size: 14,
              color: _expired
                  ? const Color(0xFFE11D48)
                  : const Color(0xFF15803D),
            ),
          const SizedBox(width: 8),
          Text(
            _isBusy
                ? 'En espera de la imagen'
                : _expired
                ? 'Código expirado'
                : 'Imagen recibida',
            style: GoogleFonts.manrope(
              color: _expired
                  ? const Color(0xFF9F1239)
                  : const Color(0xFF166534),
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
    final timerCard = Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _expired
            ? const Color(0xFFFFF1F2)
            : const Color(0xFFEEF2FF),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: <Widget>[
          Icon(
            Icons.timer_outlined,
            color: _expired
                ? const Color(0xFFE11D48)
                : const Color(0xFF4338CA),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  _expired ? 'Tiempo agotado' : 'Tiempo disponible',
                  style: GoogleFonts.manrope(
                    color: const Color(0xFF334155),
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _expired
                      ? 'Genera un código nuevo para seguir.'
                      : 'Este QR estará activo por ${_formatCountdown(_remaining)}.',
                  style: GoogleFonts.manrope(
                    color: const Color(0xFF475569),
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          Text(
            _formatCountdown(_remaining),
            style: GoogleFonts.manrope(
              color: _expired
                  ? const Color(0xFFE11D48)
                  : const Color(0xFF312E81),
              fontSize: 22,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
    final detailsContent = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        statusCard,
        const SizedBox(height: 16),
        Text(
          widget.title,
          style: GoogleFonts.manrope(
            color: const Color(0xFF0F172A),
            fontSize: 22,
            fontWeight: FontWeight.w800,
            height: 1.08,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          widget.subtitle,
          style: GoogleFonts.manrope(
            color: const Color(0xFF475569),
            fontSize: 13,
            fontWeight: FontWeight.w500,
            height: 1.45,
          ),
        ),
        const SizedBox(height: 18),
        timerCard,
        const SizedBox(height: 18),
        _StepBullet(
          icon: Icons.looks_one_rounded,
          text: 'Escanea el código con tu teléfono.',
        ),
        const SizedBox(height: 10),
        _StepBullet(
          icon: Icons.looks_two_rounded,
          text: 'Se abrirá la cámara para capturar la imagen.',
        ),
        const SizedBox(height: 10),
        _StepBullet(
          icon: Icons.looks_3_rounded,
          text: 'Déjala subir y la verás aparecer aquí automáticamente.',
        ),
        const SizedBox(height: 18),
        LinearProgressIndicator(
          minHeight: 9,
          borderRadius: BorderRadius.circular(999),
          backgroundColor: const Color(0xFFE2E8F0),
          value: _isBusy ? _progressValue : (_expired ? 0 : 1),
          valueColor: const AlwaysStoppedAnimation<Color>(
            Color(0xFF4F46E5),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          _expired
              ? 'El enlace estuvo disponible por ${WebCameraHandoffService.sessionLifetime.inMinutes} minutos. Puedes generar un código nuevo ahora mismo.'
              : 'Mantén esta ventana abierta. La carga es automática y segura.',
          style: GoogleFonts.manrope(
            color: const Color(0xFF64748B),
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
    final footerActions = compactLayout
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              OutlinedButton.icon(
                onPressed: _copyLink,
                icon: Icon(
                  _copied ? Icons.check_rounded : Icons.link_rounded,
                ),
                label: Text(_copied ? 'Enlace copiado' : 'Copiar enlace'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: BorderSide(
                    color: Colors.white.withValues(alpha: 0.18),
                  ),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 14,
                  ),
                ),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: _regenerate,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Generar código nuevo'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: BorderSide(
                    color: Colors.white.withValues(alpha: 0.18),
                  ),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 14,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              TextButton.icon(
                onPressed: _cancel,
                icon: const Icon(Icons.close_rounded),
                label: const Text('Cancelar'),
                style: TextButton.styleFrom(
                  foregroundColor: Colors.white70,
                ),
              ),
            ],
          )
        : Row(
            children: <Widget>[
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _copyLink,
                  icon: Icon(
                    _copied ? Icons.check_rounded : Icons.link_rounded,
                  ),
                  label: Text(_copied ? 'Enlace copiado' : 'Copiar enlace'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: BorderSide(
                      color: Colors.white.withValues(alpha: 0.18),
                    ),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 14,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _regenerate,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Generar código nuevo'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: BorderSide(
                      color: Colors.white.withValues(alpha: 0.18),
                    ),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 14,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              TextButton.icon(
                onPressed: _cancel,
                icon: const Icon(Icons.close_rounded),
                label: const Text('Cancelar'),
                style: TextButton.styleFrom(
                  foregroundColor: Colors.white70,
                ),
              ),
            ],
          );

    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 28),
      backgroundColor: Colors.transparent,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: 680, maxHeight: dialogMaxHeight),
        child: Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(28),
            gradient: const LinearGradient(
              colors: <Color>[Color(0xFF0F172A), Color(0xFF1E1B4B)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            boxShadow: const <BoxShadow>[
              BoxShadow(
                color: Color(0x55000000),
                blurRadius: 44,
                offset: Offset(0, 28),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.all(26),
            child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
                      color: Colors.white.withValues(alpha: 0.12),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.16),
                      ),
                    ),
                    child: const Icon(
                      Icons.qr_code_2_rounded,
                      color: Colors.white,
                      size: 26,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text('Captura remota desde tu celular', style: titleStyle),
                        const SizedBox(height: 4),
                        Text(
                          'Escanea el QR, toma la foto y la cargaremos aquí en cuanto llegue.',
                          style: bodyStyle.copyWith(color: const Color(0xFFC7D2FE)),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: _cancel,
                    tooltip: 'Cerrar',
                    style: IconButton.styleFrom(
                      foregroundColor: Colors.white70,
                      backgroundColor: Colors.white.withValues(alpha: 0.08),
                    ),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
              const SizedBox(height: 22),
              Flexible(
                fit: FlexFit.loose,
                child: SingleChildScrollView(
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: compactLayout
                          ? Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Center(
                                  child: Container(
                                    width: 220,
                                    height: 220,
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(20),
                                      color: const Color(0xFFF8FAFC),
                                    ),
                                    child: Center(
                                      child: PrettyQrView.data(
                                        data: widget.session.mobileUrl,
                                        decoration: const PrettyQrDecoration(
                                          shape: PrettyQrSmoothSymbol(),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 20),
                                detailsContent,
                              ],
                            )
                          : Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Container(
                                  width: 220,
                                  height: 220,
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(20),
                                    color: const Color(0xFFF8FAFC),
                                  ),
                                  child: Center(
                                    child: PrettyQrView.data(
                                      data: widget.session.mobileUrl,
                                      decoration: const PrettyQrDecoration(
                                        shape: PrettyQrSmoothSymbol(),
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 20),
                                Expanded(child: detailsContent),
                              ],
                            ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              footerActions,
            ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StepBullet extends StatelessWidget {
  const _StepBullet({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Icon(icon, size: 18, color: const Color(0xFF4338CA)),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: GoogleFonts.manrope(
              color: const Color(0xFF334155),
              fontSize: 13,
              fontWeight: FontWeight.w700,
              height: 1.4,
            ),
          ),
        ),
      ],
    );
  }
}