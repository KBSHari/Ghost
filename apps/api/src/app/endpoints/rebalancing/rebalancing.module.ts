import { PortfolioModule } from '@ghostfolio/api/app/portfolio/portfolio.module';
import { TransformDataSourceInRequestModule } from '@ghostfolio/api/interceptors/transform-data-source-in-request/transform-data-source-in-request.module';
import { TransformDataSourceInResponseModule } from '@ghostfolio/api/interceptors/transform-data-source-in-response/transform-data-source-in-response.module';
import { AccountModule } from '@ghostfolio/api/services/account/account.module';
import { DataProviderModule } from '@ghostfolio/api/services/data-provider/data-provider.module';
import { ExchangeRateDataModule } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';
import { SymbolProfileModule } from '@ghostfolio/api/services/symbol-profile/symbol-profile.module';

import { Module } from '@nestjs/common';

import { RebalancingPlanController } from './rebalancing-plan.controller';
import { RebalancingService } from './rebalancing.service';
import { TargetAllocationModelService } from './target-allocation-model.service';
import { TargetAllocationModelsController } from './target-allocation-models.controller';

@Module({
  controllers: [RebalancingPlanController, TargetAllocationModelsController],
  imports: [
    AccountModule,
    DataProviderModule,
    ExchangeRateDataModule,
    PortfolioModule,
    PrismaModule,
    SymbolProfileModule,
    TransformDataSourceInRequestModule,
    TransformDataSourceInResponseModule
  ],
  providers: [RebalancingService, TargetAllocationModelService]
})
export class RebalancingModule {}
