import { Logger } from '@nestjs/common';
import { DataSource } from '@prisma/client';

import { ExchangeRateDataService } from './exchange-rate-data.service';
import { ExchangeRateStoreService } from './exchange-rate-store.service';

function day(dateString: string) {
  const [year, month, dayOfMonth] = dateString.split('-').map(Number);

  return new Date(year, month - 1, dayOfMonth);
}

describe('ExchangeRateDataService', () => {
  const usdEurMarketData = {
    date: day('2026-03-02'),
    isCarriedForward: false,
    marketPrice: 0.92,
    symbol: 'USDEUR'
  };

  let dataProviderService: { getDataSourceForExchangeRates: jest.Mock };
  let exchangeRateDataService: ExchangeRateDataService;
  let exchangeRateStoreService: { getRange: jest.Mock };
  let findUnique: jest.Mock;
  let marketDataService: { getRange: jest.Mock };
  let warn: jest.SpyInstance;

  function createService({
    prismaService = { settings: { findUnique } },
    store = exchangeRateStoreService
  }: { prismaService?: unknown; store?: unknown } = {}) {
    return new ExchangeRateDataService(
      dataProviderService as any,
      marketDataService as any,
      prismaService as any,
      {} as any,
      store as any
    );
  }

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    dataProviderService = {
      getDataSourceForExchangeRates: jest.fn().mockReturnValue(DataSource.YAHOO)
    };
    exchangeRateStoreService = { getRange: jest.fn().mockResolvedValue([]) };
    findUnique = jest.fn();
    marketDataService = { getRange: jest.fn().mockResolvedValue([]) };

    exchangeRateDataService = createService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('isHistoricalFxEnabled', () => {
    it('is true when experimental features are enabled', async () => {
      findUnique.mockResolvedValue({
        settings: { isExperimentalFeatures: true }
      });

      await expect(
        exchangeRateDataService.isHistoricalFxEnabled('user-id')
      ).resolves.toBe(true);

      expect(findUnique).toHaveBeenCalledWith({
        select: { settings: true },
        where: { userId: 'user-id' }
      });
    });

    it.each([
      ['the setting is false', { settings: { isExperimentalFeatures: false } }],
      ['the setting is missing', { settings: {} }],
      ['the settings JSON is null', { settings: null }],
      ['there is no settings row', null]
    ])('is false when %s', async (_, row) => {
      findUnique.mockResolvedValue(row);

      await expect(
        exchangeRateDataService.isHistoricalFxEnabled('user-id')
      ).resolves.toBe(false);
    });

    it('is false without a user id and does not query', async () => {
      await expect(
        exchangeRateDataService.isHistoricalFxEnabled(undefined)
      ).resolves.toBe(false);

      expect(findUnique).not.toHaveBeenCalled();
    });

    it('is false without throwing or logging when there is no database service', async () => {
      const service = createService({ prismaService: null });

      await expect(service.isHistoricalFxEnabled('user-id')).resolves.toBe(
        false
      );

      expect(warn).not.toHaveBeenCalled();
    });

    it('is false and logs a warning when the query fails', async () => {
      findUnique.mockRejectedValue(new Error('database unavailable'));

      await expect(
        exchangeRateDataService.isHistoricalFxEnabled('user-id')
      ).resolves.toBe(false);

      expect(warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('getExchangeRatesByCurrencyWithStatus', () => {
    it('returns an empty result without a start date', async () => {
      await expect(
        exchangeRateDataService.getExchangeRatesByCurrencyWithStatus({
          currencies: ['EUR'],
          startDate: undefined,
          targetCurrency: 'USD'
        })
      ).resolves.toEqual({ estimatedDates: {}, missingDates: {}, rates: {} });

      expect(exchangeRateStoreService.getRange).not.toHaveBeenCalled();
      expect(marketDataService.getRange).not.toHaveBeenCalled();
    });

    it('reads the store and market data once each for all needed pairs, with a lookback', async () => {
      await exchangeRateDataService.getExchangeRatesByCurrencyWithStatus({
        currencies: ['EUR'],
        endDate: day('2026-03-09'),
        startDate: day('2026-03-06'),
        targetCurrency: 'CHF'
      });

      expect(exchangeRateStoreService.getRange).toHaveBeenCalledTimes(1);
      expect(marketDataService.getRange).toHaveBeenCalledTimes(1);

      const storeArguments = exchangeRateStoreService.getRange.mock.calls[0][0];

      expect(storeArguments.source).toBe(DataSource.YAHOO);
      expect(storeArguments.startDate).toEqual(day('2026-02-04'));
      expect(storeArguments.currencyPairs).toEqual(
        expect.arrayContaining([
          { currencyFrom: 'EUR', currencyTo: 'CHF' },
          { currencyFrom: 'CHF', currencyTo: 'EUR' },
          { currencyFrom: 'USD', currencyTo: 'EUR' },
          { currencyFrom: 'USD', currencyTo: 'CHF' }
        ])
      );

      const marketDataArguments = marketDataService.getRange.mock.calls[0][0];

      expect(marketDataArguments.dateQuery.gte).toEqual(day('2026-02-04'));
      expect(
        marketDataArguments.assetProfileIdentifiers.map(({ symbol }) => symbol)
      ).toEqual(
        expect.arrayContaining(['EURCHF', 'CHFEUR', 'USDEUR', 'USDCHF'])
      );
    });

    it('uses stored rates and carries the earlier rate forward over a weekend', async () => {
      exchangeRateStoreService.getRange.mockResolvedValue([
        {
          currencyFrom: 'USD',
          currencyTo: 'EUR',
          date: day('2026-03-06'),
          rate: 0.92
        },
        {
          currencyFrom: 'USD',
          currencyTo: 'EUR',
          date: day('2026-03-09'),
          rate: 0.93
        }
      ]);

      const result =
        await exchangeRateDataService.getExchangeRatesByCurrencyWithStatus({
          currencies: ['USD'],
          endDate: day('2026-03-09'),
          startDate: day('2026-03-06'),
          targetCurrency: 'EUR'
        });

      expect(result.rates.USDEUR).toEqual({
        '2026-03-06': 0.92,
        '2026-03-07': 0.92,
        '2026-03-08': 0.92,
        '2026-03-09': 0.93
      });
      expect(result.estimatedDates.USDEUR).toEqual([
        '2026-03-07',
        '2026-03-08'
      ]);
    });

    it('returns a market data rate unchanged and unflagged when the store has none', async () => {
      marketDataService.getRange.mockResolvedValue([usdEurMarketData]);

      const result =
        await exchangeRateDataService.getExchangeRatesByCurrencyWithStatus({
          currencies: ['USD'],
          endDate: day('2026-03-02'),
          startDate: day('2026-03-02'),
          targetCurrency: 'EUR'
        });

      expect(result.rates.USDEUR).toEqual({ '2026-03-02': 0.92 });
      expect(result.estimatedDates.USDEUR).toEqual([]);
      expect(result.missingDates.USDEUR).toEqual([]);
    });

    it('falls back to market data and logs a warning when the store cannot be read', async () => {
      exchangeRateStoreService.getRange.mockRejectedValue(
        new Error('database unavailable')
      );
      marketDataService.getRange.mockResolvedValue([usdEurMarketData]);

      const result =
        await exchangeRateDataService.getExchangeRatesByCurrencyWithStatus({
          currencies: ['USD'],
          endDate: day('2026-03-02'),
          startDate: day('2026-03-02'),
          targetCurrency: 'EUR'
        });

      expect(result.rates.USDEUR).toEqual({ '2026-03-02': 0.92 });
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('works without a store service', async () => {
      const service = createService({ store: undefined });

      marketDataService.getRange.mockResolvedValue([usdEurMarketData]);

      const result = await service.getExchangeRatesByCurrencyWithStatus({
        currencies: ['USD'],
        endDate: day('2026-03-02'),
        startDate: day('2026-03-02'),
        targetCurrency: 'EUR'
      });

      expect(result.rates.USDEUR).toEqual({ '2026-03-02': 0.92 });
    });

    it('reports every date as missing and never converts 1:1 when both sources fail', async () => {
      exchangeRateStoreService.getRange.mockRejectedValue(new Error('down'));
      marketDataService.getRange.mockRejectedValue(new Error('down'));

      const result =
        await exchangeRateDataService.getExchangeRatesByCurrencyWithStatus({
          currencies: ['EUR'],
          endDate: day('2026-03-03'),
          startDate: day('2026-03-02'),
          targetCurrency: 'USD'
        });

      expect(result.rates.EURUSD).toEqual({});
      expect(result.missingDates.EURUSD).toEqual(['2026-03-02', '2026-03-03']);
      expect(warn).toHaveBeenCalledTimes(2);
    });

    it('calculates a cross rate from two USD legs held in different sources', async () => {
      exchangeRateStoreService.getRange.mockResolvedValue([
        {
          currencyFrom: 'USD',
          currencyTo: 'GBP',
          date: day('2026-03-02'),
          rate: 0.8
        }
      ]);
      marketDataService.getRange.mockResolvedValue([
        {
          date: day('2026-03-02'),
          isCarriedForward: false,
          marketPrice: 0.9,
          symbol: 'USDCHF'
        }
      ]);

      const result =
        await exchangeRateDataService.getExchangeRatesByCurrencyWithStatus({
          currencies: ['GBP'],
          endDate: day('2026-03-02'),
          startDate: day('2026-03-02'),
          targetCurrency: 'CHF'
        });

      expect(result.rates.GBPCHF['2026-03-02']).toBeCloseTo(1.125, 10);
    });

    it.each(['CHF', 'USD', 'EUR'])(
      'returns exactly the same rates as the existing lookup for market data without gaps (base currency %s)',
      async (targetCurrency) => {
        let seed = 12345;

        const random = () => {
          seed = (seed * 1664525 + 1013904223) % 4294967296;

          return seed / 4294967296;
        };

        const rows = ['USDEUR', 'USDGBP', 'USDCHF'].flatMap((symbol, index) => {
          return Array.from({ length: 60 }, (_, offset) => {
            return {
              symbol,
              date: new Date(2026, 0, 1 + offset),
              isCarriedForward: false,
              marketPrice: 0.7 + index / 10 + random() * 0.1
            };
          });
        });

        marketDataService.getRange.mockImplementation(
          ({ assetProfileIdentifiers, dateQuery }) => {
            const symbols = assetProfileIdentifiers.map(({ symbol }) => symbol);

            return Promise.resolve(
              rows.filter(({ date, symbol }) => {
                return (
                  symbols.includes(symbol) &&
                  date >= dateQuery.gte &&
                  date < dateQuery.lt
                );
              })
            );
          }
        );

        const parameters = {
          targetCurrency,
          currencies: ['EUR', 'GBP', 'CHF', 'USD'],
          endDate: day('2026-02-20'),
          startDate: day('2026-01-10')
        };

        const existing =
          await exchangeRateDataService.getExchangeRatesByCurrency(parameters);

        const { estimatedDates, missingDates, rates } =
          await exchangeRateDataService.getExchangeRatesByCurrencyWithStatus(
            parameters
          );

        for (const currencyPair of Object.keys(rates)) {
          expect(Object.keys(rates[currencyPair])).toHaveLength(42);
          expect(estimatedDates[currencyPair]).toEqual([]);
          expect(missingDates[currencyPair]).toEqual([]);

          for (const [dateString, rate] of Object.entries(
            rates[currencyPair]
          )) {
            expect(rate).toBe(existing[currencyPair][dateString]);
          }
        }
      }
    );
  });

  describe('write access', () => {
    it.each([
      ['ExchangeRateDataService', ExchangeRateDataService],
      ['ExchangeRateStoreService', ExchangeRateStoreService]
    ])(
      '%s is no controller and none of its methods is an HTTP route, so rates are written only by the data-gathering job',
      (_, serviceClass) => {
        expect(Reflect.getMetadata('path', serviceClass)).toBeUndefined();

        for (const name of Object.getOwnPropertyNames(serviceClass.prototype)) {
          expect(
            Reflect.getMetadata('path', serviceClass.prototype[name])
          ).toBeUndefined();
        }
      }
    );
  });

  describe('dependency injection', () => {
    it('declares the store as the fifth, optional dependency so positional construction with four arguments keeps working', () => {
      const parameterTypes = Reflect.getMetadata(
        'design:paramtypes',
        ExchangeRateDataService
      );
      const optionalParameters = Reflect.getMetadata(
        'optional:paramtypes',
        ExchangeRateDataService
      );

      expect(parameterTypes).toHaveLength(5);
      expect(parameterTypes[4]).toBe(ExchangeRateStoreService);
      expect(optionalParameters).toContain(4);
    });
  });

  describe('existing behaviour that must not change', () => {
    it('still returns the unconverted value with an error log when no rate exists', () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      expect(exchangeRateDataService.toCurrency(100, 'EUR', 'CHF')).toBe(100);
      expect(error).toHaveBeenCalledTimes(1);
    });

    it('still returns a factor of 1 for the same currency', () => {
      expect(exchangeRateDataService.toCurrency(100, 'CHF', 'CHF')).toBe(100);
    });
  });
});
