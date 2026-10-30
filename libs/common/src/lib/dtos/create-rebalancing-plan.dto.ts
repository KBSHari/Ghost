import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
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

import { TARGET_ALLOCATION_AMOUNT_MAXIMUM } from './create-target-allocation-model.dto';

export const REBALANCING_PLAN_ACCOUNTS_MAXIMUM_COUNT = 100;
export const REBALANCING_PLAN_ID_MAXIMUM_LENGTH = 64;

export class RebalancingParameterOverridesDto {
  @IsBoolean()
  @IsOptional()
  allowFractional?: boolean;

  @IsBoolean()
  @IsOptional()
  allowSells?: boolean;

  @IsNumber()
  @IsOptional()
  @Max(TARGET_ALLOCATION_AMOUNT_MAXIMUM)
  @Min(0)
  cashReserveAmount?: number;

  @IsNumber()
  @IsOptional()
  @Max(100)
  @Min(0)
  cashReservePercentage?: number;

  @IsNumber()
  @IsOptional()
  @Max(100)
  @Min(0)
  driftThreshold?: number;

  @IsNumber()
  @IsOptional()
  @Max(TARGET_ALLOCATION_AMOUNT_MAXIMUM)
  @Min(0)
  flatFee?: number;

  @IsNumber()
  @IsOptional()
  @Max(TARGET_ALLOCATION_AMOUNT_MAXIMUM)
  @Min(0)
  minTradeValue?: number;

  @IsNumber()
  @IsOptional()
  @Max(100)
  @Min(0)
  percentageFee?: number;
}

export class CreateRebalancingPlanDto {
  @ArrayMaxSize(REBALANCING_PLAN_ACCOUNTS_MAXIMUM_COUNT)
  @ArrayUnique()
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  @MaxLength(REBALANCING_PLAN_ID_MAXIMUM_LENGTH, { each: true })
  accountIds?: string[];

  @IsNotEmpty()
  @IsString()
  @MaxLength(REBALANCING_PLAN_ID_MAXIMUM_LENGTH)
  modelId: string;

  @IsObject()
  @IsOptional()
  @Type(() => RebalancingParameterOverridesDto)
  @ValidateNested()
  overrides?: RebalancingParameterOverridesDto;
}
