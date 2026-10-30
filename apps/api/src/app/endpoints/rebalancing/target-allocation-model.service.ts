import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { SymbolProfileService } from '@ghostfolio/api/services/symbol-profile/symbol-profile.service';
import {
  CreateTargetAllocationModelDto,
  UpdateTargetAllocationModelDto
} from '@ghostfolio/common/dtos';
import { getAssetProfileIdentifier } from '@ghostfolio/common/helper';
import type {
  AssetProfileIdentifier,
  TargetAllocationModel,
  TargetAllocationParameters,
  TargetAllocationSymbolResolver,
  TargetAllocationTargets,
  TargetAllocationValidationError
} from '@ghostfolio/common/interfaces';
import {
  getTargetAllocationSizeError,
  validateTargetAllocation
} from '@ghostfolio/common/target-allocation/target-allocation-validation';
import { DataSource } from '@ghostfolio/prisma/enums';

import { HttpException, Injectable } from '@nestjs/common';
import {
  Prisma,
  TargetAllocationModel as PrismaTargetAllocationModel
} from '@prisma/client';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';

@Injectable()
export class TargetAllocationModelService {
  public constructor(
    private readonly prismaService: PrismaService,
    private readonly symbolProfileService: SymbolProfileService
  ) {}

  public async createModel({
    data,
    userId
  }: {
    data: CreateTargetAllocationModelDto;
    userId: string;
  }): Promise<TargetAllocationModel> {
    await this.validateTargets({ userId, targets: data.targets });

    try {
      const model = await this.prismaService.targetAllocationModel.create({
        data: {
          userId,
          name: data.name,
          parameters: this.toJson(data.parameters),
          targets: this.toJson(data.targets)
        }
      });

      return this.toModel(model);
    } catch (error) {
      throw this.getExceptionForError(error);
    }
  }

  public async deleteModel({ id, userId }: { id: string; userId: string }) {
    try {
      await this.prismaService.targetAllocationModel.delete({
        where: { id, userId }
      });
    } catch (error) {
      throw this.getExceptionForError(error);
    }
  }

  public async getModel({
    id,
    userId
  }: {
    id: string;
    userId: string;
  }): Promise<TargetAllocationModel> {
    const model = await this.prismaService.targetAllocationModel.findFirst({
      where: { id, userId }
    });

    if (!model) {
      throw this.getNotFoundException();
    }

    return this.toModel(model);
  }

  public async getModels({
    userId
  }: {
    userId: string;
  }): Promise<TargetAllocationModel[]> {
    const models = await this.prismaService.targetAllocationModel.findMany({
      orderBy: { name: 'asc' },
      where: { userId }
    });

    return models.map((model) => {
      return this.toModel(model);
    });
  }

  public async updateModel({
    data,
    id,
    userId
  }: {
    data: UpdateTargetAllocationModelDto;
    id: string;
    userId: string;
  }): Promise<TargetAllocationModel> {
    await this.validateTargets({ userId, targets: data.targets });

    try {
      const model = await this.prismaService.targetAllocationModel.update({
        data: {
          name: data.name,
          parameters: this.toJson(data.parameters),
          targets: this.toJson(data.targets)
        },
        where: { id, userId }
      });

      return this.toModel(model);
    } catch (error) {
      throw this.getExceptionForError(error);
    }
  }

  // Symbol classes come from the stored asset profiles, not from the request
  public async validateTargets({
    targets,
    userId
  }: {
    targets: TargetAllocationTargets;
    userId: string;
  }) {
    // Rejected before the lookup, so a huge tree never reaches the database
    const sizeError = getTargetAllocationSizeError(targets);

    if (sizeError) {
      throw this.getInvalidModelException([sizeError]);
    }

    const identifiers = new Map<string, AssetProfileIdentifier>();

    for (const assetClassNode of targets?.assetClasses ?? []) {
      for (const subClassNode of assetClassNode.subClasses ?? []) {
        for (const { dataSource, symbol } of subClassNode.symbols ?? []) {
          identifiers.set(getAssetProfileIdentifier({ dataSource, symbol }), {
            dataSource,
            symbol
          });
        }
      }
    }

    const assetProfiles =
      identifiers.size > 0
        ? await this.symbolProfileService.getSymbolProfiles([
            ...identifiers.values()
          ])
        : [];

    const profilesByIdentifier = new Map(
      assetProfiles.map((assetProfile) => {
        return [getAssetProfileIdentifier(assetProfile), assetProfile];
      })
    );

    const resolveSymbol: TargetAllocationSymbolResolver = ({
      dataSource,
      symbol
    }) => {
      const assetProfile = profilesByIdentifier.get(
        getAssetProfileIdentifier({ dataSource, symbol })
      );

      // A custom asset profile of another user is treated as unknown
      if (
        !assetProfile ||
        (assetProfile.dataSource === DataSource.MANUAL &&
          assetProfile.userId !== userId)
      ) {
        return undefined;
      }

      return {
        assetClass: assetProfile.assetClass ?? undefined,
        assetSubClass: assetProfile.assetSubClass ?? undefined
      };
    };

    const errors = validateTargetAllocation({ resolveSymbol, targets });

    if (errors.length > 0) {
      throw this.getInvalidModelException(errors);
    }
  }

  private getInvalidModelException(aErrors: TargetAllocationValidationError[]) {
    return new HttpException(
      {
        errors: aErrors,
        error: getReasonPhrase(StatusCodes.BAD_REQUEST),
        message: 'The target allocation model is invalid',
        statusCode: StatusCodes.BAD_REQUEST
      },
      StatusCodes.BAD_REQUEST
    );
  }

  private getExceptionForError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return new HttpException(
          getReasonPhrase(StatusCodes.CONFLICT),
          StatusCodes.CONFLICT
        );
      }

      if (error.code === 'P2025') {
        return this.getNotFoundException();
      }
    }

    return error;
  }

  // A missing and a foreign model are indistinguishable on purpose
  private getNotFoundException() {
    return new HttpException(
      getReasonPhrase(StatusCodes.NOT_FOUND),
      StatusCodes.NOT_FOUND
    );
  }

  private toJson(aValue: unknown) {
    return JSON.parse(JSON.stringify(aValue)) as Prisma.InputJsonValue;
  }

  private toModel(aModel: PrismaTargetAllocationModel): TargetAllocationModel {
    return {
      createdAt: aModel.createdAt,
      id: aModel.id,
      name: aModel.name,
      parameters: aModel.parameters as unknown as TargetAllocationParameters,
      targets: aModel.targets as unknown as TargetAllocationTargets,
      updatedAt: aModel.updatedAt
    };
  }
}
