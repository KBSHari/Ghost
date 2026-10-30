import { ALLOW_DURING_IMPERSONATION_KEY } from '@ghostfolio/api/decorators/allow-during-impersonation.decorator';
import { HAS_PERMISSION_KEY } from '@ghostfolio/api/decorators/has-permission.decorator';
import { CustomThrottlerGuard } from '@ghostfolio/api/guards/custom-throttler.guard';
import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { TransformDataSourceInRequestInterceptor } from '@ghostfolio/api/interceptors/transform-data-source-in-request/transform-data-source-in-request.interceptor';
import { TransformDataSourceInResponseInterceptor } from '@ghostfolio/api/interceptors/transform-data-source-in-response/transform-data-source-in-response.interceptor';
import { permissions } from '@ghostfolio/common/permissions';
import type { RequestWithUser } from '@ghostfolio/common/types';

import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  INTERCEPTORS_METADATA
} from '@nestjs/common/constants';
import { AuthGuard } from '@nestjs/passport';

import {
  RebalancingPlanController,
  THROTTLE_REBALANCING_PLAN_LIMIT,
  THROTTLE_REBALANCING_PLAN_TTL
} from './rebalancing-plan.controller';

function getRequest(aSettings: Record<string, unknown> = {}) {
  return {
    user: { id: 'user-1', settings: { settings: aSettings } }
  } as unknown as RequestWithUser;
}

describe('RebalancingPlanController', () => {
  let service: { createPlan: jest.Mock };

  const DATA = { modelId: 'model-1' } as never;

  beforeEach(() => {
    service = { createPlan: jest.fn().mockResolvedValue({ trades: [] }) };
  });

  describe('security', () => {
    // The route handler is only read for its metadata, never called
    const handler = (
      RebalancingPlanController.prototype as unknown as Record<string, object>
    ).createPlan;

    it('requires the permission to access the rebalancing', () => {
      expect(Reflect.getMetadata(HAS_PERMISSION_KEY, handler)).toBe(
        permissions.accessRebalancing
      );
    });

    it('authenticates, checks the permission and limits the rate', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        AuthGuard('jwt'),
        HasPermissionGuard,
        CustomThrottlerGuard
      ]);
    });

    it('transforms the data sources of the request and of the response', () => {
      expect(Reflect.getMetadata(INTERCEPTORS_METADATA, handler)).toEqual([
        TransformDataSourceInRequestInterceptor,
        TransformDataSourceInResponseInterceptor
      ]);
    });

    it('limits the calls of each user', () => {
      expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(
        THROTTLE_REBALANCING_PLAN_LIMIT
      );
      expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(
        THROTTLE_REBALANCING_PLAN_TTL
      );

      const getTracker = Reflect.getMetadata(
        'THROTTLER:TRACKERdefault',
        handler
      ) as (aRequest: RequestWithUser) => string;

      expect(getTracker(getRequest())).toBe('user-1');
    });

    it('is not available while an impersonation is active', () => {
      expect(
        Reflect.getMetadata(
          ALLOW_DURING_IMPERSONATION_KEY,
          RebalancingPlanController
        )
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(ALLOW_DURING_IMPERSONATION_KEY, handler)
      ).toBeUndefined();
    });

    it('answers with the status 200 because it creates nothing', () => {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    });
  });

  describe('behavior', () => {
    it('calculates the plan for the authenticated user', async () => {
      const request = getRequest();

      await new RebalancingPlanController(request, service as never).createPlan(
        DATA
      );

      expect(service.createPlan).toHaveBeenCalledWith({
        dto: DATA,
        user: request.user
      });
    });

    it('denies a user with a restricted view without reaching the service', async () => {
      const controller = new RebalancingPlanController(
        getRequest({ isRestrictedView: true }),
        service as never
      );

      await expect(controller.createPlan(DATA)).rejects.toMatchObject({
        status: 403
      });
      expect(service.createPlan).not.toHaveBeenCalled();
    });
  });
});
