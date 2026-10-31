import 'dart:html' as html;

/// Keeps Flutter shell navigation in sync with browser Back/Forward.
///
/// The merchant panel lives on a single root route, so without synthetic
/// `history` entries the browser leaves the SPA instead of popping shell UI.
class MerchantShellHistory {
  MerchantShellHistory._();

  static const String _marker = 'elmenuxfa-merchant-shell';

  static html.EventListener? _listener;
  static void Function()? _onBrowserBack;
  static int _depth = 0;
  static bool _mutePop = false;

  static void attach({required void Function() onBrowserBack}) {
    _onBrowserBack = onBrowserBack;
    if (_listener != null) return;
    _listener = (html.Event event) {
      if (_mutePop) {
        _mutePop = false;
        return;
      }
      if (_depth > 0) {
        _depth -= 1;
      }
      _onBrowserBack?.call();
    };
    html.window.addEventListener('popstate', _listener);
  }

  static void detach() {
    if (_listener != null) {
      html.window.removeEventListener('popstate', _listener);
      _listener = null;
    }
    _onBrowserBack = null;
    _depth = 0;
    _mutePop = false;
  }

  static void setDepth(int depth) {
    final desired = depth < 0 ? 0 : depth;
    if (desired == _depth) return;

    if (desired > _depth) {
      for (var next = _depth + 1; next <= desired; next += 1) {
        html.window.history.pushState(
          <String, Object>{'source': _marker, 'depth': next},
          '',
          html.window.location.href,
        );
      }
      _depth = desired;
      return;
    }

    final delta = _depth - desired;
    _depth = desired;
    _mutePop = true;
    html.window.history.go(-delta);
  }
}
