import 'dart:html' as html;

/// Web: notify when `#h=` / `?h=` changes without a full document reload.
void listenBusinessAssistantHashChange(void Function(String hash) onHash) {
  html.window.onHashChange.listen((_) {
    onHash(html.window.location.hash);
  });
}

/// Prefer window.location — Uri.base can omit the fragment on some Flutter web boots.
String? readBusinessAssistantHandoffFromLocation() {
  final hash = html.window.location.hash.replaceFirst('#', '');
  if (hash.startsWith('h=')) {
    return Uri.decodeComponent(hash.substring(2)).trim();
  }
  final fromHash = Uri.splitQueryString(hash)['h']?.trim();
  if (fromHash != null && fromHash.isNotEmpty) return fromHash;
  final search = html.window.location.search ?? '';
  final params = Uri.splitQueryString(search.replaceFirst('?', ''));
  final fromQuery = params['h']?.trim();
  if (fromQuery != null && fromQuery.isNotEmpty) return fromQuery;
  return null;
}

/// Remove visible `h` after capture (keeps continuity in memory; avoids analytics/log leakage).
void scrubBusinessAssistantHandoffFromUrl() {
  final uri = Uri.parse(html.window.location.href);
  final qp = Map<String, String>.from(uri.queryParameters);
  final hadHashHandoff =
      uri.fragment.startsWith('h=') || uri.fragment.contains('h=');
  if (!qp.containsKey('h') && !hadHashHandoff) return;
  qp.remove('h');
  final cleaned = uri.replace(
    queryParameters: qp.isEmpty ? null : qp,
    fragment: '',
  );
  final pathAndQuery = cleaned.hasQuery
      ? '${cleaned.path}?${cleaned.query}'
      : cleaned.path;
  html.window.history.replaceState(null, '', pathAndQuery);
}
