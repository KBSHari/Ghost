import {
  EXCHANGE_RATE_TODAY_STALENESS_IN_DAYS,
  ExchangeRateRow,
  resolveExchangeRates
} from './exchange-rate-resolver';

function day(dateString: string) {
  const [year, month, dayOfMonth] = dateString.split('-').map(Number);

  return new Date(year, month - 1, dayOfMonth);
}

function row(
  currencyFrom: string,
  currencyTo: string,
  dateString: string,
  rate: number,
  isCarriedForward = false
): ExchangeRateRow {
  return {
    currencyFrom,
    currencyTo,
    isCarriedForward,
    rate,
    date: day(dateString)
  };
}

describe('resolveExchangeRates', () => {
  const today = day('2026-06-30');

  it('returns 1 for the same currency without any data', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['USD'],
      endDate: day('2026-03-03'),
      startDate: day('2026-03-02'),
      targetCurrency: 'USD'
    });

    expect(result.rates.USDUSD).toEqual({ '2026-03-02': 1, '2026-03-03': 1 });
    expect(result.estimatedDates.USDUSD).toEqual([]);
    expect(result.missingDates.USDUSD).toEqual([]);
  });

  it('returns observed rates without flags when every day has a rate', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['USD'],
      endDate: day('2026-03-03'),
      startDate: day('2026-03-02'),
      storedRates: [
        row('USD', 'EUR', '2026-03-02', 0.92),
        row('USD', 'EUR', '2026-03-03', 0.93)
      ],
      targetCurrency: 'EUR'
    });

    expect(result.rates.USDEUR).toEqual({
      '2026-03-02': 0.92,
      '2026-03-03': 0.93
    });
    expect(result.estimatedDates.USDEUR).toEqual([]);
    expect(result.missingDates.USDEUR).toEqual([]);
  });

  it('uses the inverse of a stored rate when only the opposite pair exists', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['USD'],
      endDate: day('2026-03-02'),
      startDate: day('2026-03-02'),
      storedRates: [row('EUR', 'USD', '2026-03-02', 1.25)],
      targetCurrency: 'EUR'
    });

    expect(result.rates.USDEUR['2026-03-02']).toBeCloseTo(0.8, 10);
  });

  // The existing lookup calculates (1 / a) * b and 1 / a. The same arithmetic
  // keeps the results identical down to the last bit.
  it('calculates an inverse rate with the same arithmetic as the existing lookup', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['USD'],
      endDate: day('2026-03-02'),
      startDate: day('2026-03-02'),
      storedRates: [row('EUR', 'USD', '2026-03-02', 0.7432)],
      targetCurrency: 'EUR'
    });

    expect(result.rates.USDEUR['2026-03-02']).toBe(1 / 0.7432);
  });

  it('calculates a cross rate with the same arithmetic as the existing lookup', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['GBP'],
      endDate: day('2026-03-02'),
      startDate: day('2026-03-02'),
      storedRates: [
        row('USD', 'GBP', '2026-03-02', 0.942),
        row('USD', 'CHF', '2026-03-02', 1.011)
      ],
      targetCurrency: 'CHF'
    });

    expect(result.rates.GBPCHF['2026-03-02']).toBe((1 / 0.942) * 1.011);
  });

  it('carries the earlier rate forward over a weekend and flags it as estimated', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['USD'],
      endDate: day('2026-03-09'),
      startDate: day('2026-03-06'),
      storedRates: [
        row('USD', 'EUR', '2026-03-06', 0.92),
        row('USD', 'EUR', '2026-03-09', 0.93)
      ],
      targetCurrency: 'EUR'
    });

    expect(result.rates.USDEUR).toEqual({
      '2026-03-06': 0.92,
      '2026-03-07': 0.92,
      '2026-03-08': 0.92,
      '2026-03-09': 0.93
    });
    expect(result.estimatedDates.USDEUR).toEqual(['2026-03-07', '2026-03-08']);
    expect(result.missingDates.USDEUR).toEqual([]);
  });

  it('never fills an earlier date with a later rate', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['USD'],
      endDate: day('2026-03-09'),
      startDate: day('2026-03-06'),
      storedRates: [row('USD', 'EUR', '2026-03-09', 0.93)],
      targetCurrency: 'EUR'
    });

    expect(result.rates.USDEUR).toEqual({ '2026-03-09': 0.93 });
    expect(result.missingDates.USDEUR).toEqual([
      '2026-03-06',
      '2026-03-07',
      '2026-03-08'
    ]);
  });

  it('reports dates before the first rate as missing and never as 1', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['USD'],
      endDate: day('2026-03-06'),
      startDate: day('2026-03-02'),
      storedRates: [row('USD', 'EUR', '2026-03-06', 0.92)],
      targetCurrency: 'EUR'
    });

    expect(result.missingDates.USDEUR).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05'
    ]);
    expect(Object.values(result.rates.USDEUR)).toEqual([0.92]);
  });

  it('reports every date as missing for a currency without any data', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['JPY'],
      endDate: day('2026-03-03'),
      startDate: day('2026-03-02'),
      storedRates: [row('USD', 'EUR', '2026-03-02', 0.92)],
      targetCurrency: 'USD'
    });

    expect(result.rates.JPYUSD).toEqual({});
    expect(result.missingDates.JPYUSD).toEqual(['2026-03-02', '2026-03-03']);
    expect(result.estimatedDates.JPYUSD).toEqual([]);
  });

  it('calculates a cross rate through USD', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['GBP'],
      endDate: day('2026-03-02'),
      startDate: day('2026-03-02'),
      storedRates: [
        row('USD', 'GBP', '2026-03-02', 0.8),
        row('USD', 'CHF', '2026-03-02', 0.9)
      ],
      targetCurrency: 'CHF'
    });

    expect(result.rates.GBPCHF['2026-03-02']).toBeCloseTo(1.125, 10);
    expect(result.estimatedDates.GBPCHF).toEqual([]);
  });

  it('flags a cross rate as estimated when one leg is carried forward', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['GBP'],
      endDate: day('2026-03-06'),
      startDate: day('2026-03-06'),
      storedRates: [
        row('USD', 'GBP', '2026-03-06', 0.8),
        row('USD', 'CHF', '2026-03-05', 0.9)
      ],
      targetCurrency: 'CHF'
    });

    expect(result.rates.GBPCHF['2026-03-06']).toBeCloseTo(1.125, 10);
    expect(result.estimatedDates.GBPCHF).toEqual(['2026-03-06']);
  });

  it('reports a cross rate as missing when one leg has no data', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['GBP'],
      endDate: day('2026-03-02'),
      startDate: day('2026-03-02'),
      storedRates: [row('USD', 'GBP', '2026-03-02', 0.8)],
      targetCurrency: 'CHF'
    });

    expect(result.rates.GBPCHF).toEqual({});
    expect(result.missingDates.GBPCHF).toEqual(['2026-03-02']);
  });

  it('uses the fixed factor of a derived currency without any rows', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['GBp', 'GBP'],
      endDate: day('2026-03-02'),
      startDate: day('2026-03-02'),
      targetCurrency: 'GBP'
    });

    expect(result.rates.GBpGBP['2026-03-02']).toBeCloseTo(0.01, 10);
    expect(result.rates.GBPGBP['2026-03-02']).toBe(1);

    const reverse = resolveExchangeRates({
      today,
      currencies: ['GBP'],
      endDate: day('2026-03-02'),
      startDate: day('2026-03-02'),
      targetCurrency: 'GBp'
    });

    expect(reverse.rates.GBPGBp['2026-03-02']).toBe(100);
  });

  it('keeps a market data rate that has no stored counterpart unflagged', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['USD'],
      endDate: day('2026-03-02'),
      marketDataRates: [row('USD', 'EUR', '2026-03-02', 0.92)],
      startDate: day('2026-03-02'),
      targetCurrency: 'EUR'
    });

    expect(result.rates.USDEUR).toEqual({ '2026-03-02': 0.92 });
    expect(result.estimatedDates.USDEUR).toEqual([]);
  });

  it('flags a carried-forward market data row as estimated and keeps its value', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['USD'],
      endDate: day('2026-03-07'),
      marketDataRates: [
        row('USD', 'EUR', '2026-03-06', 0.92),
        row('USD', 'EUR', '2026-03-07', 0.92, true)
      ],
      startDate: day('2026-03-06'),
      targetCurrency: 'EUR'
    });

    expect(result.rates.USDEUR).toEqual({
      '2026-03-06': 0.92,
      '2026-03-07': 0.92
    });
    expect(result.estimatedDates.USDEUR).toEqual(['2026-03-07']);
  });

  it('prefers a stored rate over a market data rate for the same date', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['USD'],
      endDate: day('2026-03-02'),
      marketDataRates: [row('USD', 'EUR', '2026-03-02', 0.9, true)],
      startDate: day('2026-03-02'),
      storedRates: [row('USD', 'EUR', '2026-03-02', 0.95)],
      targetCurrency: 'EUR'
    });

    expect(result.rates.USDEUR['2026-03-02']).toBe(0.95);
    expect(result.estimatedDates.USDEUR).toEqual([]);
  });

  it('combines stored rates with market data for the dates the store lacks', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['USD'],
      endDate: day('2026-03-03'),
      marketDataRates: [row('USD', 'EUR', '2026-03-03', 0.93)],
      startDate: day('2026-03-02'),
      storedRates: [row('USD', 'EUR', '2026-03-02', 0.92)],
      targetCurrency: 'EUR'
    });

    expect(result.rates.USDEUR).toEqual({
      '2026-03-02': 0.92,
      '2026-03-03': 0.93
    });
    expect(result.estimatedDates.USDEUR).toEqual([]);
  });

  it.each([
    ['zero', 0],
    ['negative', -0.5],
    ['NaN', NaN],
    ['infinite', Infinity]
  ])('ignores a %s rate as if it were absent', (_, rate) => {
    const result = resolveExchangeRates({
      today,
      currencies: ['USD'],
      endDate: day('2026-03-02'),
      startDate: day('2026-03-02'),
      storedRates: [row('USD', 'EUR', '2026-03-02', rate)],
      targetCurrency: 'EUR'
    });

    expect(result.rates.USDEUR).toEqual({});
    expect(result.missingDates.USDEUR).toEqual(['2026-03-02']);
  });

  describe('rate of today', () => {
    it('is not flagged when the latest rate is within the staleness window', () => {
      const result = resolveExchangeRates({
        currencies: ['USD'],
        endDate: day('2026-03-10'),
        startDate: day('2026-03-09'),
        storedRates: [row('USD', 'EUR', '2026-03-07', 0.92)],
        targetCurrency: 'EUR',
        today: day('2026-03-10')
      });

      expect(result.rates.USDEUR).toEqual({
        '2026-03-09': 0.92,
        '2026-03-10': 0.92
      });
      expect(result.estimatedDates.USDEUR).toEqual(['2026-03-09']);
    });

    it('is flagged when the latest rate is older than the staleness window', () => {
      const result = resolveExchangeRates({
        currencies: ['USD'],
        endDate: day('2026-03-10'),
        startDate: day('2026-03-10'),
        storedRates: [row('USD', 'EUR', '2026-03-01', 0.92)],
        targetCurrency: 'EUR',
        today: day('2026-03-10')
      });

      expect(result.rates.USDEUR['2026-03-10']).toBe(0.92);
      expect(result.estimatedDates.USDEUR).toEqual(['2026-03-10']);
    });

    it('is not flagged at exactly the staleness limit', () => {
      const result = resolveExchangeRates({
        currencies: ['USD'],
        endDate: day('2026-03-10'),
        startDate: day('2026-03-10'),
        storedRates: [
          row(
            'USD',
            'EUR',
            `2026-03-${String(10 - EXCHANGE_RATE_TODAY_STALENESS_IN_DAYS).padStart(2, '0')}`,
            0.92
          )
        ],
        targetCurrency: 'EUR',
        today: day('2026-03-10')
      });

      expect(result.estimatedDates.USDEUR).toEqual([]);
    });

    it('reports today as missing when no rate exists at all', () => {
      const result = resolveExchangeRates({
        currencies: ['USD'],
        endDate: day('2026-03-10'),
        startDate: day('2026-03-10'),
        targetCurrency: 'EUR',
        today: day('2026-03-10')
      });

      expect(result.missingDates.USDEUR).toEqual(['2026-03-10']);
    });
  });

  it('returns an empty result when no start date is given', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['USD'],
      endDate: day('2026-03-02'),
      startDate: undefined,
      targetCurrency: 'EUR'
    });

    expect(result).toEqual({
      estimatedDates: {},
      missingDates: {},
      rates: {}
    });
  });

  it('resolves several currencies over ten years', () => {
    const storedRates: ExchangeRateRow[] = [];

    for (let offset = 0; offset < 3650; offset += 1) {
      const date = new Date(2016, 0, 1 + offset);

      for (const currency of ['EUR', 'GBP', 'CHF']) {
        storedRates.push({
          currencyFrom: 'USD',
          currencyTo: currency,
          date,
          rate: 0.9 + offset / 100000
        });
      }
    }

    const result = resolveExchangeRates({
      storedRates,
      today,
      currencies: ['EUR', 'GBP', 'CHF', 'USD'],
      endDate: new Date(2016, 0, 1 + 3649),
      startDate: new Date(2016, 0, 1),
      targetCurrency: 'USD'
    });

    expect(Object.keys(result.rates.EURUSD).length).toBe(3650);
    expect(result.missingDates.EURUSD).toEqual([]);
  });
});
