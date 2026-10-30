import type {
  TargetAllocationParameters,
  TargetAllocationTargets
} from '@ghostfolio/common/interfaces';
import { buildRebalancingImportJson } from '@ghostfolio/common/target-allocation/rebalancing-export';
import { UserWithSettings } from '@ghostfolio/common/types';
import {
  AssetClass,
  AssetSubClass,
  DataSource
} from '@ghostfolio/prisma/enums';

import { HttpException, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RebalancingService } from './rebalancing.service';

const PARAMETERS: TargetAllocationParameters = {
  allowFractional: true,
  allowSells: true,
  cashReserveAmount: 0,
  cashReservePercentage: 0,
  driftThreshold: 0,
  flatFee: 0,
  minTradeValue: 0,
  percentageFee: 0
};

const CLASS_TARGETS: TargetAllocationTargets = {
  assetClasses: [
    { assetClass: AssetClass.EQUITY, weight: 60 },
    { assetClass: AssetClass.FIXED_INCOME, weight: 40 }
  ]
};

const USER = {
  id: 'user-1',
  settings: { settings: { baseCurrency: 'USD' } }
} as unknown as UserWithSettings;

function holding({
  assetClass = AssetClass.EQUITY,
  assetSubClass = AssetSubClass.STOCK,
  currency = 'USD',
  marketPrice = 100,
  quantity,
  symbol,
  valueInBaseCurrency
}: {
  assetClass?: AssetClass | null;
  assetSubClass?: AssetSubClass;
  currency?: string;
  marketPrice?: number;
  quantity: number;
  symbol: string;
  valueInBaseCurrency?: number;
}) {
  return {
    marketPrice,
    quantity,
    assetProfile: {
      assetClass,
      assetSubClass,
      currency,
      symbol,
      dataSource: DataSource.YAHOO,
      name: symbol,
      sectors: []
    },
    valueInBaseCurrency: valueInBaseCurrency ?? quantity * marketPrice
  };
}

const AAPL = (aQuantity = 40) =>
  holding({ quantity: aQuantity, symbol: 'AAPL' });
const BND = (aQuantity = 40) =>
  holding({
    assetClass: AssetClass.FIXED_INCOME,
    assetSubClass: AssetSubClass.BOND,
    quantity: aQuantity,
    symbol: 'BND'
  });

describe('RebalancingService', () => {
  let accountService: { getAccounts: jest.Mock; getCashDetails: jest.Mock };
  let dataProviderService: { getQuotes: jest.Mock };
  let exchangeRateDataService: { toCurrency: jest.Mock };
  let portfolioService: { getDetails: jest.Mock };
  let service: RebalancingService;
  let symbolProfileService: { getSymbolProfiles: jest.Mock };
  let targetAllocationModelService: {
    getModel: jest.Mock;
    validateTargets: jest.Mock;
  };

  function mockPortfolio({
    cash = 0,
    holdings
  }: {
    cash?: number;
    holdings: ReturnType<typeof holding>[];
  }) {
    portfolioService.getDetails.mockResolvedValue({ holdings });
    accountService.getCashDetails.mockResolvedValue({
      accounts: [],
      balanceInBaseCurrency: cash
    });
  }

  function mockModel(aTargets: TargetAllocationTargets = CLASS_TARGETS) {
    targetAllocationModelService.getModel.mockResolvedValue({
      id: 'model-1',
      name: 'Growth',
      parameters: PARAMETERS,
      targets: aTargets
    });
  }

  beforeEach(() => {
    accountService = {
      getAccounts: jest
        .fn()
        .mockResolvedValue([{ id: 'account-1' }, { id: 'account-2' }]),
      getCashDetails: jest.fn()
    };
    dataProviderService = { getQuotes: jest.fn().mockResolvedValue({}) };
    exchangeRateDataService = {
      toCurrency: jest.fn((aValue: number) => aValue)
    };
    portfolioService = { getDetails: jest.fn() };
    symbolProfileService = {
      getSymbolProfiles: jest.fn().mockResolvedValue([])
    };
    targetAllocationModelService = {
      getModel: jest.fn(),
      validateTargets: jest.fn().mockResolvedValue(undefined)
    };

    service = new RebalancingService(
      accountService as never,
      dataProviderService as never,
      exchangeRateDataService as never,
      portfolioService as never,
      symbolProfileService as never,
      targetAllocationModelService as never
    );

    mockModel();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('adds the cash balance to the total value of the portfolio', async () => {
    mockPortfolio({ cash: 2000, holdings: [AAPL(), BND()] });

    const plan = await service.createPlan({
      dto: { modelId: 'model-1' },
      user: USER
    });

    // 8,000 holdings + 2,000 cash: equity target 6,000 means buying 2,000
    expect(plan.trades).toHaveLength(1);
    expect(plan.trades[0]).toMatchObject({
      quantity: 20,
      side: 'BUY',
      symbol: 'AAPL'
    });
    expect(plan.cash.before).toBe(2000);
  });

  it('values the whole portfolio when no account is chosen', async () => {
    mockPortfolio({ holdings: [AAPL(), BND()] });

    const plan = await service.createPlan({
      dto: { modelId: 'model-1' },
      user: USER
    });

    expect(portfolioService.getDetails).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [], userId: 'user-1' })
    );
    expect(plan.accountIds).toEqual([]);
  });

  it('limits holdings and cash to the chosen accounts', async () => {
    mockPortfolio({ holdings: [AAPL(), BND()] });

    const plan = await service.createPlan({
      dto: { accountIds: ['account-1'], modelId: 'model-1' },
      user: USER
    });

    const filters = [{ id: 'account-1', type: 'ACCOUNT' }];

    expect(portfolioService.getDetails).toHaveBeenCalledWith(
      expect.objectContaining({ filters })
    );
    expect(accountService.getCashDetails).toHaveBeenCalledWith(
      expect.objectContaining({ filters, currency: 'USD', userId: 'user-1' })
    );
    expect(plan.accountIds).toEqual(['account-1']);
  });

  it('rejects an account that belongs to another user without loading data', async () => {
    mockPortfolio({ holdings: [AAPL(), BND()] });

    await expect(
      service.createPlan({
        dto: { accountIds: ['account-of-someone-else'], modelId: 'model-1' },
        user: USER
      })
    ).rejects.toMatchObject({ status: 404 });

    expect(portfolioService.getDetails).not.toHaveBeenCalled();
  });

  it('loads the model of the user only', async () => {
    mockPortfolio({ holdings: [AAPL(), BND()] });

    await service.createPlan({ dto: { modelId: 'model-1' }, user: USER });

    expect(targetAllocationModelService.getModel).toHaveBeenCalledWith({
      id: 'model-1',
      userId: 'user-1'
    });
  });

  it('answers a model of another user with not found', async () => {
    targetAllocationModelService.getModel.mockRejectedValue(
      new HttpException('Not Found', 404)
    );

    await expect(
      service.createPlan({ dto: { modelId: 'model-1' }, user: USER })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('validates the stored model again before every run', async () => {
    mockPortfolio({ holdings: [AAPL(), BND()] });

    await service.createPlan({ dto: { modelId: 'model-1' }, user: USER });

    expect(targetAllocationModelService.validateTargets).toHaveBeenCalledWith({
      targets: CLASS_TARGETS,
      userId: 'user-1'
    });
  });

  it('stops with an error when the stored model is no longer valid', async () => {
    targetAllocationModelService.validateTargets.mockRejectedValue(
      new HttpException('Bad Request', 400)
    );

    await expect(
      service.createPlan({ dto: { modelId: 'model-1' }, user: USER })
    ).rejects.toMatchObject({ status: 400 });

    expect(portfolioService.getDetails).not.toHaveBeenCalled();
  });

  it('applies the overrides of the run on top of the stored parameters', async () => {
    mockPortfolio({ holdings: [AAPL(30), BND(70)] });

    const withSells = await service.createPlan({
      dto: { modelId: 'model-1' },
      user: USER
    });
    const buyOnly = await service.createPlan({
      dto: { modelId: 'model-1', overrides: { allowSells: false } },
      user: USER
    });

    expect(withSells.trades.some(({ side }) => side === 'SELL')).toBe(true);
    expect(buyOnly.trades.some(({ side }) => side === 'SELL')).toBe(false);
  });

  it('buys a target symbol that is not held yet at its current quote', async () => {
    mockModel({
      assetClasses: [
        {
          assetClass: AssetClass.EQUITY,
          weight: 100,
          subClasses: [
            {
              assetSubClass: AssetSubClass.ETF,
              weight: 100,
              symbols: [
                { dataSource: DataSource.YAHOO, symbol: 'VT', weight: 100 }
              ]
            }
          ]
        }
      ]
    });
    mockPortfolio({ cash: 5000, holdings: [] });
    symbolProfileService.getSymbolProfiles.mockResolvedValue([
      {
        assetClass: AssetClass.EQUITY,
        assetSubClass: AssetSubClass.ETF,
        currency: 'USD',
        dataSource: DataSource.YAHOO,
        name: 'Vanguard Total World',
        sectors: [],
        symbol: 'VT'
      }
    ]);
    dataProviderService.getQuotes.mockResolvedValue({
      VT: { currency: 'USD', marketPrice: 100 }
    });

    const plan = await service.createPlan({
      dto: { modelId: 'model-1' },
      user: USER
    });

    expect(plan.trades).toHaveLength(1);
    expect(plan.trades[0]).toMatchObject({
      quantity: 50,
      side: 'BUY',
      symbol: 'VT'
    });
  });

  it('converts the quote of a foreign-currency target symbol that is not held yet', async () => {
    mockModel({
      assetClasses: [
        {
          assetClass: AssetClass.EQUITY,
          weight: 100,
          subClasses: [
            {
              assetSubClass: AssetSubClass.ETF,
              weight: 100,
              symbols: [
                { dataSource: DataSource.YAHOO, symbol: 'EUETF', weight: 100 }
              ]
            }
          ]
        }
      ]
    });
    mockPortfolio({ cash: 5500, holdings: [] });
    symbolProfileService.getSymbolProfiles.mockResolvedValue([
      {
        assetClass: AssetClass.EQUITY,
        assetSubClass: AssetSubClass.ETF,
        currency: 'EUR',
        dataSource: DataSource.YAHOO,
        name: 'European ETF',
        sectors: [],
        symbol: 'EUETF'
      }
    ]);
    dataProviderService.getQuotes.mockResolvedValue({
      EUETF: { currency: 'EUR', marketPrice: 100 }
    });
    // 1 EUR = 1.10 USD
    exchangeRateDataService.toCurrency.mockImplementation(
      (aValue: number, aFrom: string, aTo: string) => {
        return aFrom === 'EUR' && aTo === 'USD' ? aValue * 1.1 : aValue;
      }
    );

    const plan = await service.createPlan({
      dto: { modelId: 'model-1', overrides: { flatFee: 11 } },
      user: USER
    });

    expect(exchangeRateDataService.toCurrency).toHaveBeenCalledWith(
      100,
      'EUR',
      'USD'
    );
    expect(plan.trades).toHaveLength(1);

    const [buy] = plan.trades;

    expect(buy).toMatchObject({ currency: 'EUR', side: 'BUY', unitPrice: 100 });
    expect(buy.valueInBaseCurrency).toBeCloseTo(buy.quantity * 110, 4);
    // A fee of 11 USD is 10 EUR in the currency of the asset
    expect(buy.feeInAssetCurrency).toBeCloseTo(10, 6);
    expect(buy.valueInBaseCurrency + buy.feeInBaseCurrency).toBeLessThanOrEqual(
      5500 + 0.000001
    );
  });

  it('flags a target symbol without a quote', async () => {
    mockModel({
      assetClasses: [
        {
          assetClass: AssetClass.EQUITY,
          weight: 100,
          subClasses: [
            {
              assetSubClass: AssetSubClass.ETF,
              weight: 100,
              symbols: [
                { dataSource: DataSource.YAHOO, symbol: 'VT', weight: 100 }
              ]
            }
          ]
        }
      ]
    });
    mockPortfolio({ cash: 5000, holdings: [] });

    const plan = await service.createPlan({
      dto: { modelId: 'model-1' },
      user: USER
    });

    expect(plan.excludedHoldings).toContainEqual({
      reason: 'NO_PRICE',
      symbol: 'VT'
    });
    expect(plan.trades).toEqual([]);
  });

  it('excludes a holding without an asset class', async () => {
    mockPortfolio({
      holdings: [
        AAPL(),
        BND(),
        holding({ assetClass: null, quantity: 5, symbol: 'MYSTERY' })
      ]
    });

    const plan = await service.createPlan({
      dto: { modelId: 'model-1' },
      user: USER
    });

    expect(plan.excludedHoldings).toContainEqual({
      reason: 'NO_ASSET_CLASS',
      symbol: 'MYSTERY'
    });
  });

  it('prices a foreign-currency trade in the currency of the asset', async () => {
    // 100 EUR per share, worth 110 USD per share
    mockPortfolio({
      cash: 1100,
      holdings: [
        holding({
          currency: 'EUR',
          marketPrice: 100,
          quantity: 100,
          symbol: 'EURSTOCK',
          valueInBaseCurrency: 11000
        })
      ]
    });
    mockModel({
      assetClasses: [{ assetClass: AssetClass.EQUITY, weight: 100 }]
    });

    const plan = await service.createPlan({
      dto: { modelId: 'model-1', overrides: { flatFee: 5 } },
      user: USER
    });

    expect(plan.trades).toHaveLength(1);
    expect(plan.trades[0].currency).toBe('EUR');
    expect(plan.trades[0].unitPrice).toBe(100);
    expect(plan.trades[0].valueInBaseCurrency).toBeCloseTo(
      plan.trades[0].quantity * 110,
      4
    );
  });

  it('logs neither symbols nor amounts', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    mockPortfolio({ cash: 2000, holdings: [AAPL(), BND()] });

    await service.createPlan({ dto: { modelId: 'model-1' }, user: USER });

    const output = log.mock.calls.map(([message]) => String(message)).join(' ');

    expect(log).toHaveBeenCalled();
    expect(output).not.toContain('AAPL');
    expect(output).not.toContain('BND');
    expect(output).not.toMatch(/4000|8000|2000/);
  });

  it('produces an export that passes the validation of the activity import', async () => {
    mockPortfolio({ cash: 2000, holdings: [AAPL(), BND()] });

    const plan = await service.createPlan({
      dto: { accountIds: ['account-1'], modelId: 'model-1' },
      user: USER
    });

    // Loaded here because the DTO needs the metadata polyfill of NestJS
    const { ImportDataDto } =
      await import('@ghostfolio/api/services/import/import-data.dto');

    const errors = await validate(
      plainToInstance(ImportDataDto, buildRebalancingImportJson(plan)),
      { forbidNonWhitelisted: true, whitelist: true }
    );

    expect(plan.trades.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
