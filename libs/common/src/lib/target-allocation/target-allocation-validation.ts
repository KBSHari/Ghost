import { ASSET_CLASS_MAPPING } from '@ghostfolio/common/config';
import type {
  TargetAllocationSymbolResolver,
  TargetAllocationTargets,
  TargetAllocationValidationError
} from '@ghostfolio/common/interfaces';

import { Big } from 'big.js';
import { isNil } from 'lodash-es';

export const TARGET_ALLOCATION_MAXIMUM_LEAF_NODES = 500;
export const TARGET_ALLOCATION_SUM_TOLERANCE = 0.01;

interface WeightedNode {
  max?: number | null;
  min?: number | null;
  weight: number;
}

// Cheap check that callers run before any lookup of the symbols
export function getTargetAllocationSizeError(
  aTargets: TargetAllocationTargets
): TargetAllocationValidationError | undefined {
  const leafCount = getLeafCount({
    assetClasses: aTargets?.assetClasses ?? [],
    sectors: aTargets?.sectors ?? []
  });

  if (leafCount <= TARGET_ALLOCATION_MAXIMUM_LEAF_NODES) {
    return undefined;
  }

  return {
    code: 'TOO_MANY_NODES',
    message: `A model can have at most ${TARGET_ALLOCATION_MAXIMUM_LEAF_NODES} targets`,
    path: 'assetClasses'
  };
}

export function validateTargetAllocation({
  resolveSymbol,
  targets
}: {
  resolveSymbol: TargetAllocationSymbolResolver;
  targets: TargetAllocationTargets;
}): TargetAllocationValidationError[] {
  const errors: TargetAllocationValidationError[] = [];
  const assetClasses = targets?.assetClasses ?? [];
  const sectors = targets?.sectors ?? [];

  const sizeError = getTargetAllocationSizeError(targets);

  if (sizeError) {
    errors.push(sizeError);

    return errors;
  }

  const symbolKeys = new Set<string>();

  validateSiblings({
    errors,
    label: 'Asset classes',
    nodes: assetClasses,
    parentWeight: 100,
    path: 'assetClasses'
  });

  const assetClassKeys = new Set<string>();

  for (const assetClassNode of assetClasses) {
    const assetClassPath = `assetClasses[${assetClassNode.assetClass}]`;

    validateNode({ errors, node: assetClassNode, path: assetClassPath });
    validateUnique({
      errors,
      keys: assetClassKeys,
      key: assetClassNode.assetClass,
      path: assetClassPath
    });

    const subClasses = assetClassNode.subClasses ?? [];

    if (subClasses.length === 0) {
      continue;
    }

    const subClassesPath = `${assetClassPath}.subClasses`;
    const subClassKeys = new Set<string>();

    validateSiblings({
      errors,
      label: `Sub-classes of ${assetClassNode.assetClass}`,
      nodes: subClasses,
      parentWeight: assetClassNode.weight,
      path: subClassesPath
    });

    for (const subClassNode of subClasses) {
      const subClassPath = `${subClassesPath}[${subClassNode.assetSubClass}]`;

      validateNode({ errors, node: subClassNode, path: subClassPath });
      validateUnique({
        errors,
        keys: subClassKeys,
        key: subClassNode.assetSubClass,
        path: subClassPath
      });

      if (
        !(ASSET_CLASS_MAPPING.get(assetClassNode.assetClass) ?? []).includes(
          subClassNode.assetSubClass
        )
      ) {
        errors.push({
          code: 'HIERARCHY_MISMATCH',
          message: `Sub-class ${subClassNode.assetSubClass} does not belong to asset class ${assetClassNode.assetClass}`,
          path: subClassPath
        });
      }

      const symbols = subClassNode.symbols ?? [];

      if (symbols.length === 0) {
        continue;
      }

      const symbolsPath = `${subClassPath}.symbols`;

      validateSiblings({
        errors,
        label: `Symbols of ${subClassNode.assetSubClass}`,
        nodes: symbols,
        parentWeight: subClassNode.weight,
        path: symbolsPath
      });

      for (const symbolNode of symbols) {
        const symbolKey = `${symbolNode.dataSource}-${symbolNode.symbol}`;
        const symbolPath = `${symbolsPath}[${symbolKey}]`;

        validateNode({ errors, node: symbolNode, path: symbolPath });
        validateUnique({
          errors,
          key: symbolKey,
          keys: symbolKeys,
          path: symbolPath
        });

        const resolved = resolveSymbol({
          dataSource: symbolNode.dataSource,
          symbol: symbolNode.symbol
        });

        if (!resolved) {
          errors.push({
            code: 'UNKNOWN_SYMBOL',
            message: `Symbol ${symbolNode.symbol} could not be found`,
            path: symbolPath
          });
        } else if (
          (resolved.assetClass &&
            resolved.assetClass !== assetClassNode.assetClass) ||
          (resolved.assetSubClass &&
            resolved.assetSubClass !== subClassNode.assetSubClass)
        ) {
          errors.push({
            code: 'HIERARCHY_MISMATCH',
            message: `Symbol ${symbolNode.symbol} is not a ${subClassNode.assetSubClass} of ${assetClassNode.assetClass}`,
            path: symbolPath
          });
        }
      }
    }
  }

  const sectorKeys = new Set<string>();

  for (const sectorNode of sectors) {
    const sectorPath = `sectors[${sectorNode.sector}]`;

    validateNode({ errors, node: sectorNode, path: sectorPath });
    validateUnique({
      errors,
      keys: sectorKeys,
      key: sectorNode.sector.toLowerCase(),
      path: sectorPath
    });
  }

  if (sectors.length > 0 && areWeightsValid(sectors)) {
    const sum = sumOf(sectors);

    if (sum.gt(new Big(100).plus(TARGET_ALLOCATION_SUM_TOLERANCE))) {
      errors.push({
        code: 'SUM_EXCEEDS_PARENT',
        message: `Sector targets sum to ${format(sum)}% which exceeds 100%`,
        path: 'sectors'
      });
    }
  }

  return errors;
}

function areWeightsValid(aNodes: WeightedNode[]) {
  return aNodes.every(({ weight }) => {
    return isPercentage(weight);
  });
}

function format(aValue: Big) {
  return aValue.round(4).toString();
}

function getLeafCount({
  assetClasses,
  sectors
}: {
  assetClasses: TargetAllocationTargets['assetClasses'];
  sectors: NonNullable<TargetAllocationTargets['sectors']>;
}) {
  let count = sectors.length;

  for (const assetClassNode of assetClasses) {
    const subClasses = assetClassNode.subClasses ?? [];

    if (subClasses.length === 0) {
      count += 1;
      continue;
    }

    for (const subClassNode of subClasses) {
      const symbols = subClassNode.symbols ?? [];

      count += symbols.length === 0 ? 1 : symbols.length;
    }
  }

  return count;
}

function isPercentage(aValue: unknown): aValue is number {
  return (
    typeof aValue === 'number' &&
    Number.isFinite(aValue) &&
    aValue >= 0 &&
    aValue <= 100
  );
}

function sumOf(aNodes: WeightedNode[]) {
  return aNodes.reduce((sum, { weight }) => {
    return sum.plus(weight);
  }, new Big(0));
}

function validateNode({
  errors,
  node,
  path
}: {
  errors: TargetAllocationValidationError[];
  node: WeightedNode;
  path: string;
}) {
  for (const key of ['weight', 'min', 'max'] as const) {
    const value = node[key];

    if (key !== 'weight' && isNil(value)) {
      continue;
    }

    if (!isPercentage(value)) {
      errors.push({
        path,
        code: 'INVALID_NUMBER',
        message: `${key} must be a number between 0 and 100`
      });

      return;
    }
  }

  const { max, min, weight } = node;

  if ((!isNil(min) && min > weight) || (!isNil(max) && max < weight)) {
    errors.push({
      path,
      code: 'BAND_EXCLUDES_TARGET',
      message: `The band (${min ?? 0}% to ${max ?? 100}%) must contain the target of ${weight}%`
    });
  }
}

function validateSiblings({
  errors,
  label,
  nodes,
  parentWeight,
  path
}: {
  errors: TargetAllocationValidationError[];
  label: string;
  nodes: WeightedNode[];
  parentWeight: number;
  path: string;
}) {
  if (!areWeightsValid(nodes) || !isPercentage(parentWeight)) {
    return;
  }

  const difference = sumOf(nodes).minus(parentWeight);

  if (difference.abs().lte(TARGET_ALLOCATION_SUM_TOLERANCE)) {
    return;
  }

  const isRoot = path === 'assetClasses';
  const sum = sumOf(nodes);

  if (isRoot) {
    errors.push({
      path,
      code: 'SUM_NOT_100',
      message: `${label} sum to ${format(sum)}% but must sum to 100% (${difference.lt(0) ? 'shortfall' : 'excess'} of ${format(difference.abs())} percentage points)`
    });
  } else {
    errors.push({
      path,
      code: difference.gt(0) ? 'SUM_EXCEEDS_PARENT' : 'SUM_BELOW_PARENT',
      message: `${label} sum to ${format(sum)}% but their parent target is ${format(new Big(parentWeight))}% (${difference.lt(0) ? 'shortfall' : 'excess'} of ${format(difference.abs())} percentage points)`
    });
  }
}

function validateUnique({
  errors,
  key,
  keys,
  path
}: {
  errors: TargetAllocationValidationError[];
  key: string;
  keys: Set<string>;
  path: string;
}) {
  if (keys.has(key)) {
    errors.push({
      path,
      code: 'DUPLICATE_NODE',
      message: `${key} is defined more than once`
    });
  }

  keys.add(key);
}
