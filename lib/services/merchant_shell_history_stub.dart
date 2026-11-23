/// No-op history bridge for non-web platforms.
class MerchantShellHistory {
  MerchantShellHistory._();

  static MerchantShellRoute get current => MerchantShellRoute.home();

  static bool get isSyncing => false;

  static void attach({
    required void Function(MerchantShellRoute route) onLocation,
  }) {}

  static void detach() {}

  static void setRoute(MerchantShellRoute route, {bool push = false}) {}
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

  String get path => '/panel';

  static MerchantShellRoute? parse(String pathname) => null;
}
