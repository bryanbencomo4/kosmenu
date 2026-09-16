import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:kosmenu_app/services/logo_crop.dart';
import 'package:kosmenu_app/services/logo_rasterizer.dart';

const Color _editorSurface = Color(0xFF17122E);
const Color _editorTextHigh = Color(0xFFF8F5FF);
const Color _editorTextLow = Color(0xFFB9AED7);
const Color _editorAccent = Color(0xFF8B5CF6);

/// Identifies the square pan/zoom surface, which is otherwise a plain
/// `CustomPaint` indistinguishable from the ones Material widgets create.
@visibleForTesting
const Key logoCropViewportKey = Key('logo-crop-viewport');

/// Shows the in-app square logo editor for [sourceBytes] and returns the
/// cropped logo, or `null` when the user cancels.
///
/// This exists because `image_cropper` cannot crop on Flutter web: its web
/// implementation throws unless it receives `WebUiSettings`, and wiring those
/// up also means loading cropper.js from a CDN, which this app avoids for the
/// same reason CanvasKit is vendored locally (see `web/index.html`). Building
/// on `dart:ui` instead keeps the editor identical in every browser.
///
/// Throws when [sourceBytes] cannot be decoded as an image, so callers can tell
/// an unsupported file apart from a deliberate cancellation.
Future<LogoCropResult?> showLogoCropEditor(
  BuildContext context, {
  required Uint8List sourceBytes,
}) async {
  final image = await decodeImageFromList(sourceBytes);
  if (!context.mounted) {
    image.dispose();
    return null;
  }

  return showDialog<LogoCropResult>(
    context: context,
    barrierDismissible: false,
    barrierColor: const Color(0xCC0B0718),
    builder: (_) => _LogoCropEditorDialog(image: image),
  );
}

class _LogoCropEditorDialog extends StatefulWidget {
  /// Takes ownership of [image] and disposes it once the dialog is torn down,
  /// which happens after the closing transition has finished painting it.
  const _LogoCropEditorDialog({required this.image});

  final ui.Image image;

  @override
  State<_LogoCropEditorDialog> createState() => _LogoCropEditorDialogState();
}

class _LogoCropEditorDialogState extends State<_LogoCropEditorDialog> {
  static const double _maxUserScale = 4;

  double _viewportSide = 260;
  double _userScale = 1;
  Offset _pan = Offset.zero;
  double _gestureStartScale = 1;
  bool _exporting = false;
  String? _errorMessage;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final size = MediaQuery.sizeOf(context);
    _viewportSide = math
        .min(size.width - 88, size.height * 0.46)
        .clamp(180.0, 320.0);
    _pan = _clampPan(_pan);
  }

  @override
  void dispose() {
    widget.image.dispose();
    super.dispose();
  }

  double get _scale {
    final cover = logoCoverScale(
      imageWidth: widget.image.width,
      imageHeight: widget.image.height,
      viewportSide: _viewportSide,
    );
    return cover * _userScale;
  }

  Offset _clampPan(Offset pan) {
    final scale = _scale;
    return Offset(
      clampLogoPan(
        pan: pan.dx,
        displayedExtent: widget.image.width * scale,
        viewportSide: _viewportSide,
      ),
      clampLogoPan(
        pan: pan.dy,
        displayedExtent: widget.image.height * scale,
        viewportSide: _viewportSide,
      ),
    );
  }

  void _onScaleUpdate(ScaleUpdateDetails details) {
    setState(() {
      _userScale = (_gestureStartScale * details.scale).clamp(1.0, _maxUserScale);
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
      final result = await _exportCrop();
      if (!mounted) {
        return;
      }
      Navigator.of(context).pop(result);
    } catch (error, stackTrace) {
      debugPrint('Logo crop export error: ${error.runtimeType}: $error\n$stackTrace');
      if (!mounted) {
        return;
      }
      setState(() {
        _exporting = false;
        _errorMessage = 'No se pudo recortar la imagen. Intenta de nuevo.';
      });
    }
  }

  Future<LogoCropResult> _exportCrop() {
    return rasterizeLogoCrop(
      image: widget.image,
      crop: computeLogoCropRect(
        imageWidth: widget.image.width,
        imageHeight: widget.image.height,
        viewportSide: _viewportSide,
        scale: _scale,
        panX: _pan.dx,
        panY: _pan.dy,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: _editorSurface,
      insetPadding: const EdgeInsets.all(20),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Ajusta tu logo',
                style: TextStyle(
                  color: _editorTextHigh,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Arrastra la imagen y usa el zoom para elegir que se ve dentro '
                'del circulo.',
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
      key: logoCropViewportKey,
      // A childless CustomPaint is not hit-testable, so the viewport has to
      // claim the pointer itself or dragging would never reach this detector.
      behavior: HitTestBehavior.opaque,
      onScaleStart: (_) => _gestureStartScale = _userScale,
      onScaleUpdate: _onScaleUpdate,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: SizedBox(
          width: _viewportSide,
          height: _viewportSide,
          child: CustomPaint(
            painter: _LogoCropPainter(
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
            inactiveColor: const Color(0xFF3B2F63),
            onChanged: _exporting ? null : _onZoomChanged,
          ),
        ),
        const Icon(Icons.zoom_in_rounded, color: _editorTextLow, size: 22),
      ],
    );
  }

  Widget _buildActions() {
    // OverflowBar, not a Row: it stacks the buttons instead of overflowing when
    // the user runs a large system text scale.
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

class _LogoCropPainter extends CustomPainter {
  const _LogoCropPainter({
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
      Paint()..color = const Color(0xFF0F0A1F),
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

    // The menu renders logos inside a circle, so dim the corners to preview
    // what will actually be visible. The exported crop is still the full square.
    final radius = size.shortestSide / 2;
    final corners = Path.combine(
      PathOperation.difference,
      Path()..addRect(Offset.zero & size),
      Path()..addOval(Rect.fromCircle(center: center, radius: radius)),
    );
    canvas.drawPath(corners, Paint()..color = const Color(0x8C0B0718));
    canvas.drawCircle(
      center,
      radius - 1,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..color = const Color(0x59FFFFFF),
    );
  }

  @override
  bool shouldRepaint(_LogoCropPainter oldDelegate) {
    return oldDelegate.image != image ||
        oldDelegate.scale != scale ||
        oldDelegate.pan != pan;
  }
}
