import { DataSource } from '@ghostfolio/prisma/enums';

export interface RebalancingAllocationItem {
  key: string;
  level: 'ASSET_CLASS' | 'ASSET_SUB_CLASS' | 'SYMBOL';
  valueInBaseCurrency: number;
  weight: number;
  withinBand?: boolean;
}

export interface RebalancingCash {
  after: number;
  before: number;
  reserve: number;
  shortfall: number;
}

export interface RebalancingExcludedHolding {
  reason: 'NO_ASSET_CLASS' | 'NO_PRICE';
  symbol: string;
}

export interface RebalancingPlan {
  accountIds: string[];
  allocationAfter: RebalancingAllocationItem[];
  allocationBefore: RebalancingAllocationItem[];
  calculatedAt: string;
  cash: RebalancingCash;
  excludedHoldings: RebalancingExcludedHolding[];
  message?: string;
  sectorChecks: RebalancingSectorCheck[];
  summary: RebalancingSummary;
  trades: RebalancingTrade[];
  warnings: RebalancingWarning[];
}

export interface RebalancingSectorCheck {
  exposureAfter: number;
  exposureBefore: number;
  sector: string;
  targetWeight: number;
  withinBand?: boolean;
}

export interface RebalancingSummary {
  buyCount: number;
  residualCash: number;
  sellCount: number;
  totalFeesInBaseCurrency: number;
}

export interface RebalancingTrade {
  currency: string;
  dataSource: DataSource;
  feeInAssetCurrency: number;
  feeInBaseCurrency: number;
  name?: string;
  priceDate?: string;
  quantity: number;
  side: 'BUY' | 'SELL';
  symbol: string;
  unitPrice: number;
  valueInBaseCurrency: number;
}

export interface RebalancingWarning {
  code: RebalancingWarningCode;
  message: string;
}

export type RebalancingWarningCode =
  | 'BELOW_THRESHOLD'
  | 'CASH_SHORTFALL'
  | 'EMPTY_BUCKET'
  | 'NOT_CONVERGED'
  | 'TARGETS_NOT_REACHED';
