import {
  AssetClass,
  AssetSubClass,
  DataSource
} from '@ghostfolio/prisma/enums';

export interface TargetAllocationClassNode {
  assetClass: AssetClass;
  max?: number;
  min?: number;
  subClasses?: TargetAllocationSubClassNode[];
  weight: number;
}

export interface TargetAllocationModel {
  createdAt: Date;
  id: string;
  name: string;
  parameters: TargetAllocationParameters;
  targets: TargetAllocationTargets;
  updatedAt: Date;
}

export interface TargetAllocationParameters {
  allowFractional: boolean;
  allowSells: boolean;
  cashReserveAmount: number;
  cashReservePercentage: number;
  driftThreshold: number;
  flatFee: number;
  minTradeValue: number;
  percentageFee: number;
}

export interface TargetAllocationSectorNode {
  max?: number;
  min?: number;
  sector: string;
  weight: number;
}

export interface TargetAllocationSubClassNode {
  assetSubClass: AssetSubClass;
  max?: number;
  min?: number;
  symbols?: TargetAllocationSymbolNode[];
  weight: number;
}

export interface TargetAllocationSymbolNode {
  dataSource: DataSource;
  max?: number;
  min?: number;
  symbol: string;
  weight: number;
}

// Weights at every level are percentages of the whole portfolio
export interface TargetAllocationTargets {
  assetClasses: TargetAllocationClassNode[];
  sectors?: TargetAllocationSectorNode[];
}

export interface TargetAllocationValidationError {
  code: TargetAllocationValidationErrorCode;
  message: string;
  path: string;
}

export type TargetAllocationValidationErrorCode =
  | 'BAND_EXCLUDES_TARGET'
  | 'DUPLICATE_NODE'
  | 'HIERARCHY_MISMATCH'
  | 'INVALID_NUMBER'
  | 'SUM_BELOW_PARENT'
  | 'SUM_EXCEEDS_PARENT'
  | 'SUM_NOT_100'
  | 'TOO_MANY_NODES'
  | 'UNKNOWN_SYMBOL';

export type TargetAllocationSymbolResolver = (aIdentifier: {
  dataSource: DataSource;
  symbol: string;
}) => { assetClass?: AssetClass; assetSubClass?: AssetSubClass } | undefined;
