import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/theme/app_theme.dart';
import 'package:kosmenu_app/services/billing_service.dart';
import 'package:kosmenu_app/services/payment_catalog.dart';
import 'package:kosmenu_app/services/web_camera_handoff_service.dart';
import 'package:kosmenu_app/widgets/payment_method_mark.dart';

class BillingPagoMovilScreen extends StatefulWidget {
  const BillingPagoMovilScreen({
    super.key,
    required this.method,
    required this.plan,
    required this.bcvRate,
    this.hasPendingSubmission = false,
    this.planCode = 'menu_monthly',
    this.months = 1,
    this.chargeUsd,
  });

  final PaymentMethodCatalog method;
  final BillingPlan? plan;
  final double? bcvRate;
  final bool hasPendingSubmission;
  final String planCode;
  final int months;
  /// Total the merchant should transfer (plan + kit extras).
  final double? chargeUsd;

  @override
  State<BillingPagoMovilScreen> createState() => _BillingPagoMovilScreenState();
}

class _BillingPagoMovilScreenState extends State<BillingPagoMovilScreen> {
  final _billing = const BillingService();
  final _webCamera = const WebCameraHandoffService();
  final _reference = TextEditingController();
  final _focus = FocusNode();
  bool _submitting = false;
  bool _uploading = false;
  String? _error;
  String? _receiptPath;
  String? _receiptLabel;
  late PaymentMethodCatalog _method;

  @override
  void initState() {
    super.initState();
    _method = widget.method;
    unawaited(_refreshMethod());
  }

  @override
  void dispose() {
    _reference.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _refreshMethod() async {
    try {
      final checkout = await _billing.loadCheckoutContext();
      for (final method in checkout.methods) {
        if (method.code == widget.method.code) {
          if (!mounted) return;
          setState(() => _method = method);
          return;
        }
      }
    } catch (_) {}
  }

  double get _usd {
    return widget.chargeUsd ?? widget.plan?.priceAmount ?? 10;
  }

  double? get _ves {
    return vesAmountFromUsd(usd: _usd, bcvRate: widget.bcvRate);
  }

  Future<void> _copy(String value) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Dato copiado.')));
  }

  Future<void> _uploadReceiptBytes({
    required Uint8List bytes,
    required String name,
    required String mime,
  }) async {
    setState(() {
      _error = null;
      _uploading = true;
    });
    try {
      final path = await _billing.uploadSubscriptionReceipt(
        bytes: bytes,
        fileName: name,
        mimeType: mime,
      );
      if (!mounted) return;
      setState(() {
        _receiptPath = path;
        _receiptLabel = name;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = '$error'.replaceFirst('Bad state: ', ''));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _pickReceiptFromCamera() async {
    if (_uploading || _submitting) return;
    setState(() => _error = null);
    if (!mounted) return;

    final shot = await _webCamera.pickCameraImage(
      context,
      feature: 'billing_receipt',
      waitingTitle: 'Toma la foto del comprobante desde tu celular',
      waitingSubtitle:
          'Escanea el código con tu teléfono y la cargaremos aquí en cuanto la subas.',
      imageQuality: 85,
      maxWidth: 1600,
    );
    if (shot == null || !mounted) return;

    final bytes = await shot.readAsBytes();
    if (!mounted) return;
    await _uploadReceiptBytes(
      bytes: bytes,
      name: shot.name.isEmpty ? 'comprobante.jpg' : shot.name,
      mime: shot.mimeType?.trim().isNotEmpty == true
          ? shot.mimeType!
          : _mimeForName(shot.name),
    );
  }

  Future<void> _pickReceiptFromFile() async {
    if (_uploading || _submitting) return;
    setState(() => _error = null);
    try {
      final picked = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const <String>[
          'jpg',
          'jpeg',
          'png',
          'webp',
          'pdf',
        ],
        withData: true,
      );
      final file = picked?.files.single;
      if (file == null) return;
      final data = file.bytes;
      if (data == null) {
        throw StateError('No se pudo leer el archivo. Intenta con otro.');
      }
      if (!mounted) return;
      await _uploadReceiptBytes(
        bytes: data,
        name: file.name,
        mime: _mimeForName(file.name),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = '$error'.replaceFirst('Bad state: ', ''));
    }
  }

  Future<void> _submit() async {
    if (_submitting || _uploading || widget.hasPendingSubmission) return;
    final tail = normalizePagoMovilReferenceTail(_reference.text);
    final ves = _ves;
    final draft = ManualPaymentDraft(
      months: widget.months,
      planCode: widget.planCode,
      reference: tail,
      declaredAmount: ves,
      declaredCurrency: 'VES',
      receiptPath: _receiptPath,
    );
    final validation = validateManualPaymentDraft(
      method: _method,
      draft: draft,
    );
    if (validation != null) {
      setState(() => _error = validation);
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await _billing.submitManualPayment(method: _method, draft: draft);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = '$error'.replaceFirst('Bad state: ', ''));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final method = _method;
    final ves = _ves;
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    final receiptMissing = method.requiresReceipt &&
        (_receiptPath == null || _receiptPath!.isEmpty);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: Text(
          'Pago Móvil',
          style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                    children: [
                      Row(
                        children: [
                          PaymentMethodMark(method: method, size: 52),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Text(
                              'Transfiere el monto exacto, sube el comprobante y confirma con los últimos 4 dígitos.',
                              style: GoogleFonts.manrope(
                                color: AppColors.textSoft,
                                height: 1.4,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.fromLTRB(20, 22, 20, 20),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [Color(0xFF1E1B4B), Color(0xFF4C1D95)],
                          ),
                          borderRadius: BorderRadius.circular(28),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Debes transferir',
                              style: GoogleFonts.manrope(
                                color: Colors.white.withValues(alpha: 0.72),
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Expanded(
                                  child: Text(
                                    ves == null
                                        ? 'Cargando tasa BCV…'
                                        : formatBolivares(ves),
                                    style: GoogleFonts.manrope(
                                      color: Colors.white,
                                      fontSize: 34,
                                      fontWeight: FontWeight.w900,
                                      height: 1.05,
                                      letterSpacing: -0.8,
                                    ),
                                  ),
                                ),
                                if (ves != null)
                                  IconButton(
                                    tooltip: 'Copiar monto',
                                    onPressed: () =>
                                        _copy(ves.toStringAsFixed(2)),
                                    icon: const Icon(
                                      Icons.copy_rounded,
                                      color: Colors.white,
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Text(
                              'Monto exacto · ${_usd.toStringAsFixed(0)} USD · tasa BCV'
                              '${widget.bcvRate == null ? '' : ' ${widget.bcvRate!.toStringAsFixed(2)}'}',
                              style: GoogleFonts.manrope(
                                color: Colors.white.withValues(alpha: 0.78),
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (ves == null) ...[
                        const SizedBox(height: 12),
                        Text(
                          'No pudimos leer la tasa BCV. Reintenta en un momento.',
                          style: GoogleFonts.manrope(
                            color: AppColors.warning,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                      if (method.accountFields.isNotEmpty) ...[
                        const SizedBox(height: 22),
                        Text(
                          'Datos para pagar',
                          style: GoogleFonts.manrope(
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                          ),
                        ),
                        const SizedBox(height: 10),
                        ...method.accountFields.map(
                          (field) => _CopyRow(
                            label: field.label,
                            value: field.value,
                            copyable: field.copyable,
                            onCopy: () => _copy(field.value),
                          ),
                        ),
                      ] else ...[
                        const SizedBox(height: 22),
                        Text(
                          'Aún no hay datos de la cuenta. Un administrador debe cargarlos en Suscripciones → Métodos y luego vuelve a entrar aquí.',
                          style: GoogleFonts.manrope(
                            color: AppColors.warning,
                            fontWeight: FontWeight.w700,
                            height: 1.4,
                          ),
                        ),
                      ],
                      const SizedBox(height: 22),
                      Text(
                        'Últimos 4 dígitos de la referencia',
                        style: GoogleFonts.manrope(
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Aparecen en el comprobante de Pago Móvil. Los usamos junto con el comprobante para verificar tu pago.',
                        style: GoogleFonts.manrope(
                          color: AppColors.textSoft,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _reference,
                        focusNode: _focus,
                        autofocus: false,
                        maxLength: 4,
                        keyboardType: TextInputType.number,
                        textInputAction: TextInputAction.done,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                        ],
                        style: GoogleFonts.manrope(
                          fontSize: 28,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 12,
                        ),
                        textAlign: TextAlign.center,
                        decoration: InputDecoration(
                          counterText: '',
                          hintText: '••••',
                          hintStyle: GoogleFonts.manrope(
                            fontSize: 28,
                            letterSpacing: 12,
                            color: AppColors.borderSubtle,
                          ),
                          filled: true,
                          fillColor: Colors.white,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 18,
                          ),
                        ),
                        onChanged: (_) {
                          if (_error != null) setState(() => _error = null);
                        },
                        onSubmitted: (_) => _submit(),
                      ),
                      if (method.requiresReceipt) ...[
                        const SizedBox(height: 22),
                        Text(
                          'Comprobante',
                          style: GoogleFonts.manrope(
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Sube la captura o el PDF del Pago Móvil. Es obligatorio para verificar el pago.',
                          style: GoogleFonts.manrope(
                            color: AppColors.textSoft,
                            height: 1.4,
                          ),
                        ),
                        const SizedBox(height: 12),
                        if (_receiptLabel != null)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Text(
                              'Listo: $_receiptLabel',
                              style: GoogleFonts.manrope(
                                color: AppColors.success,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed:
                                    _uploading ? null : _pickReceiptFromFile,
                                icon: _uploading
                                    ? const SizedBox(
                                        width: 18,
                                        height: 18,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : const Icon(Icons.attach_file_rounded),
                                label: Text(
                                  _uploading ? 'Subiendo…' : 'Galería o PDF',
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: _uploading
                                    ? null
                                    : _pickReceiptFromCamera,
                                icon: const Icon(Icons.photo_camera_outlined),
                                label: const Text('Cámara'),
                              ),
                            ),
                          ],
                        ),
                        if (receiptMissing && _error != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Obligatorio para continuar.',
                            style: GoogleFonts.manrope(
                              color: AppColors.danger,
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ],
                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        Text(
                          _error!,
                          style: GoogleFonts.manrope(
                            color: AppColors.danger,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                      if (widget.hasPendingSubmission) ...[
                        const SizedBox(height: 12),
                        Text(
                          'Ya hay un Pago Móvil en confirmación. Espera o cancélalo antes de enviar otro.',
                          style: GoogleFonts.manrope(
                            color: AppColors.warning,
                            fontWeight: FontWeight.w700,
                            height: 1.35,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                Padding(
                  padding: EdgeInsets.fromLTRB(
                    20,
                    8,
                    20,
                    12 + (bottomInset > 0 ? 8 : 0),
                  ),
                  child: FilledButton(
                    onPressed:
                        _submitting ||
                            _uploading ||
                            widget.hasPendingSubmission ||
                            ves == null ||
                            method.accountFields.isEmpty
                        ? null
                        : _submit,
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(56),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                      ),
                    ),
                    child: _submitting
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.4,
                              color: Colors.white,
                            ),
                          )
                        : Text(
                            ves == null
                                ? 'Ya transferí'
                                : 'Ya transferí ${formatBolivares(ves)}',
                            style: GoogleFonts.manrope(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CopyRow extends StatelessWidget {
  const _CopyRow({
    required this.label,
    required this.value,
    required this.copyable,
    required this.onCopy,
  });

  final String label;
  final String value;
  final bool copyable;
  final VoidCallback onCopy;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(14, 12, 6, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderSubtle),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: GoogleFonts.manrope(
                    color: AppColors.textSoft,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SelectableText(
                  value,
                  style: GoogleFonts.manrope(
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                  ),
                ),
              ],
            ),
          ),
          if (copyable)
            IconButton(
              onPressed: onCopy,
              icon: const Icon(Icons.copy_rounded),
              tooltip: 'Copiar',
            ),
        ],
      ),
    );
  }
}

String _mimeForName(String name) {
  final lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'image/jpeg';
}
