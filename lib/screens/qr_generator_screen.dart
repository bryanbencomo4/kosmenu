import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_gallery_saver_plus/image_gallery_saver_plus.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/comercio.dart';
import 'package:kosmenu_app/widgets/branded_loading_screen.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:pretty_qr_code/pretty_qr_code.dart';
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';

class QrGeneratorScreen extends StatefulWidget {
  const QrGeneratorScreen({
    super.key,
    required this.comercio,
    this.comercioUrl,
  });

  final ComercioModel comercio;
  final String? comercioUrl;

  @override
  State<QrGeneratorScreen> createState() => _QrGeneratorScreenState();
}

class _QrGeneratorScreenState extends State<QrGeneratorScreen> {
  static const String _fallbackLogoAsset = 'assets/branding/isotipo.png';

  final GlobalKey _posterKey = GlobalKey();
  late final Future<Uint8List> _logoBytesFuture;
  String? _busyAction;

  @override
  void initState() {
    super.initState();
    _logoBytesFuture = _loadLogoBytes();
  }

  bool get _isProcessing => _busyAction != null;

  String get _menuUrl {
    final resolved = getPublicMenuUrl(widget.comercio).trim();
    if (resolved.isNotEmpty) {
      return resolved;
    }
    return (widget.comercioUrl ?? '').trim();
  }

  String get _businessName {
    final value = widget.comercio.nombre.trim();
    return value.isEmpty ? 'Tu negocio' : value;
  }

  String get _fileSafeBusinessName {
    final safe = _businessName.toLowerCase().replaceAll(
      RegExp(r'[^a-z0-9]+'),
      '_',
    );
    return safe.replaceAll(RegExp(r'_+'), '_').replaceAll(RegExp(r'^_|_$'), '');
  }

  Future<Uint8List> _loadLogoBytes() async {
    final data = await rootBundle.load(_fallbackLogoAsset);
    return data.buffer.asUint8List();
  }

  Future<Uint8List> _capturePosterBytes() async {
    final boundary =
        _posterKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
    if (boundary == null) {
      throw StateError('QR no disponible para exportar.');
    }

    final image = await boundary.toImage(pixelRatio: 4);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    if (byteData == null) {
      throw StateError('No se pudo convertir el QR a imagen.');
    }

    return byteData.buffer.asUint8List();
  }

  Future<File> _writePosterTempFile(Uint8List bytes) async {
    final directory = await getTemporaryDirectory();
    final file = File(
      '${directory.path}/kosmenu_qr_${_fileSafeBusinessName.isEmpty ? widget.comercio.id : _fileSafeBusinessName}.png',
    );
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  Future<void> _runAction(String action, Future<void> Function() job) async {
    if (_isProcessing) {
      return;
    }

    setState(() => _busyAction = action);
    try {
      await job();
    } finally {
      if (mounted) {
        setState(() => _busyAction = null);
      }
    }
  }

  Future<void> _shareQr() async {
    await _runAction('share-image', () async {
      final file = await _writePosterTempFile(await _capturePosterBytes());
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path)],
          text: 'Escanea y mira el menú digital de $_businessName: $_menuUrl',
          subject: 'QR de $_businessName en Kosmenu',
        ),
      );
    });
  }

  Future<void> _downloadQr() async {
    await _runAction('save-image', () async {
      final bytes = await _capturePosterBytes();
      final result = await ImageGallerySaverPlus.saveImage(
        bytes,
        quality: 100,
        name:
            'kosmenu_qr_${_fileSafeBusinessName.isEmpty ? widget.comercio.id : _fileSafeBusinessName}',
        isReturnImagePathOfIOS: true,
      );

      if (!mounted) {
        return;
      }

      final savedPath = result is Map
          ? result['filePath']?.toString() ?? ''
          : '';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            savedPath.isNotEmpty
                ? 'QR guardado en galería: $savedPath'
                : 'QR guardado en la galería.',
          ),
        ),
      );
    });
  }

  Future<void> _copyLink() async {
    await _runAction('copy-link', () async {
      await Clipboard.setData(ClipboardData(text: _menuUrl));
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enlace copiado al portapapeles.')),
      );
    });
  }

  Future<Uint8List> _buildPrintKitPdf(Uint8List posterBytes) async {
    final document = pw.Document();
    final posterImage = pw.MemoryImage(posterBytes);

    document.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(28),
        build: (context) {
          return pw.Container(
            decoration: pw.BoxDecoration(
              borderRadius: pw.BorderRadius.circular(26),
              color: PdfColor.fromHex('#FFF7ED'),
              border: pw.Border.all(
                color: PdfColor.fromHex('#F97316'),
                width: 2,
              ),
            ),
            padding: const pw.EdgeInsets.all(28),
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.center,
              children: [
                pw.Text(
                  '¡Escanea y mira nuestro menú!',
                  textAlign: pw.TextAlign.center,
                  style: pw.TextStyle(
                    fontSize: 26,
                    fontWeight: pw.FontWeight.bold,
                    color: PdfColor.fromHex('#111827'),
                  ),
                ),
                pw.SizedBox(height: 10),
                pw.Text(
                  'Menú digital de $_businessName',
                  textAlign: pw.TextAlign.center,
                  style: pw.TextStyle(
                    fontSize: 14,
                    color: PdfColor.fromHex('#9A3412'),
                  ),
                ),
                pw.SizedBox(height: 22),
                pw.Container(
                  padding: const pw.EdgeInsets.all(18),
                  decoration: pw.BoxDecoration(
                    color: PdfColors.white,
                    borderRadius: pw.BorderRadius.circular(22),
                  ),
                  child: pw.Image(
                    posterImage,
                    height: 360,
                    fit: pw.BoxFit.contain,
                  ),
                ),
                pw.SizedBox(height: 18),
                pw.Container(
                  width: double.infinity,
                  padding: const pw.EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                  decoration: pw.BoxDecoration(
                    color: PdfColor.fromHex('#111827'),
                    borderRadius: pw.BorderRadius.circular(14),
                  ),
                  child: pw.Text(
                    _menuUrl,
                    textAlign: pw.TextAlign.center,
                    style: const pw.TextStyle(
                      color: PdfColors.white,
                      fontSize: 10,
                    ),
                  ),
                ),
                pw.Spacer(),
                pw.Text(
                  'Imprime esta tarjeta, colócala en mesa o vitrina y deja que cualquier cámara la lea al instante.',
                  textAlign: pw.TextAlign.center,
                  style: pw.TextStyle(
                    fontSize: 12,
                    color: PdfColor.fromHex('#6B7280'),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );

    return document.save();
  }

  Future<void> _printKit() async {
    await _runAction('print-pdf', () async {
      final pdfBytes = await _buildPrintKitPdf(await _capturePosterBytes());
      await Printing.layoutPdf(
        name: 'Kit de impresión de $_businessName',
        onLayout: (_) async => pdfBytes,
      );
    });
  }

  void _showError(Object error, String prefix) {
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('$prefix: $error')));
  }

  Widget _buildActionButton({
    required IconData icon,
    required String tooltip,
    required VoidCallback onPressed,
    bool primary = false,
  }) {
    // Paleta elmenuxfa.com
    const accent = Color(0xFFFF7A00); // naranja
    const cardBg = Color(0xFF231942); // morado
    const white = Color(0xFFFFFFFF);
    const gray = Color(0xFFB8B8B8);

    final button = primary
        ? IconButton.filled(
            onPressed: _isProcessing ? null : onPressed,
            style: IconButton.styleFrom(
              backgroundColor: accent,
              foregroundColor: white,
              minimumSize: const Size(48, 48),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
              shadowColor: accent.withValues(alpha: 0.18),
              elevation: 2,
            ),
            icon: Icon(icon, size: 21),
          )
        : IconButton.filledTonal(
            onPressed: _isProcessing ? null : onPressed,
            style: IconButton.styleFrom(
              backgroundColor: cardBg,
              foregroundColor: gray,
              minimumSize: const Size(48, 48),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
              shadowColor: Colors.black.withValues(alpha: 0.10),
              elevation: 1,
            ),
            icon: Icon(icon, size: 21),
          );

    return Tooltip(message: tooltip, child: button);
  }

  @override
  Widget build(BuildContext context) {
    const pageBg = Color(0xFF0A0A0A);
    const cardBg = Color(0xFF1A1A1A);

    return FutureBuilder<Uint8List>(
      future: _logoBytesFuture,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Scaffold(
            backgroundColor: pageBg,
            appBar: AppBar(
              backgroundColor: pageBg,
              foregroundColor: Colors.white,
              title: Text(
                'QR profesional',
                style: GoogleFonts.manrope(fontWeight: FontWeight.w700),
              ),
            ),
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'No se pudo cargar el logo para generar el QR.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.manrope(color: const Color(0xFFE5E7EB)),
                ),
              ),
            ),
          );
        }

        if (!snapshot.hasData) {
          return const BrandedLoadingScreen(withScaffold: true);
        }

        final embeddedLogo = MemoryImage(snapshot.data!);

        return Scaffold(
          backgroundColor: pageBg,
          appBar: AppBar(
            backgroundColor: pageBg,
            foregroundColor: Colors.white,
            elevation: 0,
            title: Text(
              'QR profesional',
              style: GoogleFonts.manrope(
                color: Colors.white,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          body: SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 24),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 560),
                  child: Column(
                    children: [
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
                        decoration: BoxDecoration(
                          color: cardBg,
                          borderRadius: BorderRadius.circular(22),
                          border: Border.all(color: const Color(0xFF2A2A2A)),
                        ),
                        child: Column(
                          children: [
                            Text(
                              _businessName,
                              textAlign: TextAlign.center,
                              style: GoogleFonts.manrope(
                                color: Colors.white,
                                fontSize: 24,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              'QR de menú digital',
                              style: GoogleFonts.manrope(
                                color: const Color(0xFF9CA3AF),
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 16),
                            RepaintBoundary(
                              key: _posterKey,
                              child: Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(18),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    SizedBox(
                                      width: 270,
                                      height: 270,
                                      child: PrettyQrView.data(
                                        data: _menuUrl,
                                        errorCorrectLevel:
                                            QrErrorCorrectLevel.H,
                                        decoration: PrettyQrDecoration(
                                          background: Colors.white,
                                          shape: const PrettyQrSmoothSymbol(
                                            color: Color(0xFF121212),
                                            roundFactor: 1,
                                          ),
                                          image: PrettyQrDecorationImage(
                                            image: embeddedLogo,
                                            scale: 0.2,
                                            padding: const EdgeInsets.all(12),
                                            position:
                                                PrettyQrDecorationImagePosition
                                                    .embedded,
                                            clipper:
                                                const PrettyQrCircleClipper(),
                                          ),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 14),
                                    Container(
                                      width: double.infinity,
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 12,
                                        vertical: 10,
                                      ),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFF5F5F5),
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      child: Text(
                                        _menuUrl,
                                        textAlign: TextAlign.center,
                                        style: GoogleFonts.manrope(
                                          color: const Color(0xFF111827),
                                          fontSize: 11.5,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: cardBg,
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(color: const Color(0xFF2A2A2A)),
                        ),
                        child: Center(
                          child: SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                _buildActionButton(
                                  icon: Icons.download_rounded,
                                  tooltip: 'Descargar',
                                  onPressed: () async {
                                    try {
                                      await _downloadQr();
                                    } catch (error) {
                                      _showError(
                                        error,
                                        'No se pudo guardar la imagen',
                                      );
                                    }
                                  },
                                  primary: true,
                                ),
                                const SizedBox(width: 10),
                                _buildActionButton(
                                  icon: Icons.share_rounded,
                                  tooltip: 'Compartir',
                                  onPressed: () async {
                                    try {
                                      await _shareQr();
                                    } catch (error) {
                                      _showError(
                                        error,
                                        'No se pudo compartir la imagen',
                                      );
                                    }
                                  },
                                ),
                                const SizedBox(width: 10),
                                _buildActionButton(
                                  icon: Icons.print_rounded,
                                  tooltip: 'Imprimir PDF',
                                  onPressed: () async {
                                    try {
                                      await _printKit();
                                    } catch (error) {
                                      _showError(
                                        error,
                                        'No se pudo abrir la impresión',
                                      );
                                    }
                                  },
                                ),
                                const SizedBox(width: 10),
                                _buildActionButton(
                                  icon: Icons.link_rounded,
                                  tooltip: 'Copiar enlace',
                                  onPressed: () async {
                                    try {
                                      await _copyLink();
                                    } catch (error) {
                                      _showError(
                                        error,
                                        'No se pudo copiar el enlace',
                                      );
                                    }
                                  },
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
