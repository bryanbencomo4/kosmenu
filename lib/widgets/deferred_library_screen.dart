import 'package:flutter/material.dart';
import 'package:kosmenu_app/widgets/branded_loading_screen.dart';

/// Loads a deferred Dart library once, then builds the destination screen.
class DeferredLibraryScreen extends StatefulWidget {
  const DeferredLibraryScreen({
    super.key,
    required this.load,
    required this.builder,
  });

  final Future<void> Function() load;
  final Widget Function() builder;

  @override
  State<DeferredLibraryScreen> createState() => _DeferredLibraryScreenState();
}

class _DeferredLibraryScreenState extends State<DeferredLibraryScreen> {
  late final Future<void> _loadFuture = widget.load();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<void>(
      future: _loadFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const BrandedLoadingScreen(withScaffold: true);
        }
        if (snapshot.hasError) {
          return Scaffold(
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'No se pudo cargar la pantalla: ${snapshot.error}',
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          );
        }
        return widget.builder();
      },
    );
  }
}
