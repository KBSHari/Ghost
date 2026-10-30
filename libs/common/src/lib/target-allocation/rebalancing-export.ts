import type { CreateOrderDto } from '@ghostfolio/common/dtos';
import type { RebalancingPlan } from '@ghostfolio/common/interfaces';

export const REBALANCING_CSV_COLUMNS = [
  'date',
  'type',
  'symbol',
  'dataSource',
  'currency',
  'quantity',
  'unitPrice',
  'fee',
  'accountId'
] as const;

export function buildRebalancingCsv(aPlan: RebalancingPlan) {
  const rows = getActivities(aPlan).map((activity) => {
    return [
      escapeText(activity.date),
      escapeText(activity.type),
      escapeText(activity.symbol),
      escapeText(activity.dataSource ?? ''),
      escapeText(activity.currency),
      String(activity.quantity),
      String(activity.unitPrice),
      String(activity.fee),
      escapeText(activity.accountId ?? '')
    ].join(',');
  });

  return [REBALANCING_CSV_COLUMNS.join(','), ...rows].join('\n');
}

export function buildRebalancingImportJson(aPlan: RebalancingPlan): {
  activities: CreateOrderDto[];
} {
  return { activities: getActivities(aPlan) };
}

// Neutralize spreadsheet formulas and quote values that contain separators
function escapeText(aValue: string) {
  let value = aValue;

  if (/^[=+\-@\t\r]/.test(value)) {
    value = `'${value}`;
  }

  if (/[",\n\r]/.test(value)) {
    value = `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function getActivities(aPlan: RebalancingPlan): CreateOrderDto[] {
  // An account is only attached when the plan covers exactly one account
  const accountId =
    aPlan.accountIds?.length === 1 ? aPlan.accountIds[0] : undefined;

  return aPlan.trades.map((trade) => {
    return {
      currency: trade.currency,
      dataSource: trade.dataSource,
      date: aPlan.calculatedAt,
      fee: trade.feeInAssetCurrency,
      quantity: trade.quantity,
      symbol: trade.symbol,
      type: trade.side,
      unitPrice: trade.unitPrice,
      ...(accountId ? { accountId } : {})
    };
  });
}
