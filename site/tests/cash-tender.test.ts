import { describe, expect, it } from 'vitest';

import {
  cashTenderValidity,
  parseCashAmountInput,
  suggestCashTenders,
} from '../app/_lib/cash-tender';

describe('cash tender', () => {
  it('accepts only possible cash amounts for the currency', () => {
    expect(parseCashAmountInput('abc', 'USD')).toBe('');
    expect(parseCashAmountInput('20,5a', 'USD')).toBe('20.5');
    expect(parseCashAmountInput('20.999', 'USD')).toBe('20.99');
    expect(parseCashAmountInput('15.000', 'COP')).toBe('15000');
    expect(parseCashAmountInput('00', 'COP')).toBe('0');
  });

  it('requires an amount at least equal to the total and computes change', () => {
    expect(cashTenderValidity(null, 14.8)).toEqual({ valid: false, change: 0 });
    expect(cashTenderValidity(10, 14.8)).toEqual({ valid: false, change: 0 });
    expect(cashTenderValidity(14.8, 14.8)).toEqual({ valid: true, change: 0 });
    expect(cashTenderValidity(20, 14.8)).toEqual({ valid: true, change: 5.2 });
  });

  it('suggests the exact total plus nearby bills', () => {
    expect(suggestCashTenders(14.8, 'USD')).toEqual([14.8, 20, 50, 100]);
    expect(suggestCashTenders(19000, 'COP')[0]).toBe(19000);
  });
});
