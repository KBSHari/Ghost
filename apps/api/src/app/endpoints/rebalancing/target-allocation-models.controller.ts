import { HasPermission } from '@ghostfolio/api/decorators/has-permission.decorator';
import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { TransformDataSourceInRequestInterceptor } from '@ghostfolio/api/interceptors/transform-data-source-in-request/transform-data-source-in-request.interceptor';
import { TransformDataSourceInResponseInterceptor } from '@ghostfolio/api/interceptors/transform-data-source-in-response/transform-data-source-in-response.interceptor';
import {
  CreateTargetAllocationModelDto,
  UpdateTargetAllocationModelDto
} from '@ghostfolio/common/dtos';
import type { TargetAllocationModel } from '@ghostfolio/common/interfaces';
import { isRestrictedView, permissions } from '@ghostfolio/common/permissions';
import type { RequestWithUser } from '@ghostfolio/common/types';

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Param,
  Post,
  Put,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';

import { TargetAllocationModelService } from './target-allocation-model.service';

@Controller('rebalancing/models')
export class TargetAllocationModelsController {
  public constructor(
    @Inject(REQUEST) private readonly request: RequestWithUser,
    private readonly targetAllocationModelService: TargetAllocationModelService
  ) {}

  @HasPermission(permissions.createRebalancingModel)
  @Post()
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  @UseInterceptors(
    TransformDataSourceInRequestInterceptor,
    TransformDataSourceInResponseInterceptor
  )
  public async createModel(
    @Body() data: CreateTargetAllocationModelDto
  ): Promise<TargetAllocationModel> {
    this.assertNotRestrictedView();

    return this.targetAllocationModelService.createModel({
      data,
      userId: this.request.user.id
    });
  }

  @Delete(':id')
  @HasPermission(permissions.deleteRebalancingModel)
  @HttpCode(StatusCodes.NO_CONTENT)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async deleteModel(@Param('id') id: string): Promise<void> {
    this.assertNotRestrictedView();

    await this.targetAllocationModelService.deleteModel({
      id,
      userId: this.request.user.id
    });
  }

  @Get(':id')
  @HasPermission(permissions.accessRebalancing)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  @UseInterceptors(TransformDataSourceInResponseInterceptor)
  public async getModel(
    @Param('id') id: string
  ): Promise<TargetAllocationModel> {
    this.assertNotRestrictedView();

    return this.targetAllocationModelService.getModel({
      id,
      userId: this.request.user.id
    });
  }

  @Get()
  @HasPermission(permissions.accessRebalancing)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  @UseInterceptors(TransformDataSourceInResponseInterceptor)
  public async getModels(): Promise<TargetAllocationModel[]> {
    this.assertNotRestrictedView();

    return this.targetAllocationModelService.getModels({
      userId: this.request.user.id
    });
  }

  @HasPermission(permissions.updateRebalancingModel)
  @Put(':id')
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  @UseInterceptors(
    TransformDataSourceInRequestInterceptor,
    TransformDataSourceInResponseInterceptor
  )
  public async updateModel(
    @Body() data: UpdateTargetAllocationModelDto,
    @Param('id') id: string
  ): Promise<TargetAllocationModel> {
    this.assertNotRestrictedView();

    return this.targetAllocationModelService.updateModel({
      data,
      id,
      userId: this.request.user.id
    });
  }

  private assertNotRestrictedView() {
    if (isRestrictedView(this.request.user)) {
      throw new HttpException(
        getReasonPhrase(StatusCodes.FORBIDDEN),
        StatusCodes.FORBIDDEN
      );
    }
  }
}
