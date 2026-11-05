/**
 * @jest-environment <rootDir>/jest-environment-tz.js
 * @jest-environment-options {"timeZone": "America/New_York"}
 */
import { resolveExchangeRates } from './exchange-rate-resolver';

describe('resolveExchangeRates in a time zone behind UTC', () => {
  const today = new Date(2026, 5, 30);

  it('keys a start-of-UTC-day row by the same date as the existing daily rate lookup', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['USD'],
      endDate: new Date(2026, 2, 1),
      startDate: new Date(2026, 2, 1),
      storedRates: [
        {
          currencyFrom: 'USD',
          currencyTo: 'EUR',
          date: new Date('2026-03-02T00:00:00.000Z'),
          rate: 0.92
        }
      ],
      targetCurrency: 'EUR'
    });

    // 2026-03-02 00:00 UTC is 2026-03-01 19:00 in New York, which is the key
    // `getExchangeRates` produces for the same `MarketData` row
    expect(result.rates.USDEUR).toEqual({ '2026-03-01': 0.92 });
    expect(result.estimatedDates.USDEUR).toEqual([]);
    expect(result.missingDates.USDEUR).toEqual([]);
  });

  it('lets a stored row and a market data row of the same UTC day share one key', () => {
    const date = new Date('2026-03-02T00:00:00.000Z');

    const result = resolveExchangeRates({
      today,
      currencies: ['USD'],
      endDate: new Date(2026, 2, 1),
      marketDataRates: [
        { date, currencyFrom: 'USD', currencyTo: 'EUR', rate: 0.9 }
      ],
      startDate: new Date(2026, 2, 1),
      storedRates: [
        { date, currencyFrom: 'USD', currencyTo: 'EUR', rate: 0.95 }
      ],
      targetCurrency: 'EUR'
    });

    expect(result.rates.USDEUR).toEqual({ '2026-03-01': 0.95 });
  });

  it('produces consecutive keys for consecutive UTC days without gaps or estimates', () => {
    const result = resolveExchangeRates({
      today,
      currencies: ['USD'],
      endDate: new Date(2026, 2, 3),
      startDate: new Date(2026, 2, 1),
      storedRates: [
        '2026-03-02T00:00:00.000Z',
        '2026-03-03T00:00:00.000Z',
        '2026-03-04T00:00:00.000Z'
      ].map((date, index) => {
        return {
          currencyFrom: 'USD',
          currencyTo: 'EUR',
          date: new Date(date),
          rate: 0.92 + index / 100
        };
      }),
      targetCurrency: 'EUR'
    });

    expect(Object.keys(result.rates.USDEUR)).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03'
    ]);
    expect(result.estimatedDates.USDEUR).toEqual([]);
    expect(result.missingDates.USDEUR).toEqual([]);
  });
});
