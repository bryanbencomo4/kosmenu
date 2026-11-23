import 'package:flutter/services.dart';

/// Dial digits (no +) for common checkout countries.
String dialDigitsForIso(String iso) {
  switch (iso.trim().toUpperCase()) {
    case 'VE':
      return '58';
    case 'CO':
      return '57';
    case 'US':
    case 'CA':
      return '1';
    case 'MX':
      return '52';
    case 'ES':
      return '34';
    case 'AR':
      return '54';
    case 'CL':
      return '56';
    case 'PE':
      return '51';
    case 'EC':
      return '593';
    case 'PA':
      return '507';
    case 'DO':
      return '1';
    default:
      return '';
  }
}

/// National digits for [IntlPhoneField] from a stored E.164 / local value.
///
/// Critical: `+58` alone (empty national) must become `''`, never `'58'`.
/// Otherwise clearing the field re-injects the dial code into the input.
String nationalDigitsFromStoredPhone(
  String raw, {
  String iso = 'VE',
}) {
  final trimmed = raw.trim();
  var digits = trimmed.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) return '';

  final dial = dialDigitsForIso(iso);
  if (dial.isNotEmpty && digits.startsWith(dial)) {
    digits = digits.substring(dial.length);
  } else if (trimmed.startsWith('+') && digits.length > 10) {
    digits = digits.substring(digits.length - 10);
  }

  // Trunk zero (VE mobiles often stored as 0414…).
  if (iso.toUpperCase() == 'VE' &&
      digits.startsWith('0') &&
      digits.length == 11) {
    digits = digits.substring(1);
  }

  return digits;
}

/// Digits-only national number while typing / pasting.
String normalizeNationalPhoneDigits(
  String raw, {
  String iso = 'VE',
}) {
  return nationalDigitsFromStoredPhone(raw, iso: iso);
}

/// E.164 from national digits + dial code digits (no +).
String nationalToE164({
  required String nationalDigits,
  required String dialCodeDigits,
  String iso = 'VE',
}) {
  final local = nationalDigitsFromStoredPhone(nationalDigits, iso: iso);
  final dial = dialCodeDigits.replaceAll(RegExp(r'\D'), '');
  if (local.isEmpty) return '';
  return '+$dial$local';
}

bool isPlausibleVeNational(String nationalDigits) {
  final n = nationalDigitsFromStoredPhone(nationalDigits, iso: 'VE');
  return RegExp(r'^4\d{9}$').hasMatch(n);
}

/// Whether [nationalDigits] is a plausible mobile for [iso].
///
/// Length alone is not enough (e.g. VE rejects `0061680315`).
bool isPlausibleNationalForCountry(
  String nationalDigits, {
  required String iso,
  int? minLength,
  int? maxLength,
}) {
  final n = nationalDigitsFromStoredPhone(nationalDigits, iso: iso);
  if (n.isEmpty) return false;
  final code = iso.trim().toUpperCase();

  switch (code) {
    case 'VE':
      // Mobile: 412 / 414 / 416 / 422 / 424 / 426…
      return RegExp(r'^4\d{9}$').hasMatch(n);
    case 'CO':
      // Mobile: 3XXXXXXXXX
      return RegExp(r'^3\d{9}$').hasMatch(n);
    case 'MX':
      return RegExp(r'^\d{10}$').hasMatch(n);
    case 'US':
    case 'CA':
      return RegExp(r'^\d{10}$').hasMatch(n) && !n.startsWith('0') && !n.startsWith('1');
    case 'ES':
      return RegExp(r'^[67]\d{8}$').hasMatch(n);
    case 'AR':
      return n.length >= 10 && n.length <= 11 && RegExp(r'^\d+$').hasMatch(n);
    case 'CL':
      return RegExp(r'^9\d{8}$').hasMatch(n);
    case 'PE':
      return RegExp(r'^9\d{8}$').hasMatch(n);
    case 'EC':
      return RegExp(r'^9\d{8}$').hasMatch(n);
    default:
      final min = minLength ?? 7;
      final max = maxLength ?? 15;
      return n.length >= min &&
          n.length <= max &&
          RegExp(r'^\d+$').hasMatch(n) &&
          !n.startsWith('0');
  }
}

/// Form / checkout message, or null when valid.
String? phoneValidationMessage({
  required String nationalDigits,
  required String iso,
  int? minLength,
  int? maxLength,
}) {
  final n = nationalDigitsFromStoredPhone(nationalDigits, iso: iso);
  if (n.isEmpty) return 'Indica un teléfono válido.';
  if (!isPlausibleNationalForCountry(
    n,
    iso: iso,
    minLength: minLength,
    maxLength: maxLength,
  )) {
    return 'Número inválido para ese país.';
  }
  return null;
}

/// Strips trunk zeros / pasted country codes while typing.
class NormalizeNationalPhoneFormatter extends TextInputFormatter {
  const NormalizeNationalPhoneFormatter({
    this.iso = 'VE',
    this.maxNationalLength = 10,
  });

  final String iso;
  final int maxNationalLength;

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    var normalized = nationalDigitsFromStoredPhone(newValue.text, iso: iso);
    if (normalized.length > maxNationalLength) {
      normalized = normalized.substring(0, maxNationalLength);
    }
    if (normalized == newValue.text) return newValue;
    return TextEditingValue(
      text: normalized,
      selection: TextSelection.collapsed(offset: normalized.length),
    );
  }
}
