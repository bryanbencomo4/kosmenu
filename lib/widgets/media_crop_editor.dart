import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:kosmenu_app/services/media_crop.dart';
import 'package:kosmenu_app/services/media_rasterizer.dart';

const Color _editorSurface = Color(0xFF121212);
const Color _editorTextHigh = Color(0xFFF5F5F5);
const Color _editorTextLow = Color(0xFFB0B0B0);
const Color _editorAccent = Color(0xFF8B5CF6);

@visibleForTesting
const Key mediaCropViewportKey = Key('media-crop-viewport');

enum MediaCropKind { category, product }

/// Shows the in-app 3:4 media cropper and returns JPEG bytes, or `null` on cancel.
///
/// Used on Flutter web (no reliable native cropper) and as a native fallback.
Future<MediaCropResult?> showMediaCropEditor(
  BuildContext context, {
  required Uint8List sourceBytes,
  required MediaCropKind kind,
}) async {
  final image = await decodeImageFromList(sourceBytes);
  if (!context.mounted) {
    image.dispose();
    return null;
  }

  return showDialog<MediaCropResult>(
    context: context,
    barrierDismissible: false,
    barrierColor: const Color(0xCC000000),
    builder: (_) => _MediaCropEditorDialog(image: image, kind: kind),
  );
}

class _MediaCropEditorDialog extends StatefulWidget {
  const _MediaCropEditorDialog({required this.image, required this.kind});

  final ui.Image image;
  final MediaCropKind kind;

  @override
  State<_MediaCropEditorDialog> createState() => _MediaCropEditorDialogState();
}

class _MediaCropEditorDialogState extends State<_MediaCropEditorDialog> {
  static const double _maxUserScale = 4;

  double _viewportWidth = 260;
  double _viewportHeight = 260 * kMenuMediaAspectHeight / kMenuMediaAspectWidth;
  double _userScale = 1;
  Offset _pan = Offset.zero;
  double _gestureStartScale = 1;
  bool _exporting = false;
  String? _errorMessage;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final size = MediaQuery.sizeOf(context);
    final maxW = math.min(size.width - 72, 360.0);
    final maxH = size.height * 0.52;
    var width = maxW;
    var height = width * kMenuMediaAspectHeight / kMenuMediaAspectWidth;
    if (height > maxH) {
      height = maxH;
      width = height * kMenuMediaAspectWidth / kMenuMediaAspectHeight;
    }
    _viewportWidth = width.clamp(160.0, 360.0);
    _viewportHeight =
        _viewportWidth * kMenuMediaAspectHeight / kMenuMediaAspectWidth;
    _pan = _clampPan(_pan);
  }

  @override
  void dispose() {
    // Defer so the route tear-down / last paint never touch a disposed image.
    final image = widget.image;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      image.dispose();
    });
    super.dispose();
  }

  double get _scale {
    final cover = mediaCoverScale(
      imageWidth: widget.image.width,
      imageHeight: widget.image.height,
      viewportWidth: _viewportWidth,
      viewportHeight: _viewportHeight,
    );
    return cover * _userScale;
  }

  Offset _clampPan(Offset pan) {
    final scale = _scale;
    return Offset(
      clampMediaPan(
        pan: pan.dx,
        displayedExtent: widget.image.width * scale,
        viewportExtent: _viewportWidth,
      ),
      clampMediaPan(
        pan: pan.dy,
        displayedExtent: widget.image.height * scale,
        viewportExtent: _viewportHeight,
      ),
    );
  }

  void _onScaleUpdate(ScaleUpdateDetails details) {
    setState(() {
      _userScale =
          (_gestureStartScale * details.scale).clamp(1.0, _maxUserScale);
      _pan = _clampPan(_pan + details.focalPointDelta);
    });
  }

  void _onZoomChanged(double value) {
    setState(() {
      _userScale = value;
      _pan = _clampPan(_pan);
    });
  }

  Future<void> _confirm() async {
    setState(() {
      _exporting = true;
      _errorMessage = null;
    });

    try {
      final result = await rasterizeMediaCrop(
        image: widget.image,
        crop: computeMediaCropRect(
          imageWidth: widget.image.width,
          imageHeight: widget.image.height,
          viewportWidth: _viewportWidth,
          viewportHeight: _viewportHeight,
          scale: _scale,
          panX: _pan.dx,
          panY: _pan.dy,
        ),
        fileName: widget.kind == MediaCropKind.category
            ? 'category.jpg'
            : 'product.jpg',
      );
      if (!mounted) return;
      Navigator.of(context).pop(result);
    } catch (error, stackTrace) {
      debugPrint(
        'Media crop export error: ${error.runtimeType}: $error\n$stackTrace',
      );
      if (!mounted) return;
      setState(() {
        _exporting = false;
        _errorMessage = 'No se pudo recortar la imagen. Intenta de nuevo.';
      });
    }
  }

  String get _title => widget.kind == MediaCropKind.category
      ? 'Ajusta la portada'
      : 'Ajusta la foto del producto';

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: _editorSurface,
      insetPadding: const EdgeInsets.all(16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                _title,
                style: const TextStyle(
                  color: _editorTextHigh,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Arrastra y haz zoom para encuadrar. La foto se verá así en el menú.',
                style: TextStyle(color: _editorTextLow, fontSize: 13),
              ),
              const SizedBox(height: 16),
              Center(child: _buildViewport()),
              const SizedBox(height: 8),
              _buildZoomControl(),
              if (_errorMessage != null) ...[
                const SizedBox(height: 4),
                Text(
                  _errorMessage!,
                  style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 13),
                ),
              ],
              const SizedBox(height: 4),
              _buildActions(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildViewport() {
    return GestureDetector(
      key: mediaCropViewportKey,
      behavior: HitTestBehavior.opaque,
      onScaleStart: (_) => _gestureStartScale = _userScale,
      onScaleUpdate: _onScaleUpdate,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: SizedBox(
          width: _viewportWidth,
          height: _viewportHeight,
          child: CustomPaint(
            painter: _MediaCropPainter(
              image: widget.image,
              scale: _scale,
              pan: _pan,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildZoomControl() {
    return Row(
      children: [
        const Icon(Icons.image_outlined, color: _editorTextLow, size: 18),
        Expanded(
          child: Slider(
            value: _userScale,
            min: 1,
            max: _maxUserScale,
            activeColor: _editorAccent,
            inactiveColor: const Color(0xFF3A3A3A),
            onChanged: _exporting ? null : _onZoomChanged,
          ),
        ),
        const Icon(Icons.zoom_in_rounded, color: _editorTextLow, size: 22),
      ],
    );
  }

  Widget _buildActions() {
    return OverflowBar(
      alignment: MainAxisAlignment.end,
      overflowAlignment: OverflowBarAlignment.end,
      spacing: 8,
      overflowSpacing: 8,
      children: [
        TextButton(
          onPressed: _exporting ? null : () => Navigator.of(context).pop(),
          child: const Text(
            'Cancelar',
            style: TextStyle(color: _editorTextLow),
          ),
        ),
        FilledButton(
          onPressed: _exporting ? null : _confirm,
          style: FilledButton.styleFrom(backgroundColor: _editorAccent),
          child: _exporting
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Text('Usar foto'),
        ),
      ],
    );
  }
}

class _MediaCropPainter extends CustomPainter {
  const _MediaCropPainter({
    required this.image,
    required this.scale,
    required this.pan,
  });

  final ui.Image image;
  final double scale;
  final Offset pan;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);

    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = const Color(0xFF0A0A0A),
    );
    canvas.drawImageRect(
      image,
      Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble()),
      Rect.fromCenter(
        center: center + pan,
        width: image.width * scale,
        height: image.height * scale,
      ),
      Paint()..filterQuality = FilterQuality.medium,
    );

    // Soft edge vignette (Instagram-like dim outside focus is the frame itself;
    // inside we only draw the rule-of-thirds grid).
    final gridPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.8
      ..color = const Color(0x66FFFFFF);

    final thirdW = size.width / 3;
    final thirdH = size.height / 3;
    for (var i = 1; i <= 2; i++) {
      canvas.drawLine(
        Offset(thirdW * i, 0),
        Offset(thirdW * i, size.height),
        gridPaint,
      );
      canvas.drawLine(
        Offset(0, thirdH * i),
        Offset(size.width, thirdH * i),
        gridPaint,
      );
    }

    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(1, 1, size.width - 2, size.height - 2),
        const Radius.circular(14),
      ),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.4
        ..color = const Color(0x99FFFFFF),
    );
  }

  @override
  bool shouldRepaint(_MediaCropPainter oldDelegate) {
    return oldDelegate.image != image ||
        oldDelegate.scale != scale ||
        oldDelegate.pan != pan;
  }
}
