import { scopes } from '@ghostfolio/common/scopes';
import type { ImpersonationContext } from '@ghostfolio/common/types';

import { GetDetailsDto } from './get-details.dto';
import { GetPerformanceDto } from './get-performance.dto';
import { PortfolioController } from './portfolio.controller';

describe('PortfolioController', () => {
  const fxWarnings = [
    {
      currencyFrom: 'CHF',
      currencyTo: 'USD',
      date: '2021-12-04',
      type: 'ESTIMATED' as const
    }
  ];

  const readableContext = {
    scopes: [scopes.portfolioRead, scopes.portfolioReadValues],
    userId: 'user-id'
  } as ImpersonationContext;

  const readOnlyContext = {
    scopes: [scopes.portfolioRead],
    userId: 'user-id'
  } as ImpersonationContext;

  let getDetails: jest.Mock;
  let getPerformance: jest.Mock;
  let portfolioController: PortfolioController;

  function createController(settings: {
    isRestrictedView?: boolean;
    viewMode?: string;
  }) {
    return new PortfolioController(
      null,
      { buildFiltersFromQueryParams: jest.fn().mockReturnValue([]) } as any,
      { get: jest.fn().mockReturnValue(false) } as any,
      { getDetails, getPerformance } as any,
      { user: { settings: { settings } } } as any
    );
  }

  beforeEach(() => {
    getDetails = jest.fn().mockResolvedValue({
      accounts: {},
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      fxWarnings,
      hasErrors: false,
      holdings: [],
      markets: {},
      marketsAdvanced: {},
      platforms: {},
      summary: {}
    });

    getPerformance = jest.fn().mockResolvedValue({
      chart: [],
      dateOfFirstActivity: new Date('2021-11-30T00:00:00.000Z'),
      fxWarnings,
      hasErrors: false,
      performance: {
        currentNetWorth: 0,
        currentValueInBaseCurrency: 0,
        totalInvestment: 0
      }
    });

    portfolioController = createController({});
  });

  describe('getDetails', () => {
    it('passes the warnings through when values are readable', async () => {
      const result = await portfolioController.getDetails(
        readableContext,
        {} as GetDetailsDto
      );

      expect(result.fxWarnings).toEqual(fxWarnings);
    });

    it('omits the warnings for a restricted view', async () => {
      const result = await createController({
        isRestrictedView: true
      }).getDetails(readableContext, {} as GetDetailsDto);

      expect(result).not.toHaveProperty('fxWarnings');
    });

    it('omits the warnings without the scope to read values', async () => {
      const result = await portfolioController.getDetails(
        readOnlyContext,
        {} as GetDetailsDto
      );

      expect(result).not.toHaveProperty('fxWarnings');
    });

    it('adds no warnings field when the service returns none', async () => {
      getDetails.mockResolvedValue({
        accounts: {},
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        hasErrors: false,
        holdings: [],
        markets: {},
        marketsAdvanced: {},
        platforms: {},
        summary: {}
      });

      const result = await portfolioController.getDetails(
        readableContext,
        {} as GetDetailsDto
      );

      expect(result).not.toHaveProperty('fxWarnings');
    });
  });

  describe('getPerformanceV2', () => {
    it('passes the warnings through when values are readable', async () => {
      const result = await portfolioController.getPerformanceV2(
        readableContext,
        {} as GetPerformanceDto
      );

      expect(result.fxWarnings).toEqual(fxWarnings);
    });

    it.each([
      ['a restricted view', { isRestrictedView: true }],
      ['the ZEN view mode', { viewMode: 'ZEN' }]
    ])('omits the warnings for %s', async (_, settings) => {
      const result = await createController(settings).getPerformanceV2(
        readableContext,
        {} as GetPerformanceDto
      );

      expect(result).not.toHaveProperty('fxWarnings');
    });

    it('omits the warnings without the scope to read values', async () => {
      const result = await portfolioController.getPerformanceV2(
        readOnlyContext,
        {} as GetPerformanceDto
      );

      expect(result).not.toHaveProperty('fxWarnings');
    });
  });
});
