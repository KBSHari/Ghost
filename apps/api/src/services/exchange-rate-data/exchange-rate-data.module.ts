import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { DataProviderModule } from '@ghostfolio/api/services/data-provider/data-provider.module';
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.service';
import { ExchangeRateStoreService } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-store.service';
import { MarketDataModule } from '@ghostfolio/api/services/market-data/market-data.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';
import { PropertyModule } from '@ghostfolio/api/services/property/property.module';

import { Module } from '@nestjs/common';

@Module({
  exports: [ExchangeRateDataService, ExchangeRateStoreService],
  imports: [
    ConfigurationModule,
    DataProviderModule,
    MarketDataModule,
    PrismaModule,
    PropertyModule
  ],
  providers: [ExchangeRateDataService, ExchangeRateStoreService]
})
export class ExchangeRateDataModule {}
