# Design Specification: Multi-Currency FX Conversion & Base Currency Normalization

## Meta

- **Ticket ID:** SCRUM-65
- **Feature ID:** FEAT-0002
- **Title:** Multi-Currency FX Conversion & Base Currency Normalization
- **Date:** 2026-11-05
- **Author:** Claude Code (sdlc-architecture)
- **Version:** 1
- **Iteration:** 1
- **Approval status:** pending_review
- **ready_for_implementation:** false (set to true only after design review and explicit migration confirmation)
- **codebase_location:** `C:/Users/Hariprasanth_Baskara/Agentic/ghostfolio` (single Nx monorepo at workspace root; `apps/api`, `apps/client`, `libs/common`, `libs/ui`, `prisma`)
- **codebase_analyzed:** true
- **Multi-repo:** No (single repo, `repo` field omitted on components)
- **Migration gate:** COMP-002 (Prisma migration) is designed but MUST NOT be created or applied until the user explicitly confirms it (client guardrail, DL-005, ASM-001, F-007).

## Problem Spec Reference

- Source: `docs/artifacts/SCRUM-65/ph1_problem_spec.md` (approved 2026-11-05T22:58:35+0530)
- Requirements addressed: REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006, REQ-007, REQ-008, REQ-009, REQ-010
- Traceability (REQ to components):
  - REQ-001 -> COMP-001, COMP-002, COMP-004
  - REQ-002 -> COMP-004, COMP-005, COMP-006
  - REQ-003 -> COMP-005, COMP-006, COMP-008 (largely existing behaviour, see Current Architecture)
  - REQ-004 -> COMP-003, COMP-005, COMP-008, COMP-009, COMP-010, COMP-011, COMP-014, COMP-015
  - REQ-005 -> COMP-013 (validation already exists; cache invalidation on flag change added)
  - REQ-006 -> COMP-012, COMP-004
  - REQ-007 -> COMP-005
  - REQ-008 -> COMP-004, COMP-005, COMP-006
  - REQ-009 -> COMP-006, COMP-013
  - REQ-010 -> COMP-004, COMP-012 (no new endpoint is added; the only writer is the data-gathering job)

## Current Architecture

### Description

Ghostfolio converts foreign-currency amounts to the user's base currency inside `PortfolioCalculator`. The calculator asks `ExchangeRateDataService.getExchangeRatesByCurrency` for one map per pair (`<from><to>` -> `{ 'yyyy-MM-dd': rate }`) covering every day from the portfolio start to the end date, then applies those maps per activity. Daily FX closes live in the existing `MarketData` table (symbols such as `USDEUR`, data source from env `DATA_SOURCE_EXCHANGE_RATES`, default Yahoo), written by the data-gathering job. Base currency is a per-user value in `Settings.settings` JSON and is validated as an ISO 4217 or derived code. Calculated snapshots are cached in Redis per user and calculation type.

### Characterisation of current valuation (resolves ASM-003)

Verified by reading `portfolio-calculator.ts`:

- `getHoldingValuation` (about lines 1056-1270) already computes two parallel series for every activity: the plain series converts at the CURRENT rate (`exchangeRates[today]`), and the "WithCurrencyEffect" series converts fees, unit price and investment at the rate ON THE ACTIVITY DATE (`exchangeRates[activity.date]`).
- `getTotalsFromActivities` (about lines 2016-2059) converts dividends, interest and liabilities at the activity-date rate.
- Therefore REQ-003 (transaction-date conversion) is already implemented whenever the daily map has a value for that date. The defect is not the formula but rate coverage and fallbacks.
- Silent 1:1 fallbacks (`?? 1`) exist at about 11 sites in the calculator (for example lines 422, 1136, 1138, 1148, 1152, 1157, 1161, 2036, 2042, 2048) and at the end of `toCurrency` (returns the unconverted value with an error log).
- `getExchangeRatesByCurrency` fills gaps starting from the END date and walking backwards, so a gap inside the range receives the NEXT available later rate, dates after the last known rate receive the latest rate, and dates before the first known rate receive the earliest rate. If a pair has no data at all, the factor silently becomes 1. An error is logged only when the source currency is USD.
- The data-gathering processor already writes a row for EVERY calendar day into `MarketData`, flagged `isCarriedForward` for days the provider had no close (weekends, holidays). `getSymbolsMax` already gathers FX pairs back to the earlier of the first activity date and 10 years ago.
- The calculator already has a holding-level error path: a holding without a market price is returned with `hasErrors` and listed in `errors` (an `AssetProfileIdentifier[]`), and its performance values are nulled. The client does not read `hasErrors` anywhere today.

### Existing Components (relevant)

| Name                                            | file_path                                                                                                                                               | current_behavior                                                                                                                        | modifications_needed                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| ExchangeRateDataService                         | `apps/api/src/services/exchange-rate-data/exchange-rate-data.service.ts`                                                                                | Loads USD-pivot pairs, serves current-rate `toCurrency`, date-based `toCurrencyAtDate`, and daily maps via `getExchangeRatesByCurrency` | Add a flag-gated status-aware read method and a per-user flag check; existing methods unchanged |
| ExchangeRateDataModule                          | `apps/api/src/services/exchange-rate-data/exchange-rate-data.module.ts`                                                                                 | Wires the service with its dependencies                                                                                                 | Provide and export the new store service                                                        |
| ExchangeRateDataServiceMock                     | `apps/api/src/services/exchange-rate-data/exchange-rate-data.service.mock.ts`                                                                           | Hard-coded daily maps used by about 33 calculator specs                                                                                 | Add the new method (additive)                                                                   |
| MarketDataService                               | `apps/api/src/services/market-data/market-data.service.ts`                                                                                              | `get`, `getRange`, `updateMany`, `replaceForSymbol` on `MarketData`                                                                     | None (consumed as fallback)                                                                     |
| DataGatheringProcessor                          | `apps/api/src/services/queues/data-gathering/data-gathering.processor.ts`                                                                               | Fetches history per symbol, writes a row per day to `MarketData`, flagging carried-forward days                                         | Mirror observed FX closes into the new table after each write                                   |
| PortfolioCalculator                             | `apps/api/src/app/portfolio/calculator/portfolio-calculator.ts`                                                                                         | Builds the snapshot, applies rates with `?? 1` fallbacks, tracks holding-level `errors`/`hasErrors`                                     | Select the rate path by flag, add holding-level FX exclusion and warnings                       |
| PortfolioCalculatorFactory                      | `apps/api/src/app/portfolio/calculator/portfolio-calculator.factory.ts`                                                                                 | Creates ROAI/ROI/TWR/MWR calculators; 5 call sites (4 in `portfolio.service.ts`, 1 in `portfolio-snapshot.processor.ts`)                | None (flag is resolved inside the calculator from `userId`)                                     |
| PortfolioSnapshot                               | `libs/common/src/lib/models/portfolio-snapshot.ts`                                                                                                      | Cached result model with `errors` and `hasErrors`                                                                                       | Add optional `fxWarnings`                                                                       |
| PortfolioService                                | `apps/api/src/app/portfolio/portfolio.service.ts`                                                                                                       | `getDetails` (returns `hasErrors`, about line 900) and `getPerformance` (about line 1273)                                               | Pass `fxWarnings` through                                                                       |
| PortfolioDetails / PortfolioPerformanceResponse | `libs/common/src/lib/interfaces/portfolio-details.interface.ts`, `libs/common/src/lib/interfaces/responses/portfolio-performance-response.interface.ts` | Response shapes (performance extends `ResponseError`)                                                                                   | Add optional `fxWarnings`                                                                       |
| UserController                                  | `apps/api/src/app/user/user.controller.ts` (about line 223)                                                                                             | Emits the portfolio-changed event only when `baseCurrency` is in the update                                                             | Also emit when `isExperimentalFeatures` is in the update                                        |
| PortfolioChangedListener                        | `apps/api/src/events/portfolio-changed.listener.ts`                                                                                                     | Removes the user's cached snapshots and recomputes (5 s debounce)                                                                       | None (reused)                                                                                   |
| UpdateUserSettingDto                            | `libs/common/src/lib/dtos/update-user-setting.dto.ts`                                                                                                   | `baseCurrency` already validated by `@IsCurrencyCode()`                                                                                 | None (see F-002)                                                                                |
| AnalysisPage                                    | `apps/client/src/app/pages/portfolio/analysis/analysis-page.component.ts`, `analysis-page.html`                                                         | Loads `fetchPortfolioPerformance` (about lines 323 and 354) and shows charts                                                            | Show the warning notice                                                                         |
| Prisma schema                                   | `prisma/schema.prisma`                                                                                                                                  | Alphabetically ordered models; `MarketData` unique on `[dataSource, symbol, date]`                                                      | Add `ExchangeRate` model                                                                        |

### Blast-radius callers

- `ExchangeRateDataService` is injected into 20 files; no existing method signature or behaviour changes, so callers are unaffected. The mock gains one method.
- About 33 calculator specs use `ExchangeRateDataServiceMock`; they run the flag-off path and must pass unchanged (this is the REQ-009 parity proof).
- `PortfolioSnapshot` is serialised into Redis; a new optional field is backward compatible with already-cached snapshots (field absent means no warnings).
- `PortfolioDetails` and `PortfolioPerformanceResponse` gain an optional field; `rebalancing.service.ts` (SCRUM-64) consumes `getDetails` and ignores unknown fields.
- `toCurrency` has 14 call sites in 7 files and no user context; it is intentionally left unchanged (F-001).

### Existing Patterns (the design must follow)

- Services are `@Injectable()` classes under `apps/api/src/services/<feature>/` with a module that exports them; data access goes through `PrismaService`.
- Prisma models list fields alphabetically with `@@index` and `@@unique` at the end; migrations are named `YYYYMMDDHHMMSS_description` (latest is `20261030000000_added_target_allocation_model`).
- Money maths uses `big.js`; ids/dates for rates use the `DATE_FORMAT` string key (`yyyy-MM-dd`).
- Background work runs through Bull processors with try/catch that logs and rethrows so the job retries.
- Shared response/model types live in `libs/common` and are re-exported through `interfaces/index.ts`.
- Client components are standalone, `OnPush`, selector prefix `gf-`, strings through `$localize`, HTTP only through `DataService`.
- Logging uses Nest `Logger`; `@LogPerformance` decorates heavy service methods.

### Integration Points

- `PortfolioCalculator.computeSnapshot` (about line 311) is the single place the daily maps are fetched.
- `DataGatheringProcessor.gatherHistoricalMarketData` after the `replaceForSymbol` / `updateMany` write (about lines 148-156).
- `UserController` settings update (about line 223).
- `PortfolioService.getDetails` / `getPerformance` return objects.
- Client `DataService.fetchPortfolioPerformance` consumers in `analysis-page.component.ts`.

## Architecture

### Pattern

`mvc` in its existing NestJS form: controller -> service -> Prisma, plus one pure resolver function module for the rate logic. This matches the codebase (ADR-001).

### Components

| ID       | Name                        | type      | Responsibility                                                                              | dependencies                 | file_path                                                                                                                                               | new / modified |
| -------- | --------------------------- | --------- | ------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| COMP-001 | ExchangeRate model          | utility   | Defines the persisted daily close FX rate record.                                           | none                         | `prisma/schema.prisma`                                                                                                                                  | modified       |
| COMP-002 | AddedExchangeRateMigration  | utility   | Creates the ExchangeRate table additively (GATED, do not create until confirmed).           | COMP-001                     | `prisma/migrations/20261105000000_added_exchange_rate/migration.sql`                                                                                    | new            |
| COMP-003 | ExchangeRateStatusTypes     | utility   | Declares the shared warning and status shapes.                                              | none                         | `libs/common/src/lib/interfaces/exchange-rate-warning.interface.ts` (plus export line in `libs/common/src/lib/interfaces/index.ts`)                     | new            |
| COMP-004 | ExchangeRateStoreService    | service   | Validates and persists observed rates and reads them by pair and date range.                | COMP-001                     | `apps/api/src/services/exchange-rate-data/exchange-rate-store.service.ts`                                                                               | new            |
| COMP-005 | ExchangeRateResolver        | utility   | Computes the rate, estimated flag and missing flag for each pair and date from rate series. | COMP-003                     | `apps/api/src/services/exchange-rate-data/exchange-rate-resolver.ts`                                                                                    | new            |
| COMP-006 | ExchangeRateDataService     | service   | Serves status-aware daily rate maps and the per-user flag check.                            | COMP-003, COMP-004, COMP-005 | `apps/api/src/services/exchange-rate-data/exchange-rate-data.service.ts`                                                                                | modified       |
| COMP-007 | ExchangeRateDataModule      | utility   | Registers and exports the new store service.                                                | COMP-004                     | `apps/api/src/services/exchange-rate-data/exchange-rate-data.module.ts`                                                                                 | modified       |
| COMP-008 | PortfolioCalculator         | service   | Chooses the rate path, excludes holdings without a rate and reports warnings.               | COMP-006, COMP-009           | `apps/api/src/app/portfolio/calculator/portfolio-calculator.ts`                                                                                         | modified       |
| COMP-009 | PortfolioSnapshot           | utility   | Carries the optional FX warnings inside the cached snapshot.                                | COMP-003                     | `libs/common/src/lib/models/portfolio-snapshot.ts`                                                                                                      | modified       |
| COMP-010 | PortfolioService            | service   | Passes FX warnings from the snapshot into the details and performance responses.            | COMP-009, COMP-011           | `apps/api/src/app/portfolio/portfolio.service.ts`                                                                                                       | modified       |
| COMP-011 | PortfolioResponseTypes      | utility   | Adds the optional warnings field to the two response shapes.                                | COMP-003                     | `libs/common/src/lib/interfaces/portfolio-details.interface.ts`, `libs/common/src/lib/interfaces/responses/portfolio-performance-response.interface.ts` | modified       |
| COMP-012 | DataGatheringProcessor      | service   | Mirrors observed FX closes into the store after each market-data write.                     | COMP-004                     | `apps/api/src/services/queues/data-gathering/data-gathering.processor.ts` (plus `data-gathering.module.ts` if the store is not already reachable)       | modified       |
| COMP-013 | UserController              | container | Invalidates cached snapshots when the experimental flag changes.                            | none                         | `apps/api/src/app/user/user.controller.ts`                                                                                                              | modified       |
| COMP-014 | GfFxRateWarningComponent    | presenter | Renders the list of estimated and missing rate warnings.                                    | COMP-003                     | `libs/ui/src/lib/fx-rate-warning/fx-rate-warning.component.ts` (with `.html`, `.scss`, `index.ts`)                                                      | new            |
| COMP-015 | AnalysisPage                | container | Passes warnings from the performance response to the notice.                                | COMP-011, COMP-014           | `apps/client/src/app/pages/portfolio/analysis/analysis-page.component.ts`, `analysis-page.html`                                                         | modified       |
| COMP-016 | ExchangeRateDataServiceMock | utility   | Provides deterministic status-aware rates to specs.                                         | COMP-006                     | `apps/api/src/services/exchange-rate-data/exchange-rate-data.service.mock.ts`                                                                           | modified       |

### Component dependency graph

```
COMP-001 <- COMP-002
COMP-001 <- COMP-004 <- COMP-007
COMP-004, COMP-005, COMP-003 <- COMP-006 <- COMP-008 -> COMP-009 <- COMP-010 -> COMP-011
COMP-004 <- COMP-012
COMP-003 <- COMP-005, COMP-009, COMP-011, COMP-014
COMP-011, COMP-014 <- COMP-015
COMP-006 <- COMP-016
COMP-013 (independent)
```

No cycles.

### Data flows

| ID     | from                    | to                       | data                                                                       | trigger                                         |
| ------ | ----------------------- | ------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------- |
| DF-001 | Data provider           | COMP-012                 | Historical FX closes per day, with a carried-forward marker                | Scheduled gather or existing admin "gather max" |
| DF-002 | COMP-012                | COMP-004                 | Observed (not carried-forward) USD-to-currency rows                        | After each `MarketData` write                   |
| DF-003 | COMP-004                | COMP-001 / COMP-002      | Upserted rows keyed by pair, date and source                               | Each batch of up to 500 rows                    |
| DF-004 | COMP-008                | COMP-006                 | Currencies, date range, target currency, user id                           | Snapshot computation                            |
| DF-005 | COMP-006                | COMP-004 and MarketData  | Series for each USD-to-currency leg                                        | Flag on for this user                           |
| DF-006 | COMP-004 and MarketData | COMP-005                 | Observed series and carried-forward markers                                | Resolver call                                   |
| DF-007 | COMP-005                | COMP-006 -> COMP-008     | Rate per date plus estimated and missing date lists (COMP-003 shapes)      | Return of the status-aware read                 |
| DF-008 | COMP-008                | COMP-009                 | Excluded holdings in `errors`, and `fxWarnings`                            | End of computation, cached in Redis             |
| DF-009 | COMP-009                | COMP-010 -> COMP-011     | `fxWarnings`                                                               | Details or performance request                  |
| DF-010 | COMP-011                | COMP-015 -> COMP-014     | `fxWarnings` rendered as a notice                                          | Analysis page load                              |
| DF-011 | COMP-013                | PortfolioChangedListener | Event for the user when `isExperimentalFeatures` or `baseCurrency` changes | Settings update                                 |
| DF-012 | COMP-007                | COMP-004 / COMP-006      | Dependency injection wiring                                                | Application start                               |
| DF-013 | COMP-016                | COMP-008 specs           | Deterministic rates and statuses                                           | Test runs                                       |

## API Contracts

No new HTTP endpoints, controllers, DTOs or permissions are added. The only external-facing change is two optional, additive response fields. Internal service contracts follow.

### Queries (existing endpoints, additive field)

| Endpoint                                                                                  | Change                               | Cache policy                                             |
| ----------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------- |
| Portfolio details (served by `PortfolioController` through `PortfolioService.getDetails`) | Response gains optional `fxWarnings` | Unchanged (Redis snapshot per user and calculation type) |
| Portfolio performance (served through `PortfolioService.getPerformance`)                  | Response gains optional `fxWarnings` | Unchanged                                                |

`fxWarnings` is absent when the flag is off, when the cached snapshot predates the change, or when nothing needs warning. When present it holds at most 100 entries, de-duplicated by pair, date and type, sorted by date.

### Internal service contracts

| Contract                                                       | Inputs                                                                 | Output                                                                       | Error handling                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ExchangeRateDataService.isHistoricalFxEnabled`                | `userId`                                                               | boolean from `Settings.settings.isExperimentalFeatures`                      | Missing user or settings row means false; a database error is logged and treated as false (flag-off behaviour)                                                                                                                 |
| `ExchangeRateDataService.getExchangeRatesByCurrencyWithStatus` | currencies, start date, end date, target currency                      | Rates in today's map shape plus `estimatedDates` and `missingDates` per pair | A store read failure falls back to `MarketData` only and logs a warning; if both fail the pair is reported missing, never converted 1:1                                                                                        |
| `ExchangeRateStoreService.upsertObserved` (mutation)           | list of `{ currencyFrom, currencyTo, date, rate, source }`             | count written and count rejected                                             | Each row validated first (see below); invalid rows are skipped and counted, valid rows are written in batches of 500 inside a transaction; a database error is thrown so the Bull job retries; logs carry counts and pair only |
| `ExchangeRateStoreService.getRange`                            | currency pairs, start date, end date                                   | rows ordered by date                                                         | Database errors propagate to the caller (`ExchangeRateDataService` handles them as above)                                                                                                                                      |
| `resolveExchangeRates` (pure function)                         | per-leg series with observed and carried-forward markers, pairs, dates | rate, `isEstimated`, `isMissing` per pair and date                           | Never throws on missing data; returns missing markers                                                                                                                                                                          |

### Row validation (store)

A row is rejected when: the rate is not a finite number or is `<= 0`; either currency fails the existing `isValidCurrencyCode` helper; `currencyFrom` equals `currencyTo`; or the date is not a valid day. Rejected rows are never persisted (AC-001b, EC-006).

### Resolver rules (authoritative for REQ-002, REQ-004, REQ-007)

1. Same currency -> rate 1, observed. Derived currency pairs (for example GBp and GBP) use the existing `DERIVED_CURRENCIES` factor, observed.
2. The USD-pivot series for each non-USD currency is built from `ExchangeRate` rows first, then `MarketData` rows where the store has no row for that date. `MarketData` rows with `isCarriedForward = true` count as ESTIMATED.
3. For a pair A to B: use a direct series if one exists; otherwise (1 / USD-to-A) multiplied by USD-to-B. A pair is ESTIMATED if either leg is estimated on that date.
4. A leg on date D: observed value on D -> observed. Otherwise the latest observed value strictly before D -> ESTIMATED (carry forward). Otherwise MISSING. Later rates are never used for earlier dates.
5. For today (the end date) the latest observed rate is used without the ESTIMATED flag when it is at most 5 days old (covers weekends and holidays); older than that it is ESTIMATED (F-006).
6. Currencies with no data at all produce MISSING for every date; there is no default of 1.

### Custom hooks and Context APIs

None.

## Data Models

### New persisted model: ExchangeRate

| Field        | Type                       | Notes                                   |
| ------------ | -------------------------- | --------------------------------------- |
| createdAt    | timestamp                  | default now                             |
| currencyFrom | string                     | ISO 4217 or derived code                |
| currencyTo   | string                     | ISO 4217 or derived code                |
| date         | date-time                  | start of the UTC day                    |
| id           | string                     | uuid primary key (matches `MarketData`) |
| rate         | float                      | strictly positive (ADR-007)             |
| source       | existing `DataSource` enum | provider that observed the close        |
| updatedAt    | timestamp                  | auto-updated                            |

Constraints and indexes: unique on `[currencyFrom, currencyTo, date, source]` (also serves range reads by pair); an index on `[date]`. No foreign keys, no user data. Only observed closes are stored; carried-forward values are computed at read time (ADR-006).

### New shared types (libs/common)

- `ExchangeRateWarning`: `currencyFrom` (string), `currencyTo` (string), `date` (string `yyyy-MM-dd`), `type` (`'ESTIMATED'` or `'MISSING'`).
- `ExchangeRatesWithStatus` (api interface, `apps/api/src/services/exchange-rate-data/interfaces/exchange-rate-data.interface.ts`, modified): `rates` (same shape as `ExchangeRatesByCurrency`), `estimatedDates` (pair -> list of date strings), `missingDates` (pair -> list of date strings).
- `PortfolioSnapshot.fxWarnings`, `PortfolioDetails.fxWarnings`, `PortfolioPerformanceResponse.fxWarnings`: optional list of `ExchangeRateWarning`.

### Unchanged

`MarketData`, `Settings`, `UserSettings` (no new key), `Order`, `Account`, `SymbolProfile`.

## Decisions (ADRs)

### ADR-001: Follow the existing NestJS service layering with one pure resolver

- **Context:** A pattern must be chosen for new rate logic.
- **Decision:** Services for persistence and orchestration, plus a pure function module for the rate rules, matching `apps/api/src/services/*`.
- **Alternatives:**
  - Keep all logic in `ExchangeRateDataService` (pros: fewer files; cons: the service is already 580 lines and the rules would be hard to unit test).
  - A new standalone Nest module with its own controller (pros: isolation; cons: adds an endpoint surface the requirements do not ask for).
- **Consequences:** Positive: testable rules, consistent layout. Negative: two extra files. Risk: low.

### ADR-002: Store observed closes in a new ExchangeRate table and keep MarketData as fallback (implements DL-001)

- **Context:** The ticket asks for an FX rate table; `MarketData` already holds FX history.
- **Decision:** Add `ExchangeRate`, written from the same gather job, read first; `MarketData` is the fallback so numbers stay unchanged where only `MarketData` has a rate.
- **Alternatives:**
  - Reuse `MarketData` only (pros: no migration; cons: does not meet AC1 and cannot hold validated, source-tagged rates).
  - Replace `MarketData` for FX (pros: single store; cons: breaks admin screens, charts and 20+ consumers).
  - Store rates in a JSON column on `Settings` or `Property` (pros: no new table; cons: unqueryable, unbounded growth).
- **Consequences:** Positive: validated, queryable provenance. Negative: duplicated data and a precedence rule (F-005). Risk: drift between tables, mitigated by the sync hook and by using the same provider values.

### ADR-003: Add a parallel flag-gated read method rather than change the existing one (REQ-009)

- **Context:** With the flag off, results must equal today's, and about 33 specs depend on the current method.
- **Decision:** Leave `getExchangeRatesByCurrency` untouched; add `getExchangeRatesByCurrencyWithStatus`; the calculator picks one by flag.
- **Alternatives:**
  - Change the existing method in place (pros: single path; cons: breaks parity, large blast radius).
  - A new environment variable switch (pros: ops control; cons: not per user, contradicts the "no new environment variable" constraint).
- **Consequences:** Positive: provable parity. Negative: two code paths until the flag is retired. Risk: paths drift; mitigated by parity specs.

### ADR-004: Resolve the flag inside ExchangeRateDataService from the user id

- **Context:** Calculators are created in 5 places, including a background queue processor, and none passes the user's settings.
- **Decision:** `ExchangeRateDataService.isHistoricalFxEnabled(userId)` reads `Settings` once per calculation; the calculator already holds `userId`.
- **Alternatives:**
  - Pass the flag through `createCalculator` (pros: explicit; cons: 5 call sites and the queue job payload change).
  - Global environment flag (pros: trivial; cons: not per user, no gradual rollout).
- **Consequences:** Positive: one place, no signature changes. Negative: one small query per calculation. Risk: low.

### ADR-005: Exclude at holding level through the existing error path (F-004)

- **Context:** REQ-004 says to exclude the affected amount when no earlier rate exists.
- **Decision:** A holding with any relevant date (an activity date or the end date) marked missing is added to `errors` and marked `hasErrors`, exactly like a holding without a market price; a warning of type MISSING names the pair and date.
- **Alternatives:**
  - Drop only the single activity (pros: finer; cons: leaves a sell without its buy and corrupts quantity and cost basis).
  - Fail the whole snapshot with `PortfolioSnapshotComputationError` (pros: simple; cons: one bad currency breaks the whole portfolio).
- **Consequences:** Positive: reuses a proven path, keeps invariants. Negative: coarser than the wording. Risk: users see nulled performance for that holding; the warning explains why.

### ADR-006: Persist observed rates only; compute estimates at read time

- **Context:** The gatherer already writes carried-forward rows into `MarketData`.
- **Decision:** Only rows with `isCarriedForward = false` are mirrored; the resolver decides ESTIMATED when reading.
- **Alternatives:**
  - Mirror every row including carried-forward (pros: simpler sync; cons: stores estimates as if observed and hides gaps).
  - Persist estimates in a separate flagged column (pros: faster reads; cons: more writes, stale estimates when real data arrives late).
- **Consequences:** Positive: honest provenance and no stale estimates. Negative: carry-forward work on each read. Risk: low at 4 currencies and daily granularity.

### ADR-007: Use a floating-point rate column, with Big.js in calculations

- **Context:** Column type for the rate.
- **Decision:** Float, matching `MarketData.marketPrice`; arithmetic stays in `big.js`.
- **Alternatives:**
  - Decimal(18,8) (pros: exact storage; cons: Prisma returns a Decimal object, so every consumer needs conversion, and it differs from `MarketData`).
  - Integer micro-units (pros: exact; cons: awkward and inconsistent).
- **Consequences:** Positive: consistency, no conversion layer. Negative: float storage precision (about 15 digits, ample for FX closes). Risk: low.

### ADR-008: Sync from the data-gathering processor

- **Context:** REQ-006 requires backfill through the existing job.
- **Decision:** After the market-data write in `gatherHistoricalMarketData`, mirror observed rows of currency pairs. The existing "gather max" action therefore backfills history, and re-runs are idempotent through the unique key.
- **Alternatives:**
  - Hook inside `MarketDataService.updateMany` (pros: catches admin edits; cons: cross-cutting, affects every symbol and the admin screens).
  - A separate scheduled job (pros: decoupled; cons: new job, new failure mode, timing gaps).
  - A database trigger (pros: automatic; cons: invisible logic, not portable, outside Prisma).
- **Consequences:** Positive: minimal, reuses existing scheduling and retries. Negative: admin edits to FX rows in `MarketData` are not propagated (F-005). Risk: medium; documented.

### ADR-009: Invalidate cached snapshots when the experimental flag changes

- **Context:** The snapshot cache key contains user id, calculation type and filters, not the flag, so toggling the flag would serve stale numbers until the next portfolio change.
- **Decision:** Emit the existing portfolio-changed event when `isExperimentalFeatures` is in a settings update, in addition to `baseCurrency`.
- **Alternatives:**
  - Put the flag into the cache key (pros: no invalidation; cons: changes keys used by the queue processor, cache listener and mocks).
  - Do nothing (pros: no change; cons: stale or mixed results after toggling).
- **Consequences:** Positive: one-line behavioural change reusing a debounced listener. Negative: a recompute on toggling any experimental setting. Risk: low.

### ADR-010: Keep `toCurrency` unchanged (F-001)

- **Context:** `toCurrency` is synchronous, has no user or date context and has 14 call sites in 7 files.
- **Decision:** Do not change it. The no-1:1 guarantee applies to the portfolio calculator path and `toCurrencyAtDate` is untouched.
- **Alternatives:**
  - Make it throw or return undefined when no rate exists (pros: strict; cons: breaks callers that expect a number).
  - Make it async and user-aware (pros: complete; cons: large cross-cutting refactor).
- **Consequences:** Positive: contained scope. Negative: the REQ-004 wording is only met on the valuation path. Risk: medium; needs user confirmation.

## Implementation Guidelines

### File structure

| path                                                                                            | purpose                                | component_id |
| ----------------------------------------------------------------------------------------------- | -------------------------------------- | ------------ |
| `prisma/schema.prisma`                                                                          | Add `ExchangeRate` model               | COMP-001     |
| `prisma/migrations/20261105000000_added_exchange_rate/migration.sql`                            | Additive table creation (GATED)        | COMP-002     |
| `libs/common/src/lib/interfaces/exchange-rate-warning.interface.ts`                             | Warning type                           | COMP-003     |
| `libs/common/src/lib/interfaces/index.ts`                                                       | Export the warning type (alphabetical) | COMP-003     |
| `apps/api/src/services/exchange-rate-data/interfaces/exchange-rate-data.interface.ts`           | Add `ExchangeRatesWithStatus`          | COMP-003     |
| `apps/api/src/services/exchange-rate-data/exchange-rate-store.service.ts`                       | Store service                          | COMP-004     |
| `apps/api/src/services/exchange-rate-data/exchange-rate-store.service.spec.ts`                  | Store tests                            | COMP-004     |
| `apps/api/src/services/exchange-rate-data/exchange-rate-resolver.ts`                            | Pure resolver                          | COMP-005     |
| `apps/api/src/services/exchange-rate-data/exchange-rate-resolver.spec.ts`                       | Resolver tests                         | COMP-005     |
| `apps/api/src/services/exchange-rate-data/exchange-rate-data.service.ts`                        | New method and flag check              | COMP-006     |
| `apps/api/src/services/exchange-rate-data/exchange-rate-data.service.spec.ts`                   | Service tests (no spec exists today)   | COMP-006     |
| `apps/api/src/services/exchange-rate-data/exchange-rate-data.module.ts`                         | Provide and export the store           | COMP-007     |
| `apps/api/src/app/portfolio/calculator/portfolio-calculator.ts`                                 | Flag path, exclusion, warnings         | COMP-008     |
| `apps/api/src/app/portfolio/calculator/roai/portfolio-calculator-fx-multi-currency.spec.ts`     | Flag-on calculator tests               | COMP-008     |
| `libs/common/src/lib/models/portfolio-snapshot.ts`                                              | Optional `fxWarnings`                  | COMP-009     |
| `apps/api/src/app/portfolio/portfolio.service.ts`                                               | Pass warnings through                  | COMP-010     |
| `libs/common/src/lib/interfaces/portfolio-details.interface.ts`                                 | Optional `fxWarnings`                  | COMP-011     |
| `libs/common/src/lib/interfaces/responses/portfolio-performance-response.interface.ts`          | Optional `fxWarnings`                  | COMP-011     |
| `apps/api/src/services/queues/data-gathering/data-gathering.processor.ts`                       | Mirror hook                            | COMP-012     |
| `apps/api/src/services/queues/data-gathering/data-gathering.processor.spec.ts`                  | Extend with sync tests                 | COMP-012     |
| `apps/api/src/app/user/user.controller.ts`                                                      | Emit on flag change                    | COMP-013     |
| `libs/ui/src/lib/fx-rate-warning/fx-rate-warning.component.ts`, `.html`, `.scss`, `index.ts`    | Notice presenter                       | COMP-014     |
| `apps/client/src/app/pages/portfolio/analysis/analysis-page.component.ts`, `analysis-page.html` | Show the notice                        | COMP-015     |
| `apps/api/src/services/exchange-rate-data/exchange-rate-data.service.mock.ts`                   | Add the new method                     | COMP-016     |

### Naming conventions

- Files: kebab-case; services `*.service.ts`; specs `*.spec.ts` next to source; interfaces in `interfaces/`.
- Classes and components: PascalCase (`ExchangeRateStoreService`, `GfFxRateWarningComponent`); selector `gf-fx-rate-warning`.
- Functions and methods: camelCase; constants UPPER_SNAKE_CASE.
- Prisma fields alphabetical; migration folder `YYYYMMDDHHMMSS_added_exchange_rate`.

### Patterns to use

- Reuse `isValidCurrencyCode`, `DATE_FORMAT`, `DEFAULT_CURRENCY`, `DERIVED_CURRENCIES`, `resetHours` and `getStartOfUtcDate`.
- Reuse the holding-level `errors`/`hasErrors` path for excluded holdings.
- Reuse `PortfolioChangedEvent` for invalidation.
- Batch writes in transactions of 500 rows; follow the `MarketDataService.updateMany` upsert style.
- Log with the Nest `Logger`; messages carry the currency pair, date and counts only.

### Patterns to avoid

- Do not change `getExchangeRatesByCurrency`, `toCurrency` or `toCurrencyAtDate` behaviour.
- Do not introduce a `?? 1` fallback anywhere in the new path.
- Do not read later rates for earlier dates.
- Do not add an HTTP endpoint, DTO, permission or environment variable.
- Do not log amounts, quantities, user ids tied to values, or full rate payloads.
- Do not reformat unrelated code in the 2,400-line calculator; use targeted edits.

### Libraries

No new dependency. Existing: `big.js`, `date-fns`, `class-validator`, Prisma 7.10, NestJS 11.2, Angular 22.1.

### Code standards

- Run the full API and common test suites BEFORE any change and record the baseline; run the relevant suite after each changed file.
- Flag-off parity: all existing calculator specs must pass with no edits other than the mock addition.
- Do not touch generated locale files; leave locale extraction to the user (as in SCRUM-64).
- Do not commit tooling, generated output or `package-lock.json` changes unrelated to the feature.
- COMP-002 is gated: stop and ask for explicit confirmation before creating or applying any migration.

## Testing Strategy

### Unit test targets

- `exchange-rate-resolver.spec.ts`: observed day, weekend carry-forward flagged ESTIMATED, no earlier rate gives MISSING, cross pair GBP to CHF through USD, derived currency GBp, same currency, a currency with no data, rule 5 (today within and beyond 5 days), `MarketData` carried-forward rows flagged ESTIMATED, no later-rate fill.
- `exchange-rate-store.service.spec.ts`: rejects zero, negative, NaN and infinite rates, invalid codes and identical currencies; idempotent upsert (twice yields one row); batches larger than 500 rows; database failure rethrown.
- `exchange-rate-data.service.spec.ts`: flag on and off; store failure falls back to `MarketData`; both failing yields missing, not 1:1.

### Integration test targets

- Calculator flag-off parity: all existing calculator specs unchanged and green.
- Calculator flag-on (`portfolio-calculator-fx-multi-currency.spec.ts`): EUR buy investment equals quantity x price x rate on the activity date (AC-003a); later rate moves leave investment unchanged while current value follows the latest rate (AC-003b); Saturday activity flagged ESTIMATED (AC-004a); missing pair excludes the holding, adds `errors` and a MISSING warning, and does not convert 1:1 (AC-004b); base currency change recomputes in CHF (AC-005a).
- Processor: sync mirrors only non-carried-forward rows; running twice leaves one row per day; provider failure leaves earlier rows valid; non-FX symbols are not mirrored.
- User controller: the event is emitted for `isExperimentalFeatures` and `baseCurrency` updates and not for unrelated settings.
- Performance (AC-008): 500 holdings across USD, EUR, GBP and CHF with the store and `MarketData` mocked completes under 2 s at p95.
- Security (AC-010): the store exposes no controller route (a route-enumeration spec asserts nothing new is registered); log capture contains no amounts.

### E2E scenarios

- As a user with the experimental flag on and a EUR activity on a past Saturday, when I open Portfolio analysis, then I see a notice that one rate is estimated, with the pair and date.
- As a user with a holding whose currency has no rate before its purchase date, when I open Portfolio analysis, then that holding shows no performance and the notice names the pair and date.
- As a user, when I switch my base currency from USD to CHF, then my values are re-expressed in CHF.
- As a user with the flag off, then no notice appears and values equal those before the release.

### Coverage target

At least 80% line coverage on new business logic (the client org standard is not stated; SCRUM-64 achieved 93% on its calculator and 100% on its validator, so the resolver and store target 95%).

## Security Considerations

| concern                                                   | mitigation                                                                                                                     | owasp_category                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Anyone writing or altering rates                          | No endpoint, DTO or permission is added; the only writer is the data-gathering processor; rows are validated before persisting | A01 Broken Access Control                    |
| Corrupt or hostile rates (zero, negative, NaN, huge)      | Store validation rejects non-finite and non-positive values; rejected counts are logged                                        | A04 Insecure Design                          |
| Injection through currency strings                        | Prisma parameterised queries only; codes checked with the existing `isValidCurrencyCode`                                       | A03 Injection                                |
| Personal data in the new table or logs                    | The table holds no user data; logs carry pair, date and counts only (GDPR data minimisation, PCI and HIPAA unaffected)         | A09 Security Logging and Monitoring Failures |
| Response bloat or denial of service through warnings      | `fxWarnings` capped at 100, de-duplicated; read ranges bounded by portfolio dates; at most two queries per calculation         | A05 Security Misconfiguration                |
| Stale or mixed results after toggling the flag            | Cache invalidation on flag change (ADR-009)                                                                                    | A04 Insecure Design                          |
| Schema change without approval                            | Migration is gated until explicit confirmation (client guardrail)                                                              | A04 Insecure Design                          |
| Manual correction of an FX row not reaching the new table | Documented precedence and open decision F-005                                                                                  | A08 Software and Data Integrity Failures     |

## Design Changes Log

| version | changes        | rationale                                                                             |
| ------- | -------------- | ------------------------------------------------------------------------------------- |
| 1       | Initial design | First pass from the approved problem spec; ASM-003 resolved by reading the calculator |

## Flags

Issues found in `ph1_problem_spec.md`; none were fixed silently.

| ID    | type                | finding                                                                                                                                                                                                                             | recommended action                                                                                                                                |
| ----- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-001 | ambiguity           | REQ-004 says the system "shall never convert 1:1 silently", but `toCurrency` (14 call sites, 7 files, synchronous, no user context) also falls back to the unconverted amount. The design covers the valuation path only (ADR-010). | Confirm the narrower scope, or approve a separate follow-up ticket for `toCurrency`.                                                              |
| F-002 | ambiguity           | REQ-005 says "supported currency codes" and AC-005b uses "XXX", but the existing validator accepts any ISO 4217 code and `XXX` is an ISO 4217 code, so it would likely pass.                                                        | Define "supported" as the existing validator (design default) and change the AC-005b example to a non-ISO value such as "ZZZ" or lowercase "usd". |
| F-003 | contradiction       | REQ-004 specifies the most recent EARLIER rate, but today's in-range gap fill uses the NEXT later rate, and dates before the first rate get the earliest rate. With the flag on, values for gap dates can differ from today's.      | Accept that flag-on history may shift for gap dates; flag-off stays identical.                                                                    |
| F-004 | ambiguity           | REQ-004 says "exclude the affected amount"; the design excludes the whole holding (ADR-005) to keep quantities and cost basis consistent.                                                                                           | Confirm holding-level exclusion.                                                                                                                  |
| F-005 | missing_requirement | An admin edit to an FX row in `MarketData` is not propagated to `ExchangeRate`, and `ExchangeRate` takes precedence (ADR-002, ADR-008).                                                                                             | Decide: accept (design default), make `MarketData` win, or add a sync on admin edits.                                                             |
| F-006 | missing_requirement | Today's rate often lacks a close; flagging every portfolio load as estimated would be noise. The design allows a 5-day staleness window before flagging today.                                                                      | Confirm the 5-day threshold.                                                                                                                      |
| F-007 | missing_requirement | ASM-001 and DL-005: no migration may be created or applied without explicit confirmation. Implementation cannot start on COMP-001 and COMP-002 until then.                                                                          | Obtain explicit confirmation at the design-review gate.                                                                                           |
| F-008 | ambiguity           | ASM-002: "per portfolio profile" is treated as per user (NG-001). REQ-005 therefore needs no new setting; only cache invalidation on flag change is added.                                                                          | Confirm at the design-review gate.                                                                                                                |
