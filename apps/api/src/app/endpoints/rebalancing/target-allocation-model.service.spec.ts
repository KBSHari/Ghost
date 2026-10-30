import type {
  TargetAllocationParameters,
  TargetAllocationTargets
} from '@ghostfolio/common/interfaces';
import {
  AssetClass,
  AssetSubClass,
  DataSource
} from '@ghostfolio/prisma/enums';

import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { TargetAllocationModelService } from './target-allocation-model.service';

const PARAMETERS: TargetAllocationParameters = {
  allowFractional: true,
  allowSells: true,
  cashReserveAmount: 0,
  cashReservePercentage: 0,
  driftThreshold: 0,
  flatFee: 0,
  minTradeValue: 0,
  percentageFee: 0
};

const TARGETS: TargetAllocationTargets = {
  assetClasses: [
    {
      assetClass: AssetClass.EQUITY,
      weight: 100,
      subClasses: [
        {
          assetSubClass: AssetSubClass.ETF,
          weight: 100,
          symbols: [{ dataSource: DataSource.YAHOO, symbol: 'VT', weight: 100 }]
        }
      ]
    }
  ]
};

function getModelRow(aOverrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date('2026-01-01'),
    id: 'model-1',
    name: 'Growth',
    parameters: PARAMETERS,
    targets: TARGETS,
    updatedAt: new Date('2026-01-02'),
    userId: 'user-1',
    ...aOverrides
  };
}

function getPrismaError(aCode: string) {
  return new Prisma.PrismaClientKnownRequestError('error', {
    clientVersion: 'test',
    code: aCode
  });
}

async function getHttpException(aPromise: Promise<unknown>) {
  try {
    await aPromise;
  } catch (error) {
    return error as HttpException;
  }

  throw new Error('Expected the promise to be rejected');
}

describe('TargetAllocationModelService', () => {
  let model: {
    create: jest.Mock;
    delete: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
  let service: TargetAllocationModelService;
  let symbolProfileService: { getSymbolProfiles: jest.Mock };

  beforeEach(() => {
    model = {
      create: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn()
    };
    symbolProfileService = {
      getSymbolProfiles: jest.fn().mockResolvedValue([
        {
          assetClass: AssetClass.EQUITY,
          assetSubClass: AssetSubClass.ETF,
          dataSource: DataSource.YAHOO,
          symbol: 'VT'
        }
      ])
    };

    service = new TargetAllocationModelService(
      { targetAllocationModel: model } as never,
      symbolProfileService as never
    );
  });

  describe('createModel', () => {
    it('stores the model for the user', async () => {
      model.create.mockResolvedValue(getModelRow());

      const result = await service.createModel({
        data: { name: 'Growth', parameters: PARAMETERS, targets: TARGETS },
        userId: 'user-1'
      });

      expect(model.create).toHaveBeenCalledWith({
        data: {
          name: 'Growth',
          parameters: PARAMETERS,
          targets: TARGETS,
          userId: 'user-1'
        }
      });
      expect(result).toMatchObject({ id: 'model-1', name: 'Growth' });
      expect(result).not.toHaveProperty('userId');
    });

    it('rejects targets that do not sum to 100% and stores nothing', async () => {
      const targets: TargetAllocationTargets = {
        assetClasses: [{ assetClass: AssetClass.EQUITY, weight: 99 }]
      };

      const error = await getHttpException(
        service.createModel({
          data: { targets, name: 'Growth', parameters: PARAMETERS },
          userId: 'user-1'
        })
      );

      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        errors: [expect.objectContaining({ code: 'SUM_NOT_100' })]
      });
      expect(model.create).not.toHaveBeenCalled();
    });

    it('rejects a symbol that has no asset profile', async () => {
      symbolProfileService.getSymbolProfiles.mockResolvedValue([]);

      const error = await getHttpException(
        service.createModel({
          data: { name: 'Growth', parameters: PARAMETERS, targets: TARGETS },
          userId: 'user-1'
        })
      );

      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        errors: [expect.objectContaining({ code: 'UNKNOWN_SYMBOL' })]
      });
    });

    it('rejects a symbol whose asset profile belongs to another class', async () => {
      symbolProfileService.getSymbolProfiles.mockResolvedValue([
        {
          assetClass: AssetClass.FIXED_INCOME,
          assetSubClass: AssetSubClass.BOND,
          dataSource: DataSource.YAHOO,
          symbol: 'VT'
        }
      ]);

      const error = await getHttpException(
        service.createModel({
          data: { name: 'Growth', parameters: PARAMETERS, targets: TARGETS },
          userId: 'user-1'
        })
      );

      expect(error.getResponse()).toMatchObject({
        errors: [expect.objectContaining({ code: 'HIERARCHY_MISMATCH' })]
      });
    });

    it('answers a duplicate name with a conflict', async () => {
      model.create.mockRejectedValue(getPrismaError('P2002'));

      const error = await getHttpException(
        service.createModel({
          data: { name: 'Growth', parameters: PARAMETERS, targets: TARGETS },
          userId: 'user-1'
        })
      );

      expect(error.getStatus()).toBe(409);
    });
  });

  describe('getModel', () => {
    it('looks the model up by id and user', async () => {
      model.findFirst.mockResolvedValue(getModelRow());

      await service.getModel({ id: 'model-1', userId: 'user-1' });

      expect(model.findFirst).toHaveBeenCalledWith({
        where: { id: 'model-1', userId: 'user-1' }
      });
    });

    it('answers a model of another user like a missing one', async () => {
      model.findFirst.mockResolvedValue(null);

      const error = await getHttpException(
        service.getModel({ id: 'model-1', userId: 'user-2' })
      );

      expect(error.getStatus()).toBe(404);
    });
  });

  describe('getModels', () => {
    it('returns only the models of the user, sorted by name', async () => {
      model.findMany.mockResolvedValue([getModelRow()]);

      const result = await service.getModels({ userId: 'user-1' });

      expect(model.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
        where: { userId: 'user-1' }
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('updateModel', () => {
    it('rejects targets that do not sum to 100% and writes nothing', async () => {
      const error = await getHttpException(
        service.updateModel({
          data: {
            name: 'Growth',
            parameters: PARAMETERS,
            targets: {
              assetClasses: [{ assetClass: AssetClass.EQUITY, weight: 99 }]
            }
          },
          id: 'model-1',
          userId: 'user-1'
        })
      );

      expect(error.getStatus()).toBe(400);
      expect(model.update).not.toHaveBeenCalled();
    });

    it('updates by id and user', async () => {
      model.update.mockResolvedValue(getModelRow({ name: 'Renamed' }));

      const result = await service.updateModel({
        data: { name: 'Renamed', parameters: PARAMETERS, targets: TARGETS },
        id: 'model-1',
        userId: 'user-1'
      });

      expect(model.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'model-1', userId: 'user-1' } })
      );
      expect(result.name).toBe('Renamed');
    });

    it('answers a model of another user with not found', async () => {
      model.update.mockRejectedValue(getPrismaError('P2025'));

      const error = await getHttpException(
        service.updateModel({
          data: { name: 'Renamed', parameters: PARAMETERS, targets: TARGETS },
          id: 'model-1',
          userId: 'user-2'
        })
      );

      expect(error.getStatus()).toBe(404);
    });

    it('answers a name that is already used with a conflict', async () => {
      model.update.mockRejectedValue(getPrismaError('P2002'));

      const error = await getHttpException(
        service.updateModel({
          data: { name: 'Taken', parameters: PARAMETERS, targets: TARGETS },
          id: 'model-1',
          userId: 'user-1'
        })
      );

      expect(error.getStatus()).toBe(409);
    });
  });

  describe('deleteModel', () => {
    it('deletes by id and user', async () => {
      model.delete.mockResolvedValue(getModelRow());

      await service.deleteModel({ id: 'model-1', userId: 'user-1' });

      expect(model.delete).toHaveBeenCalledWith({
        where: { id: 'model-1', userId: 'user-1' }
      });
    });

    it('answers a model of another user with not found', async () => {
      model.delete.mockRejectedValue(getPrismaError('P2025'));

      const error = await getHttpException(
        service.deleteModel({ id: 'model-1', userId: 'user-2' })
      );

      expect(error.getStatus()).toBe(404);
    });
  });

  describe('validateTargets', () => {
    it('does not look up asset profiles when there are no symbol targets', async () => {
      await service.validateTargets({
        targets: {
          assetClasses: [{ assetClass: AssetClass.EQUITY, weight: 100 }]
        },
        userId: 'user-1'
      });

      expect(symbolProfileService.getSymbolProfiles).not.toHaveBeenCalled();
    });

    it('accepts a valid tree with a resolvable symbol', async () => {
      await expect(
        service.validateTargets({ targets: TARGETS, userId: 'user-1' })
      ).resolves.toBeUndefined();
    });

    it('rejects an oversized tree before looking up any symbol', async () => {
      const targets: TargetAllocationTargets = {
        assetClasses: [
          {
            assetClass: AssetClass.EQUITY,
            weight: 100,
            subClasses: [
              {
                assetSubClass: AssetSubClass.ETF,
                weight: 100,
                symbols: Array.from({ length: 501 }, (_, index) => {
                  return {
                    dataSource: DataSource.YAHOO,
                    symbol: `S${index}`,
                    weight: 0.2
                  };
                })
              }
            ]
          }
        ]
      };

      const error = await getHttpException(
        service.validateTargets({ targets, userId: 'user-1' })
      );

      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        errors: [expect.objectContaining({ code: 'TOO_MANY_NODES' })]
      });
      expect(symbolProfileService.getSymbolProfiles).not.toHaveBeenCalled();
    });

    describe('custom asset profiles', () => {
      const manualTargets: TargetAllocationTargets = {
        assetClasses: [
          {
            assetClass: AssetClass.EQUITY,
            weight: 100,
            subClasses: [
              {
                assetSubClass: AssetSubClass.STOCK,
                weight: 100,
                symbols: [
                  {
                    dataSource: DataSource.MANUAL,
                    symbol: 'a1b2c3d4-0000-4000-8000-000000000000',
                    weight: 100
                  }
                ]
              }
            ]
          }
        ]
      };

      function mockManualProfile(aOwnerId: string) {
        symbolProfileService.getSymbolProfiles.mockResolvedValue([
          {
            assetClass: AssetClass.EQUITY,
            assetSubClass: AssetSubClass.STOCK,
            dataSource: DataSource.MANUAL,
            symbol: 'a1b2c3d4-0000-4000-8000-000000000000',
            userId: aOwnerId
          }
        ]);
      }

      it('accepts a custom asset profile of the user', async () => {
        mockManualProfile('user-1');

        await expect(
          service.validateTargets({ targets: manualTargets, userId: 'user-1' })
        ).resolves.toBeUndefined();
      });

      it('treats a custom asset profile of another user as unknown', async () => {
        mockManualProfile('user-2');

        const error = await getHttpException(
          service.validateTargets({ targets: manualTargets, userId: 'user-1' })
        );

        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toMatchObject({
          errors: [expect.objectContaining({ code: 'UNKNOWN_SYMBOL' })]
        });
      });
    });
  });
});
