import { downloadAsFile } from '@ghostfolio/common/helper';
import type {
  RebalancingExcludedHolding,
  RebalancingPlan
} from '@ghostfolio/common/interfaces';
import {
  buildRebalancingCsv,
  buildRebalancingImportJson
} from '@ghostfolio/common/target-allocation/rebalancing-export';
import { translate } from '@ghostfolio/ui/i18n';

import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, MatButtonModule],
  selector: 'gf-rebalancing-result',
  styleUrls: ['./rebalancing-result.component.scss'],
  templateUrl: './rebalancing-result.component.html'
})
export class GfRebalancingResultComponent {
  public readonly baseCurrency = input<string>();
  public readonly locale = input<string>();
  public readonly plan = input.required<RebalancingPlan>();

  protected getExcludedReason({ reason }: RebalancingExcludedHolding) {
    return reason === 'NO_ASSET_CLASS'
      ? $localize`No asset class`
      : $localize`No price`;
  }

  protected getKeyLabel(aKey: string) {
    // Class and sub-class keys look like EQUITY/ETF, symbol keys like YAHOO-VT
    return aKey
      .split('/')
      .map((part) => translate(part))
      .join(' / ');
  }

  protected getLevelLabel(
    aLevel: RebalancingPlan['allocationAfter'][0]['level']
  ) {
    switch (aLevel) {
      case 'ASSET_CLASS':
        return $localize`Asset class`;
      case 'ASSET_SUB_CLASS':
        return $localize`Sub-class`;
      default:
        return $localize`Symbol`;
    }
  }

  protected getSideLabel(aSide: 'BUY' | 'SELL') {
    return aSide === 'BUY' ? $localize`Buy` : $localize`Sell`;
  }

  protected onExportCsv() {
    downloadAsFile({
      content: buildRebalancingCsv(this.plan()),
      contentType: 'text/csv;charset=utf-8',
      fileName: 'rebalancing-plan.csv',
      format: 'string'
    });
  }

  protected onExportJson() {
    downloadAsFile({
      content: buildRebalancingImportJson(this.plan()),
      contentType: 'application/json',
      fileName: 'rebalancing-plan.json',
      format: 'json'
    });
  }
}
