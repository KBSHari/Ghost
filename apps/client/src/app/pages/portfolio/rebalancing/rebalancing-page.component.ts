import { GfRebalancingResultComponent } from '@ghostfolio/client/components/rebalancing-result/rebalancing-result.component';
import {
  GfTargetAllocationEditorComponent,
  TargetAllocationDraft
} from '@ghostfolio/client/components/target-allocation-editor/target-allocation-editor.component';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { CreateRebalancingPlanDto } from '@ghostfolio/common/dtos';
import { ConfirmationDialogType } from '@ghostfolio/common/enums';
import type {
  RebalancingPlan,
  TargetAllocationModel,
  User
} from '@ghostfolio/common/interfaces';
import { hasPermission, permissions } from '@ghostfolio/common/permissions';
import { internalRoutes } from '@ghostfolio/common/routes/routes';
import type { AccountWithValue } from '@ghostfolio/common/types';
import { NotificationService } from '@ghostfolio/ui/notifications';
import { DataService } from '@ghostfolio/ui/services';

import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GfRebalancingResultComponent,
    GfTargetAllocationEditorComponent,
    MatButtonModule
  ],
  selector: 'gf-rebalancing-page',
  styleUrls: ['./rebalancing-page.scss'],
  templateUrl: './rebalancing-page.html'
})
export class GfRebalancingPageComponent {
  protected readonly accounts = signal<AccountWithValue[]>([]);
  protected readonly allowFractional = signal<boolean | undefined>(undefined);
  protected readonly allowSells = signal<boolean | undefined>(undefined);
  protected readonly editedModel = signal<TargetAllocationModel | undefined>(
    undefined
  );
  protected readonly errorMessage = signal('');
  protected readonly isLoading = signal(true);
  protected readonly isRunning = signal(false);
  protected readonly isSaving = signal(false);
  protected readonly mode = signal<'edit' | 'run'>('run');
  protected readonly models = signal<TargetAllocationModel[]>([]);
  protected readonly plan = signal<RebalancingPlan | undefined>(undefined);
  protected readonly selectedAccountIds = signal<string[]>([]);
  protected readonly selectedModel = computed(() => {
    return this.models().find(({ id }) => {
      return id === this.selectedModelId();
    });
  });
  protected readonly selectedModelId = signal<string | undefined>(undefined);
  protected user: User;

  private hasLoaded = false;

  private readonly dataService = inject(DataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);

  public constructor() {
    this.userService.stateChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (!state?.user) {
          return;
        }

        this.user = state.user;

        if (
          !hasPermission(state.user.permissions, permissions.accessRebalancing)
        ) {
          void this.router.navigate(internalRoutes.portfolio.routerLink);

          return;
        }

        if (!this.hasLoaded) {
          this.hasLoaded = true;
          this.loadAccounts();
          this.loadModels();
        }
      });
  }

  protected canWrite() {
    return (
      this.user?.permissions?.includes(permissions.createRebalancingModel) ===
      true
    );
  }

  protected isAccountSelected(aId: string) {
    return this.selectedAccountIds().includes(aId);
  }

  protected onAccountToggled({
    checked,
    id
  }: {
    checked: boolean;
    id: string;
  }) {
    this.selectedAccountIds.update((ids) => {
      return checked
        ? [...ids.filter((accountId) => accountId !== id), id]
        : ids.filter((accountId) => accountId !== id);
    });
    this.plan.set(undefined);
  }

  protected onAllowFractionalChanged(aChecked: boolean) {
    this.allowFractional.set(aChecked);
    this.plan.set(undefined);
  }

  protected onAllowSellsChanged(aChecked: boolean) {
    this.allowSells.set(aChecked);
    this.plan.set(undefined);
  }

  protected onCancelled() {
    this.errorMessage.set('');
    this.mode.set('run');
  }

  protected onDeleteModel() {
    const model = this.selectedModel();

    if (!model) {
      return;
    }

    this.notificationService.confirm({
      confirmFn: () => {
        this.dataService
          .deleteTargetAllocationModel(model.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            error: (error: unknown) => {
              this.errorMessage.set(this.getErrorMessage(error));
            },
            next: () => {
              this.selectedModelId.set(undefined);
              this.plan.set(undefined);
              this.loadModels();
            }
          });
      },
      confirmType: ConfirmationDialogType.Warn,
      title: $localize`Do you really want to delete this model?`
    });
  }

  protected onEditModel() {
    this.errorMessage.set('');
    this.editedModel.set(this.selectedModel());
    this.mode.set('edit');
  }

  protected onModelSelected(aId: string) {
    this.selectedModelId.set(aId);
    this.allowFractional.set(undefined);
    this.allowSells.set(undefined);
    this.plan.set(undefined);
  }

  protected onNewModel() {
    this.errorMessage.set('');
    this.editedModel.set(undefined);
    this.mode.set('edit');
  }

  protected onRun() {
    const model = this.selectedModel();

    if (!model || this.isRunning()) {
      return;
    }

    const overrides: CreateRebalancingPlanDto['overrides'] = {};

    if (this.allowFractional() !== undefined) {
      overrides.allowFractional = this.allowFractional();
    }

    if (this.allowSells() !== undefined) {
      overrides.allowSells = this.allowSells();
    }

    this.errorMessage.set('');
    this.isRunning.set(true);

    this.dataService
      .postRebalancingPlan({
        overrides,
        accountIds:
          this.selectedAccountIds().length > 0
            ? this.selectedAccountIds()
            : undefined,
        modelId: model.id
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: (error: unknown) => {
          this.errorMessage.set(this.getErrorMessage(error));
          this.isRunning.set(false);
        },
        next: (plan) => {
          this.plan.set(plan);
          this.isRunning.set(false);
        }
      });
  }

  protected onSaved(aDraft: TargetAllocationDraft) {
    const editedModel = this.editedModel();

    this.errorMessage.set('');
    this.isSaving.set(true);

    const request = editedModel
      ? this.dataService.putTargetAllocationModel({
          id: editedModel.id,
          model: aDraft
        })
      : this.dataService.postTargetAllocationModel(aDraft);

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      error: (error: unknown) => {
        this.errorMessage.set(this.getErrorMessage(error));
        this.isSaving.set(false);
      },
      next: (model) => {
        this.isSaving.set(false);
        this.mode.set('run');
        this.plan.set(undefined);
        this.loadModels(model.id);
      }
    });
  }

  private getErrorMessage(aError: unknown) {
    const error = aError as HttpErrorResponse;
    const details = (error?.error as { errors?: { message: string }[] })
      ?.errors;

    switch (error?.status) {
      case 400:
        return details?.length
          ? details.map(({ message }) => message).join(' ')
          : $localize`The request is invalid.`;
      case 403:
        return $localize`You are not allowed to do this.`;
      case 404:
        return $localize`This model or account no longer exists.`;
      case 409:
        return $localize`A model with this name already exists.`;
      case 429:
        return $localize`Too many requests. Please wait a moment and try again.`;
      default:
        return $localize`Something went wrong. Please try again later.`;
    }
  }

  private loadAccounts() {
    this.dataService
      .fetchAccounts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.accounts.set([]);
        },
        next: ({ accounts }) => {
          this.accounts.set(accounts);
        }
      });
  }

  private loadModels(aSelectId?: string) {
    this.isLoading.set(true);

    this.dataService
      .fetchTargetAllocationModels()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: (error: unknown) => {
          this.errorMessage.set(this.getErrorMessage(error));
          this.isLoading.set(false);
        },
        next: (models) => {
          this.models.set(models);
          this.selectedModelId.set(
            models.find(
              ({ id }) => id === (aSelectId ?? this.selectedModelId())
            )?.id ?? models[0]?.id
          );
          this.isLoading.set(false);
        }
      });
  }
}
