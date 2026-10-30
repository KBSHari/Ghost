import { ALLOW_DURING_IMPERSONATION_KEY } from '@ghostfolio/api/decorators/allow-during-impersonation.decorator';
import { HAS_PERMISSION_KEY } from '@ghostfolio/api/decorators/has-permission.decorator';
import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { permissions } from '@ghostfolio/common/permissions';
import type { RequestWithUser } from '@ghostfolio/common/types';

import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from '@nestjs/passport';

import { TargetAllocationModelsController } from './target-allocation-models.controller';

function getRequest(aSettings: Record<string, unknown> = {}) {
  return {
    user: { id: 'user-1', settings: { settings: aSettings } }
  } as unknown as RequestWithUser;
}

describe('TargetAllocationModelsController', () => {
  let service: {
    createModel: jest.Mock;
    deleteModel: jest.Mock;
    getModel: jest.Mock;
    getModels: jest.Mock;
    updateModel: jest.Mock;
  };

  function getController(aRequest = getRequest()) {
    return new TargetAllocationModelsController(aRequest, service as never);
  }

  const DATA = { name: 'Growth', parameters: {}, targets: {} } as never;

  beforeEach(() => {
    service = {
      createModel: jest.fn().mockResolvedValue({ id: 'model-1' }),
      deleteModel: jest.fn().mockResolvedValue(undefined),
      getModel: jest.fn().mockResolvedValue({ id: 'model-1' }),
      getModels: jest.fn().mockResolvedValue([]),
      updateModel: jest.fn().mockResolvedValue({ id: 'model-1' })
    };
  });

  describe('security', () => {
    // Route handlers are only read for their metadata, never called
    const prototype =
      TargetAllocationModelsController.prototype as unknown as Record<
        string,
        object
      >;

    it.each([
      ['createModel', permissions.createRebalancingModel],
      ['deleteModel', permissions.deleteRebalancingModel],
      ['getModel', permissions.accessRebalancing],
      ['getModels', permissions.accessRebalancing],
      ['updateModel', permissions.updateRebalancingModel]
    ] as const)('requires the permission of %s', (aMethod, aPermission) => {
      expect(Reflect.getMetadata(HAS_PERMISSION_KEY, prototype[aMethod])).toBe(
        aPermission
      );
    });

    it.each([
      'createModel',
      'deleteModel',
      'getModel',
      'getModels',
      'updateModel'
    ] as const)('authenticates and checks the permission on %s', (aMethod) => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        prototype[aMethod]
      ) as unknown[];

      expect(guards).toEqual([AuthGuard('jwt'), HasPermissionGuard]);
    });

    it('is not available while an impersonation is active', () => {
      expect(
        Reflect.getMetadata(
          ALLOW_DURING_IMPERSONATION_KEY,
          TargetAllocationModelsController
        )
      ).toBeUndefined();

      for (const method of [
        'createModel',
        'deleteModel',
        'updateModel'
      ] as const) {
        expect(
          Reflect.getMetadata(ALLOW_DURING_IMPERSONATION_KEY, prototype[method])
        ).toBeUndefined();
      }
    });

    it('answers a deletion without content', () => {
      expect(
        Reflect.getMetadata(HTTP_CODE_METADATA, prototype.deleteModel)
      ).toBe(204);
    });
  });

  describe('behavior', () => {
    it('creates a model for the authenticated user', async () => {
      await getController().createModel(DATA);

      expect(service.createModel).toHaveBeenCalledWith({
        data: DATA,
        userId: 'user-1'
      });
    });

    it('deletes a model of the authenticated user', async () => {
      await getController().deleteModel('model-1');

      expect(service.deleteModel).toHaveBeenCalledWith({
        id: 'model-1',
        userId: 'user-1'
      });
    });

    it('reads one model of the authenticated user', async () => {
      await getController().getModel('model-1');

      expect(service.getModel).toHaveBeenCalledWith({
        id: 'model-1',
        userId: 'user-1'
      });
    });

    it('lists the models of the authenticated user', async () => {
      await getController().getModels();

      expect(service.getModels).toHaveBeenCalledWith({ userId: 'user-1' });
    });

    it('updates a model of the authenticated user', async () => {
      await getController().updateModel(DATA, 'model-1');

      expect(service.updateModel).toHaveBeenCalledWith({
        data: DATA,
        id: 'model-1',
        userId: 'user-1'
      });
    });
  });

  describe('restricted view', () => {
    const controller = () =>
      getController(getRequest({ isRestrictedView: true }));

    it.each([
      ['createModel', () => controller().createModel(DATA)],
      ['deleteModel', () => controller().deleteModel('model-1')],
      ['getModel', () => controller().getModel('model-1')],
      ['getModels', () => controller().getModels()],
      ['updateModel', () => controller().updateModel(DATA, 'model-1')]
    ])('denies %s and does not reach the service', async (_name, aCall) => {
      await expect(aCall()).rejects.toMatchObject({ status: 403 });

      for (const mock of Object.values(service)) {
        expect(mock).not.toHaveBeenCalled();
      }
    });
  });
});
