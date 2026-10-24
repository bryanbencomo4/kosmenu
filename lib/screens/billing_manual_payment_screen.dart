import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/theme/app_theme.dart';
import 'package:kosmenu_app/services/billing_service.dart';
import 'package:kosmenu_app/services/payment_catalog.dart';
import 'package:kosmenu_app/services/web_camera_handoff_service.dart';
import 'package:kosmenu_app/widgets/payment_method_mark.dart';

class BillingManualPaymentScreen extends StatefulWidget {
  const BillingManualPaymentScreen({
    super.key,
    required this.method,
    required this.plan,
    this.hasPendingSubmission = false,
    this.bcvRate,
  });

  final PaymentMethodCatalog method;
  final BillingPlan? plan;
  final bool hasPendingSubmission;
  final double? bcvRate;

  @override
  State<BillingManualPaymentScreen> createState() =>
      _BillingManualPaymentScreenState();
}

class _BillingManualPaymentScreenState
    extends State<BillingManualPaymentScreen> {
  final _billing = const BillingService();
  final _webCamera = const WebCameraHandoffService();
  final _reference = TextEditingController();
  final _payerName = TextEditingController();
  final _advisorCode = TextEditingController();
  final _declaredAmount = TextEditingController();
  int _months = 1;
  String? _receiptPath;
  String? _receiptLabel;
  bool _submitting = false;
  bool _uploading = false;
  String? _error;

  @override
  void dispose() {
    _reference.dispose();
    _payerName.dispose();
    _advisorCode.dispose();
    _declaredAmount.dispose();
    super.dispose();
  }

  double get _dueUsd {
    final unit = widget.plan?.priceAmount ?? 10;
    return unit * _months;
  }

  double? get _dueVes =>
      vesAmountFromUsd(usd: _dueUsd, bcvRate: widget.bcvRate);

  Future<void> _copy(String value) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Dato copiado.')),
    );
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
    if (_submitting || widget.hasPendingSubmission) return;
    final parsedDeclared =
        double.tryParse(_declaredAmount.text.replaceAll(',', '.'));
    final draft = ManualPaymentDraft(
      months: _months,
      reference: _reference.text,
      payerName: _payerName.text,
      advisorCode: _advisorCode.text,
      declaredAmount: parsedDeclared ??
          (widget.method.isPagoMovil ? _dueVes : null),
      declaredCurrency: widget.method.localCurrency,
      receiptPath: _receiptPath,
    );
    final validation = validateManualPaymentDraft(
      method: widget.method,
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
      await _billing.submitManualPayment(method: widget.method, draft: draft);
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
    final method = widget.method;
    final fields = method.accountFields;

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: Text(
          method.name,
          style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Row(
                  children: [
                    PaymentMethodMark(method: method, size: 56),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            method.name,
                            style: GoogleFonts.manrope(
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          Text(
                            'Verificacion manual · ${method.slaLabel}',
                            style: GoogleFonts.manrope(
                              color: AppColors.warning,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Text(
                  method.instructions ??
                      'Paga con los datos de abajo y envia el comprobante.',
                  style: GoogleFonts.manrope(
                    color: AppColors.textSoft,
                    height: 1.45,
                  ),
                ),
                if (method.isCash) ...[
                  const SizedBox(height: 12),
                  _Notice(
                    tone: AppColors.warning,
                    text:
                        'El efectivo solo es valido si lo entregaste a un asesor de venta autorizado. Sin su codigo no podemos verificar el pago.',
                  ),
                ],
                if (fields.isNotEmpty) ...[
                  const SizedBox(height: 18),
                  Text(
                    'Datos para pagar',
                    style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 8),
                  ...fields.map(
                    (field) => _CopyRow(
                      label: field.label,
                      value: field.value,
                      copyable: field.copyable,
                      onCopy: () => _copy(field.value),
                    ),
                  ),
                ],
                const SizedBox(height: 18),
                Text(
                  'Meses a pagar',
                  style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [1, 3, 6, 12].map((months) {
                    final selected = _months == months;
                    return ChoiceChip(
                      label: Text('$months'),
                      selected: selected,
                      onSelected: (_) => setState(() => _months = months),
                    );
                  }).toList(growable: false),
                ),
                const SizedBox(height: 8),
                Text(
                  'Total: \$${_dueUsd.toStringAsFixed(_dueUsd.truncateToDouble() == _dueUsd ? 0 : 2)} USD',
                  style: GoogleFonts.manrope(
                    color: AppColors.textSoft,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (method.isPagoMovil && _dueVes != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    'Transfiere exactamente ${formatBolivares(_dueVes!)} (tasa BCV)',
                    style: GoogleFonts.manrope(
                      color: AppColors.textStrong,
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                  Text(
                    'Te enviaremos un correo al recibir el comprobante y otro cuando lo aprobemos o rechacemos.',
                    style: GoogleFonts.manrope(
                      color: AppColors.textSoft,
                      height: 1.4,
                      fontSize: 13,
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                if (method.requiresReference)
                  TextField(
                    controller: _reference,
                    keyboardType: method.isPagoMovil
                        ? TextInputType.number
                        : TextInputType.text,
                    decoration: InputDecoration(
                      labelText: method.isPagoMovil
                          ? 'Número de referencia del Pago Móvil'
                          : 'Numero de referencia',
                      hintText: method.isPagoMovil
                          ? 'Como aparece en tu banco'
                          : null,
                      filled: true,
                      fillColor: Colors.white,
                    ),
                  ),
                if (method.requiresAdvisorCode) ...[
                  const SizedBox(height: 12),
                  TextField(
                    controller: _advisorCode,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(
                      labelText: 'Codigo del asesor',
                      hintText: 'Ej. ANA-24',
                      filled: true,
                      fillColor: Colors.white,
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                TextField(
                  controller: _payerName,
                  decoration: const InputDecoration(
                    labelText: 'Nombre de quien pago (opcional)',
                    filled: true,
                    fillColor: Colors.white,
                  ),
                ),
                if (method.localCurrency != null &&
                    method.localCurrency != 'USD') ...[
                  const SizedBox(height: 12),
                  TextField(
                    controller: _declaredAmount,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: InputDecoration(
                      labelText: 'Monto enviado en ${method.localCurrency}',
                      filled: true,
                      fillColor: Colors.white,
                    ),
                  ),
                ],
                if (method.requiresReceipt) ...[
                  const SizedBox(height: 16),
                  Text(
                    'Comprobante',
                    style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 8),
                  if (_receiptLabel != null)
                    Text(
                      'Listo: $_receiptLabel',
                      style: GoogleFonts.manrope(
                        color: AppColors.success,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed:
                              _uploading ? null : _pickReceiptFromFile,
                          icon: const Icon(Icons.attach_file_rounded),
                          label: const Text('Galeria o PDF'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed:
                              _uploading ? null : _pickReceiptFromCamera,
                          icon: const Icon(Icons.photo_camera_outlined),
                          label: const Text('Camara'),
                        ),
                      ),
                    ],
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 14),
                  Text(
                    _error!,
                    style: GoogleFonts.manrope(
                      color: AppColors.danger,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
                if (widget.hasPendingSubmission) ...[
                  const SizedBox(height: 14),
                  const _Notice(
                    tone: AppColors.warning,
                    text:
                        'Ya tienes un pago en revision. Espera la respuesta o cancelalo antes de enviar otro.',
                  ),
                ],
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _submitting ||
                          _uploading ||
                          widget.hasPendingSubmission
                      ? null
                      : _submit,
                  child: _submitting
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(
                          'Enviar para revision',
                          style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
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
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
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
                  style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
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

class _Notice extends StatelessWidget {
  const _Notice({required this.tone, required this.text});

  final Color tone;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        text,
        style: GoogleFonts.manrope(
          color: tone,
          fontWeight: FontWeight.w700,
          height: 1.35,
        ),
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
