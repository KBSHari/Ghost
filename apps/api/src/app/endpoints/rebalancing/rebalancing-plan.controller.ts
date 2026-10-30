import { HasPermission } from '@ghostfolio/api/decorators/has-permission.decorator';
import { CustomThrottlerGuard } from '@ghostfolio/api/guards/custom-throttler.guard';
import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { TransformDataSourceInRequestInterceptor } from '@ghostfolio/api/interceptors/transform-data-source-in-request/transform-data-source-in-request.interceptor';
import { TransformDataSourceInResponseInterceptor } from '@ghostfolio/api/interceptors/transform-data-source-in-response/transform-data-source-in-response.interceptor';
import { CreateRebalancingPlanDto } from '@ghostfolio/common/dtos';
import type { RebalancingPlan } from '@ghostfolio/common/interfaces';
import { isRestrictedView, permissions } from '@ghostfolio/common/permissions';
import type { RequestWithUser } from '@ghostfolio/common/types';

import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  Inject,
  Post,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';

import { RebalancingService } from './rebalancing.service';

export const THROTTLE_REBALANCING_PLAN_LIMIT = 30;
export const THROTTLE_REBALANCING_PLAN_TTL = 60000;

@Controller('rebalancing/plan')
export class RebalancingPlanController {
  public constructor(
    @Inject(REQUEST) private readonly request: RequestWithUser,
    private readonly rebalancingService: RebalancingService
  ) {}

  /**
   * Calculates the trades which bring the portfolio of the user to the target
   * weights of a model. It only reads data and changes nothing. The limit
   * applies to each user and is enforced when rate limiting is enabled.
   */
  @HasPermission(permissions.accessRebalancing)
  @HttpCode(StatusCodes.OK)
  @Post()
  @Throttle({
    default: {
      getTracker: ({ user }: RequestWithUser) => {
        return user.id;
      },
      limit: THROTTLE_REBALANCING_PLAN_LIMIT,
      ttl: THROTTLE_REBALANCING_PLAN_TTL
    }
  })
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard, CustomThrottlerGuard)
  @UseInterceptors(
    TransformDataSourceInRequestInterceptor,
    TransformDataSourceInResponseInterceptor
  )
  public async createPlan(
    @Body() data: CreateRebalancingPlanDto
  ): Promise<RebalancingPlan> {
    if (isRestrictedView(this.request.user)) {
      throw new HttpException(
        getReasonPhrase(StatusCodes.FORBIDDEN),
        StatusCodes.FORBIDDEN
      );
    }

    return this.rebalancingService.createPlan({
      dto: data,
      user: this.request.user
    });
  }
}
