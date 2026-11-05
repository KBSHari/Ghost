# Implementation Plan: SCRUM-65

## Pipeline Context

- **Ticket:** SCRUM-65 (FEAT-0002), Multi-Currency FX Conversion & Base Currency Normalization
- **Mode:** gates
- **Pipeline state:** `docs/artifacts/SCRUM-65/.state/pipeline_state_SCRUM-65.json`
- **Artifacts:** `docs/artifacts/SCRUM-65/` (`ph1_problem_spec.md`, `ph2_design_spec.md`, `ph3_design_review.md`, `ph3b_qa_test_plan.md`)
- **Classification:** Large Feature | **Review verdict:** approve_with_concerns (74/100), conditions C-1 to C-5

## Problem Summary

Users with assets in several currencies need every transaction converted to their base currency at the rate on the transaction date. Ghostfolio already converts at the activity-date rate when a daily rate exists, but it falls back to a silent 1:1 in about 11 places, fills gaps with the NEXT later rate, and has no dedicated, validated FX rate store. This change adds an additive `ExchangeRate` table, a flag-gated status-aware rate path with an explicit missing-rate policy, a backfill hook in the existing data-gathering job, and an API/UI warning for estimated and missing rates.

## Key Requirements & Constraints

| ID      | Priority | Description                                                                                                                |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 | P0       | Persist daily close FX rates in a Prisma-managed PostgreSQL table, unique per pair, date and source                        |
| REQ-002 | P0       | Resolve rates from stored rates, falling back to `MarketData`, so values are unchanged where rates already exist           |
| REQ-003 | P0       | Convert cost basis, investment and fees at the activity-date rate; current value at the latest rate                        |
| REQ-004 | P0       | Missing rate: carry forward the earlier rate and flag estimated; never convert 1:1; no earlier rate means exclude and warn |
| REQ-005 | P0       | Base currency stays per user, validated, and changing it recalculates values                                               |
| REQ-006 | P1       | Backfill history through the existing data-gathering job, idempotently                                                     |
| REQ-007 | P0       | USD, EUR, GBP, CHF guaranteed, including cross pairs                                                                       |
| REQ-008 | P1       | 500 holdings across 4 currencies within 2 s at p95 (provider calls mocked)                                                 |
| REQ-009 | P0       | Gated by `isExperimentalFeatures`; flag off means identical results                                                        |
| REQ-010 | P0       | No personal data in the table; writes only through data gathering; no user amounts in logs                                 |

**Constraints:**

- Additive schema only. **No migration is created or applied without explicit user confirmation (Step 0).**
- `MarketData` schema, asset quote data and the `DATA_SOURCE_EXCHANGE_RATES` provider setting do not change.
- No new endpoint, controller, DTO, permission, environment variable or dependency.
- `getExchangeRatesByCurrency`, `toCurrency` and `toCurrencyAtDate` keep their current behaviour (flag-off parity).
- Targeted edits only in the 2,400-line `portfolio-calculator.ts`; do not reformat unrelated code.
- Run the tests after every changed file; never batch changes and test at the end.

**Non-Goals:** NG-001 no portfolio-profile entity; NG-002 no user rate overrides; NG-003 no new provider; NG-004 `MarketData` and quote data unchanged; NG-005 no FX gain/loss reporting.

## Architecture Summary

Existing NestJS service layering plus one pure resolver module. `ExchangeRateDataService` gains a status-aware read method and a never-throwing per-user flag check, both added **additively** (ADR-003, ADR-004, condition C-2). A new `ExchangeRateStoreService` validates and persists observed closes; the resolver computes rate, estimated and missing status per pair and date (carry-forward from the earlier rate only, USD triangulation, derived currencies). `PortfolioCalculator` picks the new path by flag, **removes** holdings with a missing rate (condition C-1), and returns capped `fxWarnings` through the cached snapshot to the details and performance responses and a small client notice on the analysis page. `DataGatheringProcessor` mirrors observed (non-carried-forward) FX closes into the store, with failures isolated (condition C-3). `UserController` emits the portfolio-changed event when `isExperimentalFeatures` changes (ADR-009).

## Design Review Conditions

| Condition      | What the implementation must do                                                                                                                                                                                                                                                                                                     | Addressed in     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| C-1 (ARCH-001) | FX-excluded holdings are removed from `positions`, `valuesByAssetProfileIdentifier`, current value, investment and chart series, not merely marked `hasErrors`; an AC-004b test asserts the totals exclude them                                                                                                                     | Steps 25, 26     |
| C-2 (ARCH-002) | No new REQUIRED constructor parameter on `ExchangeRateDataService` or `DataGatheringProcessor` (append optional trailing parameters); mock gains `isHistoricalFxEnabled` (false); the flag check never throws; the 36 specs that construct the real service and the 2 processor specs pass without edits to their constructor calls | Steps 19, 22, 24 |
| C-3 (ARCH-003) | Sync failures are caught and logged (pair and counts only), never rethrown; `MarketData` write stays authoritative; migration is applied before code that writes to the table                                                                                                                                                       | Steps 2, 22      |
| C-4 (ARCH-005) | One documented date-key function for reading and storing rates, reusing the one in `getExchangeRates`; tested under a non-UTC time zone                                                                                                                                                                                             | Steps 8, 10, 19  |
| C-5 (F-007)    | No migration file is created or applied without explicit user confirmation                                                                                                                                                                                                                                                          | Step 0           |

**Concerns carried to verification:** ARCH-004 corrected blast-radius figures (35 injection sites; 8 specs use the mock; 36 specs construct the real service); ARCH-006 resolve the flag once per calculation; MISS-001 fixed log events; MISS-002 rollback statement (set the flag off, optionally drop the additive table); MISS-003 accessible notice; MISS-005 stale-snapshot behaviour documented.

**Flag decisions used by this plan (from the review's recommendations):** F-001 `toCurrency` unchanged; F-002 "supported" means the existing validator, and the test for an invalid base currency uses a non-ISO code such as `ZZZ` (not `XXX`, which is a valid ISO 4217 code); F-003 flag-on gap dates use the earlier rate; F-004 holding-level exclusion; F-005 new table wins on conflict; F-006 5-day staleness window for today's rate; F-008 per user.

## Affected Repos

Single-repo change: `ghostfolio` (Nx monorepo at the workspace root). Areas touched: `prisma`, `apps/api`, `apps/client`, `libs/common`, `libs/ui`.

## Pre-Implementation Baseline

Record pass/fail counts BEFORE any change (previous run for SCRUM-64 ended at api 700, common 242, ui 6, but record fresh numbers):

- `npm run test:api` (equivalent to `npx dotenv-cli -e .env.example -- nx test api`)
- `npm run test:common`
- `npm run test:ui`
- `npm run lint`
- `git status` snapshot: note the pre-existing modified `package-lock.json` and the untracked tooling folders so they are not staged later.

If anything is already failing, record the exact names so they are not attributed to this change.

## Implementation Steps

### Execution Mode: waves

29 files (13 new, 16 modified), 5 waves. Within a wave, files can be written in parallel; run the wave's tests before starting the next wave.

---

### Step 0: MIGRATION CONFIRMATION GATE (no file) [COMP-001, COMP-002]

---

- **Purpose:** The client guardrail forbids schema changes without explicit confirmation (DL-005, ASM-001, F-007, C-5).
- **Action:** Before Step 1, ask the user: "Do you authorize an additive Prisma migration adding the `ExchangeRate` table?" Continue only on an explicit yes.
- **If the user declines or does not answer:** STOP and report. Do not silently drop REQ-001 and REQ-006. The fallback (resolver and warnings over `MarketData` only, design review ALT-001) changes the requirements and needs a decision first.
- **Note:** The agent writes the migration SQL but never applies it to a database; the user runs `npm run database:migrate`.

---

### Wave 0 (no dependencies)

---

### Step 1: prisma/schema.prisma (modify) [COMP-001]

- **Purpose:** Add the `ExchangeRate` model.
- **Dependencies:** Step 0 confirmed.
- **Key notes:** Fields in alphabetical order: `createdAt`, `currencyFrom`, `currencyTo`, `date`, `id` (uuid default), `rate` (Float), `source` (existing `DataSource` enum), `updatedAt`. `@@unique([currencyFrom, currencyTo, date, source])` and `@@index([date])`. No relations and no user data (REQ-010). Use `date` as a date-time, matching `MarketData`.
- **Acceptance criteria:** REQ-001, AC-001a, AC-001b
- **Verify:** `npm run database:format-schema`, `npm run database:validate-schema`, then `npm run database:generate-typings` so `prisma.exchangeRate` exists for later steps.

### Step 3: libs/common/src/lib/interfaces/exchange-rate-warning.interface.ts (new) [COMP-003]

- **Purpose:** Shared `ExchangeRateWarning` type: `currencyFrom`, `currencyTo`, `date` (`yyyy-MM-dd`), `type` (`'ESTIMATED' | 'MISSING'`).
- **Dependencies:** none
- **Key notes:** Pure type, no logic. Follow the file naming of neighbouring `*.interface.ts` files.
- **Acceptance criteria:** REQ-004, AC-004a, AC-004b
- **Verify:** `npm run test:common`

### Step 4: libs/common/src/lib/interfaces/index.ts (modify) [COMP-003]

- **Purpose:** Export the new type through the barrel.
- **Dependencies:** Step 3
- **Key notes:** The barrel is an alphabetical list of `import type` lines followed by an export list. Add the import after `enhanced-asset-profile.interface` (before `filter-group`) and add the name to the export list in the matching position. One-line edits only.
- **Acceptance criteria:** REQ-004
- **Verify:** `npm run test:common`

### Step 5: apps/api/src/services/exchange-rate-data/interfaces/exchange-rate-data.interface.ts (modify) [COMP-003]

- **Purpose:** Add `ExchangeRatesWithStatus`: `rates` (same shape as `ExchangeRatesByCurrency`), `estimatedDates` and `missingDates` (pair to list of date strings).
- **Dependencies:** none
- **Key notes:** Additive; keep `ExchangeRatesByCurrency` unchanged.
- **Acceptance criteria:** REQ-002, REQ-004
- **Verify:** `npm run test:api` (compile check)

### Step 6: apps/api/src/app/user/user.controller.ts (modify) [COMP-013]

- **Purpose:** Emit the portfolio-changed event when `isExperimentalFeatures` changes, in addition to `baseCurrency` (ADR-009).
- **Dependencies:** none
- **Key notes:** One-line change at the `emitPortfolioChangedEvent` assignment (about line 223): also true when `'isExperimentalFeatures' in data`. Do not alter the other logic in `updateUserSetting`.
- **Acceptance criteria:** REQ-009, REQ-005, AC-005a
- **Verify:** `npx dotenv-cli -e .env.example -- nx run api:test --test-file user.controller.spec.ts` (after Step 7)

### Step 7: apps/api/src/app/user/user.controller.spec.ts (new) [COMP-013]

- **Purpose:** No spec exists for the controller; test the new behaviour.
- **Dependencies:** Step 6
- **Key notes:** Build the controller with mocked `userService` (spy on `updateUserSetting`) and a mocked request user with `updateUserSettings` permission. Assert `emitPortfolioChangedEvent` is true for `{ isExperimentalFeatures: true }` and for `{ baseCurrency: 'CHF' }`, and false for an unrelated key such as `{ colorScheme: 'DARK' }`. Mirror constructor-argument handling used by other controller specs in the repo.
- **Acceptance criteria:** AC-005a, AC-009a, AC-009b
- **Verify:** `npx dotenv-cli -e .env.example -- nx run api:test --test-file user.controller.spec.ts`

---

### Wave 1 (depends on Wave 0)

---

### Step 2: prisma/migrations/20261105000000_added_exchange_rate/migration.sql (new) [COMP-002]

- **Purpose:** Additive table creation, consistent with `20261030000000_added_target_allocation_model`.
- **Dependencies:** Step 1, Step 0 confirmed
- **Key notes:** `CREATE TABLE "ExchangeRate"` with the columns from Step 1, primary key on `id`, a unique index on (`currencyFrom`, `currencyTo`, `date`, `source`) and an index on `date`. No foreign keys, no data changes, no drops. **Write the file only; do not apply it.** Tell the user to run `npm run database:migrate` BEFORE deploying code from Steps 8 to 29 (condition C-3 deployment order). Rollback statement for the PR: set the flag off; the table may be dropped safely.
- **Acceptance criteria:** REQ-001
- **Verify:** `npm run database:validate-schema`

### Step 8: apps/api/src/services/exchange-rate-data/exchange-rate-store.service.ts (new) [COMP-004]

- **Purpose:** Validate and persist observed rates; read ranges by pair.
- **Dependencies:** Step 1 (generated Prisma client)
- **Key notes:** `upsertObserved` rejects rows with a non-finite or `<= 0` rate, an invalid code (existing `isValidCurrencyCode`), identical currencies, or an invalid date; writes in transactions of 500 rows following the `MarketDataService.updateMany` upsert style; returns written and rejected counts. `getRange` reads rows for the needed pairs and date range in one query. Use the single documented date-key function (condition C-4). Logs carry pair and counts only. Constructor takes `PrismaService`.
- **Acceptance criteria:** REQ-001, REQ-010, AC-001a, AC-001b, AC-010a, AC-010b, EC-006
- **Verify:** `npx dotenv-cli -e .env.example -- nx run api:test --test-file exchange-rate-store.service.spec.ts`

### Step 9: apps/api/src/services/exchange-rate-data/exchange-rate-store.service.spec.ts (new) [COMP-004]

- **Purpose:** Unit tests for the store.
- **Dependencies:** Step 8
- **Key notes:** Cover: rejects 0, negative, NaN and infinite rates, invalid codes and identical currencies; idempotent upsert (twice yields one row); batches over 500 rows; database error propagates from `getRange`; logs contain no amounts. Mock `PrismaService`.
- **Acceptance criteria:** AC-001a, AC-001b, AC-010b, EC-006
- **Verify:** `npx dotenv-cli -e .env.example -- nx run api:test --test-file exchange-rate-store.service.spec.ts`

### Step 10: apps/api/src/services/exchange-rate-data/exchange-rate-resolver.ts (new) [COMP-005]

- **Purpose:** Pure resolver implementing the design's rules 1 to 6.
- **Dependencies:** Step 3, Step 5
- **Key notes:** Same currency gives 1; derived currencies use `DERIVED_CURRENCIES`; USD-pivot series built from store rows first, then `MarketData` rows where the store has none; `MarketData` rows with `isCarriedForward = true` count as ESTIMATED; leg on date D is observed, else the latest observed strictly before D (ESTIMATED), else MISSING; never use later rates; today's rate is not flagged when the latest observation is at most 5 days old (F-006); a currency with no data is MISSING on every date, never defaulted to 1. Use `big.js` for the cross-rate multiplication. Same date-key function as Step 8 (C-4).
- **Acceptance criteria:** REQ-002, REQ-004, REQ-007, AC-002a, AC-002b, AC-004a, AC-004b, AC-007a, AC-007b, EC-002, EC-003, EC-004, EC-005
- **Verify:** `npx dotenv-cli -e .env.example -- nx run api:test --test-file exchange-rate-resolver.spec.ts`

### Step 11: apps/api/src/services/exchange-rate-data/exchange-rate-resolver.spec.ts (new) [COMP-005]

- **Purpose:** Unit tests for the resolver (target 95% coverage).
- **Dependencies:** Step 10
- **Key notes:** Observed day; weekend carry-forward flagged ESTIMATED; no earlier rate gives MISSING; GBP to CHF cross through USD; GBp derived currency; same currency; a currency with no data; today within and beyond 5 days; `MarketData` carried-forward rows flagged ESTIMATED; no later-rate fill; run the date-key tests under a non-UTC time zone (follow `data-gathering.processor.time-zone.spec.ts`).
- **Acceptance criteria:** AC-002a, AC-002b, AC-004a, AC-004b, AC-007a, AC-007b
- **Verify:** `npx dotenv-cli -e .env.example -- nx run api:test --test-file exchange-rate-resolver.spec.ts`

### Step 12: libs/common/src/lib/models/portfolio-snapshot.ts (modify) [COMP-009]

- **Purpose:** Add optional `fxWarnings` to the cached snapshot model.
- **Dependencies:** Step 3, Step 4
- **Key notes:** Plain optional array of `ExchangeRateWarning`, no `@Type` transform needed. Optional so snapshots already cached in Redis (field absent) stay valid.
- **Acceptance criteria:** REQ-004
- **Verify:** `npm run test:common`, `npm run test:api`

### Step 13: libs/common/src/lib/interfaces/portfolio-details.interface.ts (modify) [COMP-011]

- **Purpose:** Add optional `fxWarnings`.
- **Dependencies:** Step 3, Step 4
- **Key notes:** Additive and optional; existing consumers (including `rebalancing.service.ts`) ignore it.
- **Acceptance criteria:** REQ-004
- **Verify:** `npm run test:common`, `npm run test:api`

### Step 14: libs/common/src/lib/interfaces/responses/portfolio-performance-response.interface.ts (modify) [COMP-011]

- **Purpose:** Add optional `fxWarnings` to the performance response.
- **Dependencies:** Step 3, Step 4
- **Key notes:** Additive and optional.
- **Acceptance criteria:** REQ-004
- **Verify:** `npm run test:common`, `npm run test:api`

### Step 15: libs/ui/src/lib/fx-rate-warning/fx-rate-warning.component.ts (new) [COMP-014]

- **Purpose:** Standalone `OnPush` presenter, selector `gf-fx-rate-warning`, input `fxWarnings`.
- **Dependencies:** Step 3
- **Key notes:** Follow the structure of `libs/ui/src/lib/currency-selector`. No HTTP, no state. Strings via `$localize`. The `@ghostfolio/ui/*` path alias is a wildcard (`libs/ui/src/lib/*`), so no tsconfig change is needed.
- **Acceptance criteria:** REQ-004, AC-004a, AC-004b
- **Verify:** `npm run test:ui`, `npm run lint`

### Step 16: libs/ui/src/lib/fx-rate-warning/fx-rate-warning.component.html (new) [COMP-014]

- **Purpose:** Template listing estimated and missing rates with pair and date.
- **Dependencies:** Step 15
- **Key notes:** Accessible (MISS-003): status role or live region, meaning conveyed by text and not colour alone, keyboard-focusable details, no markup when `fxWarnings` is empty or absent. Render only pair and date (no amounts).
- **Acceptance criteria:** AC-004a, AC-004b, AC-009a
- **Verify:** `npm run lint`

### Step 17: libs/ui/src/lib/fx-rate-warning/fx-rate-warning.component.scss (new) [COMP-014]

- **Purpose:** Minimal styling using existing theme variables.
- **Dependencies:** Step 15
- **Key notes:** Reuse existing design tokens; ensure sufficient contrast in light and dark themes.
- **Acceptance criteria:** REQ-004
- **Verify:** `npm run lint`

### Step 18: libs/ui/src/lib/fx-rate-warning/index.ts (new) [COMP-014]

- **Purpose:** Barrel export (`export * from './fx-rate-warning.component'` in the repo's style).
- **Dependencies:** Step 15
- **Key notes:** Copy the pattern from `libs/ui/src/lib/currency-selector/index.ts`.
- **Acceptance criteria:** REQ-004
- **Verify:** `npm run test:ui`

---

### Wave 2 (depends on Waves 0 and 1)

---

### Step 19: apps/api/src/services/exchange-rate-data/exchange-rate-data.service.ts (modify) [COMP-006]

- **Purpose:** Add `getExchangeRatesByCurrencyWithStatus` and `isHistoricalFxEnabled`.
- **Dependencies:** Steps 5, 8, 10
- **Key notes (condition C-2):** Leave the existing four constructor parameters in place and **append an optional trailing parameter** for `ExchangeRateStoreService` (Nest optional injection) so the 36 specs calling `new ExchangeRateDataService(null, null, null, null)` still compile. Do not change `getExchangeRatesByCurrency`, `toCurrency`, `toCurrencyAtDate` or `initialize`. `isHistoricalFxEnabled(userId)` reads `Settings.settings.isExperimentalFeatures` through `PrismaService`; it must never throw: a missing user, a null Prisma service (as in specs) or a query error returns false and logs a warning. The status-aware method reads the store and `MarketData` for the needed legs in two queries, calls the resolver, falls back to `MarketData` only if the store read fails (or is absent), and reports MISSING rather than converting 1:1. Use the date-key function from Step 8 (C-4).
- **Acceptance criteria:** REQ-002, REQ-004, REQ-007, REQ-008, REQ-009, AC-002a, AC-002b, AC-004b, AC-008, AC-009a
- **Verify:** `npm run test:api` (the 36 constructing specs must pass unmodified)

### Step 20: apps/api/src/services/exchange-rate-data/exchange-rate-data.service.spec.ts (new) [COMP-006]

- **Purpose:** First spec for this service (none exists today).
- **Dependencies:** Step 19
- **Key notes:** Flag on and off; null Prisma returns false; store failure falls back to `MarketData`; both failing yields MISSING, never 1; existing `toCurrency` behaviour untouched (a regression guard for the current fallback). Include the AC-008 synthetic performance case here or in Step 26: 500 holdings across USD, EUR, GBP and CHF with the store and `MarketData` mocked, p95 under 2 s.
- **Acceptance criteria:** AC-002b, AC-004b, AC-008, AC-009a, AC-009b
- **Verify:** `npx dotenv-cli -e .env.example -- nx run api:test --test-file exchange-rate-data.service.spec.ts`

### Step 21: apps/api/src/services/exchange-rate-data/exchange-rate-data.module.ts (modify) [COMP-007]

- **Purpose:** Provide and export `ExchangeRateStoreService`.
- **Dependencies:** Step 8
- **Key notes:** Add the provider and export; `PrismaModule` is already imported. `DataGatheringQueueModule` already imports this module, so it needs no change.
- **Acceptance criteria:** REQ-001, REQ-006
- **Verify:** `npm run test:api`

### Step 22: apps/api/src/services/queues/data-gathering/data-gathering.processor.ts (modify) [COMP-012]

- **Purpose:** Mirror observed FX closes into the store after the market-data write.
- **Dependencies:** Steps 8, 21
- **Key notes (conditions C-2, C-3):** The two existing specs construct the processor with four positional arguments, so append `ExchangeRateStoreService` and `ExchangeRateDataService` as **optional trailing parameters**. After the `replaceForSymbol` / `updateMany` branch (about lines 148 to 156), when the store is present and the symbol is one of `exchangeRateDataService.getCurrencyPairs()` with the exchange-rate data source, call `upsertObserved` with only rows whose `isCarriedForward` is false (`currencyFrom` is `DEFAULT_CURRENCY`, `currencyTo` is the remainder of the symbol). Wrap the sync in its own try/catch: log pair and counts only and **never rethrow** (the `MarketData` write already succeeded). The existing "gather max" action therefore backfills history (REQ-006) and re-runs are idempotent.
- **Acceptance criteria:** REQ-006, REQ-010, AC-006a, AC-006b, EC-001
- **Verify:** `npx dotenv-cli -e .env.example -- nx run api:test --test-file data-gathering.processor.spec.ts` and `data-gathering.processor.time-zone.spec.ts`

### Step 23: apps/api/src/services/queues/data-gathering/data-gathering.processor.spec.ts (modify) [COMP-012]

- **Purpose:** Extend with sync tests, leaving existing tests and the constructor call untouched.
- **Dependencies:** Step 22
- **Key notes:** Add cases in new `describe` blocks constructing the processor with the extra arguments: mirrors only non-carried-forward rows; running twice leaves one row per day; a store error is logged and the job still completes; non-FX symbols are not mirrored; a new user with no activities causes no store call.
- **Acceptance criteria:** AC-006a, AC-006b, EC-001
- **Verify:** `npx dotenv-cli -e .env.example -- nx run api:test --test-file data-gathering.processor.spec.ts`

---

### Wave 3 (depends on Wave 2)

---

### Step 24: apps/api/src/services/exchange-rate-data/exchange-rate-data.service.mock.ts (modify) [COMP-016]

- **Purpose:** Keep the 8 specs that use the `Partial` mock working and support new calculator specs.
- **Dependencies:** Step 19
- **Key notes (condition C-2):** Add `isHistoricalFxEnabled` returning `Promise.resolve(false)` by default and `getExchangeRatesByCurrencyWithStatus` returning deterministic rates with empty `estimatedDates` and `missingDates`. Do not change the existing `getExchangeRatesByCurrency` data.
- **Acceptance criteria:** REQ-009, AC-009a
- **Verify:** `npm run test:api`

### Step 25: apps/api/src/app/portfolio/calculator/portfolio-calculator.ts (modify) [COMP-008]

- **Purpose:** Select the rate path by flag, exclude holdings with a missing rate, and return capped `fxWarnings`.
- **Dependencies:** Steps 12, 19
- **Key notes (conditions C-1, C-2):** Resolve the flag once per calculation at the rate-fetch site (about line 311, ARCH-006). Flag off: the existing call, unchanged. Flag on: call `getExchangeRatesByCurrencyWithStatus`. Compute the holdings whose pair is MISSING on any relevant date (an activity date of that holding, or the end date). For each such holding, **before the position loop work at about line 413**, push it to `errors` (declared about line 388), record MISSING warnings, and `continue` so it is never pushed to `positions`, never added to `valuesByAssetProfileIdentifier`, and contributes nothing to current value, investment or chart series; do not rely on `hasErrors` alone, which only nulls performance fields. Record ESTIMATED warnings for relevant dates only (activity dates and the end date), de-duplicated by pair, date and type, sorted by date and capped at 100. Return `fxWarnings` with `errors` in the object returned at about lines 746 to 755. No new `?? 1` in the new path. Targeted edits only.
- **Acceptance criteria:** REQ-003, REQ-004, REQ-009, AC-003a, AC-003b, AC-004a, AC-004b, AC-009a, AC-009b
- **Verify:** `npm run test:api` (all existing calculator specs must pass unchanged)

### Step 26: apps/api/src/app/portfolio/calculator/roai/portfolio-calculator-fx-multi-currency.spec.ts (new) [COMP-008]

- **Purpose:** Flag-on calculator tests and the flag-off parity proof.
- **Dependencies:** Steps 24, 25
- **Key notes:** Follow an existing ROAI spec (for example `portfolio-calculator-btceur.spec.ts`) for setup. Cases: a EUR buy investment equals quantity x price x rate on the activity date (AC-003a); a later EUR/USD move leaves investment unchanged while current value follows the latest rate (AC-003b); Saturday activity flagged ESTIMATED with Friday's rate (AC-004a); a pair with no rate excludes the holding and **the totals assert it contributes nothing** (C-1, AC-004b); base currency change to CHF recomputes values (AC-005a); flag off equals today's output (AC-009a); capped, de-duplicated warnings; an invalid base currency test uses `ZZZ`.
- **Acceptance criteria:** AC-003a, AC-003b, AC-004a, AC-004b, AC-005a, AC-005b, AC-009a, AC-009b
- **Verify:** `npx dotenv-cli -e .env.example -- nx run api:test --test-file portfolio-calculator-fx-multi-currency.spec.ts`

---

### Wave 4 (depends on Wave 3)

---

### Step 27: apps/api/src/app/portfolio/portfolio.service.ts (modify) [COMP-010]

- **Purpose:** Pass `fxWarnings` through `getDetails` (about line 900) and `getPerformance` (about line 1273).
- **Dependencies:** Steps 12, 13, 14, 25
- **Key notes:** Add the field next to the existing `hasErrors` in both returned objects. Do not touch the four `createCalculator` call sites. Check `portfolio.service.spec.ts` still passes (it constructs `ExchangeRateDataService` positionally).
- **Acceptance criteria:** REQ-004, AC-004a, AC-004b
- **Verify:** `npx dotenv-cli -e .env.example -- nx run api:test --test-file portfolio.service.spec.ts`, then `npm run test:api`

### Step 28: apps/client/src/app/pages/portfolio/analysis/analysis-page.component.ts (modify) [COMP-015]

- **Purpose:** Hold `fxWarnings` from the performance response (consumed at about lines 323 and 354) and import `GfFxRateWarningComponent`.
- **Dependencies:** Steps 14, 18
- **Key notes:** Additive field and component import only. No new HTTP call; `DataService.fetchPortfolioPerformance` already returns the response type, which now carries the optional field.
- **Acceptance criteria:** AC-004a, AC-004b
- **Verify:** client build (`npx nx build client`; confirm the target name in `apps/client/project.json`), `npm run lint`

### Step 29: apps/client/src/app/pages/portfolio/analysis/analysis-page.html (modify) [COMP-015]

- **Purpose:** Render `<gf-fx-rate-warning>` near the performance summary.
- **Dependencies:** Step 28
- **Key notes:** Single element, rendered only when warnings exist. Do not run `npm run extract-locales` (it rewrites many generated locale files; leave extraction to the user, as in SCRUM-64). Try the page in a browser if possible; if not, state that explicitly in the manifest.
- **Acceptance criteria:** AC-004a, AC-004b, AC-009a
- **Verify:** client build, `npm run lint`

## Wave Plan

| Wave | Files (steps)                                                                                                             | Dependencies Satisfied            | Test Command                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------ |
| 0    | schema (1), warning type (3), barrel (4), exchange-rate-data interface (5), user.controller (6), user.controller.spec (7) | Step 0 confirmed for step 1       | `npm run test:common`, `npm run test:api`                    |
| 1    | migration (2), store (8, 9), resolver (10, 11), snapshot model (12), response types (13, 14), presenter (15 to 18)        | Wave 0; Prisma client regenerated | `npm run test:api`, `npm run test:common`, `npm run test:ui` |
| 2    | data service (19, 20), module (21), processor (22, 23)                                                                    | Waves 0 and 1                     | `npm run test:api` (36 constructing specs unchanged)         |
| 3    | mock (24), calculator (25, 26)                                                                                            | Wave 2                            | `npm run test:api`                                           |
| 4    | portfolio.service (27), analysis page (28, 29)                                                                            | Wave 3                            | `npm run test:api`, client build, `npm run lint`             |

Step 2 appears in Wave 1 (it depends on Step 1) and is written but never applied by the agent.

## Risks

| Risk                                                  | Impact                                               | Mitigation                                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| User does not confirm the migration                   | REQ-001 and REQ-006 cannot be met                    | Step 0 stops and reports; do not silently drop the table                                           |
| Prisma client not regenerated                         | Store does not compile                               | Run `npm run database:generate-typings` after Step 1                                               |
| New required constructor parameters                   | 36 spec files plus 2 processor specs fail to compile | Optional trailing parameters only (C-2); run the full suite after Steps 19 and 22                  |
| `portfolio-calculator.ts` is about 2,400 lines        | Accidental regressions or noisy diffs                | Targeted edits only; flag-off path untouched; run all calculator specs after Step 25               |
| `hasErrors` alone leaves a 1:1 amount in totals       | Wrong totals, AC-004b broken                         | Remove the holding entirely and assert totals in Step 26 (C-1)                                     |
| Sync failure fails FX jobs                            | Queue noise, repeated retries                        | Catch and log, never rethrow; migration before code (C-3)                                          |
| Date keys differ between stores or time zones         | One-day rate shifts on non-UTC servers               | Single date-key function and a non-UTC test (C-4)                                                  |
| Stale cached snapshots after flag toggle or new rates | Mixed or outdated numbers                            | Flag toggle emits the portfolio-changed event (Step 6); admin cache reset documented for new rates |
| Flag-on values for gap dates differ from today's      | Users notice shifted history                         | Intended (F-003); documented in the PR; flag off is identical                                      |
| `extract-locales` rewrites generated files            | Noisy diff (SCRUM-64 R-004)                          | Do not run it; leave to the user                                                                   |
| Working tree has unrelated changes                    | Wrong files staged                                   | Note `package-lock.json` and untracked tooling in the baseline; stage files by name                |

## Edge Cases (from problem_spec)

| ID     | Scenario                                 | Expected Behavior                                            |
| ------ | ---------------------------------------- | ------------------------------------------------------------ |
| EC-001 | New user with no activities              | No rate fetch or store call, no error                        |
| EC-002 | Activity on a weekend or holiday         | Previous available rate, flagged ESTIMATED                   |
| EC-003 | Activity dated before any available rate | Holding excluded with a MISSING warning naming pair and date |
| EC-004 | Same-currency conversion                 | Factor 1, no lookup                                          |
| EC-005 | Derived currency GBp                     | Existing factor handling retained                            |
| EC-006 | Provider value of 0, negative or NaN     | Rejected and not stored                                      |

## QA Test Plan Coverage

`ph3b_qa_test_plan.md` defines 60 test cases (41 in the regression subset) across all 19 ACs. Status is plan-only: no Jira or Zephyr issues were created and no QA automation PR exists, because no QA automation repo is configured. The unit and integration tests in Steps 7, 9, 11, 20, 23 and 26 implement the API and calculator-level cases; only 4 cases are UI-layer and need manual or later Playwright coverage. The QA matrix is the checklist for the verification phase.

## Post-Implementation Checklist

- [ ] Step 0 answered explicitly by the user before any schema or migration file is written
- [ ] All tests pass with no regressions from the recorded baseline (api, common, ui) and lint is clean
- [ ] The 36 specs that construct `ExchangeRateDataService` and the 2 processor specs pass without changes to their constructor calls
- [ ] Flag-off parity confirmed (existing calculator specs unchanged)
- [ ] AC-004b test asserts excluded holdings contribute nothing to totals
- [ ] No amounts, quantities or per-user values in log statements; no PII
- [ ] `ph5_6_impl_manifest.md` written with accurate file lists, baseline and final counts, and any known conflicts
- [ ] User reminded to run `npm run database:migrate` before deploying, and that locale files were not regenerated
- [ ] Only intended files staged; `package-lock.json` and tooling folders excluded

## Plan Deviations (Phase 5)

Recorded during implementation. Items marked "user" were decided by the user; the rest are small adaptations that stay inside the plan's intent.

| #   | Deviation                                                                                                                                                                                                         | Reason                                                                                                                                                                                               | Decided by |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | Step 0 answered: the additive migration is authorized. The SQL was generated with `prisma migrate diff` (schema to schema, no database connection) instead of written by hand, and is never applied by the agent. | Exact SQL that matches Prisma's own output                                                                                                                                                           | user       |
| 2   | Work is on a new branch `SCRUM-65-fx-normalization` created from `main`, not on the checked-out SCRUM-64 branch.                                                                                                  | Keep the SCRUM-65 pull request free of SCRUM-64 changes                                                                                                                                              | user       |
| 3   | Approval pace is per wave (Step 1 was reviewed on its own) instead of per file. Files are still written and tested one at a time.                                                                                 | Fewer prompts                                                                                                                                                                                        | user       |
| 4   | Added `apps/api/src/app/portfolio/portfolio.controller.ts` (Step 27b) and `portfolio.controller.spec.ts`.                                                                                                         | The details endpoint rebuilds its response from a fixed field list and would drop `fxWarnings`. Warnings reveal a transaction date and currency, so both endpoints omit them when values are hidden. | user       |
| 5   | Added `exchange-rate-resolver.time-zone.spec.ts` (3 tests in `America/New_York`).                                                                                                                                 | Condition C-4; the repo's custom time-zone Jest environment requires a separate file                                                                                                                 | agent      |
| 6   | Added `libs/ui/src/lib/fx-rate-warning/fx-rate-warning.component.spec.ts` (8 tests).                                                                                                                              | The UI could not be run in a browser, so the notice is covered by component tests                                                                                                                    | agent      |
| 7   | The data service reads rates from 30 days before the range start (`EXCHANGE_RATE_LOOKBACK_IN_DAYS`).                                                                                                              | A carried-forward rate can come from before the range; the plan did not fix a window                                                                                                                 | agent      |
| 8   | The resolver's 10-year test no longer asserts wall-clock time. The 500-holding calculator test keeps only a loose 15 s guard; the measured time was about 307 ms.                                                 | One timing assertion failed once under parallel load                                                                                                                                                 | agent      |
| 9   | Steps 3 to 5 and 12 to 14 are type-only files and were verified by type-checking and the existing suites, not by their own tests.                                                                                 | Nothing executable to test                                                                                                                                                                           | agent      |
| 10  | The data service spec also asserts the dependency-injection metadata (the store is the fifth, optional parameter).                                                                                                | Unit tests alone would not prove the Nest wiring                                                                                                                                                     | agent      |

## Pipeline Continuation

**CRITICAL: This implementation is part of the SDLC pipeline for SCRUM-65.**
After implementation completes, the pipeline MUST continue through:

- Phase 6: Simplify
- Phase 7: Review
- Phase 8: Verification
- Phase 9: Risk Assessment
- Phase 10: PR Creation

**DO NOT skip phases 6-10. DO NOT jump directly to PR creation.**

Resume command: `/sdlc-pipeline --ticket=SCRUM-65 --resume`
