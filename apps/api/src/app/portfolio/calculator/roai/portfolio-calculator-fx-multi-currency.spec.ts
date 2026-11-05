import {
  activityDummyData,
  assetProfileDummyData,
  userDummyData
} from '@ghostfolio/api/app/portfolio/calculator/portfolio-calculator-test-utils';
import { PortfolioCalculatorFactory } from '@ghostfolio/api/app/portfolio/calculator/portfolio-calculator.factory';
import { CurrentRateService } from '@ghostfolio/api/app/portfolio/current-rate.service';
import { CurrentRateServiceMock } from '@ghostfolio/api/app/portfolio/current-rate.service.mock';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.service';
import { PortfolioSnapshotService } from '@ghostfolio/api/services/queues/portfolio-snapshot/portfolio-snapshot.service';
import { PortfolioSnapshotServiceMock } from '@ghostfolio/api/services/queues/portfolio-snapshot/portfolio-snapshot.service.mock';
import { RedisCacheService } from '@ghostfolio/api/services/redis-cache/redis-cache.service';
import { RedisCacheServiceMock } from '@ghostfolio/api/services/redis-cache/redis-cache.service.mock';
import { UpdateUserSettingDto } from '@ghostfolio/common/dtos';
import { DATE_FORMAT, parseDate } from '@ghostfolio/common/helper';
import { Activity } from '@ghostfolio/common/interfaces';
import { PerformanceCalculationType } from '@ghostfolio/common/types/performance-calculation-type.type';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { eachDayOfInterval, format } from 'date-fns';

jest.mock('@ghostfolio/api/app/portfolio/current-rate.service', () => {
  return {
    CurrentRateService: jest.fn().mockImplementation(() => {
      return CurrentRateServiceMock;
    })
  };
});

jest.mock(
  '@ghostfolio/api/services/queues/portfolio-snapshot/portfolio-snapshot.service',
  () => {
    return {
      PortfolioSnapshotService: jest.fn().mockImplementation(() => {
        return PortfolioSnapshotServiceMock;
      })
    };
  }
);

jest.mock('@ghostfolio/api/services/redis-cache/redis-cache.service', () => {
  return {
    RedisCacheService: jest.fn().mockImplementation(() => {
      return RedisCacheServiceMock;
    })
  };
});

interface RateMap {
  [date: string]: number;
}

function dailyRates({
  end = '2021-12-20',
  rate,
  start = '2021-11-01'
}: {
  end?: string;
  rate: (dateString: string) => number;
  start?: string;
}) {
  const rates: RateMap = {};

  for (const date of eachDayOfInterval({
    end: parseDate(end),
    start: parseDate(start)
  })) {
    const dateString = format(date, DATE_FORMAT);

    rates[dateString] = rate(dateString);
  }

  return rates;
}

function createActivity({
  currency,
  date,
  quantity,
  symbol,
  unitPrice
}: {
  currency: string;
  date: string;
  quantity: number;
  symbol: string;
  unitPrice: number;
}): Activity {
  return {
    ...activityDummyData,
    date: parseDate(date),
    quantity,
    tags: [],
    type: 'BUY',
    assetProfile: {
      ...assetProfileDummyData,
      currency,
      dataSource: 'YAHOO',
      name: symbol,
      symbol
    },
    feeInAssetProfileCurrency: 0,
    feeInBaseCurrency: 0,
    unitPriceInAssetProfileCurrency: unitPrice
  } as Activity;
}

describe('PortfolioCalculator with multiple currencies', () => {
  let configurationService: ConfigurationService;
  let currentRateService: CurrentRateService;
  let portfolioSnapshotService: PortfolioSnapshotService;
  let redisCacheService: RedisCacheService;

  beforeEach(() => {
    PortfolioSnapshotServiceMock.reset();
    RedisCacheServiceMock.reset();

    configurationService = new ConfigurationService();
    currentRateService = new CurrentRateService(null, null, null);
    portfolioSnapshotService = new PortfolioSnapshotService(null, null);
    redisCacheService = new RedisCacheService(null, null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function createExchangeRateDataServiceDouble({
    estimatedDates = {},
    isEnabled,
    missingDates = {},
    rates
  }: {
    estimatedDates?: { [currencyPair: string]: string[] };
    isEnabled: boolean;
    missingDates?: { [currencyPair: string]: string[] };
    rates: { [currencyPair: string]: RateMap };
  }) {
    return {
      getExchangeRatesByCurrency: jest.fn().mockResolvedValue(rates),
      getExchangeRatesByCurrencyWithStatus: jest
        .fn()
        .mockResolvedValue({ estimatedDates, missingDates, rates }),
      isHistoricalFxEnabled: jest.fn().mockResolvedValue(isEnabled)
    };
  }

  async function computeSnapshot({
    activities,
    currency = 'USD',
    exchangeRateDataService,
    today = '2021-12-18'
  }: {
    activities: Activity[];
    currency?: string;
    exchangeRateDataService: ReturnType<
      typeof createExchangeRateDataServiceDouble
    >;
    today?: string;
  }) {
    jest.useFakeTimers().setSystemTime(parseDate(today).getTime());

    const portfolioCalculatorFactory = new PortfolioCalculatorFactory(
      configurationService,
      currentRateService,
      exchangeRateDataService as unknown as ExchangeRateDataService,
      portfolioSnapshotService,
      redisCacheService
    );

    const portfolioCalculator = portfolioCalculatorFactory.createCalculator({
      activities,
      currency,
      calculationType: PerformanceCalculationType.ROAI,
      userId: userDummyData.id
    });

    return portfolioCalculator.computeSnapshot();
  }

  const chfBuy = createActivity({
    currency: 'CHF',
    date: '2021-11-30',
    quantity: 2,
    symbol: 'BALN.SW',
    unitPrice: 136.6
  });

  // 1 CHF is 1.10 USD until 2021-12-10 and 1.12 USD afterwards
  const chfToUsd = (dateString: string) => {
    return dateString <= '2021-12-10' ? 1.1 : 1.12;
  };

  describe('with the historical FX flag on', () => {
    it('converts the investment at the rate of the activity date and the value at the latest rate', async () => {
      const exchangeRateDataService = createExchangeRateDataServiceDouble({
        isEnabled: true,
        rates: { CHFUSD: dailyRates({ rate: chfToUsd }) }
      });

      const snapshot = await computeSnapshot({
        exchangeRateDataService,
        activities: [chfBuy]
      });

      const [position] = snapshot.positions;

      expect(
        exchangeRateDataService.isHistoricalFxEnabled
      ).toHaveBeenCalledWith(userDummyData.id);
      expect(
        exchangeRateDataService.getExchangeRatesByCurrency
      ).not.toHaveBeenCalled();

      // 2 * 136.6 * 1.10 (rate on 2021-11-30)
      expect(position.investmentWithCurrencyEffect.toNumber()).toBeCloseTo(
        300.52,
        6
      );
      // 2 * 148.9 (closing price on 2021-12-18) * 1.12 (latest rate)
      expect(position.valueInBaseCurrency.toNumber()).toBeCloseTo(333.536, 6);
      expect(snapshot.fxWarnings).toEqual([]);
      expect(snapshot.errors).toEqual([]);
      expect(snapshot.hasErrors).toBe(false);
    });

    it('keeps the investment unchanged when the latest rate moves after the activity', async () => {
      const run = async (latestRate: number) => {
        const exchangeRateDataService = createExchangeRateDataServiceDouble({
          isEnabled: true,
          rates: {
            CHFUSD: dailyRates({
              rate: (dateString) => {
                return dateString <= '2021-12-10' ? 1.1 : latestRate;
              }
            })
          }
        });

        const snapshot = await computeSnapshot({
          exchangeRateDataService,
          activities: [chfBuy]
        });

        return snapshot.positions[0];
      };

      const before = await run(1.12);
      const after = await run(1.2);

      expect(after.investmentWithCurrencyEffect.toNumber()).toBeCloseTo(
        before.investmentWithCurrencyEffect.toNumber(),
        6
      );
      expect(after.investmentWithCurrencyEffect.toNumber()).toBeCloseTo(
        300.52,
        6
      );
      // 2 * 148.9 * 1.20
      expect(after.valueInBaseCurrency.toNumber()).toBeCloseTo(357.36, 6);
      expect(before.valueInBaseCurrency.toNumber()).toBeCloseTo(333.536, 6);
    });

    it('flags an estimated rate on the date of an activity and ignores estimated dates which are not used', async () => {
      const saturdayBuy = createActivity({
        currency: 'CHF',
        date: '2021-12-04',
        quantity: 1,
        symbol: 'BALN.SW',
        unitPrice: 140
      });

      const exchangeRateDataService = createExchangeRateDataServiceDouble({
        estimatedDates: { CHFUSD: ['2021-12-04', '2021-12-05'] },
        isEnabled: true,
        rates: { CHFUSD: dailyRates({ rate: chfToUsd }) }
      });

      const snapshot = await computeSnapshot({
        exchangeRateDataService,
        activities: [saturdayBuy]
      });

      expect(snapshot.fxWarnings).toEqual([
        {
          currencyFrom: 'CHF',
          currencyTo: 'USD',
          date: '2021-12-04',
          type: 'ESTIMATED'
        }
      ]);
      expect(snapshot.positions).toHaveLength(1);
      expect(snapshot.errors).toEqual([]);
    });

    it('leaves a holding without any rate out of all totals, reports it, and never converts it at 1', async () => {
      const usdBuy = createActivity({
        currency: 'USD',
        date: '2021-12-12',
        quantity: 1,
        symbol: 'BTCUSD',
        unitPrice: 50000
      });

      // BTCUSD has a mocked closing price of 43099.7 on this date
      const today = '2022-01-14';
      const end = '2022-01-20';

      const exchangeRateDataService = createExchangeRateDataServiceDouble({
        isEnabled: true,
        missingDates: {
          CHFUSD: Object.keys(dailyRates({ end, rate: () => 1 }))
        },
        rates: { USDUSD: dailyRates({ end, rate: () => 1 }) }
      });

      const snapshot = await computeSnapshot({
        exchangeRateDataService,
        today,
        activities: [chfBuy, usdBuy]
      });

      expect(snapshot.positions.map(({ symbol }) => symbol)).toEqual([
        'BTCUSD'
      ]);
      expect(snapshot.errors).toEqual([
        { dataSource: 'YAHOO', symbol: 'BALN.SW' }
      ]);
      expect(snapshot.hasErrors).toBe(true);
      // Only the USD holding is counted; the CHF holding is not added at 1:1
      expect(snapshot.currentValueInBaseCurrency.toNumber()).toBeCloseTo(
        43099.7,
        6
      );
      expect(snapshot.totalInvestment.toNumber()).toBeCloseTo(50000, 6);
      expect(snapshot.fxWarnings).toEqual(
        expect.arrayContaining([
          {
            currencyFrom: 'CHF',
            currencyTo: 'USD',
            date: '2021-11-30',
            type: 'MISSING'
          },
          {
            currencyFrom: 'CHF',
            currencyTo: 'USD',
            date: '2022-01-14',
            type: 'MISSING'
          }
        ])
      );
      // The chart is built from the USD holding only
      expect(snapshot.historicalData.at(-1).netWorth).toBeCloseTo(43099.7, 6);
      expect(snapshot.historicalData.at(-1).totalInvestment).toBeCloseTo(
        50000,
        6
      );
    });

    it('de-duplicates warnings of several activities on the same date', async () => {
      const sameDate = [
        createActivity({
          currency: 'CHF',
          date: '2021-12-04',
          quantity: 1,
          symbol: 'BALN.SW',
          unitPrice: 140
        }),
        createActivity({
          currency: 'CHF',
          date: '2021-12-04',
          quantity: 2,
          symbol: 'BALN.SW',
          unitPrice: 141
        })
      ];

      const exchangeRateDataService = createExchangeRateDataServiceDouble({
        estimatedDates: { CHFUSD: ['2021-12-04'] },
        isEnabled: true,
        rates: { CHFUSD: dailyRates({ rate: chfToUsd }) }
      });

      const snapshot = await computeSnapshot({
        exchangeRateDataService,
        activities: sameDate
      });

      expect(snapshot.fxWarnings).toHaveLength(1);
    });

    it('caps the number of warnings at 100 and keeps them sorted by date', async () => {
      const activities = Array.from({ length: 120 }, (_, index) => {
        return createActivity({
          currency: 'CHF',
          date: format(new Date(Date.UTC(2021, 7, 1 + index)), DATE_FORMAT),
          quantity: 1,
          symbol: 'BALN.SW',
          unitPrice: 140
        });
      });

      const estimated = activities.map(({ date }) => {
        return format(date, DATE_FORMAT);
      });

      const exchangeRateDataService = createExchangeRateDataServiceDouble({
        estimatedDates: { CHFUSD: estimated },
        isEnabled: true,
        rates: {
          CHFUSD: dailyRates({ rate: chfToUsd, start: '2021-07-25' })
        }
      });

      const snapshot = await computeSnapshot({
        exchangeRateDataService,
        activities
      });

      expect(snapshot.fxWarnings).toHaveLength(100);

      const dates = snapshot.fxWarnings.map(({ date }) => date);

      expect(dates).toEqual([...dates].sort());
      expect(dates[0]).toBe('2021-08-01');
    });

    it('re-expresses all values when the base currency changes', async () => {
      const inUsd = await computeSnapshot({
        activities: [chfBuy],
        exchangeRateDataService: createExchangeRateDataServiceDouble({
          isEnabled: true,
          rates: { CHFUSD: dailyRates({ rate: chfToUsd }) }
        })
      });

      const inChf = await computeSnapshot({
        activities: [chfBuy],
        currency: 'CHF',
        exchangeRateDataService: createExchangeRateDataServiceDouble({
          isEnabled: true,
          rates: { CHFCHF: dailyRates({ rate: () => 1 }) }
        })
      });

      expect(
        inUsd.positions[0].investmentWithCurrencyEffect.toNumber()
      ).toBeCloseTo(300.52, 6);
      // 2 * 136.6
      expect(
        inChf.positions[0].investmentWithCurrencyEffect.toNumber()
      ).toBeCloseTo(273.2, 6);
      // 2 * 148.9
      expect(inChf.positions[0].valueInBaseCurrency.toNumber()).toBeCloseTo(
        297.8,
        6
      );
    });
  });

  describe('with the historical FX flag off', () => {
    it('uses the existing rate lookup, never the new one, and adds no warnings field', async () => {
      const exchangeRateDataService = createExchangeRateDataServiceDouble({
        isEnabled: false,
        rates: { CHFUSD: dailyRates({ rate: chfToUsd }) }
      });

      const snapshot = await computeSnapshot({
        exchangeRateDataService,
        activities: [chfBuy]
      });

      expect(
        exchangeRateDataService.getExchangeRatesByCurrency
      ).toHaveBeenCalledTimes(1);
      expect(
        exchangeRateDataService.getExchangeRatesByCurrencyWithStatus
      ).not.toHaveBeenCalled();
      expect('fxWarnings' in snapshot).toBe(false);
    });

    it('produces the same values as the flag on when every rate is available', async () => {
      const rates = { CHFUSD: dailyRates({ rate: chfToUsd }) };

      const flagOff = await computeSnapshot({
        activities: [chfBuy],
        exchangeRateDataService: createExchangeRateDataServiceDouble({
          rates,
          isEnabled: false
        })
      });

      const flagOn = await computeSnapshot({
        activities: [chfBuy],
        exchangeRateDataService: createExchangeRateDataServiceDouble({
          rates,
          isEnabled: true
        })
      });

      expect(flagOn.positions).toEqual(flagOff.positions);
      expect(flagOn.historicalData).toEqual(flagOff.historicalData);
      expect(flagOn.currentValueInBaseCurrency).toEqual(
        flagOff.currentValueInBaseCurrency
      );
      expect(flagOn.errors).toEqual(flagOff.errors);
    });
  });

  describe('base currency validation', () => {
    it('rejects a base currency which is not an ISO 4217 code', async () => {
      const errors = await validate(
        plainToInstance(UpdateUserSettingDto, { baseCurrency: 'ZZZ' })
      );

      expect(errors.map(({ property }) => property)).toContain('baseCurrency');
    });

    it.each(['USD', 'EUR', 'GBP', 'CHF'])(
      'accepts %s',
      async (baseCurrency) => {
        const errors = await validate(
          plainToInstance(UpdateUserSettingDto, { baseCurrency })
        );

        expect(errors).toHaveLength(0);
      }
    );
  });

  describe('with 500 holdings in four currencies', () => {
    it('completes without a pathological slowdown', async () => {
      const currencies = ['USD', 'EUR', 'GBP', 'CHF'];

      const activities = Array.from({ length: 500 }, (_, index) => {
        return createActivity({
          currency: currencies[index % currencies.length],
          date: '2021-12-01',
          quantity: 1,
          symbol: `SYMBOL${index}`,
          unitPrice: 10
        });
      });

      const exchangeRateDataService = createExchangeRateDataServiceDouble({
        isEnabled: true,
        rates: {
          CHFUSD: dailyRates({ rate: () => 1.1 }),
          EURUSD: dailyRates({ rate: () => 1.2 }),
          GBPUSD: dailyRates({ rate: () => 1.3 }),
          USDUSD: dailyRates({ rate: () => 1 })
        }
      });

      const start = Date.now();

      const snapshot = await computeSnapshot({
        activities,
        exchangeRateDataService
      });

      // The requirement is 2 s at p95; this guard only catches an order of
      // magnitude regression because wall-clock time varies between machines
      expect(Date.now() - start).toBeLessThan(15000);
      // The invented symbols have no mocked market price, which the existing
      // error path reports. None of the holdings is excluded for a missing
      // exchange rate.
      expect(snapshot.positions).toHaveLength(500);
      expect(snapshot.fxWarnings).toEqual([]);
    });
  });
});
