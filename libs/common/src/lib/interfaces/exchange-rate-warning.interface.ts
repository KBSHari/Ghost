export interface ExchangeRateWarning {
  currencyFrom: string;
  currencyTo: string;
  date: string;
  type: 'ESTIMATED' | 'MISSING';
}
