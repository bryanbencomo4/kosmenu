import 'package:kosmenu_app/utils/phone_national_normalize.dart';

/// Contact + kit delivery preferences for a new subscription.
class KitShippingDraft {
  const KitShippingDraft({
    this.recipientName = '',
    this.phone = '',
    this.phoneCountryIso = 'VE',
    this.email = '',
    this.deliveryMode = KitDeliveryMode.zoom,
    this.ci = '',
    this.estado = '',
    this.ciudad = '',
    this.zoomOffice = '',
    this.zoomOfficeId = '',
    this.manualOfficeEntry = false,
    this.deliveryNotes = '',
    this.extrasQty = 0,
  });

  final String recipientName;
  final String phone;
  final String phoneCountryIso;
  final String email;
  final KitDeliveryMode deliveryMode;
  final String ci;
  final String estado;
  final String ciudad;
  final String zoomOffice;
  final String zoomOfficeId;
  final bool manualOfficeEntry;
  final String deliveryNotes;
  final int extrasQty;

  KitShippingDraft copyWith({
    String? recipientName,
    String? phone,
    String? phoneCountryIso,
    String? email,
    KitDeliveryMode? deliveryMode,
    String? ci,
    String? estado,
    String? ciudad,
    String? zoomOffice,
    String? zoomOfficeId,
    bool? manualOfficeEntry,
    String? deliveryNotes,
    int? extrasQty,
  }) {
    return KitShippingDraft(
      recipientName: recipientName ?? this.recipientName,
      phone: phone ?? this.phone,
      phoneCountryIso: phoneCountryIso ?? this.phoneCountryIso,
      email: email ?? this.email,
      deliveryMode: deliveryMode ?? this.deliveryMode,
      ci: ci ?? this.ci,
      estado: estado ?? this.estado,
      ciudad: ciudad ?? this.ciudad,
      zoomOffice: zoomOffice ?? this.zoomOffice,
      zoomOfficeId: zoomOfficeId ?? this.zoomOfficeId,
      manualOfficeEntry: manualOfficeEntry ?? this.manualOfficeEntry,
      deliveryNotes: deliveryNotes ?? this.deliveryNotes,
      extrasQty: extrasQty ?? this.extrasQty,
    );
  }

  /// Checkout step 3: name, email, phone only.
  String? get contactValidationError {
    if (recipientName.trim().length < 2) {
      return 'Indica tu nombre completo.';
    }
    if (!_emailOk(email)) {
      return 'Indica un correo electrónico válido.';
    }
    final iso = phoneCountryIso.trim().isEmpty ? 'VE' : phoneCountryIso;
    return phoneValidationMessage(
      nationalDigits: nationalDigitsFromStoredPhone(phone, iso: iso),
      iso: iso,
    );
  }

  /// Secondary delivery step.
  String? get deliveryValidationError {
    switch (deliveryMode) {
      case KitDeliveryMode.support:
        return null;
      case KitDeliveryMode.manual:
        if (deliveryNotes.trim().length < 8) {
          return 'Describe cómo y dónde quieres recibir el kit.';
        }
        return null;
      case KitDeliveryMode.zoom:
        if (ci.trim().length < 5) {
          return 'Indica la cédula / RIF del destinatario.';
        }
        // Zoom ASL often omits estado; ciudad + oficina is enough to ship.
        if (ciudad.trim().isEmpty && estado.trim().isEmpty) {
          return 'Indica la ciudad de la oficina Zoom.';
        }
        if (zoomOffice.trim().length < 3) {
          return manualOfficeEntry || zoomOfficeId.trim().isEmpty
              ? 'Indica la oficina Zoom donde retirarás el kit.'
              : 'Selecciona una oficina Zoom.';
        }
        return null;
    }
  }

  /// Backward-compatible alias used by billing service.
  String? get zoomValidationError => deliveryValidationError;

  String? get validationError =>
      contactValidationError ?? deliveryValidationError;

  bool get isContactValid => contactValidationError == null;
  bool get isZoomValid => deliveryValidationError == null;
  bool get isDeliveryValid => deliveryValidationError == null;
  bool get isValid => validationError == null;

  String get deliverySummaryLabel {
    switch (deliveryMode) {
      case KitDeliveryMode.zoom:
        final office = zoomOffice.trim();
        if (office.isNotEmpty) return 'Zoom · $office';
        return 'Zoom Venezuela · flete al retirar';
      case KitDeliveryMode.support:
        return 'Acordar con soporte · WhatsApp';
      case KitDeliveryMode.manual:
        return 'Entrega coordinada manualmente';
    }
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'recipientName': recipientName.trim(),
        'phone': phone.trim(),
        'phoneCountryIso': phoneCountryIso.trim().toUpperCase(),
        'email': email.trim().toLowerCase(),
        'deliveryMode': deliveryMode.apiValue,
        'ci': ci.trim().isEmpty ? _placeholderCi : ci.trim(),
        'estado': () {
          final e = estado.trim();
          if (e.isNotEmpty) return e;
          final c = ciudad.trim();
          if (c.isNotEmpty) return c;
          return _placeholderPlace;
        }(),
        'ciudad': ciudad.trim().isEmpty ? _placeholderPlace : ciudad.trim(),
        'zoomOffice': _resolvedZoomOffice(),
        'zoomOfficeId': zoomOfficeId.trim(),
        'manualOfficeEntry': manualOfficeEntry,
        'deliveryNotes': deliveryNotes.trim(),
        'extrasQty': extrasQty < 0 ? 0 : extrasQty,
      };

  String _resolvedZoomOffice() {
    switch (deliveryMode) {
      case KitDeliveryMode.support:
        return 'Acordar con soporte elmenuxfa (WhatsApp)';
      case KitDeliveryMode.manual:
        final notes = deliveryNotes.trim();
        return notes.isEmpty ? 'Entrega manual' : notes;
      case KitDeliveryMode.zoom:
        return zoomOffice.trim();
    }
  }

  static const String _placeholderCi = 'POR_DEFINIR';
  static const String _placeholderPlace = 'Por definir';

  static bool _emailOk(String value) {
    final email = value.trim();
    return RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email);
  }
}

enum KitDeliveryMode {
  zoom,
  support,
  manual;

  String get apiValue {
    switch (this) {
      case KitDeliveryMode.zoom:
        return 'zoom';
      case KitDeliveryMode.support:
        return 'support';
      case KitDeliveryMode.manual:
        return 'manual';
    }
  }

  static KitDeliveryMode fromApi(String? raw) {
    switch ((raw ?? '').trim().toLowerCase()) {
      case 'support':
        return KitDeliveryMode.support;
      case 'manual':
        return KitDeliveryMode.manual;
      case 'zoom':
      default:
        return KitDeliveryMode.zoom;
    }
  }
}
