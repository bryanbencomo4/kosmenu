export type BdvIncomingPayment = {
  event?: string | null;
  payment_id: string;
  amount: number | null;
  currency?: string | null;
  reference: string | null;
  operation_number: string | null;
  sender_name: string | null;
  sender_phone: string | null;
  raw_text: string | null;
  bank_date: string | null;
  bank_time: string | null;
  source_package: string | null;
};

export type BdvPendingTarget = {
  id: string;
  businessId: string;
  submissionId: string | null;
  planCode: string;
  months: number;
  amountUsd: number;
  expectedAmountVes: number | null;
  expectedPhone: string | null;
  reference: string | null;
};

export function normalizeBdvReference(value: string | null | undefined) {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 6 ? digits : trimmed.toUpperCase();
}

export function bdvReferenceDigits(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '');
}

export function bdvReferencesMatch(incoming: string | null | undefined, expected: string | null | undefined) {
  const incomingNormalized = normalizeBdvReference(incoming);
  const expectedNormalized = normalizeBdvReference(expected);
  if (!incomingNormalized || !expectedNormalized) return false;
  if (incomingNormalized === expectedNormalized) return true;

  const incomingDigits = bdvReferenceDigits(incomingNormalized);
  const expectedDigits = bdvReferenceDigits(expectedNormalized);
  if (expectedDigits.length === 4 && incomingDigits.length >= 4) {
    return incomingDigits.endsWith(expectedDigits);
  }
  if (incomingDigits.length === 4 && expectedDigits.length >= 4) {
    return expectedDigits.endsWith(incomingDigits);
  }
  return false;
}

export function normalizeBdvPhone(value: string | null | undefined) {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('58') && digits.length >= 12) {
    return digits.slice(-10);
  }
  if (digits.startsWith('0') && digits.length >= 11) {
    return digits.slice(-10);
  }
  return digits.slice(-10);
}

export function vesAmountsMatch(incoming: number | null, expected: number | null) {
  if (incoming == null || expected == null || incoming < 0 || expected < 0) {
    return false;
  }
  const tolerance = Math.max(2, expected * 0.02);
  return Math.abs(incoming - expected) <= tolerance;
}

export function parseBdvPaymentPayload(value: unknown): BdvIncomingPayment | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const paymentId = typeof body.payment_id === 'string' ? body.payment_id.trim() : '';
  if (!paymentId) return null;

  const amountRaw = body.amount;
  const amount =
    amountRaw == null || amountRaw === ''
      ? null
      : typeof amountRaw === 'number'
        ? amountRaw
        : Number(amountRaw);

  return {
    event: typeof body.event === 'string' ? body.event : 'payment_received',
    payment_id: paymentId,
    amount: Number.isFinite(amount) ? amount : null,
    currency: typeof body.currency === 'string' ? body.currency : 'VES',
    reference: typeof body.reference === 'string' ? body.reference : null,
    operation_number: typeof body.operation_number === 'string' ? body.operation_number : null,
    sender_name: typeof body.sender_name === 'string' ? body.sender_name : null,
    sender_phone: typeof body.sender_phone === 'string' ? body.sender_phone : null,
    raw_text: typeof body.raw_text === 'string' ? body.raw_text : null,
    bank_date: typeof body.bank_date === 'string' ? body.bank_date : null,
    bank_time: typeof body.bank_time === 'string' ? body.bank_time : null,
    source_package: typeof body.source_package === 'string' ? body.source_package : null,
  };
}

export function matchBdvPendingTarget(
  payment: BdvIncomingPayment,
  targets: BdvPendingTarget[],
): { target: BdvPendingTarget; reason: 'reference' | 'amount_phone' | 'amount' } | null {
  const paymentReference = normalizeBdvReference(payment.reference ?? payment.operation_number);
  const paymentPhone = normalizeBdvPhone(payment.sender_phone);

  if (paymentReference) {
    const byReference = targets.filter(
      (target) =>
        normalizeBdvReference(target.reference) &&
        bdvReferencesMatch(payment.reference ?? payment.operation_number, target.reference),
    );
    if (byReference.length === 1) {
      return { target: byReference[0], reason: 'reference' };
    }
  }

  if (payment.amount != null && paymentPhone) {
    const byAmountPhone = targets.filter(
      (target) =>
        vesAmountsMatch(payment.amount, target.expectedAmountVes) &&
        normalizeBdvPhone(target.expectedPhone) === paymentPhone,
    );
    if (byAmountPhone.length === 1) {
      return { target: byAmountPhone[0], reason: 'amount_phone' };
    }
  }

  if (payment.amount != null) {
    const byAmount = targets.filter((target) => vesAmountsMatch(payment.amount, target.expectedAmountVes));
    if (byAmount.length === 1) {
      return { target: byAmount[0], reason: 'amount' };
    }
  }

  return null;
}
