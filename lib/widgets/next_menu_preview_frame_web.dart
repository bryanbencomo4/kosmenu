// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use

import 'dart:html' as html;
import 'dart:ui_web' as ui_web;

import 'package:flutter/material.dart';

/// Flutter Web iframe embedding the Next.js owner preview page.
class NextMenuPreviewFrame extends StatefulWidget {
  const NextMenuPreviewFrame({super.key, required this.previewUrl});

  final Uri previewUrl;

  @override
  State<NextMenuPreviewFrame> createState() => _NextMenuPreviewFrameState();
}

class _NextMenuPreviewFrameState extends State<NextMenuPreviewFrame> {
  late final String _viewType;

  @override
  void initState() {
    super.initState();
    _viewType =
        'next-menu-preview-${identityHashCode(this)}-${DateTime.now().microsecondsSinceEpoch}';
    ui_web.platformViewRegistry.registerViewFactory(_viewType, (int viewId) {
      final iframe = html.IFrameElement()
        ..src = widget.previewUrl.toString()
        ..style.border = 'none'
        ..style.width = '100%'
        ..style.height = '100%'
        ..allow = 'geolocation; payment'
        ..allowFullscreen = true;
      return iframe;
    });
  }

  @override
  Widget build(BuildContext context) {
    return HtmlElementView(viewType: _viewType);
  }
}
