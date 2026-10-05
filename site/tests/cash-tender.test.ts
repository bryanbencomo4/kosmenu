import { describe, expect, it } from 'vitest';

import {
  cashTenderValidity,
  describeCashBills,
  parseCashAmountInput,
  suggestCashTenders,
} from '../app/_lib/cash-tender';

describe('cash tender', () => {
  it('keeps typed decimals so 14.80 USD is not silently turned into another amount', () => {
    expect(parseCashAmountInput('14.80', 'USD')).toBe('14.80');
    expect(parseCashAmountInput('15.000', 'COP')).toBe('15000');
    expect(parseCashAmountInput('abc', 'USD')).toBe('');
  });

  it('accepts only sums of real bills and computes change', () => {
    expect(cashTenderValidity(14.8, 14.8, 'USD')).toMatchObject({ valid: false, reason: 'bills' });
    expect(cashTenderValidity(15, 14.8, 'USD')).toEqual({ valid: true, change: 0.2, reason: null });
    expect(cashTenderValidity(10, 14.8, 'USD')).toMatchObject({ valid: false, reason: 'low' });
    expect(cashTenderValidity(20, 14.8, 'USD')).toEqual({ valid: true, change: 5.2, reason: null });
    expect(cashTenderValidity(15, 14.8, 'EUR')).toMatchObject({ valid: true });
    expect(cashTenderValidity(12, 10, 'VES')).toMatchObject({ valid: false, reason: 'bills' });
    expect(cashTenderValidity(15, 12, 'VES')).toEqual({ valid: true, change: 3, reason: null });
    expect(cashTenderValidity(19250, 19000, 'COP')).toMatchObject({ valid: false, reason: 'bills' });
    expect(cashTenderValidity(150, 100, 'COP')).toMatchObject({ valid: false, reason: 'bills' });
    expect(cashTenderValidity(300, 250, 'COP')).toEqual({ valid: true, change: 50, reason: null });
    expect(cashTenderValidity(19000, 19000, 'COP')).toEqual({ valid: true, change: 0, reason: null });
    expect(describeCashBills('USD')).toContain('1, 5, 10');
    expect(describeCashBills('VES')).toContain('5, 10, 20');
  });

  it('suggests the next payable amount, never a total that is not cash', () => {
    expect(suggestCashTenders(14.8, 'USD')).toEqual([15, 20, 50, 100]);
    expect(suggestCashTenders(14.8, 'EUR')).toEqual([15, 20, 50, 100]);
    expect(suggestCashTenders(12, 'VES')).toEqual([15, 20, 50, 100, 200]);
    expect(suggestCashTenders(19000, 'COP')).toEqual([19000, 20000, 50000, 100000]);
    expect(suggestCashTenders(150, 'COP')).toEqual([200, 500, 1000, 2000, 5000]);
  });
});
