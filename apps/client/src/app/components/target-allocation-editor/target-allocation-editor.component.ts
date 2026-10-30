import { ASSET_CLASS_MAPPING } from '@ghostfolio/common/config';
import type {
  LookupItem,
  TargetAllocationClassNode,
  TargetAllocationModel,
  TargetAllocationParameters,
  TargetAllocationSectorNode,
  TargetAllocationSubClassNode,
  TargetAllocationSymbolNode
} from '@ghostfolio/common/interfaces';
import { validateTargetAllocation } from '@ghostfolio/common/target-allocation/target-allocation-validation';
import { AssetClass, AssetSubClass } from '@ghostfolio/prisma/enums';
import { translate } from '@ghostfolio/ui/i18n';
import { GfSymbolAutocompleteComponent } from '@ghostfolio/ui/symbol-autocomplete';

import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  input,
  output,
  signal,
  untracked
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trashOutline } from 'ionicons/icons';

export type TargetAllocationDraft = Pick<
  TargetAllocationModel,
  'name' | 'parameters' | 'targets'
>;

type NumberField = 'max' | 'min' | 'weight';

interface BandedNode {
  max?: number;
  min?: number;
  weight: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GfSymbolAutocompleteComponent,
    IonIcon,
    MatButtonModule,
    MatFormFieldModule,
    NgTemplateOutlet,
    ReactiveFormsModule
  ],
  selector: 'gf-target-allocation-editor',
  styleUrls: ['./target-allocation-editor.component.scss'],
  templateUrl: './target-allocation-editor.component.html'
})
export class GfTargetAllocationEditorComponent {
  public readonly cancelled = output<void>();
  public readonly isSaving = input(false);
  public readonly model = input<TargetAllocationModel>();
  public readonly saved = output<TargetAllocationDraft>();

  protected assetClasses: TargetAllocationClassNode[] = [];
  protected readonly errors = computed(() => {
    this.version();

    return validateTargetAllocation({
      resolveSymbol: ({ dataSource, symbol }) => {
        return this.symbolInfo.get(`${dataSource}-${symbol}`);
      },
      targets: { assetClasses: this.assetClasses, sectors: this.sectors }
    });
  });
  protected readonly labels = {
    max: $localize`Maximum`,
    min: $localize`Minimum`,
    weight: $localize`Target`
  };
  protected name = '';
  protected parameters: TargetAllocationParameters = getDefaultParameters();
  protected sectors: TargetAllocationSectorNode[] = [];
  protected readonly symbolControl = new FormControl<LookupItem | null>(null);
  protected readonly symbolMessage = signal('');
  protected readonly symbolNames = new Map<string, string>();

  private readonly symbolInfo = new Map<
    string,
    { assetClass: AssetClass; assetSubClass: AssetSubClass }
  >();
  private readonly version = signal(0);

  public constructor(private destroyRef: DestroyRef) {
    addIcons({ trashOutline });

    effect(() => {
      const model = this.model();

      untracked(() => {
        this.loadDraft(model);
      });
    });

    this.symbolControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        if (value?.dataSource && value.symbol) {
          this.addSymbol(value);
          this.symbolControl.reset(null, { emitEvent: false });
        }
      });
  }

  protected canSave() {
    return (
      this.name.trim().length > 0 &&
      this.errors().length === 0 &&
      !this.isSaving()
    );
  }

  protected getAvailableAssetClasses() {
    const used = new Set(this.assetClasses.map(({ assetClass }) => assetClass));

    return Object.values(AssetClass).filter((assetClass) => {
      return !used.has(assetClass);
    });
  }

  protected getAvailableSubClasses(aClassNode: TargetAllocationClassNode) {
    const used = new Set(
      (aClassNode.subClasses ?? []).map(({ assetSubClass }) => assetSubClass)
    );

    return (ASSET_CLASS_MAPPING.get(aClassNode.assetClass) ?? []).filter(
      (assetSubClass) => {
        return !used.has(assetSubClass);
      }
    );
  }

  protected getRemoveLabel(aName: string) {
    return $localize`Remove ${aName}`;
  }

  protected getSum(aNodes?: BandedNode[]) {
    return (
      Math.round(
        (aNodes ?? []).reduce((sum, { weight }) => {
          return sum + (Number.isFinite(weight) ? weight : 0);
        }, 0) * 10000
      ) / 10000
    );
  }

  protected getSymbolKey({ dataSource, symbol }: TargetAllocationSymbolNode) {
    return `${dataSource}-${symbol}`;
  }

  protected label(aKey: string) {
    return translate(aKey);
  }

  protected onAssetClassAdded(aEvent: Event) {
    const select = aEvent.target as HTMLSelectElement;
    const assetClass = select.value as AssetClass;

    select.value = '';

    if (assetClass) {
      this.ensureAssetClass(assetClass);
      this.touch();
    }
  }

  protected onAssetClassRemoved(aClassNode: TargetAllocationClassNode) {
    this.assetClasses = this.assetClasses.filter((node) => {
      return node !== aClassNode;
    });
    this.touch();
  }

  protected onCancel() {
    this.cancelled.emit();
  }

  protected onNameChange(aEvent: Event) {
    this.name = (aEvent.target as HTMLInputElement).value;
    this.touch();
  }

  protected onNumberChange({
    event,
    field,
    node
  }: {
    event: Event;
    field: NumberField;
    node: BandedNode;
  }) {
    const value = (event.target as HTMLInputElement).valueAsNumber;

    if (field === 'weight') {
      node.weight = Number.isNaN(value) ? 0 : value;
    } else {
      node[field] = Number.isNaN(value) ? undefined : value;
    }

    this.touch();
  }

  protected onParameterBooleanChange({
    event,
    field
  }: {
    event: Event;
    field: 'allowFractional' | 'allowSells';
  }) {
    this.parameters[field] = (event.target as HTMLInputElement).checked;
    this.touch();
  }

  protected onParameterNumberChange({
    event,
    field
  }: {
    event: Event;
    field: Exclude<
      keyof TargetAllocationParameters,
      'allowFractional' | 'allowSells'
    >;
  }) {
    const value = (event.target as HTMLInputElement).valueAsNumber;

    this.parameters[field] = Number.isNaN(value) ? 0 : value;
    this.touch();
  }

  protected onSave() {
    if (!this.canSave()) {
      return;
    }

    this.saved.emit({
      name: this.name.trim(),
      parameters: { ...this.parameters },
      targets: {
        assetClasses: this.assetClasses.map((classNode) => {
          return {
            ...classNode,
            subClasses: classNode.subClasses?.length
              ? classNode.subClasses.map((subClassNode) => {
                  return {
                    ...subClassNode,
                    symbols: subClassNode.symbols?.length
                      ? subClassNode.symbols
                      : undefined
                  };
                })
              : undefined
          };
        }),
        sectors: this.sectors.length > 0 ? this.sectors : undefined
      }
    });
  }

  protected onSectorAdded(aInput: HTMLInputElement) {
    const sector = aInput.value.trim();

    if (
      sector &&
      !this.sectors.some((node) => {
        return node.sector.toLowerCase() === sector.toLowerCase();
      })
    ) {
      this.sectors = [...this.sectors, { sector, weight: 0 }];
      this.touch();
    }

    aInput.value = '';
  }

  protected onSectorRemoved(aSectorNode: TargetAllocationSectorNode) {
    this.sectors = this.sectors.filter((node) => {
      return node !== aSectorNode;
    });
    this.touch();
  }

  protected onSubClassAdded({
    classNode,
    event
  }: {
    classNode: TargetAllocationClassNode;
    event: Event;
  }) {
    const select = event.target as HTMLSelectElement;
    const assetSubClass = select.value as AssetSubClass;

    select.value = '';

    if (assetSubClass) {
      this.ensureSubClass(classNode, assetSubClass);
      this.touch();
    }
  }

  protected onSubClassRemoved({
    classNode,
    subClassNode
  }: {
    classNode: TargetAllocationClassNode;
    subClassNode: TargetAllocationSubClassNode;
  }) {
    classNode.subClasses = (classNode.subClasses ?? []).filter((node) => {
      return node !== subClassNode;
    });
    this.touch();
  }

  protected onSymbolRemoved({
    subClassNode,
    symbolNode
  }: {
    subClassNode: TargetAllocationSubClassNode;
    symbolNode: TargetAllocationSymbolNode;
  }) {
    subClassNode.symbols = (subClassNode.symbols ?? []).filter((node) => {
      return node !== symbolNode;
    });
    this.touch();
  }

  private addSymbol({
    assetClass,
    assetSubClass,
    dataSource,
    name,
    symbol
  }: LookupItem) {
    this.symbolMessage.set('');

    if (!dataSource) {
      return;
    }

    if (!assetClass || !assetSubClass) {
      this.symbolMessage.set(
        $localize`The symbol ${symbol} has no asset class and cannot be used as a target.`
      );

      return;
    }

    if (!(ASSET_CLASS_MAPPING.get(assetClass) ?? []).includes(assetSubClass)) {
      this.symbolMessage.set(
        $localize`The symbol ${symbol} has an unsupported asset class.`
      );

      return;
    }

    const key = `${dataSource}-${symbol}`;
    const isDuplicate = this.assetClasses.some((classNode) => {
      return (classNode.subClasses ?? []).some((subClassNode) => {
        return (subClassNode.symbols ?? []).some((symbolNode) => {
          return this.getSymbolKey(symbolNode) === key;
        });
      });
    });

    if (isDuplicate) {
      this.symbolMessage.set(
        $localize`The symbol ${symbol} is already a target.`
      );

      return;
    }

    const targetSubClassNode = this.ensureSubClass(
      this.ensureAssetClass(assetClass),
      assetSubClass
    );

    targetSubClassNode.symbols = [
      ...(targetSubClassNode.symbols ?? []),
      { dataSource, symbol, weight: 0 }
    ];
    this.symbolInfo.set(key, { assetClass, assetSubClass });
    this.symbolNames.set(key, name);
    this.touch();
  }

  private ensureAssetClass(aAssetClass: AssetClass) {
    let classNode = this.assetClasses.find(({ assetClass }) => {
      return assetClass === aAssetClass;
    });

    if (!classNode) {
      classNode = { assetClass: aAssetClass, weight: 0 };
      this.assetClasses = [...this.assetClasses, classNode];
    }

    return classNode;
  }

  private ensureSubClass(
    aClassNode: TargetAllocationClassNode,
    aAssetSubClass: AssetSubClass
  ) {
    let subClassNode = (aClassNode.subClasses ?? []).find(
      ({ assetSubClass }) => {
        return assetSubClass === aAssetSubClass;
      }
    );

    if (!subClassNode) {
      subClassNode = { assetSubClass: aAssetSubClass, weight: 0 };
      aClassNode.subClasses = [...(aClassNode.subClasses ?? []), subClassNode];
    }

    return subClassNode;
  }

  private loadDraft(aModel?: TargetAllocationModel) {
    this.symbolInfo.clear();
    this.symbolNames.clear();
    this.symbolMessage.set('');

    const copy: TargetAllocationModel | undefined = aModel
      ? (JSON.parse(JSON.stringify(aModel)) as TargetAllocationModel)
      : undefined;

    this.name = copy?.name ?? '';
    this.parameters = copy?.parameters ?? getDefaultParameters();
    this.assetClasses = copy?.targets?.assetClasses ?? [];
    this.sectors = copy?.targets?.sectors ?? [];

    // Saved symbols were validated by the server, so their position is trusted
    for (const classNode of this.assetClasses) {
      for (const subClassNode of classNode.subClasses ?? []) {
        for (const symbolNode of subClassNode.symbols ?? []) {
          this.symbolInfo.set(this.getSymbolKey(symbolNode), {
            assetClass: classNode.assetClass,
            assetSubClass: subClassNode.assetSubClass
          });
        }
      }
    }

    this.touch();
  }

  private touch() {
    this.version.update((version) => version + 1);
  }
}

function getDefaultParameters(): TargetAllocationParameters {
  return {
    allowFractional: true,
    allowSells: true,
    cashReserveAmount: 0,
    cashReservePercentage: 0,
    driftThreshold: 0,
    flatFee: 0,
    minTradeValue: 0,
    percentageFee: 0
  };
}
