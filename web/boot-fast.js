/**
 * Early boot helpers for app.elmenuxfa.com.
 * - Public deep links skip Flutter (redirect to Next).
 * - Hides the static HTML brand shell as soon as Flutter paints.
 */
(function () {
  var PUBLIC_SITE = 'https://elmenuxfa.com';
  var shellRemoved = false;

  function hasSupabaseSession() {
    try {
      for (var i = 0; i < localStorage.length; i += 1) {
        var key = localStorage.key(i);
        if (!key || key.indexOf('auth-token') === -1) continue;
        var raw = localStorage.getItem(key);
        if (raw && raw.indexOf('access_token') !== -1) return true;
      }
    } catch (_) {}
    return false;
  }

  function redirect(url) {
    try {
      window.location.replace(url);
      return true;
    } catch (_) {
      window.location.href = url;
      return true;
    }
  }

  function maybeBypassFlutter() {
    var loc = window.location;
    var path = loc.pathname || '/';
    var params = new URLSearchParams(loc.search || '');
    var segments = path.split('/').filter(Boolean);

    if (segments[0] === 'v' && segments[1]) {
      var rest = segments.slice(1).map(encodeURIComponent).join('/');
      return redirect(PUBLIC_SITE + '/v/' + rest + (loc.search || '') + (loc.hash || ''));
    }

    if (segments[0] === 'orders' && segments[1] === 'public' && segments[2]) {
      return redirect(
        PUBLIC_SITE +
          '/orders/' +
          encodeURIComponent(decodeURIComponent(segments[2])) +
          (loc.search || ''),
      );
    }

    if (
      segments[0] === 'orders' &&
      segments[1] === 'view' &&
      segments[2] &&
      !hasSupabaseSession()
    ) {
      var shortCode = (params.get('shortCode') || '').trim();
      if (/^[A-Za-z0-9_-]{10}$/.test(shortCode)) {
        return redirect(PUBLIC_SITE + '/o/' + encodeURIComponent(shortCode));
      }
      var fallback = (params.get('fallback') || '').trim();
      if (fallback.indexOf(PUBLIC_SITE + '/') === 0) {
        return redirect(fallback);
      }
    }

    if (
      segments[0] === 'orders' &&
      segments.length === 2 &&
      segments[1] !== 'view' &&
      segments[1] !== 'public' &&
      !hasSupabaseSession()
    ) {
      var code = (params.get('shortCode') || '').trim();
      if (/^[A-Za-z0-9_-]{10}$/.test(code)) {
        return redirect(PUBLIC_SITE + '/o/' + encodeURIComponent(code));
      }
      var fb = (params.get('fallback') || '').trim();
      if (fb.indexOf(PUBLIC_SITE + '/') === 0) {
        return redirect(fb);
      }
    }

    return false;
  }

  if (maybeBypassFlutter()) return;

  function removeShell() {
    if (shellRemoved) return;
    shellRemoved = true;
    var shell = document.getElementById('elmx-boot-shell');
    if (!shell) return;
    shell.hidden = true;
    shell.setAttribute('aria-busy', 'false');
  }

  // Prefer Flutter's first-frame; also drop as soon as the canvas mounts.
  window.addEventListener('flutter-first-frame', removeShell, { once: true });

  var observer = null;
  function watchFlutterDom() {
    if (!document.body || observer) return;
    observer = new MutationObserver(function () {
      if (
        document.querySelector('flt-glass-pane') ||
        document.querySelector('flutter-view') ||
        document.querySelector('canvas[aria-label="flutter"]')
      ) {
        removeShell();
        if (observer) {
          observer.disconnect();
          observer = null;
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) watchFlutterDom();
  else document.addEventListener('DOMContentLoaded', watchFlutterDom);

  // Safety net if first-frame is missed.
  window.setTimeout(removeShell, 12000);
})();
