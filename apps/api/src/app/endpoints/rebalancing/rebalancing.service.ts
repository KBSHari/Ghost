import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { AccountService } from '@ghostfolio/api/services/account/account.service';
import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.service';
import { SymbolProfileService } from '@ghostfolio/api/services/symbol-profile/symbol-profile.service';
import { DEFAULT_CURRENCY } from '@ghostfolio/common/config';
import { CreateRebalancingPlanDto } from '@ghostfolio/common/dtos';
import { getAssetProfileIdentifier } from '@ghostfolio/common/helper';
import type {
  AssetProfileIdentifier,
  Filter,
  RebalancingPlan,
  TargetAllocationParameters,
  TargetAllocationTargets,
  UserSettings
} from '@ghostfolio/common/interfaces';
import { UserWithSettings } from '@ghostfolio/common/types';

import { HttpException, Injectable, Logger } from '@nestjs/common';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import { isUndefined, omitBy } from 'lodash-es';

import {
  RebalancingInstrument,
  calculateRebalancingPlan
} from './rebalancing-calculator';
import { TargetAllocationModelService } from './target-allocation-model.service';

@Injectable()
export class RebalancingService {
  private readonly logger = new Logger(RebalancingService.name);

  public constructor(
    private readonly accountService: AccountService,
    private readonly dataProviderService: DataProviderService,
    private readonly exchangeRateDataService: ExchangeRateDataService,
    private readonly portfolioService: PortfolioService,
    private readonly symbolProfileService: SymbolProfileService,
    private readonly targetAllocationModelService: TargetAllocationModelService
  ) {}

  public async createPlan({
    dto,
    user
  }: {
    dto: CreateRebalancingPlanDto;
    user: UserWithSettings;
  }): Promise<RebalancingPlan> {
    const startTime = performance.now();
    const userId = user.id;
    const baseCurrency =
      (user.settings?.settings as UserSettings)?.baseCurrency ??
      DEFAULT_CURRENCY;

    const model = await this.targetAllocationModelService.getModel({
      userId,
      id: dto.modelId
    });

    // A stored model is validated again before every run
    await this.targetAllocationModelService.validateTargets({
      userId,
      targets: model.targets
    });

    const parameters: TargetAllocationParameters = {
      ...model.parameters,
      ...omitBy(dto.overrides ?? {}, isUndefined)
    };

    const accountIds = dto.accountIds ?? [];

    await this.assertAccountsBelongToUser({ accountIds, userId });

    const filters: Filter[] = accountIds.map((id) => {
      return { id, type: 'ACCOUNT' };
    });

    const [details, cashDetails] = await Promise.all([
      this.portfolioService.getDetails({ filters, user, userId }),
      this.accountService.getCashDetails({
        filters,
        userId,
        currency: baseCurrency
      })
    ]);

    const instruments: RebalancingInstrument[] = details.holdings.map(
      (holding) => {
        const { assetProfile, marketPrice, quantity, valueInBaseCurrency } =
          holding;

        return {
          quantity,
          assetClass: assetProfile.assetClass,
          assetSubClass: assetProfile.assetSubClass,
          currency: assetProfile.currency,
          dataSource: assetProfile.dataSource,
          name: assetProfile.name,
          sectors: (assetProfile.sectors ?? []).map(({ name, weight }) => {
            return { name, weight };
          }),
          symbol: assetProfile.symbol,
          // The market price is given in the currency of the asset
          unitPrice: marketPrice,
          unitPriceInBaseCurrency:
            quantity > 0 ? (valueInBaseCurrency ?? 0) / quantity : undefined,
          valueInBaseCurrency: valueInBaseCurrency ?? 0
        };
      }
    );

    instruments.push(
      ...(await this.getInstrumentsOfUnheldTargets({
        baseCurrency,
        held: instruments,
        targets: model.targets,
        user
      }))
    );

    const result = calculateRebalancingPlan({
      instruments,
      parameters,
      cashInBaseCurrency: cashDetails.balanceInBaseCurrency,
      targets: model.targets
    });

    // Only counts and durations are logged, never symbols or amounts
    this.logger.log(
      `Rebalancing plan calculated (holdings: ${details.holdings.length}, trades: ${result.trades.length}, duration: ${Math.round(performance.now() - startTime)} ms)`
    );

    return {
      ...result,
      accountIds,
      calculatedAt: new Date().toISOString()
    };
  }

  private async assertAccountsBelongToUser({
    accountIds,
    userId
  }: {
    accountIds: string[];
    userId: string;
  }) {
    if (accountIds.length === 0) {
      return;
    }

    const accounts = await this.accountService.getAccounts(userId);
    const ownedIds = new Set(accounts.map(({ id }) => id));

    // A foreign account is indistinguishable from a missing one
    if (!accountIds.every((id) => ownedIds.has(id))) {
      throw new HttpException(
        getReasonPhrase(StatusCodes.NOT_FOUND),
        StatusCodes.NOT_FOUND
      );
    }
  }

  private async getInstrumentsOfUnheldTargets({
    baseCurrency,
    held,
    targets,
    user
  }: {
    baseCurrency: string;
    held: RebalancingInstrument[];
    targets: TargetAllocationTargets;
    user: UserWithSettings;
  }) {
    const heldKeys = new Set(
      held.map(({ dataSource, symbol }) => {
        return getAssetProfileIdentifier({ dataSource, symbol });
      })
    );

    const missing = new Map<string, AssetProfileIdentifier>();

    for (const assetClassNode of targets.assetClasses) {
      for (const subClassNode of assetClassNode.subClasses ?? []) {
        for (const { dataSource, symbol } of subClassNode.symbols ?? []) {
          const key = getAssetProfileIdentifier({ dataSource, symbol });

          if (!heldKeys.has(key)) {
            missing.set(key, { dataSource, symbol });
          }
        }
      }
    }

    if (missing.size === 0) {
      return [];
    }

    const items = [...missing.values()];

    const [assetProfiles, quotes] = await Promise.all([
      this.symbolProfileService.getSymbolProfiles(items),
      this.dataProviderService.getQuotes({
        items,
        subscriptionType: user.subscription?.type
      })
    ]);

    const instruments: RebalancingInstrument[] = [];

    for (const assetProfile of assetProfiles) {
      const quote = quotes[assetProfile.symbol];
      const price = quote?.marketPrice;

      instruments.push({
        assetClass: assetProfile.assetClass,
        assetSubClass: assetProfile.assetSubClass,
        currency: assetProfile.currency,
        dataSource: assetProfile.dataSource,
        name: assetProfile.name,
        quantity: 0,
        sectors: (assetProfile.sectors ?? []).map(({ name, weight }) => {
          return { name, weight };
        }),
        symbol: assetProfile.symbol,
        unitPrice: price,
        unitPriceInBaseCurrency: price
          ? this.exchangeRateDataService.toCurrency(
              price,
              quote.currency ?? assetProfile.currency,
              baseCurrency
            )
          : undefined,
        valueInBaseCurrency: 0
      });
    }

    return instruments;
  }
}
