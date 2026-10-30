# Implementation Plan: SCRUM-64

## Pipeline Context

- **Ticket:** SCRUM-64
- **Mode:** gates
- **Pipeline state:** `docs/artifacts/SCRUM-64/.state/pipeline_state_SCRUM-64.json`
- **Artifacts:** `docs/artifacts/SCRUM-64/` (`ph1_problem_spec.md`, `ph2_design_spec.md`, `ph3_design_review.md`, `ph3b_qa_test_plan.md`)
- **Classification:** Large Feature (11-phase set)

## Problem Summary

Wealth managers cannot define a target asset allocation or get exact buy/sell recommendations to reach it; Ghostfolio only shows current allocation. We add named per-user target models (class, sub-class, symbol, with optional bands), a fee- and cash-aware trade calculation, a trade list, export as import-JSON and CSV, and the UI for all of it. It is gated behind `isExperimentalFeatures`.

## Key Requirements & Constraints

| ID      | Priority | Description                                                                                                               |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 | P0       | Create, view, edit, delete multiple named target models per user                                                          |
| REQ-002 | P0       | Targets per class, sub-class, symbol; optional min/max band; symbols sum into sub-class, sub-classes into class           |
| REQ-003 | P0       | Validate before save and run (sums, bands, hierarchy)                                                                     |
| REQ-004 | P0       | Apply to the whole portfolio or an account filter chosen at run time                                                      |
| REQ-005 | P0       | Compute buy/sell trades with flat + % fees and cash reserve, in base currency                                             |
| REQ-006 | P0       | Toggles: whole shares, sells; optional minimum trade value and drift threshold; in-band holdings untouched                |
| REQ-007 | P0       | Trade list with before/after allocation and remaining cash                                                                |
| REQ-008 | P0       | Export import-compatible JSON and CSV                                                                                     |
| REQ-009 | P0       | UI to manage models, run, view, export                                                                                    |
| REQ-010 | P1       | Flag missing class/price, convert currencies, report insufficient cash                                                    |
| REQ-011 | P0       | Any authenticated user, only with `isExperimentalFeatures`; blocked for restricted view; own models only; no data in logs |
| REQ-012 | P1       | Under 2 s for 500 holdings                                                                                                |
| REQ-013 | P2       | WCAG 2.1 AA, translatable strings                                                                                         |

**Constraints:**

- Additive only: new table, endpoints, DTOs, UI; no change to existing signatures or behaviour with the flag off.
- No new dependencies (use `big.js`, `class-validator`, existing Angular stack).
- Exported JSON must be accepted unchanged by `POST /import` (dry run).
- Never log symbols, quantities or amounts.
- Do NOT apply `@AllowDuringImpersonation` to the new controllers.

**Design review conditions (must be implemented):**

- **C-1** Cash comes from `AccountService.getCashDetails` for the same filters and base currency; total value V = holdings + cash. Never assume cash is in the `getDetails` holdings list.
- **C-2** The target validator takes a symbol resolver (class and sub-class per symbol); unresolved symbols are rejected (`UNKNOWN_SYMBOL`).
- **C-3** Nested, decorated DTO classes for the whole target tree and parameters (global `ValidationPipe` uses `whitelist` and `forbidNonWhitelisted`), with array-size caps (max 500 leaf nodes).
- **C-4** Per-user throttling on `POST /rebalancing/plan` using the existing throttler pattern (AI/auth controllers).

**Planning decisions on open flags** (defaults taken from the design so implementation is not blocked; change before Phase 5 if you disagree):

- **F-001 sector targets:** kept as advisory exposure checks that never create trades (ADR-004). Test coverage comes from calculator unit tests; the problem spec has no AC for it.
- **F-002 DEMO role:** excluded from the feature.
- **F-004 2 s scope:** hard gate on calculator plus orchestration with stubbed data loading; end-to-end latency is measured and reported but is not a pass/fail gate.
- **F-005 `accountId` on export:** included only when the run covers exactly one account; omitted otherwise.
- **ARCH-005 permission idiom:** keep ADR-006 as designed (permission in the ADMIN and USER role lists, removed in the existing `!isExperimentalFeatures` block of `UserService`). The review's alternative of pushing the permission when experimental is rejected: the existing experimental push (`enableGhostfolioAi`) sits inside the Premium-only branch of `user.service.ts`, which would exclude Basic-subscription users and break "any authenticated user".

**Non-Goals:** client management via shared access; trade execution/broker integration; tax-lot or tax-aware optimisation; scheduled/automatic rebalancing and alerts; changing the existing import/export formats or the allocations page.

## Architecture Summary

Existing NestJS feature-module layering (controller → service → Prisma) with a pure, dependency-free calculation core (`RebalancingCalculator`) fed by one `PortfolioService.getDetails` call, one `AccountService.getCashDetails` call and one batched quote lookup. Persistence is one new Prisma table (`TargetAllocationModel`, JSON `targets` and `parameters`, unique per user and name). Shared validation and export builders live in `libs/common`. The client adds a `Rebalancing` tab (container page + editor and result presenters) using `DataService`. Gating is by a new `accessRebalancing` permission. Money and weight arithmetic uses `big.js`. Data sources are transformed with the existing request/response interceptors.

## Design Review Conditions

See C-1 to C-4 above. Advisory concerns to verify later: ARCH-006 (confirm `marketPrice` currency with a foreign-currency unit test), ARCH-007 (return `calculatedAt` and price dates), ARCH-008 (global invariants: sell ≤ held, buy cost ≤ cash above reserve, no negative quantities), MISS-001 (log run counts, durations and outcome codes only), MISS-002 (rollback note: turn the flag off, drop the table in a follow-up migration), MISS-005 (extra tests: all-cash portfolio, single holding, class-only targets).

## Affected Repos

Single-repo change — `ghostfolio` (Nx monorepo at the workspace root): `prisma`, `apps/api`, `apps/client`, `libs/common`, `libs/ui`.

## Pre-Implementation Baseline

Run before ANY change and record pass/fail counts per project (all from the workspace root):

- `npm run test:api`
- `npm run test:common`
- `npm run test:ui`
- `npx dotenv-cli -e .env.example -- npx nx test client`
- `npm run lint`
- `npm run database:validate-schema`

Also record which existing tests (if any) touch permission lists, the `internalRoutes` table, `DataService`, or `app.module.ts` before modifying those files (the design review found no test referencing `getPermissions`).

## Implementation Steps

### Execution Mode: waves

44 files (33 new, 11 modified) exceed the 8-file threshold. Execute by wave (see Wave Plan). Per-file review applies; run the stated verify command after each accepted file. Test files are implemented together with their source file.

Command shorthands: `T-api <spec>` = `npx dotenv-cli -e .env.example -- npx nx test api --test-file <spec>`; `T-common <spec>` = same with `common`; `T-client` = `npx dotenv-cli -e .env.example -- npx nx test client`; `L-<project>` = `npx nx lint <project>`.

---

### Wave 0 — contracts, schema, permission (no dependencies)

### Step 1: `prisma/schema.prisma` (modify) [COMP-006]

- **Purpose:** Add `TargetAllocationModel` (id uuid, userId FK `onDelete: Cascade`, name, `targets` Json, `parameters` Json, createdAt, updatedAt; `@@unique([userId, name])`, `@@index([userId])`) and a `targetAllocationModels` relation on `User`.
- **Dependencies:** none
- **Key notes:** Follow field ordering and style of neighbouring models (alphabetical fields as in `Access`). Additive only. After editing run `npm run database:format-schema`, `npm run database:validate-schema`, then `npm run database:generate-typings` so API code compiles against the new client.
- **Acceptance criteria:** REQ-001 AC-001a, AC-001b
- **Verify:** `npm run database:validate-schema`

### Step 2: `prisma/migrations/20261030000000_added_target_allocation_model/migration.sql` (new) [COMP-006]

- **Purpose:** Create table, unique constraint and index for Step 1.
- **Dependencies:** Step 1
- **Key notes:** Match the SQL Prisma generates (use `prisma migrate diff` or `migrate dev --create-only` against a scratch database) rather than writing by hand. Purely additive; do not touch existing tables. Do not run `migrate deploy` against any shared database from the pipeline.
- **Acceptance criteria:** AC-001a, AC-001b (cascade delete covers account removal)
- **Verify:** `npm run database:validate-schema`; migration SQL reviewed against generated diff

### Step 3: `libs/common/src/lib/interfaces/target-allocation-model.interface.ts` (new) [COMP-004]

- **Purpose:** Shapes for model, target tree (class/sub-class/symbol/sector nodes with optional min/max) and parameters.
- **Dependencies:** none
- **Key notes:** Use `interface` and string-literal unions; enums come from `@ghostfolio/prisma/enums`. Field names exactly as in the design spec Data Models.
- **Acceptance criteria:** AC-002a, AC-003a
- **Verify:** `L-common`

### Step 4: `libs/common/src/lib/interfaces/rebalancing-plan.interface.ts` (new) [COMP-004]

- **Purpose:** Plan, trade, allocation row, sector check, cash, excluded holding and warning shapes, including `calculatedAt` and per-trade price date (ARCH-007).
- **Dependencies:** none
- **Key notes:** Trade carries `unitPrice` and `currency` in the asset currency plus `valueInBaseCurrency`, `feeInBaseCurrency`, `feeInAssetCurrency`.
- **Acceptance criteria:** AC-007a, AC-008a
- **Verify:** `L-common`

### Step 5: `libs/common/src/lib/interfaces/index.ts` (modify) [COMP-004]

- **Purpose:** Re-export the new interfaces in the existing alphabetical import/export lists.
- **Dependencies:** Steps 3, 4
- **Key notes:** Add both the `import type` lines and the export names in the existing sorted order; no other edits.
- **Verify:** `L-common`

### Step 6: `libs/common/src/lib/routes/routes.ts` (modify) [COMP-005]

- **Purpose:** Add `rebalancing` to `internalRoutes.portfolio.subRoutes` (path `rebalancing`, `routerLink: ['/portfolio', 'rebalancing']`, `$localize` title).
- **Dependencies:** none
- **Key notes:** Keep alphabetical placement (between `fire`/`xRay` as the file orders keys); additive only.
- **Acceptance criteria:** AC-009a
- **Verify:** `L-common`; `T-client`

### Step 7: `libs/common/src/lib/permissions.ts` (modify) [COMP-010]

- **Purpose:** Add the `accessRebalancing` constant and add it to the ADMIN and USER role lists (not DEMO).
- **Dependencies:** none
- **Key notes:** Keep the constants object alphabetical. DEMO excluded (F-002).
- **Acceptance criteria:** AC-011a
- **Verify:** `T-common helper.spec.ts` (smoke), `L-common`

### Step 8: `apps/api/src/app/user/user.service.ts` (modify) [COMP-010]

- **Purpose:** Remove `accessRebalancing` when `isExperimentalFeatures` is off.
- **Dependencies:** Step 7
- **Key notes:** Use the existing empty `!isExperimentalFeatures` block (~lines 404-410) with `without(currentPermissions, permissions.accessRebalancing)`. That block runs before the subscription branches, so it applies to every user. Verify the permission is NOT removed by the Basic-subscription `without(...)` list (~line 457) and not added only in the Premium branch. Add a unit test (new `user.service.spec.ts` or the existing one if present) for: flag on, flag off, DEMO, Basic and Premium subscription.
- **Acceptance criteria:** AC-011a (TC-058, TC-059, TC-060)
- **Verify:** `T-api user.service.spec.ts`

---

### Wave 1 — shared logic and calculator (depend on Wave 0 contracts)

### Step 9: `libs/common/src/lib/target-allocation/target-allocation-validation.ts` (new) [COMP-001]

- **Purpose:** Pure validation of the target tree: sibling sums (±0.01 pp), band contains target, hierarchy via `ASSET_CLASS_MAPPING`, duplicates, 500-leaf cap, unknown symbols via a caller-supplied resolver (C-2). Returns structured errors `{ path, code, message }` naming the level and shortfall.
- **Dependencies:** Steps 3, 4
- **Key notes:** `big.js` for all arithmetic. No I/O. Resolver is a parameter (map of symbol → class and sub-class).
- **Acceptance criteria:** AC-002a, AC-002b, AC-003a, AC-003b (TC-007 to TC-018)
- **Verify:** `T-common target-allocation-validation.spec.ts`

### Step 10: `libs/common/src/lib/target-allocation/target-allocation-validation.spec.ts` (new) [COMP-001]

- **Purpose:** Unit tests for Step 9, including EC-004 (33.33 × 3), band boundary equals target, crypto under LIQUIDITY accepted and under EQUITY rejected, unknown symbol, 501 leaves.
- **Dependencies:** Step 9
- **Verify:** `T-common target-allocation-validation.spec.ts`

### Step 11: `libs/common/src/lib/target-allocation/rebalancing-export.ts` (new) [COMP-002]

- **Purpose:** Build the import JSON (`{ activities: [...] }` conforming to `CreateOrderDto`) and CSV text from a plan.
- **Dependencies:** Step 4
- **Key notes:** `accountId` only when exactly one account is in scope (F-005). Neutralise CSV cells starting with `=`, `+`, `-`, `@`. Date = run date (ISO).
- **Acceptance criteria:** AC-008a, AC-008b (TC-043 to TC-048)
- **Verify:** `T-common rebalancing-export.spec.ts`

### Step 12: `libs/common/src/lib/target-allocation/rebalancing-export.spec.ts` (new) [COMP-002]

- **Purpose:** Tests incl. validating output against `ImportDataDto` (use `class-validator` + `plainToInstance`), header + one row per trade, empty plan, formula injection.
- **Dependencies:** Step 11
- **Verify:** `T-common rebalancing-export.spec.ts`

### Step 13: `libs/common/src/lib/dtos/create-target-allocation-model.dto.ts` (new) [COMP-003]

- **Purpose:** Request body for creating a model with nested decorated node classes and parameters (C-3).
- **Dependencies:** Steps 3, 4
- **Key notes:** Use `@ValidateNested`, `@Type`, `@ArrayMaxSize`, numeric `@Min/@Max`, `@IsEnum` for Prisma enums, `@MaxLength(100)` on name; follow `import-data.dto.ts`. Nested classes may live in the same file or sibling `*.dto.ts` files.
- **Acceptance criteria:** AC-001a, AC-003a, AC-012 (TC-065)
- **Verify:** `L-common`; DTO tests in Step 15 spec

### Step 14: `libs/common/src/lib/dtos/update-target-allocation-model.dto.ts` (new) [COMP-003]

- **Purpose:** Request body for updating a model (same nested structure).
- **Dependencies:** Step 13
- **Verify:** `L-common`

### Step 15: `libs/common/src/lib/dtos/create-rebalancing-plan.dto.ts` (new) [COMP-003]

- **Purpose:** Plan-run body: `modelId`, optional `accountIds` (array size cap), optional parameter overrides (flat fee, percentage fee, cash reserve amount and percentage, `allowFractional`, `allowSells`, `minTradeValue`, `driftThreshold`).
- **Dependencies:** Step 13
- **Key notes:** All ranges validated; unknown properties rejected by the global pipe. Add a small spec (e.g. `create-target-allocation-model.dto.spec.ts`) proving nested undecorated properties are rejected and valid trees pass.
- **Verify:** `T-common create-target-allocation-model.dto.spec.ts`

### Step 16: `libs/common/src/lib/dtos/index.ts` (modify) [COMP-003]

- **Purpose:** Re-export the three DTOs (and nested classes if exported).
- **Dependencies:** Steps 13-15
- **Key notes:** Keep sorted import and export lists.
- **Verify:** `L-common`

### Step 17: `apps/api/src/app/endpoints/rebalancing/rebalancing-calculator.ts` (new) [COMP-008]

- **Purpose:** Pure calculator implementing the 11-step approach in the design spec: V = holdings + cash (C-1); reserve = fixed + % of V; leaf targets with bucket spreading; band and drift filtering; sell/buy sizing; flat + % fees included in the cash budget; bounded settling iteration with fixed cap and tolerance; whole-share rounding with residual; minimum trade; sector advisory exposure; warnings and excluded holdings.
- **Dependencies:** Steps 3, 4
- **Key notes:** `big.js` only; no I/O, no Nest imports, no logging. Enforce invariants: sell ≤ held, buy cost ≤ cash above reserve, no negative quantities (ARCH-008). Deterministic ordering of trades (stable sort). On non-convergence return the best plan with a `NOT_CONVERGED` warning.
- **Acceptance criteria:** AC-005a, AC-005b, AC-006a, AC-006b, AC-007a, AC-007b, AC-010, AC-012 (TC-025 to TC-042, TC-055 to TC-057, TC-064)
- **Verify:** `T-api rebalancing-calculator.spec.ts`

### Step 18: `apps/api/src/app/endpoints/rebalancing/rebalancing-calculator.spec.ts` (new) [COMP-008]

- **Purpose:** Unit tests: fee model, reserve combinations, buy-only, whole vs fractional, minimum trade, drift, in-band untouched, unheld target symbol (EC-002), fee ≥ trade (EC-003), residual (EC-005), multi-sector exposure (EC-006), empty portfolio (EC-001), all-cash portfolio, single holding, class-only targets (MISS-005), cash included in V (TC-024), foreign-currency trade price/fee (ARCH-006), 500-holding performance test under 2 s (F-004 decision).
- **Dependencies:** Step 17
- **Verify:** `T-api rebalancing-calculator.spec.ts`

---

### Wave 2 — persistence service, client services and presenters

### Step 19: `apps/api/src/app/endpoints/rebalancing/target-allocation-model.service.ts` (new) [COMP-007]

- **Purpose:** Create/read/update/delete a user's models via `PrismaService`; every query filtered by `userId`; revalidate with Step 9 (symbol resolver built from `SymbolProfileService`); duplicate name → 409; foreign/missing id → 404 (ADR-008).
- **Dependencies:** Steps 1, 9 (needs generated Prisma client)
- **Key notes:** Follow `TagService` style (`HttpException` + `StatusCodes`). Map Prisma unique-violation error to 409. No logging of model contents.
- **Acceptance criteria:** AC-001a, AC-001b, AC-002b, AC-003a (TC-001 to TC-006)
- **Verify:** `T-api target-allocation-model.service.spec.ts`

### Step 20: `apps/api/src/app/endpoints/rebalancing/target-allocation-model.service.spec.ts` (new) [COMP-007]

- **Purpose:** Tests with mocked `PrismaService`: user scoping, 404 for other user's id, 409 duplicate, validation failures, cascade expectation documented.
- **Dependencies:** Step 19
- **Verify:** `T-api target-allocation-model.service.spec.ts`

### Step 21: `libs/ui/src/lib/services/data.service.ts` (modify) [COMP-014]

- **Purpose:** Add `fetchTargetAllocationModels`, `fetchTargetAllocationModel`, `postTargetAllocationModel`, `putTargetAllocationModel`, `deleteTargetAllocationModel`, `postRebalancingPlan`.
- **Dependencies:** Steps 4, 13-16
- **Key notes:** Match the style of `fetchTags/postTag/putTag/deleteTag`; place alphabetically; no changes to existing methods.
- **Verify:** `L-ui`; `npx dotenv-cli -e .env.example -- npx nx test ui`

### Step 22: `apps/client/src/app/components/target-allocation-editor/target-allocation-editor.component.ts` (+ `.html`, `.scss`) (new) [COMP-016]

- **Purpose:** Presenter to edit the target tree (class → sub-class → symbol, optional sectors), bands and parameters with inline validation using Step 9 and a symbol resolver backed by existing asset-profile search.
- **Dependencies:** Steps 9, 3
- **Key notes:** Standalone, `OnPush`, `selector: 'gf-target-allocation-editor'`, class `GfTargetAllocationEditorComponent`; `$localize` for all text; labels, `aria-*`, keyboard operation (REQ-013). Emits valid-model draft; no HTTP in the component.
- **Acceptance criteria:** AC-002a, AC-003a, AC-003b, AC-009a, AC-009b, AC-013 (TC-050, TC-052 to TC-054, TC-067 to TC-069)
- **Verify:** `T-client`; `L-client`

### Step 23: `apps/client/src/app/components/rebalancing-result/rebalancing-result.component.ts` (+ `.html`, `.scss`) (new) [COMP-017]

- **Purpose:** Presenter showing trades, before/after allocation, cash, warnings, excluded holdings, `calculatedAt`, and export buttons (JSON, CSV) using Step 11.
- **Dependencies:** Steps 11, 4
- **Key notes:** Standalone, `OnPush`, `GfRebalancingResultComponent`, selector `gf-rebalancing-result`. Download via `Blob` and object URL, revoked after use. Empty plan shows the "portfolio already within targets" message. Accessible table with captions.
- **Acceptance criteria:** AC-007a, AC-007b, AC-008a, AC-008b, AC-013 (TC-037 to TC-048, TC-067, TC-068)
- **Verify:** `T-client`; `L-client`

### Step 24: `apps/client/src/app/pages/portfolio/portfolio-page.component.ts` and `portfolio-page.routes.ts` (modify) [COMP-018]

- **Purpose:** Show the Rebalancing tab only when `hasPermission(user.permissions, permissions.accessRebalancing)`; add the lazy child route using `internalRoutes.portfolio.subRoutes.rebalancing.path`.
- **Dependencies:** Steps 6, 7
- **Key notes:** Additive; existing tabs and order unchanged. Route should also guard so a direct URL without permission redirects (follow how other gated pages behave). Add tab icon consistent with the others (ionicons name).
- **Acceptance criteria:** AC-009a, AC-011a (TC-049, TC-058, TC-059)
- **Verify:** `T-client`; `L-client`

---

### Wave 3 — orchestration service and models controller

### Step 25: `apps/api/src/app/endpoints/rebalancing/rebalancing.service.ts` (new) [COMP-009]

- **Purpose:** Load the model (ownership checked via Step 19), holdings via `PortfolioService.getDetails` (account `Filter[]`), cash via `AccountService.getCashDetails` for the same filters and base currency (C-1), quotes for unheld target symbols via `DataProviderService.getQuotes`, fee conversion via `ExchangeRateDataService.toCurrency`; revalidate the stored model before every run; call the calculator; attach `calculatedAt`.
- **Dependencies:** Steps 17, 19
- **Key notes:** Exclude holdings without asset class or price and report them. Verify account ids belong to the user (reject foreign ids, TC-020). Respect excluded accounts consistently with `getDetails`. Log only counts, durations and outcome codes (MISS-001). Add `@LogPerformance` or use the existing interceptor pattern.
- **Acceptance criteria:** AC-004a, AC-004b, AC-005a, AC-010, AC-011b (TC-019 to TC-024, TC-055 to TC-057, TC-061 to TC-063)
- **Verify:** `T-api rebalancing.service.spec.ts`

### Step 26: `apps/api/src/app/endpoints/rebalancing/rebalancing.service.spec.ts` (new) [COMP-009]

- **Purpose:** Tests with stubbed dependencies: account scoping, foreign account id rejected, cash added to V, missing price/class exclusion, FX conversion, log output contains no symbols or amounts.
- **Dependencies:** Step 25
- **Verify:** `T-api rebalancing.service.spec.ts`

### Step 27: `apps/api/src/app/endpoints/rebalancing/target-allocation-models.controller.ts` (new) [COMP-011]

- **Purpose:** `GET/POST /rebalancing/models`, `GET/PUT/DELETE /rebalancing/models/:id` with `AuthGuard('jwt')`, `HasPermissionGuard` + `@HasPermission(permissions.accessRebalancing)`, explicit `isRestrictedView` rejection (403), no `@AllowDuringImpersonation`.
- **Dependencies:** Steps 8, 16, 19
- **Key notes:** Status codes per design API Contracts (201, 200, 204, 400, 403, 404, 409). Add a controller spec (`target-allocation-models.controller.spec.ts`) covering 403 for missing permission and restricted view, impersonation rejection, 404 mapping.
- **Acceptance criteria:** AC-001a, AC-001b, AC-011a (TC-001 to TC-006, TC-058 to TC-060)
- **Verify:** `T-api target-allocation-models.controller.spec.ts`

---

### Wave 4

### Step 28: `apps/api/src/app/endpoints/rebalancing/rebalancing-plan.controller.ts` (new) [COMP-012]

- **Purpose:** `POST /rebalancing/plan` with the same guards as Step 27, `TransformDataSourceInRequestInterceptor` and `TransformDataSourceInResponseInterceptor`, and per-user throttling (C-4).
- **Dependencies:** Steps 8, 15, 25
- **Key notes:** Choose and document the throttle limit (follow `ai.controller.ts`). Add `rebalancing-plan.controller.spec.ts` for 403/404/400 mapping, throttle metadata, restricted-view and impersonation rejection.
- **Acceptance criteria:** AC-004a, AC-004b, AC-005a, AC-011a, AC-012 (TC-019 to TC-030, TC-058 to TC-060, TC-066)
- **Verify:** `T-api rebalancing-plan.controller.spec.ts`

---

### Wave 5 — wiring and page

### Step 29: `apps/api/src/app/endpoints/rebalancing/rebalancing.module.ts` (new) and `apps/api/src/app/app.module.ts` (modify) [COMP-013]

- **Purpose:** Nest module declaring both controllers and providers `TargetAllocationModelService`, `RebalancingService`; importing `PortfolioModule`, `AccountModule`, `DataProviderModule`, `ExchangeRateDataModule`, `SymbolProfileModule`, `PrismaModule`, the transform interceptor modules and `PerformanceLoggingModule`; register in `AppModule` imports (alphabetical position).
- **Dependencies:** Steps 19, 25, 27, 28
- **Key notes:** Check for circular module imports (`PortfolioModule` exports `PortfolioService` already). Run `app.module.spec.ts` (exists in repo) because it compiles the full module graph.
- **Acceptance criteria:** all API ACs (wiring)
- **Verify:** `T-api app.module.spec.ts`; `L-api`

### Step 30: `apps/client/src/app/pages/portfolio/rebalancing/rebalancing-page.component.ts` (+ `rebalancing-page.html`, `rebalancing-page.scss`, `rebalancing-page.routes.ts`) (new) [COMP-015]

- **Purpose:** Container: load models, create/edit/delete via `DataService`, choose model and optional account filter and parameter overrides, run plan, show result, map HTTP errors (400/403/404/409) to inline messages.
- **Dependencies:** Steps 21, 22, 23
- **Key notes:** Standalone `GfRebalancingPageComponent`, `OnPush`, signals for state, `takeUntilDestroyed`, route with `AuthGuard` as `fire-page.routes.ts`. Show an empty/loading state with skeleton as in other pages. No business rules here.
- **Acceptance criteria:** AC-001a, AC-004a, AC-004b, AC-009a, AC-009b, AC-013 (TC-049 to TC-054)
- **Verify:** `T-client`; `L-client`; `npx nx build client` (once, at the end of the wave)

---

### Wave 6 — translations

### Step 31: `apps/client/src/locales/messages.xlf` (modify) [COMP-019]

- **Purpose:** Add the new `$localize` strings.
- **Dependencies:** Steps 6, 22, 23, 24, 30
- **Key notes:** Run `npm run extract-locales` once, after all UI text is final, and review the diff: only additions for the new strings should appear; if the extraction reformats unrelated entries, revert those hunks. Do not hand-translate other languages.
- **Acceptance criteria:** AC-013 (TC-069)
- **Verify:** `git diff --stat` shows only additions to `messages.xlf`; `L-client`

## Wave Plan

| Wave | Files                                                                                                                                                                                                                                                                                                    | Dependencies Satisfied | Test Command                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| 0    | `prisma/schema.prisma`, migration `20261030000000_added_target_allocation_model/migration.sql`, `interfaces/target-allocation-model.interface.ts`, `interfaces/rebalancing-plan.interface.ts`, `interfaces/index.ts`, `routes/routes.ts`, `permissions.ts`, `user.service.ts` (+ `user.service.spec.ts`) | none                   | `npm run database:validate-schema`; `npm run test:common`; `T-api user.service.spec.ts` |
| 1    | `target-allocation-validation.ts` (+spec), `rebalancing-export.ts` (+spec), 3 DTOs + `dtos/index.ts` (+ DTO spec), `rebalancing-calculator.ts` (+spec)                                                                                                                                                   | Wave 0                 | `npm run test:common`; `T-api rebalancing-calculator.spec.ts`                           |
| 2    | `target-allocation-model.service.ts` (+spec), `data.service.ts`, editor component (3 files), result component (3 files), `portfolio-page.component.ts` + `portfolio-page.routes.ts`                                                                                                                      | Wave 1                 | `npm run test:api`; `T-client`; `npm run test:ui`                                       |
| 3    | `rebalancing.service.ts` (+spec), `target-allocation-models.controller.ts` (+spec)                                                                                                                                                                                                                       | Wave 2                 | `npm run test:api`                                                                      |
| 4    | `rebalancing-plan.controller.ts` (+spec)                                                                                                                                                                                                                                                                 | Wave 3                 | `npm run test:api`                                                                      |
| 5    | `rebalancing.module.ts`, `app.module.ts`, page component (4 files)                                                                                                                                                                                                                                       | Wave 4                 | `T-api app.module.spec.ts`; `T-client`; `npx nx build client`                           |
| 6    | `messages.xlf`                                                                                                                                                                                                                                                                                           | Wave 5                 | `npm run extract-locales` then `npm run lint`                                           |

Final full run: `npm run test:api`, `npm run test:common`, `npm run test:ui`, `T-client`, `npm run lint`, `npm run database:validate-schema`; compare with the baseline.

## Acceptance Criteria → File Mapping

| AC        | Primary files (steps) |
| --------- | --------------------- |
| AC-001a/b | 1, 2, 19, 20, 27, 30  |
| AC-002a/b | 9, 10, 13, 19, 22     |
| AC-003a/b | 9, 10, 13, 22         |
| AC-004a/b | 15, 25, 26, 28, 30    |
| AC-005a/b | 17, 18, 25, 28        |
| AC-006a/b | 17, 18                |
| AC-007a/b | 4, 17, 18, 23         |
| AC-008a/b | 11, 12, 23            |
| AC-009a/b | 22, 24, 30            |
| AC-010    | 17, 25, 26            |
| AC-011a/b | 7, 8, 25-28           |
| AC-012    | 13, 18, 28            |
| AC-013    | 22, 23, 30, 31        |

QA coverage: `ph3b_qa_test_plan.md` plans 69 cases (6 regression: TC-043, 045, 049, 058, 059, 060). No automation exists (no QA repo configured), so these remain manual until `client-notes/qa-test-generation.md` is added; unit and integration tests above are the automated coverage.

## Risks

| Risk                                                             | Impact                                    | Mitigation                                                                          |
| ---------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------- |
| Permission change affects every request (`user.service.ts`)      | Wrong permission lists for existing users | Additive only; unit tests for flag on/off, DEMO, Basic, Premium; baseline run first |
| Prisma client not regenerated after schema change                | API fails to compile                      | Run `database:generate-typings` right after Step 1; Wave 0 gate                     |
| Global whitelist rejects undecorated nested DTO properties (C-3) | Valid models rejected with 400            | Decorated nested DTO classes; DTO spec in Step 15                                   |
| Cash omitted from total value (C-1)                              | All weights and reserve wrong             | Explicit calculator input; TC-024 and a dedicated unit test                         |
| Validator needs symbol class data (C-2)                          | Hierarchy cannot be checked               | Resolver parameter; server builds it from `SymbolProfileService`                    |
| Fee settling does not converge                                   | Plan inexact                              | Fixed iteration cap and tolerance; `NOT_CONVERGED` warning; tests                   |
| `getDetails` latency dominates the 2 s target                    | Perceived slowness                        | F-004 decision: gate on calculator + orchestration; measure end-to-end              |
| Plan endpoint abuse                                              | API load                                  | Per-user throttling (C-4)                                                           |
| `messages.xlf` extraction reformats unrelated entries            | Noisy PR                                  | Run once at the end, review the diff, revert unrelated hunks                        |
| Module import cycles in `RebalancingModule`                      | App fails to start                        | Use `app.module.spec.ts` as the wiring gate (Step 29)                               |
| Sensitive data in logs                                           | Privacy breach                            | Log counts/durations/outcomes only; log-inspection tests (TC-061 to TC-063)         |

## Edge Cases (from problem_spec)

| ID     | Scenario                                | Expected Behavior                                     |
| ------ | --------------------------------------- | ----------------------------------------------------- |
| EC-001 | Empty portfolio                         | Empty trade list with a message, no error             |
| EC-002 | Target symbol not held                  | Bought at market price, or flagged if no price exists |
| EC-003 | Fee exceeds trade value or minimum      | Trade skipped and listed as below threshold           |
| EC-004 | Targets sum to 100% only after rounding | Allowed within ±0.01 percentage points                |
| EC-005 | Whole-share rounding leaves cash        | Residual shown in the result                          |
| EC-006 | Multi-sector fund vs sector targets     | Weighted exposure used (advisory)                     |

## Post-Implementation Checklist

- [ ] Baseline recorded before changes; all tests pass with no regressions from baseline
- [ ] C-1 to C-4 implemented and covered by tests
- [ ] Migration reviewed; Prisma client regenerated; `npm run database:validate-schema` passes
- [ ] No symbols, quantities or amounts in any log statement (verified by test)
- [ ] `ph5_6_impl_manifest.md` written with accurate file lists
- [ ] Exported JSON validates against `ImportDataDto` (dry run)
- [ ] Translations extracted once; diff reviewed
- [ ] Lint passes for api, client, common, ui

## Pipeline Continuation

**CRITICAL: This implementation is part of the SDLC pipeline for SCRUM-64.**
After implementation completes, the pipeline MUST continue through:

- Phase 6: Simplify
- Phase 7: Review
- Phase 8: Verification
- Phase 9: Risk Assessment
- Phase 10: PR Creation

**DO NOT skip phases 6-10. DO NOT jump directly to PR creation.**

Resume command: `/sdlc-pipeline --ticket=SCRUM-64 --resume`

## Plan Deviations (Phase 5)

Items 1 and 4 were approved by the user in the Wave 0 review (2026-10-30). Items 2 and 3 are test-placement and verification notes made by the implementer; they are not user decisions and will be raised in the next wave review.

1. **Write permissions added (affects Steps 7, 8, 27, 28).** The existing read-only-mode filter in `user.service.ts` strips permissions whose names start with `create`, `delete` or `update`. A single `accessRebalancing` permission would keep model writes available in read-only mode. Added `createRebalancingModel`, `updateRebalancingModel` and `deleteRebalancingModel` to `permissions.ts` (ADMIN and USER lists, not DEMO); `UserService` removes all four when experimental features are off. `accessRebalancing` stays for reading models and running plans. The models controller must use `@HasPermission(createRebalancingModel | updateRebalancingModel | deleteRebalancingModel)` on POST, PUT and DELETE.
2. **Import-compatibility test location (Step 12).** `libs/common` cannot import `ImportDataDto` from `apps/api`, so the export builders are validated against `CreateOrderDto` in `libs/common`, and a test against `ImportDataDto` lives in `apps/api` (with the Wave 3 service tests).
3. **Client verification (Steps 22-24, 30).** The `client` project has no Jest tests ("No tests found"), so client steps are verified with lint, type-check and a build instead of `T-client`.
4. **Schema formatting.** `prisma format` realigned 20 existing lines of the `User` model; accepted by the user.
