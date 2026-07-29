/// Pure helpers for the business logo picker/cropper flow. Deliberately free
/// of any Flutter dependency (only `dart:core` types are used) so this file
/// can be unit-tested without a widget environment and reused outside
/// widgets if needed. Callers that want debug logging pass their own
/// callback (e.g. `debugPrint`) rather than this file importing Flutter.
library;

/// Returns true when [fileName]/[mimeType] point to a HEIC/HEIF image.
///
/// HEIC/HEIF logos are rejected before reaching `ImageCropper` because the
/// web crop UI cannot decode that format and previously failed silently
/// (the failure was swallowed by a broad `catch (_) { return null; }`).
///
/// Both MIME and extension are checked because either signal can be
/// missing or unreliable depending on platform/browser:
/// - An empty/null [mimeType] never causes a rejection by itself; the
///   extension alone is used in that case.
/// - The MIME value is normalized (trimmed, lower-cased, and stripped of any
///   `;`-separated parameters such as `; charset=binary`) before comparison.
/// - If MIME and extension disagree about whether the file is HEIC/HEIF,
///   the file is treated as HEIC/HEIF (rejected) if either signal says so.
///   The mismatch is reported via [onFormatMismatch], if provided, instead
///   of this pure helper logging directly.
///
/// Recognized HEIC/HEIF signals:
/// - extensions: `.heic`, `.heif` (case-insensitive)
/// - MIME types: `image/heic`, `image/heif`, `image/heic-sequence`,
///   `image/heif-sequence`
bool isHeicOrHeifLogo({
  required String fileName,
  String? mimeType,
  void Function(String message)? onFormatMismatch,
}) {
  final normalizedMime = _normalizedMimeType(mimeType);
  final extension = _extensionOf(fileName);

  const heicMimeTypes = <String>{
    'image/heic',
    'image/heif',
    'image/heic-sequence',
    'image/heif-sequence',
  };
  const heicExtensions = <String>{'heic', 'heif'};

  final mimeIndicatesHeic = heicMimeTypes.contains(normalizedMime);
  final extensionIndicatesHeic = heicExtensions.contains(extension);

  if (normalizedMime.isNotEmpty &&
      mimeIndicatesHeic != extensionIndicatesHeic) {
    onFormatMismatch?.call(
      'Logo format mismatch: mime="$normalizedMime" extension="$extension" '
      '(treated as HEIC/HEIF: ${mimeIndicatesHeic || extensionIndicatesHeic}).',
    );
  }

  return mimeIndicatesHeic || extensionIndicatesHeic;
}

/// Normalizes a MIME type for comparison: trims whitespace, lower-cases it,
/// and drops any `;`-separated parameters (e.g. `image/heic; charset=binary`
/// becomes `image/heic`). A null/empty input normalizes to `''`.
String _normalizedMimeType(String? mimeType) {
  final trimmed = (mimeType ?? '').trim().toLowerCase();
  if (trimmed.isEmpty) {
    return '';
  }
  return trimmed.split(';').first.trim();
}

String _extensionOf(String fileName) {
  final match = RegExp(r'\.([a-zA-Z0-9]+)$').firstMatch(fileName.trim());
  return (match?.group(1) ?? '').trim().toLowerCase();
}

/// Outcome of a manual logo crop/edit attempt.
///
/// Replaces the previous `String?` contract used by the logo editor, which
/// could not distinguish a voluntary cancellation from a real failure: both
/// ended up as `null` and were handled identically (silently).
sealed class LogoEditOutcome {
  const LogoEditOutcome();
}

/// The user completed the crop; [path] points to the resulting image.
class LogoEditSuccess extends LogoEditOutcome {
  const LogoEditSuccess(this.path);

  final String path;
}

/// The user closed/cancelled the cropper without confirming. Not an error:
/// no message should be shown and the previous logo must be left untouched.
class LogoEditCancelled extends LogoEditOutcome {
  const LogoEditCancelled();
}

/// The crop could not be completed due to an unexpected error (thrown
/// exception, missing source file, or an empty result path).
class LogoEditFailure extends LogoEditOutcome {
  const LogoEditFailure(this.error, this.stackTrace);

  final Object error;
  final StackTrace stackTrace;
}

/// Classifies the raw `cropped?.path` value returned by `ImageCropper`.
///
/// `ImageCropper.cropImage` returns `null` when the user cancels, so `null`
/// is classified as [LogoEditCancelled]. An empty/blank path is not a
/// cancellation signal from the plugin and is treated as [LogoEditFailure]
/// instead, so it is never confused with a deliberate user cancellation.
LogoEditOutcome classifyCroppedPath(String? rawPath) {
  if (rawPath == null) {
    return const LogoEditCancelled();
  }

  final trimmed = rawPath.trim();
  if (trimmed.isEmpty) {
    return LogoEditFailure(
      StateError('Image cropper returned an empty path.'),
      StackTrace.current,
    );
  }

  return LogoEditSuccess(trimmed);
}
