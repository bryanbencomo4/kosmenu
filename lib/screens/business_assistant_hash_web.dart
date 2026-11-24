import 'dart:html' as html;

/// Web: notify when `#h=` changes without a full document reload.
void listenBusinessAssistantHashChange(void Function(String hash) onHash) {
  html.window.onHashChange.listen((_) {
    onHash(html.window.location.hash);
  });
}

/// Prefer window.location — Uri.base can omit the fragment on some Flutter web boots.
String? readBusinessAssistantHandoffFromLocation() {
  final hash = (html.window.location.hash ?? '').replaceFirst('#', '');
  if (hash.startsWith('h=')) {
    return Uri.decodeComponent(hash.substring(2)).trim();
  }
  final fromHash = Uri.splitQueryString(hash)['h']?.trim();
  if (fromHash != null && fromHash.isNotEmpty) return fromHash;
  final fromQuery = Uri.base.queryParameters['h']?.trim();
  if (fromQuery != null && fromQuery.isNotEmpty) return fromQuery;
  return null;
}
