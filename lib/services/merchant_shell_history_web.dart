import 'dart:html' as html;

/// Web panel navigation via real `/panel/...` URLs.
///
/// Important: we never call `history.go`. Closing sheets / saving forms uses
/// `replaceState`, so Flutter never sees a fake browser Back that jumps to
/// Inicio. Only the user's real Back/Forward triggers [onLocation].
class MerchantShellHistory {
  MerchantShellHistory._();

  static const String _marker = 'elmenuxfa-merchant-shell';
  static const String _basePath = '/panel';

  static html.EventListener? _listener;
  static void Function(MerchantShellRoute route)? _onLocation;
  static MerchantShellRoute _current = MerchantShellRoute.home();

  static MerchantShellRoute get current => _current;

  /// Kept for call-site compatibility; replaceState sync never needs muting.
  static bool get isSyncing => false;

  static void attach({
    required void Function(MerchantShellRoute route) onLocation,
  }) {
    _onLocation = onLocation;
    if (_listener != null) {
      // Adopt whatever URL is already in the address bar (refresh / deep link).
      final parsed = MerchantShellRoute.parse(_pathname());
      if (parsed != null) {
        _current = parsed;
      }
      return;
    }

    final initial = MerchantShellRoute.parse(_pathname());
    if (initial != null) {
      _current = initial;
    } else {
      // First landing on `/` after login → normalize to `/panel`.
      _current = MerchantShellRoute.home();
      _replace(_current);
    }

    _listener = (html.Event event) {
      final parsed = MerchantShellRoute.parse(_pathname()) ??
          MerchantShellRoute.fromHistoryState(html.window.history.state) ??
          MerchantShellRoute.home();
      _current = parsed;
      _onLocation?.call(parsed);
    };
    html.window.addEventListener('popstate', _listener);
  }

  static void detach() {
    if (_listener != null) {
      html.window.removeEventListener('popstate', _listener);
      _listener = null;
    }
    _onLocation = null;
    _current = MerchantShellRoute.home();
  }

  /// Updates the address bar to match the shell UI.
  ///
  /// - [push]: user moved to another section (or opened a pushed page) →
  ///   creates a real history entry so browser Back works like a normal site.
  /// - replace (default): UI already changed (save/pop/sheet-irrelevant) →
  ///   rewrite the current entry only. Never synthesizes a Back event.
  static void setRoute(MerchantShellRoute route, {bool push = false}) {
    if (route == _current && _pathname() == route.path) {
      return;
    }
    if (push) {
      _push(route);
    } else {
      _replace(route);
    }
  }

  static String _pathname() => html.window.location.pathname ?? '/';

  static void _push(MerchantShellRoute route) {
    html.window.history.pushState(route.toHistoryState(), '', route.path);
    _current = route;
  }

  static void _replace(MerchantShellRoute route) {
    html.window.history.replaceState(route.toHistoryState(), '', route.path);
    _current = route;
  }
}

class MerchantShellRoute {
  const MerchantShellRoute({
    required this.section,
    this.stack = 0,
  });

  factory MerchantShellRoute.home() =>
      const MerchantShellRoute(section: 'home', stack: 0);

  factory MerchantShellRoute.fromDestination(
    String section, {
    int stack = 0,
  }) {
    return MerchantShellRoute(
      section: section,
      stack: stack < 0 ? 0 : stack,
    );
  }

  final String section;
  final int stack;

  String get path {
    final base = _sectionPath(section);
    if (stack <= 0) return base;
    return '$base/~$stack';
  }

  Map<String, Object> toHistoryState() => <String, Object>{
    'source': MerchantShellHistory._marker,
    'section': section,
    'stack': stack,
  };

  static MerchantShellRoute? parse(String pathname) {
    var path = pathname;
    if (path.length > 1 && path.endsWith('/')) {
      path = path.substring(0, path.length - 1);
    }
    if (path.isEmpty || path == '/' || path == MerchantShellHistory._basePath) {
      return MerchantShellRoute.home();
    }
    if (!path.startsWith('${MerchantShellHistory._basePath}/') &&
        path != MerchantShellHistory._basePath) {
      return null;
    }

    final rest = path == MerchantShellHistory._basePath
        ? ''
        : path.substring(MerchantShellHistory._basePath.length + 1);
    if (rest.isEmpty) return MerchantShellRoute.home();

    final parts = rest.split('/');
    final section = _sectionFromSegment(parts.first);
    if (section == null) return null;

    var stack = 0;
    if (parts.length >= 2 && parts[1].startsWith('~')) {
      stack = int.tryParse(parts[1].substring(1)) ?? 0;
    }
    return MerchantShellRoute(section: section, stack: stack < 0 ? 0 : stack);
  }

  static MerchantShellRoute? fromHistoryState(dynamic state) {
    if (state == null) return null;
    try {
      if (state['source'] != MerchantShellHistory._marker) return null;
      final section = state['section'];
      final rawStack = state['stack'];
      if (section is! String) return null;
      final stack = rawStack is int
          ? rawStack
          : (rawStack is num ? rawStack.toInt() : 0);
      return MerchantShellRoute(section: section, stack: stack < 0 ? 0 : stack);
    } catch (_) {
      return null;
    }
  }

  static String _sectionPath(String section) {
    switch (section) {
      case 'home':
        return MerchantShellHistory._basePath;
      case 'orders':
        return '${MerchantShellHistory._basePath}/orders';
      case 'digitalMenu':
        return '${MerchantShellHistory._basePath}/menu';
      case 'products':
        return '${MerchantShellHistory._basePath}/products';
      case 'clients':
        return '${MerchantShellHistory._basePath}/clients';
      case 'stats':
        return '${MerchantShellHistory._basePath}/stats';
      case 'marketing':
        return '${MerchantShellHistory._basePath}/marketing';
      case 'settings':
        return '${MerchantShellHistory._basePath}/settings';
      case 'plan':
        return '${MerchantShellHistory._basePath}/plan';
      default:
        return MerchantShellHistory._basePath;
    }
  }

  static String? _sectionFromSegment(String segment) {
    switch (segment) {
      case 'orders':
        return 'orders';
      case 'menu':
        return 'digitalMenu';
      case 'products':
        return 'products';
      case 'clients':
        return 'clients';
      case 'stats':
        return 'stats';
      case 'marketing':
        return 'marketing';
      case 'settings':
        return 'settings';
      case 'plan':
        return 'plan';
      default:
        return null;
    }
  }

  @override
  bool operator ==(Object other) {
    return other is MerchantShellRoute &&
        other.section == section &&
        other.stack == stack;
  }

  @override
  int get hashCode => Object.hash(section, stack);
}
