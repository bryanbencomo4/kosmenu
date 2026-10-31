/// No-op history bridge for non-web platforms.
class MerchantShellHistory {
  MerchantShellHistory._();

  static void attach({required void Function() onBrowserBack}) {}

  static void detach() {}

  /// Keeps synthetic browser history depth aligned with in-app back stack.
  static void setDepth(int depth) {}
}
