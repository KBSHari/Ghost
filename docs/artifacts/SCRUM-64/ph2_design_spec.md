# Design Specification: Advanced Portfolio Rebalancing & Target Allocation Planner

## Meta

- **Ticket ID:** SCRUM-64
- **Feature ID:** FEAT-0001
- **Title:** Advanced Portfolio Rebalancing & Target Allocation Planner
- **Date:** 2026-10-30
- **Author:** Claude Code (sdlc-architecture)
- **Version:** 1
- **Iteration:** 1
- **Approval status:** pending_review
- **ready_for_implementation:** false (set to true only after design review)
- **codebase_location:** `C:/Users/Hariprasanth_Baskara/Agentic/ghostfolio` (single Nx monorepo at workspace root; `apps/api`, `apps/client`, `libs/common`, `libs/ui`, `prisma`)
- **codebase_analyzed:** true
- **Multi-repo:** No (single repo, `repo` field omitted on components)

## Problem Spec Reference

- Source: `docs/artifacts/SCRUM-64/ph1_problem_spec.md` (approved 2026-10-30T13:28:23+0530)
- Requirements addressed: REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006, REQ-007, REQ-008, REQ-009, REQ-010, REQ-011, REQ-012, REQ-013
- Traceability (REQ → components): REQ-001 → COMP-006, COMP-007, COMP-011, COMP-014; REQ-002/003 → COMP-001, COMP-003, COMP-007, COMP-016; REQ-004/005/006 → COMP-008, COMP-009, COMP-012; REQ-007 → COMP-004, COMP-009, COMP-017; REQ-008 → COMP-002, COMP-017; REQ-009 → COMP-015, COMP-016, COMP-017, COMP-018; REQ-010 → COMP-008, COMP-009, COMP-017; REQ-011 → COMP-010, COMP-011, COMP-012, COMP-018; REQ-012 → COMP-008, COMP-009; REQ-013 → COMP-015, COMP-016, COMP-017, COMP-019.

## Current Architecture

### Description

Ghostfolio is an Nx monorepo: a NestJS API (`apps/api`), an Angular client (`apps/client`), shared code (`libs/common` for DTOs, interfaces, permissions, routes; `libs/ui` for shared components and the `DataService`), and a Prisma/PostgreSQL schema (`prisma`). The API exposes feature endpoints under `apps/api/src/app/endpoints/<feature>/` (controller + module, sometimes a service, e.g. `watchlist`) and portfolio calculations under `apps/api/src/app/portfolio/`. There is no rebalancing or target-allocation code today (verified: zero matches for rebalanc/targetAllocation outside blog pages). The client's `Portfolio` page hosts tabbed sub-pages (analysis, activities, allocations, FIRE, X-ray) that are lazy-loaded routes.

### Existing Components (relevant)

| Name                                              | file_path                                                                                                                                                   | current_behavior                                                                                                                                                                                                                                                       | modifications_needed                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| PortfolioService                                  | `apps/api/src/app/portfolio/portfolio.service.ts`                                                                                                           | `getDetails` returns holdings (with `valueInBaseCurrency`, `marketPrice`, `quantity`, `assetProfile` incl. `assetClass`, `assetSubClass`, `sectors`, `currency`), accounts, summary; cash appears as cash-position holdings; supports `Filter[]` incl. account filters | None (consumed read-only)                                     |
| AccountService.getCashDetails                     | `apps/api/src/services/account/account.service.ts`                                                                                                          | Returns cash balances per currency/base currency with account filters                                                                                                                                                                                                  | None (consumed)                                               |
| DataProviderService.getQuotes                     | `apps/api/src/services/data-provider/data-provider.service.ts`                                                                                              | Returns latest quotes for `AssetProfileIdentifier[]`                                                                                                                                                                                                                   | None (consumed, for unheld target symbols)                    |
| ExchangeRateDataService.toCurrency                | `apps/api/src/services/exchange-rate-data/exchange-rate-data.service.ts`                                                                                    | Converts a value between currencies                                                                                                                                                                                                                                    | None (consumed, fee conversion)                               |
| SymbolProfileService                              | `apps/api/src/services/symbol-profile/`                                                                                                                     | Reads `SymbolProfile` (class, sub-class, sectors, currency)                                                                                                                                                                                                            | None (consumed)                                               |
| ImportController / ImportDataDto / CreateOrderDto | `apps/api/src/app/endpoints/import/import.controller.ts`, `apps/api/src/services/import/import-data.dto.ts`, `libs/common/src/lib/dtos/create-order.dto.ts` | `POST /import` accepts `{ activities: CreateOrderDto[] ... }`, `dryRun` supported; needs `createActivity` + `createAccount` permissions                                                                                                                                | None (export format must conform)                             |
| TagsController                                    | `apps/api/src/app/endpoints/tags/tags.controller.ts`                                                                                                        | CRUD pattern: `AuthGuard('jwt')`, `HasPermissionGuard` + `@HasPermission`, `HttpException` with `StatusCodes`                                                                                                                                                          | None (pattern to follow)                                      |
| permissions                                       | `libs/common/src/lib/permissions.ts`                                                                                                                        | Permission constants and per-role lists; `isRestrictedView(user)` helper                                                                                                                                                                                               | Add `accessRebalancing`; grant to roles                       |
| UserService (permissions)                         | `apps/api/src/app/user/user.service.ts` (~lines 398-410, 476-490)                                                                                           | Computes `currentPermissions`; has an empty `!isExperimentalFeatures` block intended for `without(...)` and pushes permissions conditionally on `isExperimentalFeatures`                                                                                               | Remove `accessRebalancing` when experimental features are off |
| UserSettings                                      | `libs/common/src/lib/interfaces/user-settings.interface.ts`                                                                                                 | Per-user JSON settings incl. `isExperimentalFeatures`, `isRestrictedView`, `baseCurrency`                                                                                                                                                                              | None                                                          |
| ASSET_CLASS_MAPPING                               | `libs/common/src/lib/config.ts:38`                                                                                                                          | Fixed map `AssetClass → AssetSubClass[]` (e.g. `LIQUIDITY → [CRYPTOCURRENCY]`, `EQUITY → [ETF, MUTUALFUND, PRIVATE_EQUITY, STOCK]`)                                                                                                                                    | None (hierarchy source of truth)                              |
| Prisma schema                                     | `prisma/schema.prisma`                                                                                                                                      | Models `User`, `Account`, `Order`, `SymbolProfile`, `Settings`, `Access`, etc.                                                                                                                                                                                         | Add model + `User` relation                                   |
| App module                                        | `apps/api/src/app/app.module.ts`                                                                                                                            | Registers endpoint modules                                                                                                                                                                                                                                             | Register `RebalancingModule`                                  |
| DataService                                       | `libs/ui/src/lib/services/data.service.ts`                                                                                                                  | Client HTTP layer for all API calls (e.g. `fetchTags`, `postTag`, `putTag`, `deleteTag`, `fetchPortfolioDetails`)                                                                                                                                                      | Add rebalancing methods                                       |
| Portfolio page                                    | `apps/client/src/app/pages/portfolio/portfolio-page.component.ts`, `portfolio-page.routes.ts`                                                               | Builds the tab list; routes child pages lazily                                                                                                                                                                                                                         | Add conditional tab and route                                 |
| Routes                                            | `libs/common/src/lib/routes/routes.ts`                                                                                                                      | `internalRoutes.portfolio.subRoutes` (`allocations`, `analysis`, `fire`, `xRay`)                                                                                                                                                                                       | Add `rebalancing` sub-route                                   |
| DTO / interface barrels                           | `libs/common/src/lib/dtos/index.ts`, `libs/common/src/lib/interfaces/index.ts`                                                                              | Central re-exports                                                                                                                                                                                                                                                     | Add new exports                                               |

### Blast-radius callers

- `permissions.ts` and `user.service.ts` are evaluated for every authenticated request (permission list). Change is additive (one new constant, conditional removal); existing tests asserting permission lists for ADMIN/USER must be enumerated by the baseline test run (see Implementation Guidelines).
- `dtos/index.ts`, `interfaces/index.ts`, `routes.ts`, `data.service.ts`, `app.module.ts` are shared barrels/registries: additive exports only, no signature changes.
- `portfolio.service.ts`, `account.service.ts`, `data-provider.service.ts`, `exchange-rate-data.service.ts` are only consumed, not changed (zero change to their callers).

### Existing Patterns (the design must follow)

- Endpoint = `endpoints/<feature>/{*.controller.ts, *.module.ts, *.service.ts}`; auth by `AuthGuard('jwt')` + `HasPermissionGuard` with `@HasPermission(...)`; errors via `HttpException(getReasonPhrase(code), code)`.
- Request validation with `class-validator` DTOs in `libs/common/src/lib/dtos/` re-exported through `index.ts`; response/shared types in `libs/common/src/lib/interfaces/`.
- Data-source obfuscation via `TransformDataSourceInRequestInterceptor` / `TransformDataSourceInResponseInterceptor`.
- Per-user data uses Prisma models with `userId` FK and `onDelete: Cascade`, `@@index([userId])`; Prisma migrations named `YYYYMMDDHHMMSS_description`.
- Client: standalone Angular components (`ChangeDetectionStrategy.OnPush`, `imports: [...]`, `selector: 'gf-...'`), lazy routes with `AuthGuard`, all HTTP through `DataService`, strings via `$localize`.
- Money arithmetic with `big.js` (`Big`) in services.
- Tests: Jest `*.spec.ts` next to source; `npm run test:api`, `npx nx test common|ui`.

### Integration Points

- `PortfolioService.getDetails({ filters, userId, ... })` → holdings and cash (read).
- `AccountService.getCashDetails({ filters, userId, currency })` → cash for the scope (read).
- `DataProviderService.getQuotes({ items })` → prices for target symbols not held (read).
- `ExchangeRateDataService.toCurrency(value, from, to)` → currency conversion (read).
- `POST /import` (existing) consumes the exported JSON (contract only; no code change).
- `UserService` permission computation consumes the new permission rule.

## Architecture

### Pattern

**Existing NestJS feature-module layering (`mvc`-style: controller → service → Prisma) with a pure calculation core on the API, and Angular standalone `container_presenter` components on the client** (ADR-001). The rebalancing math is isolated in a dependency-free calculator so it can be unit-tested without Nest, Prisma or HTTP.

### Components

| ID       | Name                              | Type      | Responsibility                                                                                                     | Dependencies                           | file_path                                                                                                                                                                        | New / Modified             |
| -------- | --------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| COMP-001 | TargetAllocationValidation        | utility   | Validate a target tree (sibling sums, bands, hierarchy against `ASSET_CLASS_MAPPING`) and return structured errors | COMP-004                               | `libs/common/src/lib/target-allocation/target-allocation-validation.ts`                                                                                                          | New                        |
| COMP-002 | RebalancingExportBuilders         | utility   | Convert a rebalancing plan into import-compatible JSON and CSV text                                                | COMP-004                               | `libs/common/src/lib/target-allocation/rebalancing-export.ts`                                                                                                                    | New                        |
| COMP-003 | TargetAllocationDtos              | utility   | Validate API request bodies for model create/update and plan runs                                                  | COMP-004                               | `libs/common/src/lib/dtos/create-target-allocation-model.dto.ts`, `update-target-allocation-model.dto.ts`, `create-rebalancing-plan.dto.ts`; `libs/common/src/lib/dtos/index.ts` | New (3), Modified (barrel) |
| COMP-004 | RebalancingInterfaces             | utility   | Define shared TypeScript shapes for models, parameters, trades and plans                                           | none                                   | `libs/common/src/lib/interfaces/target-allocation-model.interface.ts`, `rebalancing-plan.interface.ts`; `libs/common/src/lib/interfaces/index.ts`                                | New (2), Modified (barrel) |
| COMP-005 | RebalancingRoute                  | utility   | Register the `rebalancing` portfolio sub-route constant                                                            | none                                   | `libs/common/src/lib/routes/routes.ts`                                                                                                                                           | Modified                   |
| COMP-006 | TargetAllocationModelSchema       | utility   | Persist named models per user                                                                                      | none                                   | `prisma/schema.prisma`; `prisma/migrations/20261030000000_added_target_allocation_model/migration.sql`                                                                           | Modified, New              |
| COMP-007 | TargetAllocationModelService      | service   | Read and write a user's models with ownership scoping and validation                                               | COMP-001, COMP-006                     | `apps/api/src/app/endpoints/rebalancing/target-allocation-model.service.ts`                                                                                                      | New                        |
| COMP-008 | RebalancingCalculator             | utility   | Compute trades, before/after weights, cash and warnings from holdings, cash, model and parameters (pure, no I/O)   | COMP-004                               | `apps/api/src/app/endpoints/rebalancing/rebalancing-calculator.ts`                                                                                                               | New                        |
| COMP-009 | RebalancingService                | service   | Load holdings, cash, prices and rates for the chosen scope and invoke the calculator                               | COMP-007, COMP-008                     | `apps/api/src/app/endpoints/rebalancing/rebalancing.service.ts`                                                                                                                  | New                        |
| COMP-010 | RebalancingPermission             | utility   | Define the `accessRebalancing` permission and withhold it when experimental features are off                       | none                                   | `libs/common/src/lib/permissions.ts`; `apps/api/src/app/user/user.service.ts`                                                                                                    | Modified (2)               |
| COMP-011 | TargetAllocationModelsController  | service   | Expose the `/rebalancing/models` REST endpoints                                                                    | COMP-003, COMP-007, COMP-010           | `apps/api/src/app/endpoints/rebalancing/target-allocation-models.controller.ts`                                                                                                  | New                        |
| COMP-012 | RebalancingPlanController         | service   | Expose the `/rebalancing/plan` REST endpoint                                                                       | COMP-003, COMP-009, COMP-010           | `apps/api/src/app/endpoints/rebalancing/rebalancing-plan.controller.ts`                                                                                                          | New                        |
| COMP-013 | RebalancingModule                 | service   | Wire the rebalancing providers, controllers and imported modules                                                   | COMP-007, COMP-009, COMP-011, COMP-012 | `apps/api/src/app/endpoints/rebalancing/rebalancing.module.ts`; `apps/api/src/app/app.module.ts`                                                                                 | New, Modified              |
| COMP-014 | RebalancingDataClient             | service   | Provide client HTTP methods for models and plans                                                                   | COMP-003, COMP-004                     | `libs/ui/src/lib/services/data.service.ts`                                                                                                                                       | Modified                   |
| COMP-015 | GfRebalancingPageComponent        | container | Own page state, load models, run plans and coordinate children                                                     | COMP-014, COMP-016, COMP-017           | `apps/client/src/app/pages/portfolio/rebalancing/rebalancing-page.component.ts`, `rebalancing-page.html`, `rebalancing-page.scss`, `rebalancing-page.routes.ts`                  | New                        |
| COMP-016 | GfTargetAllocationEditorComponent | presenter | Edit the target tree, bands and parameters with inline validation                                                  | COMP-001, COMP-004                     | `apps/client/src/app/components/target-allocation-editor/target-allocation-editor.component.ts`, `.html`, `.scss`                                                                | New                        |
| COMP-017 | GfRebalancingResultComponent      | presenter | Show trades, before/after allocation, warnings and export actions                                                  | COMP-002, COMP-004                     | `apps/client/src/app/components/rebalancing-result/rebalancing-result.component.ts`, `.html`, `.scss`                                                                            | New                        |
| COMP-018 | RebalancingNavigation             | utility   | Show the Rebalancing tab and route only when permitted                                                             | COMP-005, COMP-010                     | `apps/client/src/app/pages/portfolio/portfolio-page.component.ts`, `apps/client/src/app/pages/portfolio/portfolio-page.routes.ts`                                                | Modified (2)               |
| COMP-019 | RebalancingTranslations           | utility   | Add translatable UI strings                                                                                        | none                                   | `apps/client/src/locales/messages.xlf` (and language files via the existing extraction script)                                                                                   | Modified                   |

### Component dependency graph (no cycles)

- COMP-004 ← COMP-001, COMP-002, COMP-003, COMP-008, COMP-014, COMP-016, COMP-017
- COMP-001 ← COMP-007, COMP-016
- COMP-006 ← COMP-007
- COMP-007, COMP-008 ← COMP-009
- COMP-007 ← COMP-011; COMP-009 ← COMP-012; COMP-003/010 ← COMP-011, COMP-012
- COMP-011, COMP-012, COMP-007, COMP-009 ← COMP-013
- COMP-014 ← COMP-015; COMP-016, COMP-017 ← COMP-015
- COMP-005, COMP-010 ← COMP-018

### Data flows

| #     | From         | To                                                                                | Data                                                                                     | Trigger                   |
| ----- | ------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------- |
| DF-01 | COMP-015     | COMP-014                                                                          | List-models request                                                                      | Page load                 |
| DF-02 | COMP-014     | COMP-011                                                                          | `GET /rebalancing/models`                                                                | Page load                 |
| DF-03 | COMP-011     | COMP-007                                                                          | userId from JWT                                                                          | Request                   |
| DF-04 | COMP-007     | COMP-006                                                                          | Prisma queries scoped by `userId`                                                        | Request                   |
| DF-05 | COMP-016     | COMP-001                                                                          | Draft tree for live validation                                                           | User edit                 |
| DF-06 | COMP-016     | COMP-015                                                                          | Valid model draft (event)                                                                | Save click                |
| DF-07 | COMP-015     | COMP-014 → COMP-011 → COMP-003                                                    | Create/update/delete model payload                                                       | Save/delete               |
| DF-08 | COMP-011     | COMP-007 → COMP-001                                                               | Server-side re-validation then persist                                                   | Request                   |
| DF-09 | COMP-015     | COMP-014 → COMP-012 → COMP-003                                                    | Plan request (model id, account filter, overrides)                                       | Run click                 |
| DF-10 | COMP-012     | COMP-009                                                                          | Validated run options + userId                                                           | Request                   |
| DF-11 | COMP-009     | COMP-007                                                                          | Load model (ownership checked)                                                           | Run                       |
| DF-12 | COMP-009     | PortfolioService / AccountService / DataProviderService / ExchangeRateDataService | Holdings, cash, quotes, FX (read)                                                        | Run                       |
| DF-13 | COMP-009     | COMP-008                                                                          | Normalised holdings, cash, model, parameters                                             | Run                       |
| DF-14 | COMP-008     | COMP-009                                                                          | Plan (trades, before/after, warnings)                                                    | Run                       |
| DF-15 | COMP-009     | COMP-012 → COMP-014 → COMP-015                                                    | Plan response                                                                            | Run                       |
| DF-16 | COMP-015     | COMP-017                                                                          | Plan for display                                                                         | Plan received             |
| DF-17 | COMP-017     | COMP-002                                                                          | Plan → JSON / CSV text → browser download                                                | Export click              |
| DF-18 | COMP-010     | COMP-011, COMP-012, COMP-018                                                      | `accessRebalancing` permission check                                                     | Every request / tab build |
| DF-19 | COMP-018     | COMP-005                                                                          | Route constants for tab and lazy route                                                   | Page build                |
| DF-20 | COMP-013     | COMP-011, COMP-012, COMP-007, COMP-009                                            | Module wiring                                                                            | App start                 |
| DF-21 | COMP-019     | COMP-015, COMP-016, COMP-017                                                      | Translated strings                                                                       | Render                    |
| DF-22 | COMP-004     | COMP-001, COMP-002, COMP-003, COMP-008, COMP-014, COMP-016, COMP-017              | Shared types for models, plans and trades (compile-time contract between API and client) | Build                     |
| Error | COMP-011/012 | COMP-014 → COMP-015                                                               | HTTP 400/403/404/409 bodies → inline errors                                              | Failure                   |

### Calculation approach (COMP-008, described not coded)

1. **Inputs:** scope holdings in base currency (value, price, quantity, class, sub-class, sectors, currency), cash in base currency, the model, and parameters (flat fee, percentage fee, cash reserve fixed and/or percentage, whole-share toggle, allow-sells toggle, minimum trade value, drift threshold).
2. **Portfolio value V** = sum of holdings including cash positions in scope. **Cash reserve R** = fixed amount + percentage × V.
3. **Target values:** each leaf target (symbol target, or a sub-class/class bucket without symbol breakdown) gets target value = weight × V. A bucket without symbol targets is spread over the held instruments in that bucket in proportion to current value; an empty bucket yields a warning ("no instrument to buy").
4. **Band and drift filter:** a leaf is traded only if its current weight is outside its band (when present) and its deviation exceeds the drift threshold.
5. **Trade sizing:** delta = target value − current value. Sells fund buys; in buy-only mode only available cash above R funds buys, and buys are scaled down proportionally to what is affordable.
6. **Fees:** each trade fee = flat + percentage × trade value, included in the cash budget. A trade whose fee is greater than or equal to its value, or whose value is below the minimum, is skipped and listed as "below threshold".
7. **Rounding:** whole-share mode rounds buys down and sells to the nearest whole share without overselling; the unspent residual is reported. Fractional mode keeps decimals.
8. **Budget settling:** because fees depend on trade sizes, the budget is settled by a bounded iteration with a fixed tolerance; if it does not converge, the plan is returned with a warning.
9. **Cash check:** if cash after trades would fall below R, buys are reduced and the shortfall is reported.
10. **Sector targets** (advisory, ADR-004): compute weighted sector exposure before and after trades (using holdings' `sectors`) and report in-band status; sector targets do not generate trades.
11. **Outputs:** trade list, before/after weights per level, cash before/after/reserve, sector checks, excluded holdings (no asset class, no price), and warnings.

## API Contracts

All routes require `AuthGuard('jwt')`, `HasPermissionGuard` with `@HasPermission(permissions.accessRebalancing)`, and an explicit restricted-view rejection. `@AllowDuringImpersonation` is NOT applied (impersonation requests are rejected). Request bodies are validated with whitelisting; unknown properties are rejected.

### REST endpoints

| Method & path                    | Request                                                                                                                                                                              | Success response                                                             | Error handling                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /rebalancing/models`        | none                                                                                                                                                                                 | `200` list of the caller's models (id, name, updatedAt, targets, parameters) | `401` no/invalid token; `403` no permission or restricted view                                                                                                                                                                                                                                                                                                    |
| `GET /rebalancing/models/:id`    | path id                                                                                                                                                                              | `200` model                                                                  | `404` not found or not owned (no existence leak); `403` as above                                                                                                                                                                                                                                                                                                  |
| `POST /rebalancing/models`       | name, targets tree, parameters                                                                                                                                                       | `201` created model                                                          | `400` validation errors (list with level and shortfall, REQ-003); `409` name already used by this user; `403`                                                                                                                                                                                                                                                     |
| `PUT /rebalancing/models/:id`    | name, targets, parameters                                                                                                                                                            | `200` updated model                                                          | `400`, `404`, `409`, `403`                                                                                                                                                                                                                                                                                                                                        |
| `DELETE /rebalancing/models/:id` | path id                                                                                                                                                                              | `204`                                                                        | `404`, `403`                                                                                                                                                                                                                                                                                                                                                      |
| `POST /rebalancing/plan`         | modelId, optional accountIds, optional parameter overrides (flat fee, percentage fee, cash reserve fixed and percentage, allowFractional, allowSells, minTradeValue, driftThreshold) | `200` plan (see Data Models)                                                 | `400` invalid input or invalid stored model (same error structure); `404` model not owned; `403`; `422` portfolio has no valued holdings and no cash to plan on (returned as an empty-plan `200` with message instead, per EC-001, so `422` is not used); `504`-style timeout not introduced, request fails with `500` and a generic message on unexpected errors |

Error body shape: the standard Nest/`HttpException` JSON (`statusCode`, `message`, `error`); validation errors add an `errors` list of `{ path, code, message }` (path names the level and node).

### Mutations with error handling (summary)

Create, update, delete model and run plan each define the error mapping above; none leave partial state (model writes are single-row; plan runs are read-only).

### Custom client methods (COMP-014)

`fetchTargetAllocationModels`, `fetchTargetAllocationModel`, `postTargetAllocationModel`, `putTargetAllocationModel`, `deleteTargetAllocationModel`, `postRebalancingPlan` — each returns an Observable of the typed response; errors propagate as `HttpErrorResponse` for the container to map to inline messages.

### Context / queries

No GraphQL and no new Angular Context APIs.

## Data Models

### Persisted: `TargetAllocationModel` (new table)

| Field                 | Type          | Notes                                      |
| --------------------- | ------------- | ------------------------------------------ |
| id                    | string (uuid) | primary key                                |
| userId                | string        | FK to `User`, `onDelete: Cascade`, indexed |
| name                  | string        | unique per user; max 100 chars             |
| targets               | JSON          | target tree (below)                        |
| parameters            | JSON          | default parameters (below)                 |
| createdAt / updatedAt | datetime      | standard                                   |

Constraints: unique (`userId`, `name`); index on `userId`. `User` gains a `targetAllocationModels` relation. Migration is purely additive.

### Target tree (stored in `targets`)

- Root: list of **asset class nodes**; each node: `assetClass` (enum from Prisma), `weight` (percent, 0–100), optional `min`/`max` (percent).
- Each class node: optional list of **sub-class nodes**: `assetSubClass`, `weight` (percent of portfolio), optional `min`/`max`; sub-class must be a member of the class per `ASSET_CLASS_MAPPING`.
- Each sub-class node: optional list of **symbol nodes**: `dataSource`, `symbol`, `weight` (percent of portfolio), optional `min`/`max`.
- Optional separate list of **sector targets**: `sector` (name as stored on holdings), `weight`, optional `min`/`max` (advisory only).
- Rules: sibling weights at each level sum to 100% of the parent group (class level sums to 100%; sub-classes sum to their class weight; symbols sum to their sub-class weight; tolerance ±0.01 percentage points); `min ≤ weight ≤ max` when present; maximum 500 leaf nodes; no duplicate nodes.

### Parameters (stored defaults, overridable at run time)

`flatFee` (≥0, base currency), `percentageFee` (0–100, percent of trade value), `cashReserveAmount` (≥0, base currency), `cashReservePercentage` (0–100), `allowFractional` (boolean), `allowSells` (boolean), `minTradeValue` (≥0), `driftThreshold` (0–100 percentage points).

### Plan (API response, not persisted)

- `trades[]`: `symbol`, `dataSource`, `name`, `currency` (asset currency), `side` (BUY|SELL), `quantity`, `unitPrice` (asset currency), `valueInBaseCurrency`, `feeInBaseCurrency`, `feeInAssetCurrency`.
- `allocationBefore[]` / `allocationAfter[]`: per node `{ level, key, weight, valueInBaseCurrency, withinBand }`.
- `sectorChecks[]`: `{ sector, targetWeight, exposureBefore, exposureAfter, withinBand }`.
- `cash`: `{ before, after, reserve, shortfall }` (base currency).
- `excludedHoldings[]`: `{ symbol, reason }` (reasons: NO_ASSET_CLASS, NO_PRICE).
- `warnings[]`: `{ code, message }` (e.g. TARGETS_NOT_REACHED, BELOW_THRESHOLD, EMPTY_BUCKET, CASH_SHORTFALL, NOT_CONVERGED).
- `summary`: counts of buys/sells, total fees, residual cash from rounding; `message` when no trades are needed.

### Export formats (built client-side from the plan)

- **JSON:** an object with an `activities` list; each item conforms to `CreateOrderDto` (symbol, dataSource, currency, date = run date, type BUY|SELL, quantity, unitPrice, fee in asset currency, optional accountId only when exactly one account is selected). No other top-level keys.
- **CSV:** header row plus one row per trade with the same fields in the same order; cells starting with `=`, `+`, `-` or `@` are neutralised (spreadsheet-formula injection).

## Decisions (ADRs)

### ADR-001 — Architecture pattern

- **Context:** A new multi-layer feature must fit the codebase without destabilising large shared services.
- **Decision:** Follow the existing NestJS feature-module layering (controller → service → Prisma) with a pure calculation core, and Angular standalone container/presenter components.
- **Alternatives:**
  - Keep existing pattern (chosen): pros — consistent, familiar, low risk; cons — more files.
  - Extend `PortfolioService` with the logic: pros — fewer files; cons — it is already a very large service and would mix persistence with calculation.
  - Clean-architecture layering with ports/adapters: pros — maximal isolation; cons — unfamiliar in this codebase, over-engineered for one feature.
- **Consequences:** positive — testable pure core, no change to existing services; negative — one more endpoint module; risks — drift from the pattern during implementation (mitigate with design review).

### ADR-002 — Persistence shape

- **Context:** REQ-001 requires several named models per user; tree depth is bounded (class → sub-class → symbol).
- **Decision:** One new table with `targets` and `parameters` JSON columns, validated in code, unique (`userId`, `name`).
- **Alternatives:**
  - JSON columns (chosen): pros — atomic read/write, simple migration, matches existing JSON use (`Settings.settings`, `SymbolProfile.sectors`); cons — no DB-level integrity of the tree.
  - Normalised child tables (model, node rows): pros — relational integrity, queryable; cons — more migrations, joins and write complexity for data never queried by node.
  - Store in `Settings.settings` JSON: pros — no migration; cons — single model only, contradicts DL-001, bloats every settings read.
- **Consequences:** positive — small additive migration; negative — integrity enforced by COMP-001 only; risks — invalid tree stored by a bug (mitigate: server re-validates on write and again before every plan run).

### ADR-003 — Where the calculation runs

- **Context:** The calculation needs holdings, cash, prices, FX and must meet 2 s for 500 holdings (REQ-012).
- **Decision:** Compute on the API in a pure calculator fed by one `getDetails` call and one batched quote lookup.
- **Alternatives:**
  - Server-side pure calculator (chosen): pros — direct access to valuations and prices, consistent results, testable; cons — API CPU use.
  - Client-side calculation: pros — no API load; cons — would need full holdings/price payloads and duplicate logic, and exposes more data to the browser.
  - Background job/queue: pros — handles very large portfolios; cons — asynchronous UX and queue plumbing for a sub-second computation.
- **Consequences:** positive — single source of truth; negative — latency tied to `getDetails`; risks — see Flag F-004.

### ADR-004 — Hierarchy and sectors

- **Context:** Class → sub-class → symbol is a strict hierarchy; a fund can span several sectors, so sectors do not nest (DL-003, DL-004).
- **Decision:** Hierarchy uses `ASSET_CLASS_MAPPING` for class ↔ sub-class membership and each symbol's own class/sub-class; sector targets are advisory exposure checks outside the hierarchy.
- **Alternatives:**
  - Advisory sectors (chosen): pros — well-defined with multi-sector funds; cons — sectors never drive trades.
  - Sectors as a strict level: pros — consistent tree; cons — undefined for multi-sector holdings.
  - Drop sectors: pros — simplest; cons — loses part of the ticket wording.
- **Consequences:** positive — deterministic; negative — users may expect sector-driven trades; risks — scope mismatch (Flag F-001).

### ADR-005 — Export generation

- **Context:** REQ-008 needs import-JSON and CSV.
- **Decision:** Build both in a shared pure helper and download in the browser from the plan response.
- **Alternatives:**
  - Client-side builders (chosen): pros — no extra endpoints, plan already contains all fields; cons — formats must be tested in the shared lib.
  - Server file endpoints: pros — format enforced server-side; cons — extra routes, auth and response handling for static transformations.
  - Reuse the existing export endpoint: pros — none for trades; cons — it exports activities already stored, not proposed trades.
- **Consequences:** positive — fewer moving parts; negative — format drift risk; mitigate with a spec asserting the output validates against `ImportDataDto`.

### ADR-006 — Access control and gating

- **Context:** REQ-011: any authenticated user, only with `isExperimentalFeatures`, blocked for restricted view; `user.service.ts` already has an empty `!isExperimentalFeatures` block meant for `without(...)`.
- **Decision:** Add one permission `accessRebalancing` for roles ADMIN and USER, remove it in `UserService` when experimental features are off, enforce with `@HasPermission`, and add an explicit `isRestrictedView` rejection in both controllers.
- **Alternatives:**
  - Permission-based (chosen): pros — idiomatic, the client already reads permissions to show/hide UI; cons — touches permission computation used by every request.
  - Bespoke guard reading user settings: pros — isolated; cons — a second gating mechanism and the client would need its own flag check.
  - Client-side only gating: pros — trivial; cons — insecure, API stays open.
- **Consequences:** positive — single enforcement path, UI and API agree; negative — shared file change; risks — existing permission-list tests need updating (listed in baseline).

### ADR-007 — Money arithmetic

- **Context:** Fee, rounding and sum-to-100 checks are precision-sensitive.
- **Decision:** Use the existing `big.js` for all monetary and weight arithmetic in the calculator and validator.
- **Alternatives:**
  - `big.js` (chosen): pros — already a dependency and used in `portfolio.service.ts`; cons — verbose.
  - Native floating-point with epsilon: pros — simple; cons — rounding drift on fees and whole-share residuals.
  - Integer minor units: pros — exact; cons — currencies with different minor units and asset prices with many decimals.
- **Consequences:** no new dependency; slightly slower arithmetic (acceptable within 2 s for 500 holdings).

### ADR-008 — Ownership failures return 404

- **Context:** AC-001b requires another user's model to be inaccessible.
- **Decision:** Return `404` for models that do not exist or belong to another user.
- **Alternatives:**
  - 404 (chosen): pros — no existence leak; cons — less explicit than 403.
  - 403 (as `TagsController` does for system tags): pros — explicit; cons — confirms an ID exists.
- **Consequences:** clients cannot distinguish missing from foreign IDs, which is the intent.

## Implementation Guidelines

### File structure

| path                                                                                                                 | purpose                                                   | component_id |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------ |
| `prisma/schema.prisma`                                                                                               | add `TargetAllocationModel`; add relation field on `User` | COMP-006     |
| `prisma/migrations/20261030000000_added_target_allocation_model/migration.sql`                                       | create table, unique and index                            | COMP-006     |
| `libs/common/src/lib/target-allocation/target-allocation-validation.ts`                                              | pure validation of the target tree                        | COMP-001     |
| `libs/common/src/lib/target-allocation/target-allocation-validation.spec.ts`                                         | unit tests                                                | COMP-001     |
| `libs/common/src/lib/target-allocation/rebalancing-export.ts`                                                        | JSON and CSV builders                                     | COMP-002     |
| `libs/common/src/lib/target-allocation/rebalancing-export.spec.ts`                                                   | unit tests                                                | COMP-002     |
| `libs/common/src/lib/dtos/create-target-allocation-model.dto.ts`                                                     | create-model body                                         | COMP-003     |
| `libs/common/src/lib/dtos/update-target-allocation-model.dto.ts`                                                     | update-model body                                         | COMP-003     |
| `libs/common/src/lib/dtos/create-rebalancing-plan.dto.ts`                                                            | plan-run body                                             | COMP-003     |
| `libs/common/src/lib/dtos/index.ts`                                                                                  | re-export new DTOs                                        | COMP-003     |
| `libs/common/src/lib/interfaces/target-allocation-model.interface.ts`                                                | model, tree, parameters shapes                            | COMP-004     |
| `libs/common/src/lib/interfaces/rebalancing-plan.interface.ts`                                                       | plan, trade, warning shapes                               | COMP-004     |
| `libs/common/src/lib/interfaces/index.ts`                                                                            | re-export new interfaces                                  | COMP-004     |
| `libs/common/src/lib/routes/routes.ts`                                                                               | add `rebalancing` sub-route                               | COMP-005     |
| `libs/common/src/lib/permissions.ts`                                                                                 | add `accessRebalancing`; grant to ADMIN, USER             | COMP-010     |
| `apps/api/src/app/user/user.service.ts`                                                                              | withhold permission when `isExperimentalFeatures` is off  | COMP-010     |
| `apps/api/src/app/endpoints/rebalancing/target-allocation-model.service.ts`                                          | model persistence service                                 | COMP-007     |
| `apps/api/src/app/endpoints/rebalancing/target-allocation-model.service.spec.ts`                                     | tests                                                     | COMP-007     |
| `apps/api/src/app/endpoints/rebalancing/rebalancing-calculator.ts`                                                   | pure calculator                                           | COMP-008     |
| `apps/api/src/app/endpoints/rebalancing/rebalancing-calculator.spec.ts`                                              | tests                                                     | COMP-008     |
| `apps/api/src/app/endpoints/rebalancing/rebalancing.service.ts`                                                      | data loading and orchestration                            | COMP-009     |
| `apps/api/src/app/endpoints/rebalancing/rebalancing.service.spec.ts`                                                 | tests                                                     | COMP-009     |
| `apps/api/src/app/endpoints/rebalancing/target-allocation-models.controller.ts`                                      | models REST                                               | COMP-011     |
| `apps/api/src/app/endpoints/rebalancing/rebalancing-plan.controller.ts`                                              | plan REST                                                 | COMP-012     |
| `apps/api/src/app/endpoints/rebalancing/rebalancing.module.ts`                                                       | Nest module                                               | COMP-013     |
| `apps/api/src/app/app.module.ts`                                                                                     | register `RebalancingModule`                              | COMP-013     |
| `libs/ui/src/lib/services/data.service.ts`                                                                           | add client methods                                        | COMP-014     |
| `apps/client/src/app/pages/portfolio/rebalancing/rebalancing-page.component.ts`                                      | container                                                 | COMP-015     |
| `apps/client/src/app/pages/portfolio/rebalancing/rebalancing-page.html`                                              | container template                                        | COMP-015     |
| `apps/client/src/app/pages/portfolio/rebalancing/rebalancing-page.scss`                                              | container styles                                          | COMP-015     |
| `apps/client/src/app/pages/portfolio/rebalancing/rebalancing-page.routes.ts`                                         | lazy route                                                | COMP-015     |
| `apps/client/src/app/components/target-allocation-editor/target-allocation-editor.component.ts` (+ `.html`, `.scss`) | editor presenter                                          | COMP-016     |
| `apps/client/src/app/components/rebalancing-result/rebalancing-result.component.ts` (+ `.html`, `.scss`)             | result presenter                                          | COMP-017     |
| `apps/client/src/app/pages/portfolio/portfolio-page.component.ts`                                                    | conditional tab                                           | COMP-018     |
| `apps/client/src/app/pages/portfolio/portfolio-page.routes.ts`                                                       | lazy child route                                          | COMP-018     |
| `apps/client/src/locales/messages.xlf`                                                                               | extracted strings                                         | COMP-019     |

### Naming conventions (from codebase)

- Files: kebab-case with role suffix (`*.controller.ts`, `*.service.ts`, `*.module.ts`, `*.dto.ts`, `*.interface.ts`, `*.spec.ts`).
- Classes: PascalCase; Angular components prefixed `Gf` with selector `gf-...`; DTO classes end in `Dto`.
- Interfaces/types: PascalCase; constants UPPER_SNAKE_CASE; hooks/signals camelCase.
- Prisma models PascalCase; migration folders `YYYYMMDDHHMMSS_snake_case_description`.
- Permissions are camelCase string constants in `permissions.ts`.

### Patterns to use

- Controller → service → Prisma layering as in `endpoints/watchlist` and `endpoints/tags`.
- `class-validator` + whitelisting for bodies; shared validation function reused client and server.
- `big.js` for all money/weight maths; pure functions for calculator, validator and export builders.
- Standalone, `OnPush` Angular components; all HTTP via `DataService`; `$localize` for strings.
- Apply `TransformDataSourceInRequestInterceptor` / `TransformDataSourceInResponseInterceptor` on the plan endpoint (as the import endpoint does) so data sources are handled consistently.

### Patterns to avoid

- Adding logic to `PortfolioService`, `AccountService` or other shared services.
- Logging holdings, symbols, quantities or amounts anywhere in the new code; only counts/durations/ids.
- `@AllowDuringImpersonation` on the new controllers.
- Floating-point math for money or sum-to-100 checks.
- Putting calculation or validation rules in components.

### Libraries

No new dependencies. Existing: `big.js`, `class-validator`, `class-transformer`, `@prisma/client`, `@angular/*`, `lodash-es`. (No ADR required because nothing is added; ADR-007 records the choice of the existing `big.js`.)

### Code standards

- Follow the existing error handling (`HttpException` + `StatusCodes`) and the Nest `Logger` usage pattern, restricted to non-sensitive fields.
- **Run the test baseline before any change** (`npm run test:api`, `npx nx test common`, `npx nx test ui`, `npm run lint`), record counts, and confirm which existing tests assert permission lists or route tables before touching `permissions.ts`, `user.service.ts` and `routes.ts`.
- Backward compatibility: all changes are additive; do not remove defaults or alter existing signatures. New permission must not change behaviour for users with `isExperimentalFeatures` off.
- Run the locale extraction script after adding strings; do not hand-edit generated language files beyond what the existing workflow produces.
- Apply the Prisma migration with the project's standard command; generated Prisma client artifacts are not committed by hand.

## Testing Strategy

### Unit test targets

- `target-allocation-validation`: sums per level (including ±0.01 rounding, EC-004), band containment, hierarchy against `ASSET_CLASS_MAPPING`, duplicates, 500-leaf cap, error paths naming the level.
- `rebalancing-calculator`: fee model (flat + %), cash reserve (fixed, %, both, exceeds cash), buy-only, whole-share vs fractional, minimum trade and drift threshold, in-band holdings untouched (AC-007b), unheld target symbol (EC-002), fee ≥ trade value (EC-003), rounding residual (EC-005), multi-sector exposure (EC-006), empty portfolio (EC-001), convergence/non-convergence warning.
- `rebalancing-export`: JSON validates against `ImportDataDto`; CSV header and row count; formula-injection neutralisation; account id only for a single account.
- `target-allocation-model.service`: user scoping, duplicate name conflict, not-owned access.
- Permission logic: `accessRebalancing` present/absent by role and `isExperimentalFeatures`.

### Integration test targets

- Controllers with mocked Prisma and mocked portfolio/account/data-provider/FX services: 401/403/404/400/409 mapping, restricted-view rejection, impersonation rejection, response data-source transformation.
- `rebalancing.service` with stubbed dependencies: account filter scoping (AC-004a), missing price and missing asset class exclusion (AC-010), foreign-currency conversion.
- Import round trip: exported JSON posted to the import service in dry-run succeeds (AC-008a).
- Performance check: a synthetic 500-holding input meets the 2 s target for calculator plus orchestration with stubbed data loading (AC-012; end-to-end budget per Flag F-004).

### E2E scenarios (user-story form)

- As a user with experimental features on, I create a model "Growth" (Equity 60 / Fixed Income 30 / Crypto sub-class 10), run it against my portfolio, review the trade list, and export JSON and CSV.
- As a user with an invalid model (targets sum to 99%), I see a blocking inline error naming the level and shortfall.
- As a user with experimental features off or restricted view, I do not see the tab and direct API calls are denied.
- As a user, I run with buy-only and whole-share toggles and see no sells and integer quantities.
- Keyboard-only and screen-reader pass over the editor and result screens (REQ-013).

### Coverage target

≥ 80% line coverage on new business logic overall; ≥ 90% on `rebalancing-calculator` and `target-allocation-validation`.

## Security Considerations

| #   | Concern                                                                          | Mitigation                                                                                                                                                                    | OWASP                               |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | Another user reads or changes a model (IDOR)                                     | Every query filters by authenticated `userId`; foreign/missing IDs return 404; unique and ownership enforced in the service                                                   | A01 Broken Access Control           |
| 2   | Feature reachable when gated off, by restricted-view users, or via impersonation | `accessRebalancing` withheld in `UserService` when experimental features are off; `HasPermissionGuard`; explicit `isRestrictedView` rejection; no `@AllowDuringImpersonation` | A01 Broken Access Control           |
| 3   | Malformed or oversized input (huge trees, NaN, negative values)                  | `class-validator` whitelisting, numeric ranges, 500-leaf cap, name length limit; server re-validation before persist and before each run                                      | A03 Injection / A04 Insecure Design |
| 4   | Spreadsheet formula injection through CSV export                                 | Neutralise cells beginning with `=`, `+`, `-`, `@` in the CSV builder                                                                                                         | A03 Injection                       |
| 5   | Financial data (holdings, amounts) leaks into logs                               | Log only ids, counts and durations; PerformanceLogging must not capture bodies; add a test asserting no symbol/amount in log output (AC-011b)                                 | A09 Logging & Monitoring Failures   |
| 6   | Persisted financial preferences (GDPR)                                           | Stored per user with `onDelete: Cascade` so account deletion erases models; no personal identifiers in exports; data minimisation (only target weights and parameters stored) | A04 Insecure Design                 |
| 7   | Resource exhaustion from repeated plan runs                                      | Bounded input sizes; single `getDetails` call; bounded settling iterations; existing global throttling applies if configured (verify at implementation)                       | A04 Insecure Design                 |
| 8   | Stale or tampered stored model produces an unsafe plan                           | Re-validate the stored model on every run and fail with 400                                                                                                                   | A08 Software & Data Integrity       |
| 9   | Dependency risk                                                                  | No new dependencies                                                                                                                                                           | A06 Vulnerable Components           |

## Design Changes Log

| Version | Date       | Changes        | Rationale                                           | Rejected feedback      |
| ------- | ---------- | -------------- | --------------------------------------------------- | ---------------------- |
| 1       | 2026-10-30 | Initial design | First iteration from approved `ph1_problem_spec.md` | none (no prior review) |

## Flags

| ID    | Type                | Finding                                                                                                                                                                                                                                                                                                           | Recommended action                                                                      |
| ----- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| F-001 | ambiguity           | REQ-002 and its acceptance criteria cover class, sub-class and symbol only, while the ticket text, DL-004 and EC-006 refer to sector targets. The design treats sector targets as advisory exposure checks (ADR-004) with no AC to verify them.                                                                   | Confirm at design review; if accepted, add an AC for sector checks to the problem spec. |
| F-002 | ambiguity           | REQ-011 says "any authenticated user". The design grants `accessRebalancing` to ADMIN and USER only and excludes the shared DEMO role (read-only shared account where saved models would be shared).                                                                                                              | Confirm DEMO exclusion.                                                                 |
| F-003 | contradiction       | ASM-003 assumed a sub-class's parent class is derived from held assets. The code has a fixed `ASSET_CLASS_MAPPING` (`libs/common/src/lib/config.ts`), so the design uses it (e.g. crypto sits under `LIQUIDITY`, not `EQUITY`). Users who think of crypto as a separate class will see it nested under Liquidity. | Treat ASM-003 as resolved by the mapping; confirm the UI should label this clearly.     |
| F-004 | ambiguity           | REQ-012 does not say whether 2 s covers only the calculation or the whole request. `getDetails` latency (cold cache, many activities) is outside this feature's control. The design measures calculator plus orchestration with stubbed loading and reports end-to-end separately.                                | Confirm the measurement scope.                                                          |
| F-005 | missing_requirement | AC-008a says the import must succeed "with no format changes", but import requires `createActivity`/`createAccount` permissions and a valid `accountId` when accounts exist; an export from a multi-account scope omits `accountId`.                                                                              | Confirm that omitting `accountId` for multi-account scopes is acceptable.               |
