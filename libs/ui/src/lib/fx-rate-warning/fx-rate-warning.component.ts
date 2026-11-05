import { ExchangeRateWarning } from '@ghostfolio/common/interfaces';

import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges
} from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'gf-fx-rate-warning',
  styleUrls: ['./fx-rate-warning.component.scss'],
  templateUrl: './fx-rate-warning.component.html'
})
export class GfFxRateWarningComponent implements OnChanges {
  @Input() fxWarnings: ExchangeRateWarning[] = [];

  public estimatedWarnings: ExchangeRateWarning[] = [];
  public missingWarnings: ExchangeRateWarning[] = [];

  public ngOnChanges() {
    const warnings = this.fxWarnings ?? [];

    this.estimatedWarnings = warnings.filter(({ type }) => {
      return type === 'ESTIMATED';
    });

    this.missingWarnings = warnings.filter(({ type }) => {
      return type === 'MISSING';
    });
  }
}
