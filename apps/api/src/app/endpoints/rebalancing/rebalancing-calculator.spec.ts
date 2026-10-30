import type {
  TargetAllocationParameters,
  TargetAllocationTargets
} from '@ghostfolio/common/interfaces';
import {
  AssetClass,
  AssetSubClass,
  DataSource
} from '@ghostfolio/prisma/enums';

import {
  RebalancingCalculatorInput,
  RebalancingInstrument,
  calculateRebalancingPlan
} from './rebalancing-calculator';

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

function instrument({
  assetClass = AssetClass.EQUITY,
  assetSubClass = AssetSubClass.STOCK,
  price = 100,
  quantity,
  symbol,
  ...rest
}: Partial<RebalancingInstrument> & {
  price?: number;
  quantity: number;
  symbol: string;
}): RebalancingInstrument {
  return {
    assetClass,
    assetSubClass,
    quantity,
    symbol,
    currency: 'USD',
    dataSource: DataSource.YAHOO,
    unitPrice: price,
    unitPriceInBaseCurrency: price,
    valueInBaseCurrency: quantity * price,
    ...rest
  };
}

const AAPL = (aQuantity = 100, aPrice = 100) => {
  return instrument({ price: aPrice, quantity: aQuantity, symbol: 'AAPL' });
};
const BND = (aQuantity = 100, aPrice = 100) => {
  return instrument({
    assetClass: AssetClass.FIXED_INCOME,
    assetSubClass: AssetSubClass.BOND,
    price: aPrice,
    quantity: aQuantity,
    symbol: 'BND'
  });
};

function run(
  aInput: Partial<RebalancingCalculatorInput> & {
    instruments: RebalancingInstrument[];
  }
) {
  return calculateRebalancingPlan({
    cashInBaseCurrency: 0,
    parameters: PARAMETERS,
    targets: CLASS_TARGETS,
    ...aInput
  });
}

function params(aOverrides: Partial<TargetAllocationParameters>) {
  return { ...PARAMETERS, ...aOverrides };
}

function trade(aPlan: ReturnType<typeof run>, aSymbol: string) {
  return aPlan.trades.find(({ symbol }) => symbol === aSymbol);
}

describe('RebalancingCalculator', () => {
  describe('basic rebalancing', () => {
    it('buys the underweight class and sells the overweight class', () => {
      const plan = run({ instruments: [AAPL(), BND()] });

      expect(plan.trades).toHaveLength(2);
      expect(trade(plan, 'BND')).toMatchObject({ quantity: 20, side: 'SELL' });
      expect(trade(plan, 'AAPL')).toMatchObject({ quantity: 20, side: 'BUY' });
      expect(plan.cash.after).toBeCloseTo(0, 6);
      expect(plan.warnings).toEqual([]);
    });

    it('lists sells before buys in a stable order', () => {
      const plan = run({ instruments: [AAPL(), BND()] });

      expect(plan.trades.map(({ side }) => side)).toEqual(['SELL', 'BUY']);
    });

    it('reports the allocation before and after the trades', () => {
      const plan = run({ instruments: [AAPL(), BND()] });
      const before = plan.allocationBefore.find(({ key }) => key === 'EQUITY');
      const after = plan.allocationAfter.find(({ key }) => key === 'EQUITY');

      expect(before.weight).toBeCloseTo(50, 4);
      expect(after.weight).toBeCloseTo(60, 4);
    });

    it('includes cash in the total portfolio value', () => {
      // 8,000 holdings + 2,000 cash = 10,000: equity target 6,000
      const plan = run({
        cashInBaseCurrency: 2000,
        instruments: [AAPL(40), BND(40)]
      });

      expect(trade(plan, 'AAPL')).toMatchObject({ quantity: 20, side: 'BUY' });
      // Fixed income is already at its 4,000 target, so it is not traded
      expect(trade(plan, 'BND')).toBeUndefined();
      expect(plan.cash.after).toBeCloseTo(0, 6);
    });
  });

  describe('fees', () => {
    it('adds a flat and a percentage fee to every trade and stays within the budget', () => {
      const plan = run({
        instruments: [AAPL(), BND()],
        parameters: params({ flatFee: 5, percentageFee: 0.1 })
      });

      expect(
        plan.trades.every(({ feeInBaseCurrency }) => feeInBaseCurrency > 0)
      ).toBe(true);
      expect(trade(plan, 'BND').feeInBaseCurrency).toBeCloseTo(7, 6);
      expect(plan.cash.after).toBeGreaterThanOrEqual(0);
      expect(plan.cash.after).toBeLessThan(0.01);
      expect(plan.warnings.map(({ code }) => code)).toContain(
        'TARGETS_NOT_REACHED'
      );
    });

    it('skips a trade whose fee is larger than its value', () => {
      const plan = run({
        // 1% deviation of 20,000 is a 200 trade, below the 500 fee
        instruments: [AAPL(61), BND(39)],
        parameters: params({ flatFee: 500 })
      });

      expect(plan.trades).toEqual([]);
      expect(plan.warnings.map(({ code }) => code)).toContain(
        'BELOW_THRESHOLD'
      );
    });

    it('converts the fee into the currency of the asset', () => {
      const eur = instrument({
        currency: 'EUR',
        price: 100,
        quantity: 0,
        symbol: 'EUR1',
        unitPriceInBaseCurrency: 110
      });
      const plan = run({
        cashInBaseCurrency: 10000,
        instruments: [eur],
        parameters: params({ flatFee: 5 }),
        targets: {
          assetClasses: [
            {
              assetClass: AssetClass.EQUITY,
              weight: 100,
              subClasses: [
                {
                  assetSubClass: AssetSubClass.STOCK,
                  weight: 100,
                  symbols: [
                    {
                      dataSource: DataSource.YAHOO,
                      symbol: 'EUR1',
                      weight: 100
                    }
                  ]
                }
              ]
            }
          ]
        }
      });

      const buy = trade(plan, 'EUR1');

      expect(buy.unitPrice).toBe(100);
      expect(buy.feeInBaseCurrency).toBeCloseTo(5, 6);
      expect(buy.feeInAssetCurrency).toBeCloseTo((5 * 100) / 110, 5);
      expect(buy.valueInBaseCurrency).toBeCloseTo(buy.quantity * 110, 4);
    });
  });

  describe('cash reserve', () => {
    const targets = CLASS_TARGETS;

    it('combines a fixed amount and a percentage', () => {
      const plan = run({
        cashInBaseCurrency: 1000,
        instruments: [AAPL(), BND()],
        parameters: params({
          cashReserveAmount: 1000,
          cashReservePercentage: 2
        })
      });

      // total value 21,000: 1,000 + 2% of 21,000
      expect(plan.cash.reserve).toBeCloseTo(1420, 6);
    });

    it('recommends no buy that would breach a reserve above the available cash', () => {
      const plan = run({
        cashInBaseCurrency: 5000,
        instruments: [AAPL(100), BND(0, 50)],
        parameters: params({ cashReserveAmount: 10000 }),
        targets
      });

      expect(plan.trades.filter(({ side }) => side === 'BUY')).toEqual([]);
      expect(plan.cash.shortfall).toBeGreaterThan(0);
      expect(plan.warnings.map(({ code }) => code)).toContain('CASH_SHORTFALL');
    });

    it('keeps the reserve when sells fund the buys', () => {
      const plan = run({
        cashInBaseCurrency: 500,
        instruments: [AAPL(60), BND(100)],
        parameters: params({ cashReserveAmount: 500 })
      });

      expect(plan.cash.after).toBeGreaterThanOrEqual(500 - 0.000001);
      expect(plan.cash.shortfall).toBe(0);
    });
  });

  describe('trade options', () => {
    it('recommends no sell in buy-only mode', () => {
      const plan = run({
        cashInBaseCurrency: 1000,
        instruments: [AAPL(100), BND(100)],
        parameters: params({ allowSells: false })
      });

      expect(plan.trades.filter(({ side }) => side === 'SELL')).toEqual([]);
      expect(plan.warnings.map(({ code }) => code)).toContain(
        'TARGETS_NOT_REACHED'
      );
    });

    it('includes sells when they are allowed', () => {
      const plan = run({ instruments: [AAPL(), BND()] });

      expect(plan.trades.some(({ side }) => side === 'SELL')).toBe(true);
    });

    it('buys nothing in buy-only mode without spare cash and does not claim the targets are met', () => {
      const plan = run({
        instruments: [AAPL(), BND()],
        parameters: params({ allowSells: false })
      });

      expect(plan.trades).toEqual([]);
      expect(plan.message).toBeUndefined();
      expect(plan.warnings.map(({ code }) => code)).toContain(
        'TARGETS_NOT_REACHED'
      );
    });

    it('does not claim the targets are met when every buy is blocked by the reserve', () => {
      const plan = run({
        cashInBaseCurrency: 1000,
        instruments: [AAPL(0, 100), BND(100)],
        parameters: params({ allowSells: false, cashReserveAmount: 1000 }),
        targets: {
          assetClasses: [
            { assetClass: AssetClass.EQUITY, weight: 50 },
            { assetClass: AssetClass.FIXED_INCOME, weight: 50 }
          ]
        }
      });

      expect(plan.trades).toEqual([]);
      expect(plan.message).toBeUndefined();
    });

    it('uses whole shares and reports the unspent residual', () => {
      const plan = run({
        instruments: [AAPL(100, 123.45), BND(100, 100)],
        parameters: params({ allowFractional: false })
      });

      for (const { quantity } of plan.trades) {
        expect(Number.isInteger(quantity)).toBe(true);
      }

      expect(plan.summary.residualCash).toBeGreaterThan(0);
    });

    it('keeps decimals in fractional mode', () => {
      const plan = run({ instruments: [AAPL(100, 123.45), BND(100, 100)] });

      expect(
        plan.trades.some(({ quantity }) => !Number.isInteger(quantity))
      ).toBe(true);
    });

    it('skips trades below the minimum trade value', () => {
      const plan = run({
        instruments: [AAPL(51), BND(49)],
        parameters: params({ minTradeValue: 5000 })
      });

      expect(plan.trades).toEqual([]);
      expect(plan.warnings.map(({ code }) => code)).toContain(
        'BELOW_THRESHOLD'
      );
    });

    it('trades only when the deviation exceeds the drift threshold', () => {
      const instruments = [AAPL(55), BND(45)];

      const within = run({
        instruments,
        parameters: params({ driftThreshold: 5 })
      });
      const beyond = run({
        instruments,
        parameters: params({ driftThreshold: 4 })
      });

      expect(within.trades).toEqual([]);
      expect(beyond.trades.length).toBeGreaterThan(0);
    });
  });

  describe('sub-class targets', () => {
    const ETF1 = (aQuantity: number) =>
      instrument({
        assetSubClass: AssetSubClass.ETF,
        quantity: aQuantity,
        symbol: 'ETF1'
      });
    const ETF2 = (aQuantity: number) =>
      instrument({
        assetSubClass: AssetSubClass.ETF,
        quantity: aQuantity,
        symbol: 'ETF2'
      });
    const PRIVATE = (aQuantity: number) =>
      instrument({
        assetSubClass: AssetSubClass.PRIVATE_EQUITY,
        quantity: aQuantity,
        symbol: 'PE1'
      });

    const subClassTargets: TargetAllocationTargets = {
      assetClasses: [
        {
          assetClass: AssetClass.EQUITY,
          weight: 80,
          subClasses: [
            { assetSubClass: AssetSubClass.ETF, weight: 50 },
            { assetSubClass: AssetSubClass.STOCK, weight: 30 }
          ]
        },
        { assetClass: AssetClass.FIXED_INCOME, weight: 20 }
      ]
    };

    it('brings each sub-class to its target and spreads trades in proportion to holdings', () => {
      // 10,000 total: ETF 4,000 (target 5,000), stock 3,000 (target 3,000), bonds 3,000 (target 2,000)
      const plan = run({
        instruments: [ETF1(30), ETF2(10), AAPL(30), BND(30)],
        targets: subClassTargets
      });

      expect(trade(plan, 'BND')).toMatchObject({ quantity: 10, side: 'SELL' });
      expect(trade(plan, 'ETF1')).toMatchObject({ quantity: 7.5, side: 'BUY' });
      expect(trade(plan, 'ETF2')).toMatchObject({ quantity: 2.5, side: 'BUY' });
      expect(trade(plan, 'AAPL')).toBeUndefined();

      const after = plan.allocationAfter.find(
        ({ key }) => key === 'EQUITY/ETF'
      );

      expect(after.level).toBe('ASSET_SUB_CLASS');
      expect(after.weight).toBeCloseTo(50, 4);
    });

    it('sells in full a holding of a sub-class that is not in the model', () => {
      const plan = run({
        instruments: [ETF1(40), AAPL(30), BND(20), PRIVATE(10)],
        targets: subClassTargets
      });

      expect(trade(plan, 'PE1')).toMatchObject({ quantity: 10, side: 'SELL' });
      expect(trade(plan, 'ETF1')).toMatchObject({ quantity: 10, side: 'BUY' });
    });
  });

  describe('bands', () => {
    const banded: TargetAllocationTargets = {
      assetClasses: [
        { assetClass: AssetClass.EQUITY, max: 65, min: 55, weight: 60 },
        { assetClass: AssetClass.FIXED_INCOME, max: 45, min: 35, weight: 40 }
      ]
    };

    it('leaves a holding within its band untouched and says so', () => {
      const plan = run({ instruments: [AAPL(59), BND(41)], targets: banded });

      expect(plan.trades).toEqual([]);
      expect(plan.message).toBe('The portfolio is already within its targets');
      expect(
        plan.allocationBefore.find(({ key }) => key === 'EQUITY').withinBand
      ).toBe(true);
    });

    it('trades back to the target, not to the edge of the band', () => {
      const plan = run({ instruments: [AAPL(70), BND(30)], targets: banded });
      const after = plan.allocationAfter.find(({ key }) => key === 'EQUITY');

      expect(after.weight).toBeCloseTo(60, 4);
    });
  });

  describe('instruments', () => {
    const vtTargets: TargetAllocationTargets = {
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
    };

    const VT = (aPrice?: number | null) => {
      return instrument({
        assetSubClass: AssetSubClass.ETF,
        price: aPrice === null ? 0 : (aPrice ?? 100),
        quantity: 0,
        symbol: 'VT'
      });
    };

    it('buys a target symbol that is not held yet and sells holdings outside the model', () => {
      const plan = run({ instruments: [BND(100), VT()], targets: vtTargets });

      expect(trade(plan, 'BND')).toMatchObject({ quantity: 100, side: 'SELL' });
      expect(trade(plan, 'VT')).toMatchObject({ quantity: 100, side: 'BUY' });
    });

    it('flags a target symbol without a price and does not trade it', () => {
      const plan = run({
        instruments: [BND(100), VT(null)],
        targets: vtTargets
      });

      expect(plan.excludedHoldings).toContainEqual({
        reason: 'NO_PRICE',
        symbol: 'VT'
      });
      expect(trade(plan, 'VT')).toBeUndefined();
    });

    it('flags a target symbol that is unknown', () => {
      const plan = run({ instruments: [BND(100)], targets: vtTargets });

      expect(plan.excludedHoldings).toContainEqual({
        reason: 'NO_PRICE',
        symbol: 'VT'
      });
    });

    it('excludes a holding without an asset class from the calculation', () => {
      const plan = run({
        instruments: [
          AAPL(),
          BND(),
          instrument({ assetClass: null, quantity: 10, symbol: 'MYSTERY' })
        ]
      });

      expect(plan.excludedHoldings).toContainEqual({
        reason: 'NO_ASSET_CLASS',
        symbol: 'MYSTERY'
      });
      expect(
        plan.allocationBefore.find(({ key }) => key === 'EQUITY').weight
      ).toBeCloseTo(50, 4);
    });

    it('excludes a holding without a price', () => {
      const plan = run({
        instruments: [
          AAPL(),
          BND(),
          instrument({
            price: 0,
            quantity: 10,
            symbol: 'NOPRICE',
            unitPriceInBaseCurrency: 0,
            valueInBaseCurrency: 0
          })
        ]
      });

      expect(plan.excludedHoldings).toContainEqual({
        reason: 'NO_PRICE',
        symbol: 'NOPRICE'
      });
    });

    it('sells in full a holding of an asset class that is not in the model', () => {
      const realEstate = instrument({
        assetClass: AssetClass.REAL_ESTATE,
        assetSubClass: null,
        quantity: 5.5,
        symbol: 'REIT'
      });
      const plan = run({ instruments: [AAPL(), BND(), realEstate] });

      expect(trade(plan, 'REIT')).toMatchObject({
        quantity: 5.5,
        side: 'SELL'
      });
    });

    it('does not sell a holding outside the model when selling is disabled', () => {
      const realEstate = instrument({
        assetClass: AssetClass.REAL_ESTATE,
        assetSubClass: null,
        quantity: 5,
        symbol: 'REIT'
      });
      const plan = run({
        instruments: [AAPL(), BND(), realEstate],
        parameters: params({ allowSells: false })
      });

      expect(trade(plan, 'REIT')).toBeUndefined();
    });
  });

  describe('empty and minimal portfolios', () => {
    it('returns an empty plan with a message for an empty portfolio', () => {
      const plan = run({ instruments: [] });

      expect(plan.trades).toEqual([]);
      expect(plan.message).toBe('The portfolio has no value to rebalance');
    });

    it('invests an all-cash portfolio into the available instruments of each class', () => {
      const plan = run({
        cashInBaseCurrency: 10000,
        instruments: [
          instrument({ price: 50, quantity: 0, symbol: 'AAPL' }),
          BND(0, 100)
        ]
      });

      expect(trade(plan, 'AAPL')).toMatchObject({ quantity: 120, side: 'BUY' });
      expect(trade(plan, 'BND')).toMatchObject({ quantity: 40, side: 'BUY' });
      expect(plan.cash.after).toBeCloseTo(0, 6);
    });

    it('warns about a class without any instrument to buy', () => {
      const plan = run({
        cashInBaseCurrency: 10000,
        instruments: [instrument({ price: 50, quantity: 0, symbol: 'AAPL' })]
      });

      expect(trade(plan, 'AAPL')).toMatchObject({ side: 'BUY' });
      expect(plan.warnings.map(({ code }) => code)).toContain('EMPTY_BUCKET');
    });

    it('reports no trade for a single holding that already matches class-only targets', () => {
      const plan = run({
        instruments: [AAPL()],
        targets: {
          assetClasses: [{ assetClass: AssetClass.EQUITY, weight: 100 }]
        }
      });

      expect(plan.trades).toEqual([]);
    });
  });

  describe('sector exposure', () => {
    it('reports weighted sector exposure without creating trades', () => {
      const etf = instrument({
        assetSubClass: AssetSubClass.ETF,
        quantity: 100,
        sectors: [
          { name: 'Technology', weight: 0.5 },
          { name: 'Healthcare', weight: 0.5 }
        ],
        symbol: 'FUND'
      });
      const plan = run({
        instruments: [etf, BND(100, 100)],
        targets: {
          assetClasses: [
            { assetClass: AssetClass.EQUITY, weight: 50 },
            { assetClass: AssetClass.FIXED_INCOME, weight: 50 }
          ],
          sectors: [{ max: 35, min: 20, sector: 'technology', weight: 25 }]
        }
      });

      expect(plan.trades).toEqual([]);
      expect(plan.sectorChecks).toHaveLength(1);
      expect(plan.sectorChecks[0].exposureBefore).toBeCloseTo(25, 4);
      expect(plan.sectorChecks[0].withinBand).toBe(true);
    });
  });

  describe('invariants', () => {
    const scenarios: Partial<TargetAllocationParameters>[] = [];

    for (const allowFractional of [true, false]) {
      for (const flatFee of [0, 5]) {
        for (const percentageFee of [0, 1]) {
          for (const cashReserveAmount of [0, 500]) {
            for (const allowSells of [true, false]) {
              scenarios.push({
                allowFractional,
                allowSells,
                cashReserveAmount,
                flatFee,
                percentageFee
              });
            }
          }
        }
      }
    }

    it.each(scenarios)(
      'never oversells, overspends or trades zero (%j)',
      (aParameters) => {
        const instruments = [AAPL(37, 123.45), BND(81, 67.89)];
        const plan = run({
          instruments,
          cashInBaseCurrency: 1200,
          parameters: params(aParameters)
        });

        for (const { quantity, side, symbol } of plan.trades) {
          expect(quantity).toBeGreaterThan(0);

          if (side === 'SELL') {
            const held = instruments.find(
              (item) => item.symbol === symbol
            ).quantity;

            expect(quantity).toBeLessThanOrEqual(held);
          }
        }

        expect(plan.cash.after).toBeGreaterThanOrEqual(-0.000001);

        if (aParameters.cashReserveAmount <= 1200) {
          expect(plan.cash.after).toBeGreaterThanOrEqual(
            aParameters.cashReserveAmount - 0.000001
          );
        }
      }
    );
  });

  describe('performance', () => {
    it('calculates a plan for 500 holdings in under 2 seconds', () => {
      const instruments: RebalancingInstrument[] = [];

      for (let index = 0; index < 400; index++) {
        instruments.push(
          instrument({ price: 50 + index, quantity: 10, symbol: `EQ${index}` })
        );
      }

      for (let index = 0; index < 100; index++) {
        instruments.push(
          instrument({
            assetClass: AssetClass.FIXED_INCOME,
            assetSubClass: AssetSubClass.BOND,
            price: 90 + index,
            quantity: 10,
            symbol: `FI${index}`
          })
        );
      }

      const start = performance.now();
      const plan = run({
        instruments,
        cashInBaseCurrency: 25000,
        parameters: params({ flatFee: 1, percentageFee: 0.1 })
      });
      const duration = performance.now() - start;

      expect(plan.trades.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(2000);
    });
  });
});
