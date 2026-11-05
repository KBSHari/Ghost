import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import {
  getStartOfUtcDate,
  isValidCurrencyCode
} from '@ghostfolio/common/helper';

import { Injectable, Logger } from '@nestjs/common';
import { DataSource, ExchangeRate } from '@prisma/client';
import { chunk } from 'lodash-es';

export interface ObservedExchangeRate {
  currencyFrom: string;
  currencyTo: string;
  date: Date;
  rate: number;
  source: DataSource;
}

@Injectable()
export class ExchangeRateStoreService {
  private static readonly BATCH_SIZE = 500;

  private readonly logger = new Logger(ExchangeRateStoreService.name);

  public constructor(private readonly prismaService: PrismaService) {}

  public async getRange({
    currencyPairs,
    endDate,
    source,
    startDate
  }: {
    currencyPairs: { currencyFrom: string; currencyTo: string }[];
    endDate: Date;
    source?: DataSource;
    startDate: Date;
  }): Promise<ExchangeRate[]> {
    if (currencyPairs.length === 0) {
      return [];
    }

    return this.prismaService.exchangeRate.findMany({
      orderBy: [{ date: 'asc' }],
      where: {
        source,
        date: { gte: getStartOfUtcDate(startDate), lte: endDate },
        OR: currencyPairs.map(({ currencyFrom, currencyTo }) => {
          return { currencyFrom, currencyTo };
        })
      }
    });
  }

  public async upsertObserved(
    rows: ObservedExchangeRate[]
  ): Promise<{ rejected: number; written: number }> {
    const validRows = rows.filter((row) => {
      return this.isValid(row);
    });

    const rejected = rows.length - validRows.length;

    if (rejected > 0) {
      this.logger.warn(`Rejected ${rejected} invalid exchange rate rows`);
    }

    let written = 0;

    for (const batch of chunk(validRows, ExchangeRateStoreService.BATCH_SIZE)) {
      await this.prismaService.$transaction(
        batch.map(({ currencyFrom, currencyTo, date, rate, source }) => {
          const normalizedDate = getStartOfUtcDate(date);

          return this.prismaService.exchangeRate.upsert({
            create: {
              currencyFrom,
              currencyTo,
              rate,
              source,
              date: normalizedDate
            },
            update: { rate },
            where: {
              currencyFrom_currencyTo_date_source: {
                currencyFrom,
                currencyTo,
                source,
                date: normalizedDate
              }
            }
          });
        })
      );

      written += batch.length;
    }

    return { rejected, written };
  }

  private isValid({
    currencyFrom,
    currencyTo,
    date,
    rate
  }: ObservedExchangeRate) {
    return (
      Number.isFinite(rate) &&
      rate > 0 &&
      isValidCurrencyCode(currencyFrom) &&
      isValidCurrencyCode(currencyTo) &&
      currencyFrom !== currencyTo &&
      date instanceof Date &&
      !isNaN(date.getTime())
    );
  }
}
