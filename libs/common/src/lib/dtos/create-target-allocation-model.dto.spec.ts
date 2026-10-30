import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import 'reflect-metadata';

import { CreateRebalancingPlanDto } from './create-rebalancing-plan.dto';
import { CreateTargetAllocationModelDto } from './create-target-allocation-model.dto';

// Same options as the global validation pipe of the API
const VALIDATION_OPTIONS = { forbidNonWhitelisted: true, whitelist: true };

function getValidModel() {
  return {
    name: 'Growth',
    parameters: {
      allowFractional: true,
      allowSells: true,
      cashReserveAmount: 0,
      cashReservePercentage: 2,
      driftThreshold: 0,
      flatFee: 5,
      minTradeValue: 0,
      percentageFee: 0.1
    },
    targets: {
      assetClasses: [
        {
          assetClass: 'EQUITY',
          max: 65,
          min: 55,
          weight: 60,
          subClasses: [
            {
              assetSubClass: 'ETF',
              weight: 60,
              symbols: [{ dataSource: 'YAHOO', symbol: 'VT', weight: 60 }]
            }
          ]
        },
        { assetClass: 'FIXED_INCOME', weight: 40 }
      ],
      sectors: [{ sector: 'Technology', weight: 25 }]
    }
  };
}

async function getErrors(aPlain: unknown) {
  return validate(
    plainToInstance(CreateTargetAllocationModelDto, aPlain),
    VALIDATION_OPTIONS
  );
}

describe('CreateTargetAllocationModelDto', () => {
  it('accepts a valid nested model', async () => {
    expect(await getErrors(getValidModel())).toEqual([]);
  });

  it('trims the name', () => {
    const instance = plainToInstance(CreateTargetAllocationModelDto, {
      ...getValidModel(),
      name: '  Growth  '
    });

    expect(instance.name).toBe('Growth');
  });

  it.each(['', 'x'.repeat(101)])('rejects the name "%s"', async (aName) => {
    expect(await getErrors({ ...getValidModel(), name: aName })).not.toEqual(
      []
    );
  });

  it('rejects an unknown property on a nested symbol node', async () => {
    const model = getValidModel();
    Object.assign(model.targets.assetClasses[0].subClasses[0].symbols[0], {
      extra: 1
    });

    expect(await getErrors(model)).not.toEqual([]);
  });

  it('rejects an unknown property on the model', async () => {
    expect(
      await getErrors({ ...getValidModel(), userId: 'other' })
    ).not.toEqual([]);
  });

  it('rejects a weight above 100 on a nested node', async () => {
    const model = getValidModel();
    model.targets.assetClasses[0].subClasses[0].symbols[0].weight = 101;

    expect(await getErrors(model)).not.toEqual([]);
  });

  it('rejects an unknown asset class', async () => {
    const model = getValidModel();
    model.targets.assetClasses[0].assetClass = 'NOT_A_CLASS';

    expect(await getErrors(model)).not.toEqual([]);
  });

  it('rejects negative parameters', async () => {
    const model = getValidModel();
    model.parameters.flatFee = -1;

    expect(await getErrors(model)).not.toEqual([]);
  });

  it('rejects a missing parameters object', async () => {
    const { parameters, ...model } = getValidModel();

    expect(parameters).toBeDefined();
    expect(await getErrors(model)).not.toEqual([]);
  });

  it('rejects more than 500 sector targets', async () => {
    const model = getValidModel();
    model.targets.sectors = Array.from({ length: 501 }, (_, index) => {
      return { sector: `Sector ${index}`, weight: 0.1 };
    });

    expect(await getErrors(model)).not.toEqual([]);
  });
});

describe('CreateRebalancingPlanDto', () => {
  async function getPlanErrors(aPlain: unknown) {
    return validate(
      plainToInstance(CreateRebalancingPlanDto, aPlain),
      VALIDATION_OPTIONS
    );
  }

  it('accepts a model id only', async () => {
    expect(await getPlanErrors({ modelId: 'model-1' })).toEqual([]);
  });

  it('accepts account ids and overrides', async () => {
    expect(
      await getPlanErrors({
        accountIds: ['account-1', 'account-2'],
        modelId: 'model-1',
        overrides: { allowSells: false, flatFee: 2, percentageFee: 0.5 }
      })
    ).toEqual([]);
  });

  it('rejects a missing model id', async () => {
    expect(await getPlanErrors({})).not.toEqual([]);
  });

  it('rejects duplicate account ids', async () => {
    expect(
      await getPlanErrors({ accountIds: ['a', 'a'], modelId: 'model-1' })
    ).not.toEqual([]);
  });

  it('rejects more than 100 account ids', async () => {
    expect(
      await getPlanErrors({
        accountIds: Array.from({ length: 101 }, (_, index) => `a${index}`),
        modelId: 'model-1'
      })
    ).not.toEqual([]);
  });

  it('rejects an out-of-range override', async () => {
    expect(
      await getPlanErrors({
        modelId: 'model-1',
        overrides: { percentageFee: 101 }
      })
    ).not.toEqual([]);
  });

  it('rejects an unknown override', async () => {
    expect(
      await getPlanErrors({ modelId: 'model-1', overrides: { unknown: 1 } })
    ).not.toEqual([]);
  });

  it('rejects overrides given as an array', async () => {
    const errors = await getPlanErrors({
      modelId: 'model-1',
      overrides: [{ flatFee: 1 }]
    });

    expect(errors.map(({ property }) => property)).toContain('overrides');
  });

  it('rejects an absurdly high fee override', async () => {
    const [error] = await getPlanErrors({
      modelId: 'model-1',
      overrides: { flatFee: 1e300 }
    });

    expect(error.property).toBe('overrides');
    expect(error.children[0].property).toBe('flatFee');
    expect(error.children[0].constraints).toHaveProperty('max');
  });

  it('rejects an id longer than 64 characters', async () => {
    const modelErrors = await getPlanErrors({ modelId: 'x'.repeat(65) });
    const accountErrors = await getPlanErrors({
      accountIds: ['x'.repeat(65)],
      modelId: 'model-1'
    });

    expect(modelErrors[0].property).toBe('modelId');
    expect(modelErrors[0].constraints).toHaveProperty('maxLength');
    expect(accountErrors[0].property).toBe('accountIds');
    expect(accountErrors[0].constraints).toHaveProperty('maxLength');
  });
});

describe('CreateTargetAllocationModelDto limits', () => {
  it('rejects more asset classes than exist', async () => {
    const model = getValidModel();
    model.targets.assetClasses = Array.from({ length: 7 }, () => {
      return { assetClass: 'EQUITY', weight: 1 };
    });

    const [error] = await getErrors(model);

    expect(error.property).toBe('targets');
    expect(error.children[0].property).toBe('assetClasses');
    expect(error.children[0].constraints).toHaveProperty('arrayMaxSize');
  });

  it('rejects more sub-classes than exist', async () => {
    const model = getValidModel();
    model.targets.assetClasses[0].subClasses = Array.from(
      { length: 12 },
      () => {
        return { assetSubClass: 'ETF', weight: 1, symbols: [] };
      }
    );

    const [error] = await getErrors(model);

    expect(error.property).toBe('targets');
    expect(
      error.children[0].children[0].children[0].constraints
    ).toHaveProperty('arrayMaxSize');
  });

  it('rejects an absurdly high flat fee', async () => {
    const model = getValidModel();
    model.parameters.flatFee = 1e300;

    const [error] = await getErrors(model);

    expect(error.property).toBe('parameters');
    expect(error.children[0].property).toBe('flatFee');
    expect(error.children[0].constraints).toHaveProperty('max');
  });
});
