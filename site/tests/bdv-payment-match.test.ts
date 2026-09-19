import { describe, expect, it } from 'vitest';

import { matchBdvPendingTarget, normalizeBdvPhone, vesAmountsMatch } from '../app/api/_lib/bdv-match';

const order = {
  id: 'order-1',
  businessId: 'biz-1',
  submissionId: 'sub-1',
  planCode: 'menu_monthly',
  months: 1,
  amountUsd: 10,
  expectedAmountVes: 1200,
  expectedPhone: '04143481318',
  reference: '000856148754',
};

describe('BDV payment matching', () => {
  it('matches by bank reference first', () => {
    const match = matchBdvPendingTarget(
      {
        payment_id: 'bdv-1',
        amount: 50,
        reference: '000856148754',
        operation_number: null,
        sender_name: null,
        sender_phone: '04240000000',
        raw_text: null,
        bank_date: null,
        bank_time: null,
        source_package: null,
      },
      [order],
    );

    expect(match?.reason).toBe('reference');
    expect(match?.target.businessId).toBe('biz-1');
  });

  it('matches amount + phone when the reference is missing', () => {
    const match = matchBdvPendingTarget(
      {
        payment_id: 'bdv-2',
        amount: 1200,
        reference: null,
        operation_number: null,
        sender_name: null,
        sender_phone: '0414-3481318',
        raw_text: null,
        bank_date: null,
        bank_time: null,
        source_package: null,
      },
      [{ ...order, reference: null }],
    );

    expect(match?.reason).toBe('amount_phone');
  });

  it('matches a unique expected VES amount', () => {
    const match = matchBdvPendingTarget(
      {
        payment_id: 'bdv-3',
        amount: 1199,
        reference: null,
        operation_number: null,
        sender_name: null,
        sender_phone: null,
        raw_text: null,
        bank_date: null,
        bank_time: null,
        source_package: null,
      },
      [{ ...order, reference: null, expectedPhone: null }],
    );

    expect(match?.reason).toBe('amount');
    expect(vesAmountsMatch(1199, 1200)).toBe(true);
  });

  it('does not guess when two pending orders share the same amount', () => {
    const match = matchBdvPendingTarget(
      {
        payment_id: 'bdv-4',
        amount: 1200,
        reference: null,
        operation_number: null,
        sender_name: null,
        sender_phone: null,
        raw_text: null,
        bank_date: null,
        bank_time: null,
        source_package: null,
      },
      [
        { ...order, id: 'a', businessId: 'biz-a', reference: null, expectedPhone: null },
        { ...order, id: 'b', businessId: 'biz-b', reference: null, expectedPhone: null },
      ],
    );

    expect(match).toBeNull();
  });

  it('matches the last 4 digits the merchant typed', () => {
    const match = matchBdvPendingTarget(
      {
        payment_id: 'bdv-5',
        amount: 50,
        reference: '000856148754',
        operation_number: null,
        sender_name: null,
        sender_phone: '04240000000',
        raw_text: null,
        bank_date: null,
        bank_time: null,
        source_package: null,
      },
      [{ ...order, reference: '8754' }],
    );

    expect(match?.reason).toBe('reference');
    expect(match?.target.businessId).toBe('biz-1');
  });

  it('does not guess when two pending last-4 tails collide', () => {
    const match = matchBdvPendingTarget(
      {
        payment_id: 'bdv-6',
        amount: 1200,
        reference: '000856148754',
        operation_number: null,
        sender_name: null,
        sender_phone: null,
        raw_text: null,
        bank_date: null,
        bank_time: null,
        source_package: null,
      },
      [
        { ...order, id: 'a', businessId: 'biz-a', reference: '8754', expectedPhone: null },
        { ...order, id: 'b', businessId: 'biz-b', reference: '8754', expectedPhone: null },
      ],
    );

    expect(match).toBeNull();
  });

  it('normalizes Venezuelan mobile numbers', () => {
    expect(normalizeBdvPhone('0414-3481318')).toBe('4143481318');
    expect(normalizeBdvPhone('+58 414 3481318')).toBe('4143481318');
  });
});
