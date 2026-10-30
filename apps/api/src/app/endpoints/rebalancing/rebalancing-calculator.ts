import type {
  RebalancingAllocationItem,
  RebalancingExcludedHolding,
  RebalancingPlan,
  RebalancingSectorCheck,
  RebalancingTrade,
  RebalancingWarning,
  TargetAllocationParameters,
  TargetAllocationTargets
} from '@ghostfolio/common/interfaces';
import {
  AssetClass,
  AssetSubClass,
  DataSource
} from '@ghostfolio/prisma/enums';

import { Big } from 'big.js';
import { isNil } from 'lodash-es';

export const REBALANCING_MAXIMUM_SETTLING_ITERATIONS = 20;
export const REBALANCING_QUANTITY_DECIMAL_PLACES = 8;

const BAND_TOLERANCE = 0.000001;

export interface RebalancingCalculatorInput {
  cashInBaseCurrency: number;
  instruments: RebalancingInstrument[];
  parameters: TargetAllocationParameters;
  targets: TargetAllocationTargets;
}

export interface RebalancingInstrument {
  assetClass?: AssetClass | null;
  assetSubClass?: AssetSubClass | null;
  currency: string;
  dataSource: DataSource;
  name?: string;
  priceDate?: string;
  quantity: number;
  // Sector weights as fractions (0.25 = 25%)
  sectors?: { name: string; weight: number }[];
  symbol: string;
  // Price in the currency of the asset and in the base currency
  unitPrice?: number | null;
  unitPriceInBaseCurrency?: number | null;
  valueInBaseCurrency: number;
}

export type RebalancingCalculatorResult = Omit<
  RebalancingPlan,
  'accountIds' | 'calculatedAt'
>;

interface Band {
  max?: number | null;
  min?: number | null;
}

interface Leaf {
  band?: Band;
  key: string;
  members: Prepared[];
  targetWeight: number;
}

interface Prepared {
  assetClass: AssetClass;
  assetSubClass?: AssetSubClass | null;
  instrument: RebalancingInstrument;
  key: string;
  priceInAssetCurrency: Big;
  priceInBaseCurrency: Big;
  quantity: Big;
  value: Big;
}

interface Trade {
  prepared: Prepared;
  quantity: Big;
  side: 'BUY' | 'SELL';
  value: Big;
}

export function calculateRebalancingPlan({
  cashInBaseCurrency,
  instruments,
  parameters,
  targets
}: RebalancingCalculatorInput): RebalancingCalculatorResult {
  const warnings: RebalancingWarning[] = [];
  const excludedHoldings: RebalancingExcludedHolding[] = [];
  const skippedSymbols: string[] = [];
  const cash = new Big(cashInBaseCurrency);

  const eligible = new Map<string, Prepared>();

  for (const instrument of instruments) {
    const key = getKey(instrument);

    if (!instrument.assetClass) {
      excludedHoldings.push({
        reason: 'NO_ASSET_CLASS',
        symbol: instrument.symbol
      });
      continue;
    }

    const priceInAssetCurrency = new Big(instrument.unitPrice ?? 0);
    let priceInBaseCurrency = new Big(instrument.unitPriceInBaseCurrency ?? 0);

    if (priceInBaseCurrency.lte(0) && new Big(instrument.quantity).gt(0)) {
      priceInBaseCurrency = new Big(instrument.valueInBaseCurrency).div(
        instrument.quantity
      );
    }

    if (priceInAssetCurrency.lte(0) || priceInBaseCurrency.lte(0)) {
      excludedHoldings.push({ reason: 'NO_PRICE', symbol: instrument.symbol });
      continue;
    }

    eligible.set(key, {
      instrument,
      key,
      priceInAssetCurrency,
      priceInBaseCurrency,
      assetClass: instrument.assetClass,
      assetSubClass: instrument.assetSubClass,
      quantity: new Big(instrument.quantity),
      value: new Big(instrument.valueInBaseCurrency)
    });
  }

  const holdingsValue = [...eligible.values()].reduce((sum, { value }) => {
    return sum.plus(value);
  }, new Big(0));
  const totalValue = holdingsValue.plus(cash);

  if (totalValue.lte(0)) {
    return {
      excludedHoldings,
      warnings,
      allocationAfter: [],
      allocationBefore: [],
      cash: { after: 0, before: 0, reserve: 0, shortfall: 0 },
      message: 'The portfolio has no value to rebalance',
      sectorChecks: [],
      summary: {
        buyCount: 0,
        residualCash: 0,
        sellCount: 0,
        totalFeesInBaseCurrency: 0
      },
      trades: []
    };
  }

  const reserve = new Big(parameters.cashReserveAmount).plus(
    totalValue.times(parameters.cashReservePercentage).div(100)
  );

  const leaves = buildLeaves({
    eligible,
    excludedHoldings,
    instruments,
    targets
  });

  // Candidate trades per leaf, outside of the band or the drift threshold
  const candidates: Trade[] = [];
  let hasUnreachedTargets = false;

  for (const leaf of leaves) {
    const current = leaf.members.reduce((sum, { value }) => {
      return sum.plus(value);
    }, new Big(0));
    const currentWeight = current.div(totalValue).times(100);

    const isOutside = hasBand(leaf.band)
      ? isOutsideBand({ band: leaf.band, weight: currentWeight })
      : currentWeight
          .minus(leaf.targetWeight)
          .abs()
          .gt(parameters.driftThreshold);

    if (!isOutside) {
      continue;
    }

    const delta = totalValue.times(leaf.targetWeight).div(100).minus(current);

    if (delta.eq(0)) {
      continue;
    }

    if (delta.gt(0)) {
      if (leaf.members.length === 0) {
        warnings.push({
          code: 'EMPTY_BUCKET',
          message: `No instrument is available to buy for ${leaf.key}`
        });
        continue;
      }

      const memberTotal = leaf.members.reduce((sum, { value }) => {
        return sum.plus(value);
      }, new Big(0));

      for (const member of leaf.members) {
        const share = memberTotal.gt(0)
          ? member.value.div(memberTotal)
          : new Big(1).div(leaf.members.length);

        candidates.push({
          prepared: member,
          quantity: new Big(0),
          side: 'BUY',
          value: delta.times(share)
        });
      }
    } else {
      const sellTotal = delta.abs();

      for (const member of leaf.members) {
        if (member.value.lte(0)) {
          continue;
        }

        const share = member.value.div(current);

        candidates.push({
          prepared: member,
          quantity: new Big(0),
          side: 'SELL',
          value: minOf(sellTotal.times(share), member.value)
        });
      }
    }
  }

  const feeOf = (aValue: Big) => {
    return new Big(parameters.flatFee).plus(
      aValue.times(parameters.percentageFee).div(100)
    );
  };
  const isTooSmall = (aValue: Big) => {
    return (
      aValue.lte(0) ||
      aValue.lt(parameters.minTradeValue) ||
      feeOf(aValue).gte(aValue)
    );
  };

  // Sells first, because their proceeds fund the buys
  const sells: Trade[] = [];

  for (const candidate of candidates.filter(({ side }) => side === 'SELL')) {
    if (!parameters.allowSells) {
      hasUnreachedTargets = true;
      continue;
    }

    const { prepared } = candidate;
    const isFullSale = candidate.value.gte(
      prepared.value.minus(BAND_TOLERANCE)
    );
    const quantity = isFullSale
      ? prepared.quantity
      : minOf(
          roundQuantity({
            allowFractional: parameters.allowFractional,
            value: candidate.value.div(prepared.priceInBaseCurrency)
          }),
          prepared.quantity
        );
    const value = quantity.times(prepared.priceInBaseCurrency);

    if (quantity.lte(0) || isTooSmall(value)) {
      skippedSymbols.push(prepared.instrument.symbol);
      continue;
    }

    sells.push({ prepared, quantity, side: 'SELL', value });
  }

  const sellProceeds = sells.reduce((sum, { value }) => {
    return sum.plus(value).minus(feeOf(value));
  }, new Big(0));
  const available = maxOf(cash.plus(sellProceeds).minus(reserve), new Big(0));

  // Buys are scaled down to what the budget allows. Fees depend on the size of
  // the trades, so the scaling is settled iteratively with a fixed bound.
  let buys = candidates
    .filter(({ side }) => side === 'BUY')
    .map(({ prepared, value }) => ({ prepared, value }));
  let hasConverged = false;

  for (
    let iteration = 0;
    iteration < REBALANCING_MAXIMUM_SETTLING_ITERATIONS;
    iteration++
  ) {
    const totalBuy = buys.reduce(
      (sum, { value }) => sum.plus(value),
      new Big(0)
    );
    const cost = totalBuy
      .times(new Big(1).plus(new Big(parameters.percentageFee).div(100)))
      .plus(new Big(parameters.flatFee).times(buys.length));

    if (buys.length === 0 || cost.lte(available)) {
      hasConverged = true;
      break;
    }

    const divisor = totalBuy.times(
      new Big(1).plus(new Big(parameters.percentageFee).div(100))
    );
    const factor = available
      .minus(new Big(parameters.flatFee).times(buys.length))
      .div(divisor);

    hasUnreachedTargets = true;

    if (factor.lte(0)) {
      buys = [];
      hasConverged = true;
      break;
    }

    buys = buys.map(({ prepared, value }) => ({
      prepared,
      value: value.times(factor)
    }));

    const kept = buys.filter(({ value }) => !isTooSmall(value));

    if (kept.length === buys.length) {
      hasConverged = true;
      break;
    }

    for (const { prepared, value } of buys) {
      if (isTooSmall(value)) {
        skippedSymbols.push(prepared.instrument.symbol);
      }
    }

    buys = kept;
  }

  if (!hasConverged) {
    warnings.push({
      code: 'NOT_CONVERGED',
      message:
        'The plan could not be settled within the iteration limit; some buys were dropped'
    });
    buys = [];
  }

  const buyTrades: Trade[] = [];
  let residualCash = new Big(0);

  for (const { prepared, value } of buys) {
    const quantity = roundQuantity({
      allowFractional: parameters.allowFractional,
      value: value.div(prepared.priceInBaseCurrency)
    });
    const roundedValue = quantity.times(prepared.priceInBaseCurrency);

    if (quantity.lte(0) || isTooSmall(roundedValue)) {
      skippedSymbols.push(prepared.instrument.symbol);
      continue;
    }

    residualCash = residualCash.plus(value.minus(roundedValue));
    buyTrades.push({ prepared, quantity, side: 'BUY', value: roundedValue });
  }

  const trades = [...sells, ...buyTrades].sort((a, b) => {
    if (a.side !== b.side) {
      return a.side === 'SELL' ? -1 : 1;
    }

    return a.prepared.instrument.symbol.localeCompare(
      b.prepared.instrument.symbol
    );
  });

  const totalFees = trades.reduce((sum, { value }) => {
    return sum.plus(feeOf(value));
  }, new Big(0));
  const buyCost = buyTrades.reduce((sum, { value }) => {
    return sum.plus(value).plus(feeOf(value));
  }, new Big(0));
  const cashAfter = cash.plus(sellProceeds).minus(buyCost);
  const shortfall = maxOf(reserve.minus(cashAfter), new Big(0));

  if (skippedSymbols.length > 0) {
    warnings.push({
      code: 'BELOW_THRESHOLD',
      message: `Skipped trades below the minimum trade value, smaller than their fee, or rounded to zero: ${[...new Set(skippedSymbols)].join(', ')}`
    });
  }

  if (hasUnreachedTargets) {
    warnings.push({
      code: 'TARGETS_NOT_REACHED',
      message:
        'Some targets could not be reached because of the cash budget or because selling is not allowed'
    });
  }

  if (shortfall.gt(0)) {
    warnings.push({
      code: 'CASH_SHORTFALL',
      message: 'The cash reserve cannot be met with the available cash'
    });
  }

  const afterValues = new Map<string, Big>();

  for (const prepared of eligible.values()) {
    afterValues.set(prepared.key, prepared.value);
  }

  for (const { prepared, side, value } of trades) {
    const previous = afterValues.get(prepared.key);

    afterValues.set(
      prepared.key,
      side === 'BUY' ? previous.plus(value) : previous.minus(value)
    );
  }

  const totalAfter = [...afterValues.values()]
    .reduce((sum, value) => sum.plus(value), new Big(0))
    .plus(cashAfter);

  const result: RebalancingTrade[] = trades.map(
    ({ prepared, quantity, side, value }) => {
      const feeInBaseCurrency = feeOf(value);

      return {
        side,
        currency: prepared.instrument.currency,
        dataSource: prepared.instrument.dataSource,
        feeInAssetCurrency: toNumber(
          feeInBaseCurrency
            .times(prepared.priceInAssetCurrency)
            .div(prepared.priceInBaseCurrency)
        ),
        feeInBaseCurrency: toNumber(feeInBaseCurrency),
        name: prepared.instrument.name,
        priceDate: prepared.instrument.priceDate,
        quantity: toNumber(quantity, REBALANCING_QUANTITY_DECIMAL_PLACES),
        symbol: prepared.instrument.symbol,
        unitPrice: toNumber(prepared.priceInAssetCurrency),
        valueInBaseCurrency: toNumber(value)
      };
    }
  );

  return {
    excludedHoldings,
    warnings,
    allocationAfter: getAllocation({
      eligible,
      targets,
      total: totalAfter,
      values: afterValues
    }),
    allocationBefore: getAllocation({
      eligible,
      targets,
      total: totalValue,
      values: new Map(
        [...eligible.values()].map(({ key, value }) => [key, value])
      )
    }),
    cash: {
      after: toNumber(cashAfter),
      before: toNumber(cash),
      reserve: toNumber(reserve),
      shortfall: toNumber(shortfall)
    },
    // Only true when no trade was wanted; blocked trades are explained by warnings
    message:
      candidates.length === 0 && warnings.length === 0
        ? 'The portfolio is already within its targets'
        : undefined,
    sectorChecks: getSectorChecks({
      afterTotal: totalAfter,
      afterValues,
      beforeTotal: totalValue,
      eligible,
      targets
    }),
    summary: {
      buyCount: buyTrades.length,
      residualCash: toNumber(residualCash),
      sellCount: sells.length,
      totalFeesInBaseCurrency: toNumber(totalFees)
    },
    trades: result
  };
}

function buildLeaves({
  eligible,
  excludedHoldings,
  instruments,
  targets
}: {
  eligible: Map<string, Prepared>;
  excludedHoldings: RebalancingExcludedHolding[];
  instruments: RebalancingInstrument[];
  targets: TargetAllocationTargets;
}) {
  const leaves: Leaf[] = [];
  const assigned = new Set<string>();
  const explicitKeys = new Set<string>();

  for (const assetClassNode of targets.assetClasses) {
    for (const subClassNode of assetClassNode.subClasses ?? []) {
      for (const symbolNode of subClassNode.symbols ?? []) {
        explicitKeys.add(getKey(symbolNode));
      }
    }
  }

  const unclaimed = (aMatcher: (aPrepared: Prepared) => boolean) => {
    return [...eligible.values()].filter((prepared) => {
      return !explicitKeys.has(prepared.key) && aMatcher(prepared);
    });
  };

  for (const assetClassNode of targets.assetClasses) {
    const subClasses = assetClassNode.subClasses ?? [];

    if (subClasses.length === 0) {
      const members = unclaimed(({ assetClass }) => {
        return assetClass === assetClassNode.assetClass;
      });

      leaves.push({
        members,
        band: assetClassNode,
        key: assetClassNode.assetClass,
        targetWeight: assetClassNode.weight
      });
      members.forEach(({ key }) => assigned.add(key));

      continue;
    }

    for (const subClassNode of subClasses) {
      const symbols = subClassNode.symbols ?? [];

      if (symbols.length === 0) {
        const members = unclaimed(({ assetClass, assetSubClass }) => {
          return (
            assetClass === assetClassNode.assetClass &&
            assetSubClass === subClassNode.assetSubClass
          );
        });

        leaves.push({
          members,
          band: subClassNode,
          key: `${assetClassNode.assetClass}/${subClassNode.assetSubClass}`,
          targetWeight: subClassNode.weight
        });
        members.forEach(({ key }) => assigned.add(key));

        continue;
      }

      for (const symbolNode of symbols) {
        const key = getKey(symbolNode);
        const prepared = eligible.get(key);

        if (!prepared) {
          const isKnown = instruments.some((instrument) => {
            return getKey(instrument) === key;
          });

          if (!isKnown) {
            excludedHoldings.push({
              reason: 'NO_PRICE',
              symbol: symbolNode.symbol
            });
          }

          continue;
        }

        leaves.push({
          band: symbolNode,
          key,
          members: [prepared],
          targetWeight: symbolNode.weight
        });
        assigned.add(key);
      }
    }
  }

  // Holdings outside of the model have a target of zero
  for (const prepared of eligible.values()) {
    if (!assigned.has(prepared.key)) {
      leaves.push({
        key: prepared.key,
        members: [prepared],
        targetWeight: 0
      });
    }
  }

  return leaves;
}

function getAllocation({
  eligible,
  targets,
  total,
  values
}: {
  eligible: Map<string, Prepared>;
  targets: TargetAllocationTargets;
  total: Big;
  values: Map<string, Big>;
}) {
  const items: RebalancingAllocationItem[] = [];

  const add = ({
    band,
    key,
    level,
    matcher
  }: {
    band: Band;
    key: string;
    level: RebalancingAllocationItem['level'];
    matcher: (aPrepared: Prepared) => boolean;
  }) => {
    const value = [...eligible.values()]
      .filter(matcher)
      .reduce((sum, { key: preparedKey }) => {
        return sum.plus(values.get(preparedKey));
      }, new Big(0));
    const weight = total.gt(0) ? value.div(total).times(100) : new Big(0);

    items.push({
      key,
      level,
      valueInBaseCurrency: toNumber(value),
      weight: toNumber(weight, 4),
      withinBand: hasBand(band) ? !isOutsideBand({ band, weight }) : undefined
    });
  };

  for (const assetClassNode of targets.assetClasses) {
    add({
      level: 'ASSET_CLASS',
      band: assetClassNode,
      key: assetClassNode.assetClass,
      matcher: ({ assetClass }) => assetClass === assetClassNode.assetClass
    });

    for (const subClassNode of assetClassNode.subClasses ?? []) {
      add({
        level: 'ASSET_SUB_CLASS',
        band: subClassNode,
        key: `${assetClassNode.assetClass}/${subClassNode.assetSubClass}`,
        matcher: ({ assetClass, assetSubClass }) => {
          return (
            assetClass === assetClassNode.assetClass &&
            assetSubClass === subClassNode.assetSubClass
          );
        }
      });

      for (const symbolNode of subClassNode.symbols ?? []) {
        add({
          level: 'SYMBOL',
          band: symbolNode,
          key: getKey(symbolNode),
          matcher: ({ key }) => key === getKey(symbolNode)
        });
      }
    }
  }

  return items;
}

function getKey({
  dataSource,
  symbol
}: {
  dataSource: DataSource;
  symbol: string;
}) {
  return `${dataSource}-${symbol}`;
}

function getSectorChecks({
  afterTotal,
  afterValues,
  beforeTotal,
  eligible,
  targets
}: {
  afterTotal: Big;
  afterValues: Map<string, Big>;
  beforeTotal: Big;
  eligible: Map<string, Prepared>;
  targets: TargetAllocationTargets;
}) {
  const exposure = (
    aSector: string,
    aTotal: Big,
    aValue: (aKey: string) => Big
  ) => {
    if (aTotal.lte(0)) {
      return new Big(0);
    }

    let sum = new Big(0);

    for (const prepared of eligible.values()) {
      const weight = (prepared.instrument.sectors ?? [])
        .filter(({ name }) => name.toLowerCase() === aSector.toLowerCase())
        .reduce((total, { weight: sectorWeight }) => total + sectorWeight, 0);

      sum = sum.plus(aValue(prepared.key).times(weight));
    }

    return sum.div(aTotal).times(100);
  };

  return (targets.sectors ?? []).map<RebalancingSectorCheck>((sectorNode) => {
    const before = exposure(sectorNode.sector, beforeTotal, (aKey) => {
      return eligible.get(aKey).value;
    });
    const after = exposure(sectorNode.sector, afterTotal, (aKey) => {
      return afterValues.get(aKey);
    });
    return {
      exposureAfter: toNumber(after, 4),
      exposureBefore: toNumber(before, 4),
      sector: sectorNode.sector,
      targetWeight: sectorNode.weight,
      withinBand: hasBand(sectorNode)
        ? !isOutsideBand({ band: sectorNode, weight: after })
        : undefined
    };
  });
}

function hasBand(aBand?: Band) {
  return !isNil(aBand?.min) || !isNil(aBand?.max);
}

function isOutsideBand({ band, weight }: { band: Band; weight: Big }) {
  return (
    (!isNil(band.min) && weight.lt(new Big(band.min).minus(BAND_TOLERANCE))) ||
    (!isNil(band.max) && weight.gt(new Big(band.max).plus(BAND_TOLERANCE)))
  );
}

function maxOf(aFirst: Big, aSecond: Big) {
  return aFirst.gt(aSecond) ? aFirst : aSecond;
}

function minOf(aFirst: Big, aSecond: Big) {
  return aFirst.lt(aSecond) ? aFirst : aSecond;
}

function roundQuantity({
  allowFractional,
  value
}: {
  allowFractional: boolean;
  value: Big;
}) {
  return value.round(
    allowFractional ? REBALANCING_QUANTITY_DECIMAL_PLACES : 0,
    Big.roundDown
  );
}

function toNumber(aValue: Big, aDecimalPlaces = 6) {
  return aValue.round(aDecimalPlaces).toNumber();
}
