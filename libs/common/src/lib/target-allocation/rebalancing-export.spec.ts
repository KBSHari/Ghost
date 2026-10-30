import { CreateOrderDto } from '@ghostfolio/common/dtos/create-order.dto';
import type { RebalancingPlan } from '@ghostfolio/common/interfaces';
import { DataSource } from '@ghostfolio/prisma/enums';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  REBALANCING_CSV_COLUMNS,
  buildRebalancingCsv,
  buildRebalancingImportJson
} from './rebalancing-export';

function getPlan(aOverrides: Partial<RebalancingPlan> = {}): RebalancingPlan {
  return {
    accountIds: [],
    allocationAfter: [],
    allocationBefore: [],
    calculatedAt: '2026-10-30T10:00:00.000Z',
    cash: { after: 0, before: 0, reserve: 0, shortfall: 0 },
    excludedHoldings: [],
    sectorChecks: [],
    summary: {
      buyCount: 1,
      residualCash: 0,
      sellCount: 1,
      totalFeesInBaseCurrency: 10
    },
    trades: [
      {
        currency: 'USD',
        dataSource: DataSource.YAHOO,
        feeInAssetCurrency: 5.5,
        feeInBaseCurrency: 5,
        quantity: 10,
        side: 'SELL',
        symbol: 'AAPL',
        unitPrice: 180.25,
        valueInBaseCurrency: 1650
      },
      {
        currency: 'EUR',
        dataSource: DataSource.COINGECKO,
        feeInAssetCurrency: 5,
        feeInBaseCurrency: 5,
        quantity: 0.5,
        side: 'BUY',
        symbol: 'bitcoin',
        unitPrice: 60000,
        valueInBaseCurrency: 30000
      }
    ],
    warnings: [],
    ...aOverrides
  };
}

describe('RebalancingExport', () => {
  describe('import JSON', () => {
    it('contains only an activities list', () => {
      const result = buildRebalancingImportJson(getPlan());

      expect(Object.keys(result)).toEqual(['activities']);
      expect(result.activities).toHaveLength(2);
    });

    it('produces activities that pass the validation of an imported activity', async () => {
      const { activities } = buildRebalancingImportJson(
        getPlan({ accountIds: ['account-1'] })
      );

      for (const activity of activities) {
        const errors = await validate(
          plainToInstance(CreateOrderDto, activity),
          {
            forbidNonWhitelisted: true,
            whitelist: true
          }
        );

        expect(errors).toEqual([]);
      }
    });

    it('maps trade fields to activity fields', () => {
      const [sell] = buildRebalancingImportJson(getPlan()).activities;

      expect(sell).toEqual({
        currency: 'USD',
        dataSource: DataSource.YAHOO,
        date: '2026-10-30T10:00:00.000Z',
        fee: 5.5,
        quantity: 10,
        symbol: 'AAPL',
        type: 'SELL',
        unitPrice: 180.25
      });
    });

    it('attaches the account only when exactly one account is in scope', () => {
      const single = buildRebalancingImportJson(
        getPlan({ accountIds: ['account-1'] })
      );
      const multiple = buildRebalancingImportJson(
        getPlan({ accountIds: ['account-1', 'account-2'] })
      );
      const whole = buildRebalancingImportJson(getPlan({ accountIds: [] }));

      expect(single.activities[0].accountId).toBe('account-1');
      expect(multiple.activities[0].accountId).toBeUndefined();
      expect(whole.activities[0].accountId).toBeUndefined();
    });

    it('returns an empty list for an empty plan', () => {
      expect(
        buildRebalancingImportJson(getPlan({ trades: [] })).activities
      ).toEqual([]);
    });
  });

  describe('CSV', () => {
    it('has a header row and one row per trade', () => {
      const lines = buildRebalancingCsv(getPlan()).split('\n');

      expect(lines[0]).toBe(REBALANCING_CSV_COLUMNS.join(','));
      expect(lines).toHaveLength(3);
      expect(lines[1]).toBe(
        '2026-10-30T10:00:00.000Z,SELL,AAPL,YAHOO,USD,10,180.25,5.5,'
      );
    });

    it('contains only the header for an empty plan', () => {
      expect(buildRebalancingCsv(getPlan({ trades: [] }))).toBe(
        REBALANCING_CSV_COLUMNS.join(',')
      );
    });

    it('includes the account id for a single-account plan', () => {
      const lines = buildRebalancingCsv(
        getPlan({ accountIds: ['account-1'] })
      ).split('\n');

      expect(lines[1].endsWith(',account-1')).toBe(true);
    });

    it.each(['=SUM(A1)', '+1', '-1', '@cmd'])(
      'neutralizes a symbol starting with a formula character (%s)',
      (aSymbol) => {
        const plan = getPlan();
        plan.trades[0].symbol = aSymbol;

        const row = buildRebalancingCsv(plan).split('\n')[1];

        expect(row).toContain(`,'${aSymbol},`);
      }
    );

    it('quotes values that contain separators', () => {
      const plan = getPlan();
      plan.trades[0].symbol = 'A,B"C';

      const row = buildRebalancingCsv(plan).split('\n')[1];

      expect(row).toContain(',"A,B""C",');
    });
  });
});
