import 'package:flutter/material.dart';
import 'package:kosmenu_app/services/google_places_lookup.dart';

class GoogleMapsSdkGate extends StatefulWidget {
  const GoogleMapsSdkGate({
    super.key,
    required this.child,
    required this.loading,
  });

  final Widget child;
  final Widget loading;

  @override
  State<GoogleMapsSdkGate> createState() => _GoogleMapsSdkGateState();
}

class _GoogleMapsSdkGateState extends State<GoogleMapsSdkGate> {
  late Future<void> _ready;

  @override
  void initState() {
    super.initState();
    _ready = GooglePlacesLookup.ensureReady();
  }

  void _retry() {
    setState(() => _ready = GooglePlacesLookup.ensureReady());
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<void>(
      future: _ready,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.done &&
            !snapshot.hasError) {
          return widget.child;
        }
        if (snapshot.hasError) {
          return SizedBox.expand(
            child: Center(
              child: TextButton.icon(
                onPressed: _retry,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Reintentar mapa'),
              ),
            ),
          );
        }
        return widget.loading;
      },
    );
  }
}
