import type {
  TargetAllocationSymbolResolver,
  TargetAllocationTargets
} from '@ghostfolio/common/interfaces';
import {
  AssetClass,
  AssetSubClass,
  DataSource
} from '@ghostfolio/prisma/enums';

import {
  TARGET_ALLOCATION_MAXIMUM_LEAF_NODES,
  validateTargetAllocation
} from './target-allocation-validation';

const KNOWN_SYMBOLS: {
  [symbol: string]: { assetClass: AssetClass; assetSubClass: AssetSubClass };
} = {
  AAPL: { assetClass: AssetClass.EQUITY, assetSubClass: AssetSubClass.STOCK },
  BND: {
    assetClass: AssetClass.FIXED_INCOME,
    assetSubClass: AssetSubClass.BOND
  },
  bitcoin: {
    assetClass: AssetClass.LIQUIDITY,
    assetSubClass: AssetSubClass.CRYPTOCURRENCY
  },
  VT: { assetClass: AssetClass.EQUITY, assetSubClass: AssetSubClass.ETF },
  XYZ: {
    assetClass: AssetClass.FIXED_INCOME,
    assetSubClass: AssetSubClass.BOND
  }
};

const resolveSymbol: TargetAllocationSymbolResolver = ({ symbol }) => {
  return KNOWN_SYMBOLS[symbol];
};

function getValidTargets(): TargetAllocationTargets {
  return {
    assetClasses: [
      {
        assetClass: AssetClass.EQUITY,
        weight: 60,
        subClasses: [
          {
            assetSubClass: AssetSubClass.ETF,
            weight: 40,
            symbols: [
              { dataSource: DataSource.YAHOO, symbol: 'VT', weight: 40 }
            ]
          },
          {
            assetSubClass: AssetSubClass.STOCK,
            weight: 20,
            symbols: [
              { dataSource: DataSource.YAHOO, symbol: 'AAPL', weight: 20 }
            ]
          }
        ]
      },
      {
        assetClass: AssetClass.FIXED_INCOME,
        weight: 30,
        subClasses: [
          {
            assetSubClass: AssetSubClass.BOND,
            weight: 30,
            symbols: [
              { dataSource: DataSource.YAHOO, symbol: 'BND', weight: 30 }
            ]
          }
        ]
      },
      {
        assetClass: AssetClass.LIQUIDITY,
        weight: 10,
        subClasses: [
          {
            assetSubClass: AssetSubClass.CRYPTOCURRENCY,
            weight: 10,
            symbols: [
              {
                dataSource: DataSource.COINGECKO,
                symbol: 'bitcoin',
                weight: 10
              }
            ]
          }
        ]
      }
    ]
  };
}

function validate(aTargets: TargetAllocationTargets) {
  return validateTargetAllocation({ resolveSymbol, targets: aTargets });
}

describe('TargetAllocationValidation', () => {
  it('accepts a valid hierarchical model with crypto under liquidity', () => {
    expect(validate(getValidTargets())).toEqual([]);
  });

  it('accepts class-only targets without sub-classes', () => {
    expect(
      validate({
        assetClasses: [
          { assetClass: AssetClass.EQUITY, weight: 70 },
          { assetClass: AssetClass.FIXED_INCOME, weight: 30 }
        ]
      })
    ).toEqual([]);
  });

  describe('sums', () => {
    it('rejects asset classes that sum to 99% and names the shortfall', () => {
      const targets = getValidTargets();
      targets.assetClasses[2].weight = 9;
      targets.assetClasses[2].subClasses = undefined;

      const errors = validate(targets);

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('SUM_NOT_100');
      expect(errors[0].path).toBe('assetClasses');
      expect(errors[0].message).toContain('99%');
      expect(errors[0].message).toContain('shortfall');
      expect(errors[0].message).toContain('1 percentage points');
    });

    it('rejects an empty model', () => {
      const errors = validate({ assetClasses: [] });

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('SUM_NOT_100');
    });

    it('accepts three targets of 33.33 within the rounding tolerance', () => {
      expect(
        validate({
          assetClasses: [
            { assetClass: AssetClass.EQUITY, weight: 33.33 },
            { assetClass: AssetClass.FIXED_INCOME, weight: 33.33 },
            { assetClass: AssetClass.COMMODITY, weight: 33.33 }
          ]
        })
      ).toEqual([]);
    });

    it('rejects three targets of 33.30 outside the rounding tolerance', () => {
      const errors = validate({
        assetClasses: [
          { assetClass: AssetClass.EQUITY, weight: 33.3 },
          { assetClass: AssetClass.FIXED_INCOME, weight: 33.3 },
          { assetClass: AssetClass.COMMODITY, weight: 33.3 }
        ]
      });

      expect(errors.map(({ code }) => code)).toEqual(['SUM_NOT_100']);
    });

    it('rejects symbols that exceed their sub-class target', () => {
      const targets = getValidTargets();
      targets.assetClasses[0].subClasses[0].symbols[0].weight = 45;

      const errors = validate(targets);

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('SUM_EXCEEDS_PARENT');
      expect(errors[0].path).toBe(
        'assetClasses[EQUITY].subClasses[ETF].symbols'
      );
      expect(errors[0].message).toContain('excess');
    });

    it('rejects symbols that fall short of their sub-class target', () => {
      const targets = getValidTargets();
      targets.assetClasses[0].subClasses[0].symbols[0].weight = 35;

      const errors = validate(targets);

      expect(errors.map(({ code }) => code)).toEqual(['SUM_BELOW_PARENT']);
    });

    it('rejects sub-classes that exceed their asset class target', () => {
      const targets = getValidTargets();
      targets.assetClasses[0].subClasses[1].weight = 25;
      targets.assetClasses[0].subClasses[1].symbols[0].weight = 25;

      const errors = validate(targets);

      expect(errors.map(({ code }) => code)).toEqual(['SUM_EXCEEDS_PARENT']);
    });
  });

  describe('bands', () => {
    it('accepts an optional band that contains the target', () => {
      const targets = getValidTargets();
      targets.assetClasses[2].subClasses[0].min = 8;
      targets.assetClasses[2].subClasses[0].max = 12;

      expect(validate(targets)).toEqual([]);
    });

    it('accepts a band whose limits equal the target', () => {
      const targets = getValidTargets();
      targets.assetClasses[2].subClasses[0].min = 10;
      targets.assetClasses[2].subClasses[0].max = 10;

      expect(validate(targets)).toEqual([]);
    });

    it('rejects a band that excludes its own target', () => {
      const targets = getValidTargets();
      targets.assetClasses[2].subClasses[0].min = 12;
      targets.assetClasses[2].subClasses[0].max = 15;

      const errors = validate(targets);

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('BAND_EXCLUDES_TARGET');
      expect(errors[0].path).toBe(
        'assetClasses[LIQUIDITY].subClasses[CRYPTOCURRENCY]'
      );
    });

    it('rejects a band whose minimum is above its maximum', () => {
      const targets = getValidTargets();
      targets.assetClasses[1].min = 31;
      targets.assetClasses[1].max = 29;

      expect(validate(targets).map(({ code }) => code)).toEqual([
        'BAND_EXCLUDES_TARGET'
      ]);
    });
  });

  describe('hierarchy', () => {
    it('rejects crypto placed under equity', () => {
      const targets: TargetAllocationTargets = {
        assetClasses: [
          {
            assetClass: AssetClass.EQUITY,
            weight: 100,
            subClasses: [
              { assetSubClass: AssetSubClass.CRYPTOCURRENCY, weight: 100 }
            ]
          }
        ]
      };

      const errors = validate(targets);

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('HIERARCHY_MISMATCH');
    });

    it('rejects an unknown symbol', () => {
      const targets = getValidTargets();
      targets.assetClasses[0].subClasses[0].symbols[0].symbol = 'UNKNOWN';

      const errors = validate(targets);

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('UNKNOWN_SYMBOL');
    });

    it('rejects a symbol whose own class differs from its parent', () => {
      const targets = getValidTargets();
      targets.assetClasses[0].subClasses[0].symbols[0].symbol = 'XYZ';

      const errors = validate(targets);

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('HIERARCHY_MISMATCH');
    });
  });

  describe('duplicates', () => {
    it('rejects the same asset class twice', () => {
      const errors = validate({
        assetClasses: [
          { assetClass: AssetClass.EQUITY, weight: 50 },
          { assetClass: AssetClass.EQUITY, weight: 50 }
        ]
      });

      expect(errors.map(({ code }) => code)).toEqual(['DUPLICATE_NODE']);
    });

    it('rejects the same symbol twice across sub-classes', () => {
      const targets = getValidTargets();
      targets.assetClasses[0].subClasses[1].symbols = [
        { dataSource: DataSource.YAHOO, symbol: 'VT', weight: 20 }
      ];

      expect(validate(targets).map(({ code }) => code)).toContain(
        'DUPLICATE_NODE'
      );
    });
  });

  describe('numbers', () => {
    it.each([-1, 101, NaN, Infinity])('rejects a weight of %p', (aWeight) => {
      const errors = validate({
        assetClasses: [
          { assetClass: AssetClass.EQUITY, weight: 100 },
          { assetClass: AssetClass.FIXED_INCOME, weight: aWeight }
        ]
      });

      expect(errors.map(({ code }) => code)).toContain('INVALID_NUMBER');
    });
  });

  describe('sectors', () => {
    it('accepts advisory sector targets with a valid band', () => {
      const targets = getValidTargets();
      targets.sectors = [
        { max: 35, min: 25, sector: 'Technology', weight: 30 },
        { sector: 'Healthcare', weight: 15 }
      ];

      expect(validate(targets)).toEqual([]);
    });

    it('rejects sector targets that sum to more than 100%', () => {
      const targets = getValidTargets();
      targets.sectors = [
        { sector: 'Technology', weight: 70 },
        { sector: 'Healthcare', weight: 40 }
      ];

      expect(validate(targets).map(({ code }) => code)).toEqual([
        'SUM_EXCEEDS_PARENT'
      ]);
    });

    it('rejects the same sector twice regardless of case', () => {
      const targets = getValidTargets();
      targets.sectors = [
        { sector: 'Technology', weight: 20 },
        { sector: 'technology', weight: 10 }
      ];

      expect(validate(targets).map(({ code }) => code)).toEqual([
        'DUPLICATE_NODE'
      ]);
    });
  });

  describe('limits', () => {
    it('accepts exactly the maximum number of targets', () => {
      const sectorCount = TARGET_ALLOCATION_MAXIMUM_LEAF_NODES - 1;

      const errors = validate({
        assetClasses: [{ assetClass: AssetClass.EQUITY, weight: 100 }],
        sectors: Array.from({ length: sectorCount }, (_, index) => {
          return { sector: `Sector ${index}`, weight: 0.1 };
        })
      });

      expect(errors.map(({ code }) => code)).not.toContain('TOO_MANY_NODES');
    });

    it('rejects more than the maximum number of targets', () => {
      const errors = validate({
        assetClasses: [{ assetClass: AssetClass.EQUITY, weight: 100 }],
        sectors: Array.from(
          { length: TARGET_ALLOCATION_MAXIMUM_LEAF_NODES },
          (_, index) => {
            return { sector: `Sector ${index}`, weight: 0.1 };
          }
        )
      });

      expect(errors.map(({ code }) => code)).toEqual(['TOO_MANY_NODES']);
    });
  });
});
