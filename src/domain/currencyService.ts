import { CurrencyCode } from '../types/domain';
import { fromMinorCents, toMinorCents } from './rulesEngine';

/**
 * Demonstration-only static FX rate from base CAD to reporting USD.
 * Official Appendix 4.1 baselines and underlying storage always remain in CAD;
 * USD conversion is applied strictly at presentation/reporting time from authoritative CAD values
 * so switching CAD <-> USD repeatedly never drifts or compounds rounding errors.
 */
export const DEMO_CAD_TO_USD_RATE = 0.72;
export const DEMO_USD_TO_CAD_EQUIVALENT = Number((1 / DEMO_CAD_TO_USD_RATE).toFixed(4));

export const CURRENCY_METADATA: Record<
  CurrencyCode,
  {
    code: CurrencyCode;
    label: string;
    compactPrefix: string;
    rateFromCad: number;
    rateDescription: string;
  }
> = {
  CAD: {
    code: 'CAD',
    label: 'Canadian Dollar (CAD)',
    compactPrefix: '$',
    rateFromCad: 1,
    rateDescription: 'Authoritative Appendix & ledger base currency (1.00 CAD).',
  },
  USD: {
    code: 'USD',
    label: 'US Dollar (USD)',
    compactPrefix: 'US$',
    rateFromCad: DEMO_CAD_TO_USD_RATE,
    rateDescription: `Static demonstration rate: 1 CAD = ${DEMO_CAD_TO_USD_RATE.toFixed(2)} USD (1 USD ≈ ${DEMO_USD_TO_CAD_EQUIVALENT.toFixed(4)} CAD). Not a live FX feed.`,
  },
};

export function getCurrencyRate(currency: CurrencyCode): number {
  return currency === 'USD' ? DEMO_CAD_TO_USD_RATE : 1;
}

/**
 * Converts an authoritative CAD amount to the selected reporting currency using minor-unit precision.
 * Always converts directly from base CAD rather than from an already-converted value.
 */
export function convertFromCad(amountCad: number, targetCurrency: CurrencyCode): number {
  if (!Number.isFinite(amountCad)) return 0;
  if (targetCurrency === 'CAD') return amountCad;
  const cadCents = toMinorCents(amountCad);
  const usdCents = Math.round(cadCents * DEMO_CAD_TO_USD_RATE);
  return fromMinorCents(usdCents);
}

/**
 * Format an authoritative CAD amount in the active reporting currency (e.g., "CAD 329,700,000" or "USD 237,384,000").
 */
export function formatReportingMoney(
  amountCad: number,
  currency: CurrencyCode = 'CAD',
  options?: { compact?: boolean; showSign?: boolean; includeDecimalsWhenWhole?: boolean }
): string {
  const converted = convertFromCad(amountCad, currency);
  const cents = toMinorCents(converted);
  const absCents = Math.abs(cents);
  const absVal = absCents / 100;
  const sign = cents < 0 ? '-' : options?.showSign && cents > 0 ? '+' : '';

  if (options?.compact) {
    const prefix = CURRENCY_METADATA[currency].compactPrefix;
    if (absVal >= 1_000_000) {
      return `${sign}${prefix}${(absVal / 1_000_000).toFixed(1)}M`;
    }
    if (absVal >= 1_000) {
      return `${sign}${prefix}${(absVal / 1_000).toFixed(1)}K`;
    }
  }

  const hasCents = absCents % 100 !== 0;
  const formatted = absVal.toLocaleString('en-CA', {
    minimumFractionDigits: hasCents || options?.includeDecimalsWhenWhole ? 2 : 0,
    maximumFractionDigits: hasCents || options?.includeDecimalsWhenWhole ? 2 : 0,
  });

  return `${sign}${currency} ${formatted}`;
}

export function formatReportingCompact(
  amountCad: number,
  currency: CurrencyCode = 'CAD',
  options?: { showSign?: boolean }
): string {
  const converted = convertFromCad(amountCad, currency);
  const cents = toMinorCents(converted);
  const absVal = Math.abs(cents) / 100;
  const sign = cents < 0 ? '-' : options?.showSign && cents > 0 ? '+' : '';
  const prefix = CURRENCY_METADATA[currency].compactPrefix;

  if (absVal >= 1_000_000) {
    return `${sign}${prefix}${(absVal / 1_000_000).toFixed(1)}M`;
  }
  if (absVal >= 1_000) {
    return `${sign}${prefix}${(absVal / 1_000).toFixed(1)}K`;
  }
  return `${sign}${prefix}${Math.round(absVal).toLocaleString('en-CA')}`;
}

export function formatReportingShort(
  amountCad: number,
  currency: CurrencyCode = 'CAD',
  options?: { showSign?: boolean }
): string {
  const converted = convertFromCad(amountCad, currency);
  const cents = toMinorCents(converted);
  const absCents = Math.abs(cents);
  const absVal = absCents / 100;
  const sign = cents < 0 ? '-' : options?.showSign && cents > 0 ? '+' : '';
  const hasCents = absCents % 100 !== 0;
  const prefix = CURRENCY_METADATA[currency].compactPrefix;
  return `${sign}${prefix}${absVal.toLocaleString('en-CA', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`;
}

export function formatOverviewReportingCompact(
  amountCad: number,
  currency: CurrencyCode = 'CAD',
  options?: { showSign?: boolean }
): string {
  const converted = convertFromCad(amountCad, currency);
  const cents = toMinorCents(converted);
  const absVal = Math.abs(cents) / 100;
  const sign = cents < 0 ? '-' : options?.showSign && cents > 0 ? '+' : '';
  const prefix = CURRENCY_METADATA[currency].compactPrefix;

  if (absVal >= 10_000_000) {
    return `${sign}${prefix}${(absVal / 1_000_000).toFixed(1)}M`;
  }
  if (absVal >= 1_000_000) {
    return `${sign}${prefix}${(absVal / 1_000_000).toFixed(2)}M`;
  }
  if (absVal >= 1_000) {
    return `${sign}${prefix}${(absVal / 1_000).toFixed(1)}K`;
  }
  return `${sign}${prefix}${Math.round(absVal).toLocaleString('en-CA')}`;
}
