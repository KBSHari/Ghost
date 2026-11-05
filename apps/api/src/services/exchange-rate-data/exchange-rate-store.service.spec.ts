import { Logger } from '@nestjs/common';
import { DataSource } from '@prisma/client';

import {
  ExchangeRateStoreService,
  ObservedExchangeRate
} from './exchange-rate-store.service';

describe('ExchangeRateStoreService', () => {
  let exchangeRateStoreService: ExchangeRateStoreService;
  let findMany: jest.Mock;
  let transaction: jest.Mock;
  let upsert: jest.Mock;

  const validRow: ObservedExchangeRate = {
    currencyFrom: 'USD',
    currencyTo: 'EUR',
    date: new Date('2026-03-02T15:30:00.000Z'),
    rate: 0.92,
    source: DataSource.YAHOO
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    findMany = jest.fn().mockResolvedValue([]);
    upsert = jest.fn((args) => args);
    transaction = jest.fn((operations) => Promise.resolve(operations));

    exchangeRateStoreService = new ExchangeRateStoreService({
      $transaction: transaction,
      exchangeRate: { findMany, upsert }
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('upsertObserved', () => {
    it.each([
      ['zero', 0],
      ['negative', -1.5],
      ['NaN', NaN],
      ['infinite', Infinity]
    ])('rejects a %s rate and persists nothing', async (_, rate) => {
      const result = await exchangeRateStoreService.upsertObserved([
        { ...validRow, rate }
      ]);

      expect(result).toEqual({ rejected: 1, written: 0 });
      expect(transaction).not.toHaveBeenCalled();
      expect(upsert).not.toHaveBeenCalled();
    });

    it.each([
      ['an unknown currency code', { currencyTo: 'ZZZ' }],
      ['a lowercase currency code', { currencyFrom: 'usd' }],
      ['identical currencies', { currencyTo: 'USD' }],
      ['an invalid date', { date: new Date('not-a-date') }]
    ])('rejects a row with %s', async (_, override) => {
      const result = await exchangeRateStoreService.upsertObserved([
        { ...validRow, ...override }
      ]);

      expect(result).toEqual({ rejected: 1, written: 0 });
      expect(upsert).not.toHaveBeenCalled();
    });

    it('writes a valid row keyed by pair, source and start of the UTC day', async () => {
      const result = await exchangeRateStoreService.upsertObserved([validRow]);

      const startOfUtcDay = new Date('2026-03-02T00:00:00.000Z');

      expect(result).toEqual({ rejected: 0, written: 1 });
      expect(upsert).toHaveBeenCalledWith({
        create: {
          currencyFrom: 'USD',
          currencyTo: 'EUR',
          date: startOfUtcDay,
          rate: 0.92,
          source: DataSource.YAHOO
        },
        update: { rate: 0.92 },
        where: {
          currencyFrom_currencyTo_date_source: {
            currencyFrom: 'USD',
            currencyTo: 'EUR',
            date: startOfUtcDay,
            source: DataSource.YAHOO
          }
        }
      });
    });

    it('uses the same unique key when the same row is written twice', async () => {
      await exchangeRateStoreService.upsertObserved([validRow]);
      await exchangeRateStoreService.upsertObserved([
        { ...validRow, date: new Date('2026-03-02T01:00:00.000Z'), rate: 0.93 }
      ]);

      expect(upsert).toHaveBeenCalledTimes(2);
      expect(upsert.mock.calls[0][0].where).toEqual(
        upsert.mock.calls[1][0].where
      );
      expect(upsert.mock.calls[1][0].update).toEqual({ rate: 0.93 });
    });

    it('writes more than 500 rows in batches of at most 500', async () => {
      const rows = Array.from({ length: 1201 }, (_, index) => {
        return {
          ...validRow,
          date: new Date(Date.UTC(2020, 0, 1 + index)),
          rate: 0.9 + index / 100000
        };
      });

      const result = await exchangeRateStoreService.upsertObserved(rows);

      expect(result).toEqual({ rejected: 0, written: 1201 });
      expect(transaction).toHaveBeenCalledTimes(3);
      expect(
        transaction.mock.calls.map(([operations]) => operations.length)
      ).toEqual([500, 500, 201]);
    });

    it('writes the valid rows and counts the rejected ones in a mixed list', async () => {
      const result = await exchangeRateStoreService.upsertObserved([
        validRow,
        { ...validRow, rate: -1 },
        { ...validRow, currencyTo: 'CHF' }
      ]);

      expect(result).toEqual({ rejected: 1, written: 2 });
    });

    it('does not call the database for an empty list', async () => {
      const result = await exchangeRateStoreService.upsertObserved([]);

      expect(result).toEqual({ rejected: 0, written: 0 });
      expect(transaction).not.toHaveBeenCalled();
    });

    it('propagates a database failure', async () => {
      transaction.mockRejectedValueOnce(new Error('database unavailable'));

      await expect(
        exchangeRateStoreService.upsertObserved([validRow])
      ).rejects.toThrow('database unavailable');
    });

    it('logs only the number of rejected rows and never the rate values', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      await exchangeRateStoreService.upsertObserved([
        { ...validRow, rate: -123.456 }
      ]);

      expect(warn).toHaveBeenCalledTimes(1);

      const message = String(warn.mock.calls[0][0]);

      expect(message).toMatch(/Rejected 1 invalid exchange rate rows/);
      expect(message).not.toContain('123.456');
    });
  });

  describe('getRange', () => {
    it('returns an empty list without querying when no pairs are requested', async () => {
      const result = await exchangeRateStoreService.getRange({
        currencyPairs: [],
        endDate: new Date('2026-03-31T00:00:00.000Z'),
        startDate: new Date('2026-03-01T00:00:00.000Z')
      });

      expect(result).toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('queries all requested pairs for the date range and source in one call', async () => {
      await exchangeRateStoreService.getRange({
        currencyPairs: [
          { currencyFrom: 'USD', currencyTo: 'EUR' },
          { currencyFrom: 'USD', currencyTo: 'CHF' }
        ],
        endDate: new Date('2026-03-31T00:00:00.000Z'),
        source: DataSource.YAHOO,
        startDate: new Date('2026-03-01T12:00:00.000Z')
      });

      expect(findMany).toHaveBeenCalledTimes(1);
      expect(findMany).toHaveBeenCalledWith({
        orderBy: [{ date: 'asc' }],
        where: {
          source: DataSource.YAHOO,
          date: {
            gte: new Date('2026-03-01T00:00:00.000Z'),
            lte: new Date('2026-03-31T00:00:00.000Z')
          },
          OR: [
            { currencyFrom: 'USD', currencyTo: 'EUR' },
            { currencyFrom: 'USD', currencyTo: 'CHF' }
          ]
        }
      });
    });

    it('propagates a database failure to the caller', async () => {
      findMany.mockRejectedValueOnce(new Error('database unavailable'));

      await expect(
        exchangeRateStoreService.getRange({
          currencyPairs: [{ currencyFrom: 'USD', currencyTo: 'EUR' }],
          endDate: new Date('2026-03-31T00:00:00.000Z'),
          startDate: new Date('2026-03-01T00:00:00.000Z')
        })
      ).rejects.toThrow('database unavailable');
    });
  });
});
