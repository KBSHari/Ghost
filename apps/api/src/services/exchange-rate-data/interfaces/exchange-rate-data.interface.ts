export interface ExchangeRatesByCurrency {
  [currency: string]: {
    [dateString: string]: number;
  };
}

export interface ExchangeRatesWithStatus {
  estimatedDates: { [currencyPair: string]: string[] };
  missingDates: { [currencyPair: string]: string[] };
  rates: ExchangeRatesByCurrency;
}
