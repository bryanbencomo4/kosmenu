import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_gallery_saver_plus/image_gallery_saver_plus.dart';
import 'package:kosmenu_app/models/comercio.dart';
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
    required this.comercioUrl,
  });

  final ComercioModel comercio;
  final String comercioUrl;

  @override
  State<QrGeneratorScreen> createState() => _QrGeneratorScreenState();
}

class _QrGeneratorScreenState extends State<QrGeneratorScreen> {
  static const String _fallbackLogoAsset = 'assets/logo_kosmenu.png';

  final GlobalKey _posterKey = GlobalKey();
  late final Future<Uint8List> _logoBytesFuture;
  String? _busyAction;

  @override
  void initState() {
    super.initState();
    _logoBytesFuture = _loadLogoBytes();
  }

  bool get _isProcessing => _busyAction != null;

  String get _menuUrl => widget.comercioUrl.trim();

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
    final logoUrl = widget.comercio.logoUrl?.trim() ?? '';
    if (logoUrl.isNotEmpty) {
      try {
        final data = await NetworkAssetBundle(Uri.parse(logoUrl)).load(logoUrl);
        return data.buffer.asUint8List();
      } catch (_) {
        // Use the bundled fallback when the business logo cannot be fetched.
      }
    }

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
                  '¡Escanea y pide tu pizza!',
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

  Future<void> _sharePrintKit() async {
    await _runAction('share-pdf', () async {
      final pdfBytes = await _buildPrintKitPdf(await _capturePosterBytes());
      await Printing.sharePdf(
        bytes: pdfBytes,
        filename:
            'kit_impresion_${_fileSafeBusinessName.isEmpty ? widget.comercio.id : _fileSafeBusinessName}.pdf',
        subject: 'Kit de impresión de $_businessName',
        body: 'Tarjeta imprimible con QR y enlace de $_businessName.',
      );
    });
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
    required String label,
    required VoidCallback onPressed,
    required bool filled,
  }) {
    final child = Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, size: 18),
        const SizedBox(width: 8),
        Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
      ],
    );

    if (filled) {
      return FilledButton(
        onPressed: _isProcessing ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: const Color(0xFFFF6B00),
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        child: child,
      );
    }

    return OutlinedButton(
      onPressed: _isProcessing ? null : onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: const Color(0xFFFFE4BD),
        side: const BorderSide(color: Color(0x44FFB04A)),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Uint8List>(
      future: _logoBytesFuture,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Scaffold(
            backgroundColor: const Color(0xFF0F0D0B),
            appBar: AppBar(title: const Text('QR profesional')),
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'No se pudo cargar el logo para generar el QR.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.manrope(color: Colors.white),
                ),
              ),
            ),
          );
        }

        if (!snapshot.hasData) {
          return const Scaffold(
            backgroundColor: Color(0xFF0F0D0B),
            body: Center(child: CircularProgressIndicator()),
          );
        }

        final embeddedLogo = MemoryImage(snapshot.data!);

        return Scaffold(
          backgroundColor: const Color(0xFF0F0D0B),
          appBar: AppBar(
            backgroundColor: const Color(0xFF17120E),
            foregroundColor: Colors.white,
            elevation: 0,
            title: const Text('QR profesional'),
          ),
          body: SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
              children: [
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(28),
                    gradient: const LinearGradient(
                      colors: [Color(0xFF2A1C12), Color(0xFF15100C)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    border: Border.all(color: const Color(0x44FFB04A)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Listo para mesa, vitrina y redes',
                        style: GoogleFonts.playfairDisplay(
                          color: Colors.white,
                          fontSize: 28,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Genera un QR vibrante, fácil de escanear y con tu marca al centro. También puedes exportar un kit de impresión en PDF.',
                        style: GoogleFonts.manrope(
                          color: const Color(0xFFE5CFB1),
                          fontSize: 14,
                          height: 1.45,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                RepaintBoundary(
                  key: _posterKey,
                  child: Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(30),
                      gradient: const LinearGradient(
                        colors: [
                          Color(0xFFFF8A1F),
                          Color(0xFFFF5A1F),
                          Color(0xFFFACC15),
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0x33160000),
                          blurRadius: 24,
                          offset: Offset(0, 14),
                        ),
                      ],
                    ),
                    child: Container(
                      padding: const EdgeInsets.all(22),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFF8EC),
                        borderRadius: BorderRadius.circular(26),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 7,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(0xFF111827),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              'ESCANEA Y PIDE',
                              style: GoogleFonts.manrope(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 1.1,
                              ),
                            ),
                          ),
                          const SizedBox(height: 14),
                          Text(
                            _businessName,
                            textAlign: TextAlign.center,
                            style: GoogleFonts.poppins(
                              color: const Color(0xFF111827),
                              fontSize: 24,
                              fontWeight: FontWeight.w800,
                              height: 1.05,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Escanéalo con cualquier cámara y abre el menú al instante.',
                            textAlign: TextAlign.center,
                            style: GoogleFonts.manrope(
                              color: const Color(0xFF5B4631),
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 20),
                          Container(
                            padding: const EdgeInsets.all(18),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(28),
                              border: Border.all(
                                color: const Color(0xFFF6C486),
                                width: 2,
                              ),
                              boxShadow: const [
                                BoxShadow(
                                  color: Color(0x1AF97316),
                                  blurRadius: 18,
                                  offset: Offset(0, 8),
                                ),
                              ],
                            ),
                            child: SizedBox(
                              width: 268,
                              height: 268,
                              child: PrettyQrView.data(
                                data: _menuUrl,
                                errorCorrectLevel: QrErrorCorrectLevel.H,
                                decoration: PrettyQrDecoration(
                                  background: Colors.white,
                                  shape: const PrettyQrSmoothSymbol(
                                    color: Color(0xFF111111),
                                    roundFactor: 1,
                                  ),
                                  image: PrettyQrDecorationImage(
                                    image: embeddedLogo,
                                    scale: 0.2,
                                    padding: const EdgeInsets.all(12),
                                    position: PrettyQrDecorationImagePosition
                                        .embedded,
                                    clipper: const PrettyQrCircleClipper(),
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 18),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 12,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(0xFF111827),
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Text(
                              _menuUrl,
                              textAlign: TextAlign.center,
                              style: GoogleFonts.manrope(
                                color: Colors.white,
                                fontSize: 11.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                Text(
                  'Exportaciones',
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    SizedBox(
                      width: 220,
                      child: _buildActionButton(
                        icon: Icons.share_rounded,
                        label: _busyAction == 'share-image'
                            ? 'Compartiendo...'
                            : 'Compartir imagen',
                        onPressed: () async {
                          try {
                            await _shareQr();
                          } catch (error) {
                            _showError(error, 'No se pudo compartir la imagen');
                          }
                        },
                        filled: true,
                      ),
                    ),
                    SizedBox(
                      width: 220,
                      child: _buildActionButton(
                        icon: Icons.download_rounded,
                        label: _busyAction == 'save-image'
                            ? 'Guardando...'
                            : 'Guardar en galería',
                        onPressed: () async {
                          try {
                            await _downloadQr();
                          } catch (error) {
                            _showError(error, 'No se pudo guardar la imagen');
                          }
                        },
                        filled: false,
                      ),
                    ),
                    SizedBox(
                      width: 220,
                      child: _buildActionButton(
                        icon: Icons.link_rounded,
                        label: _busyAction == 'copy-link'
                            ? 'Copiando...'
                            : 'Copiar enlace',
                        onPressed: () async {
                          try {
                            await _copyLink();
                          } catch (error) {
                            _showError(error, 'No se pudo copiar el enlace');
                          }
                        },
                        filled: false,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: const Color(0xFF17120E),
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(color: const Color(0x33FFB04A)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Kit de impresión',
                        style: GoogleFonts.poppins(
                          color: const Color(0xFFFFE2BF),
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Genera una tarjeta imprimible en PDF con el mensaje “¡Escanea y pide tu pizza!” y el QR listo para mesa, caja o vitrina.',
                        style: GoogleFonts.manrope(
                          color: const Color(0xFFE5CFB1),
                          fontSize: 14,
                          height: 1.45,
                        ),
                      ),
                      const SizedBox(height: 14),
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: [
                          SizedBox(
                            width: 220,
                            child: _buildActionButton(
                              icon: Icons.picture_as_pdf_rounded,
                              label: _busyAction == 'share-pdf'
                                  ? 'Generando PDF...'
                                  : 'Compartir kit PDF',
                              onPressed: () async {
                                try {
                                  await _sharePrintKit();
                                } catch (error) {
                                  _showError(
                                    error,
                                    'No se pudo compartir el PDF',
                                  );
                                }
                              },
                              filled: true,
                            ),
                          ),
                          SizedBox(
                            width: 220,
                            child: _buildActionButton(
                              icon: Icons.print_rounded,
                              label: _busyAction == 'print-pdf'
                                  ? 'Preparando impresión...'
                                  : 'Imprimir kit',
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
                              filled: false,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
