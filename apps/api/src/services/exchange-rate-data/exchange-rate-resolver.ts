import {
  DEFAULT_CURRENCY,
  DERIVED_CURRENCIES
} from '@ghostfolio/common/config';
import { DATE_FORMAT } from '@ghostfolio/common/helper';

import {
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  parseISO
} from 'date-fns';

import { ExchangeRatesWithStatus } from './interfaces/exchange-rate-data.interface';

export const EXCHANGE_RATE_TODAY_STALENESS_IN_DAYS = 5;

export interface ExchangeRateRow {
  currencyFrom: string;
  currencyTo: string;
  date: Date;
  isCarriedForward?: boolean;
  rate: number;
}

interface LegEntry {
  dateString: string;
  isCarriedForward: boolean;
  rate: number;
}

interface LegValue {
  isEstimated: boolean;
  isMissing: boolean;
  rate?: number;
}

interface SeriesByPair {
  [currencyPair: string]: LegEntry[];
}

function getExchangeRateDateString(date: Date) {
  return format(date, DATE_FORMAT);
}

export function resolveExchangeRates({
  currencies,
  endDate,
  marketDataRates = [],
  startDate,
  storedRates = [],
  targetCurrency,
  today = new Date()
}: {
  currencies: string[];
  endDate: Date;
  marketDataRates?: ExchangeRateRow[];
  startDate: Date;
  storedRates?: ExchangeRateRow[];
  targetCurrency: string;
  today?: Date;
}): ExchangeRatesWithStatus {
  const result: ExchangeRatesWithStatus = {
    estimatedDates: {},
    missingDates: {},
    rates: {}
  };

  if (!startDate || !endDate) {
    return result;
  }

  const dateStrings = eachDayOfInterval({ end: endDate, start: startDate }).map(
    (date) => {
      return getExchangeRateDateString(date);
    }
  );

  const series = buildSeries({ marketDataRates, storedRates });

  for (const currency of currencies) {
    const currencyPair = `${currency}${targetCurrency}`;

    const values = resolvePair({
      dateStrings,
      series,
      today,
      currencyFrom: currency,
      currencyTo: targetCurrency
    });

    result.rates[currencyPair] = {};
    result.estimatedDates[currencyPair] = [];
    result.missingDates[currencyPair] = [];

    values.forEach(({ isEstimated, isMissing, rate }, index) => {
      const dateString = dateStrings[index];

      if (isMissing) {
        result.missingDates[currencyPair].push(dateString);
      } else {
        result.rates[currencyPair][dateString] = rate;

        if (isEstimated) {
          result.estimatedDates[currencyPair].push(dateString);
        }
      }
    });
  }

  return result;
}

function buildSeries({
  marketDataRates,
  storedRates
}: {
  marketDataRates: ExchangeRateRow[];
  storedRates: ExchangeRateRow[];
}): SeriesByPair {
  const entriesByPair: {
    [currencyPair: string]: { [dateString: string]: LegEntry };
  } = {};

  // Stored rates are added last so they take precedence over market data
  const rowsWithPrecedence: ExchangeRateRow[] = [
    ...marketDataRates,
    ...storedRates.map((row) => {
      return { ...row, isCarriedForward: false };
    })
  ];

  for (const row of rowsWithPrecedence) {
    if (!Number.isFinite(row.rate) || row.rate <= 0) {
      continue;
    }

    const currencyPair = `${row.currencyFrom}${row.currencyTo}`;
    const dateString = getExchangeRateDateString(row.date);

    entriesByPair[currencyPair] ??= {};
    entriesByPair[currencyPair][dateString] = {
      dateString,
      isCarriedForward: row.isCarriedForward ?? false,
      rate: row.rate
    };
  }

  const series: SeriesByPair = {};

  for (const currencyPair of Object.keys(entriesByPair)) {
    series[currencyPair] = Object.values(entriesByPair[currencyPair]).sort(
      (a, b) => {
        return a.dateString.localeCompare(b.dateString);
      }
    );
  }

  return series;
}

function getDerivedFactor(currencyFrom: string, currencyTo: string) {
  for (const { currency, factor, rootCurrency } of DERIVED_CURRENCIES) {
    if (currencyFrom === currency && currencyTo === rootCurrency) {
      return 1 / factor;
    }

    if (currencyFrom === rootCurrency && currencyTo === currency) {
      return factor;
    }
  }

  return undefined;
}

function getLegEntries(
  series: SeriesByPair,
  currencyFrom: string,
  currencyTo: string
): LegEntry[] | undefined {
  const direct = series[`${currencyFrom}${currencyTo}`];

  if (direct) {
    return direct;
  }

  const inverse = series[`${currencyTo}${currencyFrom}`];

  return inverse?.map((entry) => {
    return {
      ...entry,
      // Same arithmetic as the existing lookup so that results are identical
      rate: 1 / entry.rate
    };
  });
}

function resolveConstant(dateStrings: string[], rate: number): LegValue[] {
  return dateStrings.map(() => {
    return { rate, isEstimated: false, isMissing: false };
  });
}

function resolveLeg({
  dateStrings,
  entries,
  today
}: {
  dateStrings: string[];
  entries: LegEntry[] | undefined;
  today: Date;
}): LegValue[] {
  if (!entries || entries.length === 0) {
    return dateStrings.map(() => {
      return { isEstimated: false, isMissing: true };
    });
  }

  const todayString = getExchangeRateDateString(today);

  let index = 0;
  let previous: LegEntry | undefined;

  return dateStrings.map((dateString) => {
    while (index < entries.length && entries[index].dateString < dateString) {
      previous = entries[index];
      index += 1;
    }

    const exact =
      entries[index]?.dateString === dateString ? entries[index] : undefined;

    const entry = exact ?? previous;

    if (!entry) {
      return { isEstimated: false, isMissing: true };
    }

    if (dateString >= todayString) {
      // The close of today is usually not available yet. The latest rate is
      // only considered an estimate when it is older than a long weekend or
      // a holiday.
      const age = differenceInCalendarDays(today, parseISO(entry.dateString));

      return {
        isEstimated: age > EXCHANGE_RATE_TODAY_STALENESS_IN_DAYS,
        isMissing: false,
        rate: entry.rate
      };
    }

    return {
      isEstimated: !exact || exact.isCarriedForward,
      isMissing: false,
      rate: entry.rate
    };
  });
}

function resolvePair({
  currencyFrom,
  currencyTo,
  dateStrings,
  series,
  today
}: {
  currencyFrom: string;
  currencyTo: string;
  dateStrings: string[];
  series: SeriesByPair;
  today: Date;
}): LegValue[] {
  if (currencyFrom === currencyTo) {
    return resolveConstant(dateStrings, 1);
  }

  const derivedFactor = getDerivedFactor(currencyFrom, currencyTo);

  if (derivedFactor !== undefined) {
    return resolveConstant(dateStrings, derivedFactor);
  }

  const directEntries = getLegEntries(series, currencyFrom, currencyTo);

  if (directEntries?.length > 0) {
    return resolveLeg({ dateStrings, today, entries: directEntries });
  }

  // Calculate indirectly via the default currency
  const legFrom = resolveCurrencyAgainstDefault({
    dateStrings,
    series,
    today,
    currency: currencyFrom
  });

  const legTo = resolveCurrencyAgainstDefault({
    dateStrings,
    series,
    today,
    currency: currencyTo
  });

  return dateStrings.map((_, index) => {
    const from = legFrom[index];
    const to = legTo[index];

    if (from.isMissing || to.isMissing) {
      return { isEstimated: false, isMissing: true };
    }

    // Same arithmetic as the existing lookup so that results are identical
    const rate = (1 / from.rate) * to.rate;

    if (!Number.isFinite(rate) || rate <= 0) {
      return { isEstimated: false, isMissing: true };
    }

    return {
      rate,
      isEstimated: from.isEstimated || to.isEstimated,
      isMissing: false
    };
  });
}

function resolveCurrencyAgainstDefault({
  currency,
  dateStrings,
  series,
  today
}: {
  currency: string;
  dateStrings: string[];
  series: SeriesByPair;
  today: Date;
}): LegValue[] {
  if (currency === DEFAULT_CURRENCY) {
    return resolveConstant(dateStrings, 1);
  }

  return resolveLeg({
    dateStrings,
    today,
    entries: getLegEntries(series, DEFAULT_CURRENCY, currency)
  });
}
