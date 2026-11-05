import { ExchangeRateWarning } from '../exchange-rate-warning.interface';
import { HistoricalDataItem } from '../historical-data-item.interface';
import { PortfolioPerformance } from '../portfolio-performance.interface';
import { ResponseError } from './errors.interface';

export interface PortfolioPerformanceResponse extends ResponseError {
  chart?: HistoricalDataItem[];
  dateOfFirstActivity: Date;
  fxWarnings?: ExchangeRateWarning[];
  performance: PortfolioPerformance;
}
