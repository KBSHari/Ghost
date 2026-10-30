import { SYMBOL_MAXIMUM_LENGTH } from '@ghostfolio/common/config';
import {
  AssetClass,
  AssetSubClass,
  DataSource
} from '@ghostfolio/prisma/enums';

import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';
import { isString } from 'lodash-es';

export const TARGET_ALLOCATION_MODEL_NAME_MAXIMUM_LENGTH = 100;
export const TARGET_ALLOCATION_AMOUNT_MAXIMUM = 1_000_000_000_000;
export const TARGET_ALLOCATION_NODES_MAXIMUM_COUNT = 500;

export class TargetAllocationSymbolNodeDto {
  @IsEnum(DataSource)
  dataSource: DataSource;

  @IsNumber()
  @IsOptional()
  @Max(100)
  @Min(0)
  max?: number;

  @IsNumber()
  @IsOptional()
  @Max(100)
  @Min(0)
  min?: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(SYMBOL_MAXIMUM_LENGTH)
  symbol: string;

  @IsNumber()
  @Max(100)
  @Min(0)
  weight: number;
}

export class TargetAllocationSubClassNodeDto {
  @IsEnum(AssetSubClass)
  assetSubClass: AssetSubClass;

  @IsNumber()
  @IsOptional()
  @Max(100)
  @Min(0)
  max?: number;

  @IsNumber()
  @IsOptional()
  @Max(100)
  @Min(0)
  min?: number;

  @ArrayMaxSize(TARGET_ALLOCATION_NODES_MAXIMUM_COUNT)
  @IsArray()
  @IsOptional()
  @Type(() => TargetAllocationSymbolNodeDto)
  @ValidateNested({ each: true })
  symbols?: TargetAllocationSymbolNodeDto[];

  @IsNumber()
  @Max(100)
  @Min(0)
  weight: number;
}

export class TargetAllocationClassNodeDto {
  @IsEnum(AssetClass)
  assetClass: AssetClass;

  @IsNumber()
  @IsOptional()
  @Max(100)
  @Min(0)
  max?: number;

  @IsNumber()
  @IsOptional()
  @Max(100)
  @Min(0)
  min?: number;

  @ArrayMaxSize(Object.keys(AssetSubClass).length)
  @IsArray()
  @IsOptional()
  @Type(() => TargetAllocationSubClassNodeDto)
  @ValidateNested({ each: true })
  subClasses?: TargetAllocationSubClassNodeDto[];

  @IsNumber()
  @Max(100)
  @Min(0)
  weight: number;
}

export class TargetAllocationSectorNodeDto {
  @IsNumber()
  @IsOptional()
  @Max(100)
  @Min(0)
  max?: number;

  @IsNumber()
  @IsOptional()
  @Max(100)
  @Min(0)
  min?: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  sector: string;

  @IsNumber()
  @Max(100)
  @Min(0)
  weight: number;
}

export class TargetAllocationTargetsDto {
  @ArrayMaxSize(Object.keys(AssetClass).length)
  @IsArray()
  @Type(() => TargetAllocationClassNodeDto)
  @ValidateNested({ each: true })
  assetClasses: TargetAllocationClassNodeDto[];

  @ArrayMaxSize(TARGET_ALLOCATION_NODES_MAXIMUM_COUNT)
  @IsArray()
  @IsOptional()
  @Type(() => TargetAllocationSectorNodeDto)
  @ValidateNested({ each: true })
  sectors?: TargetAllocationSectorNodeDto[];
}

export class TargetAllocationParametersDto {
  @IsBoolean()
  allowFractional: boolean;

  @IsBoolean()
  allowSells: boolean;

  @IsNumber()
  @Max(TARGET_ALLOCATION_AMOUNT_MAXIMUM)
  @Min(0)
  cashReserveAmount: number;

  @IsNumber()
  @Max(100)
  @Min(0)
  cashReservePercentage: number;

  @IsNumber()
  @Max(100)
  @Min(0)
  driftThreshold: number;

  @IsNumber()
  @Max(TARGET_ALLOCATION_AMOUNT_MAXIMUM)
  @Min(0)
  flatFee: number;

  @IsNumber()
  @Max(TARGET_ALLOCATION_AMOUNT_MAXIMUM)
  @Min(0)
  minTradeValue: number;

  @IsNumber()
  @Max(100)
  @Min(0)
  percentageFee: number;
}

export class CreateTargetAllocationModelDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(TARGET_ALLOCATION_MODEL_NAME_MAXIMUM_LENGTH)
  @Transform(({ value }: TransformFnParams) =>
    isString(value) ? value.trim() : (value as unknown)
  )
  name: string;

  @IsObject()
  @Type(() => TargetAllocationParametersDto)
  @ValidateNested()
  parameters: TargetAllocationParametersDto;

  @IsObject()
  @Type(() => TargetAllocationTargetsDto)
  @ValidateNested()
  targets: TargetAllocationTargetsDto;
}
