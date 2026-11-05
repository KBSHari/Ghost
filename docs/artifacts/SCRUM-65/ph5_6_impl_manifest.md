# Implementation Manifest: SCRUM-65

## Summary

- Files created: 16 (8 source, 8 test)
- Files modified: 18 (16 source, 2 test), not counting a pre-existing `package-lock.json` change that is not part of this work
- Total lines added: about 3183
- Branch: `SCRUM-65-fx-normalization`, created from `main` (merge base `c9e8b091c`); nothing committed or pushed
- Review mode: per wave (Waves 0-4), accepted by the user. Step 1 (schema) was reviewed on its own.
- Plan deviations (recorded in `ph4_implementation_plan.md` under "Plan Deviations (Phase 5)"): `portfolio.controller.ts` and its spec added (user approved); a time-zone spec for the resolver and a component spec for the notice added; branch created from `main` instead of the SCRUM-64 branch (user chose); approval pace changed from per file to per wave (user chose)
- Migration: the SQL file is written and valid but was never applied to any database

## Baseline Test Counts

| Repo                | Pass               | Fail |
| ------------------- | ------------------ | ---- |
| ghostfolio / api    | 560 (83 suites)    | 0    |
| ghostfolio / common | 178 (4 suites)     | 0    |
| ghostfolio / ui     | 6 (2 suites)       | 0    |
| lint                | clean (4 projects) | 0    |

Measured on `SCRUM-65-fx-normalization` before the first change, with the Nx cache bypassed.

## Final Test Counts

| Repo                | Pass                                                                                                | Fail |
| ------------------- | --------------------------------------------------------------------------------------------------- | ---- |
| ghostfolio / api    | 669 (90 suites), 1 snapshot (658 at the end of Phase 5; 11 tests added by the Phase 7 review fixes) | 0    |
| ghostfolio / common | 178 (4 suites)                                                                                      | 0    |
| ghostfolio / ui     | 14 (3 suites)                                                                                       | 0    |
| lint                | clean, 0 errors (4 projects)                                                                        | 0    |

Also verified: `prisma validate` passes; `nx build client --configuration=development-en` succeeds (AOT, so the new template and the analysis-page wiring compile); `tsc --noEmit` on the API app project reports 0 errors; Prettier reports no issues on all touched code files. All 36 existing calculator suites and the 2 existing data-gathering processor suites pass without any change to their constructor calls (flag-off parity). Measured: 500 holdings in 4 currencies are valued in about 307 ms with providers mocked.

## Files Created

| Path                                                                      | Component | Lines Added |
| ------------------------------------------------------------------------- | --------- | ----------- |
| `apps/api/src/services/exchange-rate-data/exchange-rate-resolver.ts`      | COMP-005  | 360         |
| `apps/api/src/services/exchange-rate-data/exchange-rate-store.service.ts` | COMP-004  | 117         |
| `libs/common/src/lib/interfaces/exchange-rate-warning.interface.ts`       | COMP-003  | 6           |
| `libs/ui/src/lib/fx-rate-warning/fx-rate-warning.component.html`          | COMP-014  | 44          |
| `libs/ui/src/lib/fx-rate-warning/fx-rate-warning.component.scss`          | COMP-014  | 18          |
| `libs/ui/src/lib/fx-rate-warning/fx-rate-warning.component.ts`            | COMP-014  | 33          |
| `libs/ui/src/lib/fx-rate-warning/index.ts`                                | COMP-014  | 1           |
| `prisma/migrations/20261105000000_added_exchange_rate/migration.sql`      | COMP-002  | 19          |

## Files Modified

| Path                                                                                   | Component | Lines Changed |
| -------------------------------------------------------------------------------------- | --------- | ------------- |
| `apps/api/src/app/portfolio/calculator/portfolio-calculator.ts`                        | COMP-008  | +139 / -3     |
| `apps/api/src/app/portfolio/portfolio.controller.ts`                                   | COMP-010  | +9 / -0       |
| `apps/api/src/app/portfolio/portfolio.service.ts`                                      | COMP-010  | +10 / -3      |
| `apps/api/src/app/user/user.controller.ts`                                             | COMP-013  | +2 / -1       |
| `apps/api/src/services/exchange-rate-data/exchange-rate-data.module.ts`                | COMP-007  | +3 / -2       |
| `apps/api/src/services/exchange-rate-data/exchange-rate-data.service.mock.ts`          | COMP-016  | +11 / -0      |
| `apps/api/src/services/exchange-rate-data/exchange-rate-data.service.ts`               | COMP-006  | +146 / -4     |
| `apps/api/src/services/exchange-rate-data/interfaces/exchange-rate-data.interface.ts`  | COMP-003  | +6 / -0       |
| `apps/api/src/services/queues/data-gathering/data-gathering.processor.ts`              | COMP-012  | +63 / -2      |
| `apps/client/src/app/pages/portfolio/analysis/analysis-page.component.ts`              | COMP-015  | +6 / -1       |
| `apps/client/src/app/pages/portfolio/analysis/analysis-page.html`                      | COMP-015  | +1 / -0       |
| `libs/common/src/lib/interfaces/index.ts`                                              | COMP-003  | +2 / -0       |
| `libs/common/src/lib/interfaces/portfolio-details.interface.ts`                        | COMP-011  | +2 / -0       |
| `libs/common/src/lib/interfaces/responses/portfolio-performance-response.interface.ts` | COMP-011  | +2 / -0       |
| `libs/common/src/lib/models/portfolio-snapshot.ts`                                     | COMP-009  | +3 / -0       |
| `prisma/schema.prisma`                                                                 | COMP-001  | +14 / -0      |

## Test Files

| Path                                                                                              | Tests Component | Lines     |
| ------------------------------------------------------------------------------------------------- | --------------- | --------- |
| `apps/api/src/app/portfolio/calculator/roai/portfolio-calculator-fx-multi-currency.spec.ts` (new) | COMP-008        | 574       |
| `apps/api/src/app/portfolio/portfolio.controller.spec.ts` (new)                                   | COMP-010        | 152       |
| `apps/api/src/app/user/user.controller.spec.ts` (new)                                             | COMP-013        | 77        |
| `apps/api/src/services/exchange-rate-data/exchange-rate-data.service.spec.ts` (new)               | COMP-006        | 341       |
| `apps/api/src/services/exchange-rate-data/exchange-rate-resolver.spec.ts` (new)                   | COMP-005        | 421       |
| `apps/api/src/services/exchange-rate-data/exchange-rate-resolver.time-zone.spec.ts` (new)         | COMP-005        | 83        |
| `apps/api/src/services/exchange-rate-data/exchange-rate-store.service.spec.ts` (new)              | COMP-004        | 220       |
| `libs/ui/src/lib/fx-rate-warning/fx-rate-warning.component.spec.ts` (new)                         | COMP-014        | 115       |
| `apps/api/src/services/queues/data-gathering/data-gathering.processor.spec.ts` (extended)         | COMP-012        | +183 / -0 |
| `apps/api/src/app/portfolio/portfolio.service.spec.ts` (extended in Phase 7)                      | COMP-010        | +88 / -0  |

## Known Conflicts

None. No Figma design is involved in this ticket.

## Known Dependencies / Open Items

- **Apply the migration before deploying.** Run `npm run database:migrate` for `20261105000000_added_exchange_rate`. The data-gathering sync swallows its own errors, so deploying code first does not break gathering, but the table stays empty until the migration is applied.
- **Populate the table.** After the migration, run the existing "gather max" action once from the admin area. It re-gathers FX history back to the earliest activity (or 10 years) and the new sync mirrors the observed closes. Re-running is idempotent.
- **The behaviour is behind `isExperimentalFeatures`.** With the flag off nothing changes: results are identical, no `fxWarnings` field is added, and the legacy rate lookup is used.
- **User interface not exercised in a browser.** The notice is covered by 8 component tests and an AOT build only. A manual smoke test with a EUR or GBP activity on a weekend is recommended before enabling the flag for users.
- **Translations not extracted.** `npm run extract-locales` was not run (it rewrites many generated files). The notice strings use `i18n` and appear in English until extracted.
- **`toCurrency` is unchanged (F-001).** It is synchronous, has no user or date context, and has 14 call sites in 7 files, so it can still return an unconverted amount when no rate exists. The "never convert at 1" guarantee covers the portfolio calculator (snapshots, performance, details) only.
- **A holding without a usable rate is excluded as a whole (F-004).** It is listed in `errors`, `hasErrors` becomes true, and a MISSING warning names the pair and date.
- **Look-back limit.** The data service reads rates from 30 days before the range start. A gap longer than that before the range is reported as missing even if an older rate exists. In practice the gatherer writes a row for every day, so this should be rare.
- **Today's rate (F-006).** The latest rate is not flagged as estimated for today when it is at most 5 days old (`EXCHANGE_RATE_TODAY_STALENESS_IN_DAYS`).
- **Manual corrections (F-005).** An admin edit of an FX row in `MarketData` is not copied to the new table, and the new table wins on a conflict for the same pair and date.
- **Cache behaviour.** Changing `isExperimentalFeatures` or `baseCurrency` clears the user's cached snapshots. New rates that arrive later do not (existing behaviour for `MarketData`); the admin cache reset applies.
- **Warnings reveal a currency and a date**, so they are omitted from the details and performance responses for restricted views, without the value scope, and in ZEN mode.
- **Not part of this work:** the `package-lock.json` change in the working tree and the untracked tooling folders (`.claude`, `client`, `config`, `docs`, `hooks`, `scripts`, `skills`, `.codebase-index`) must not be staged. `tsc` on `libs/common` reports one error in `create-asset-profile-with-market-data.dto.ts`, a file this work does not touch (not checked against `main`).

## Simplification

Files reviewed: 33 | Files modified: 3 | Behaviour changes: none

| File                                                                          | Changes                                                                                                                                                                                                                                                                                                                                                                                                                  | Skipped                                                                                                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/services/exchange-rate-data/exchange-rate-resolver.ts`          | Un-exported `getExchangeRateDateString` (used only inside the file; verified by a repo-wide search). Removed the `todayString` parameter from four functions, because it was always derived from `today`; it is now computed once inside `resolveLeg`. Extracted a `direct` constant in `getLegEntries` instead of building the same key twice. Simplified the exact-date lookup in `resolveLeg` with optional chaining. | Kept the overflow guard in the cross-rate calculation: it is practically unreachable, but removing it would change the result for pathological inputs |
| `apps/api/src/app/portfolio/calculator/portfolio-calculator.ts`               | In `getExchangeRateWarnings`, replaced the two-pass `isExcluded` / `continue` logic and the duplicated warning object literal with one `getWarnings` helper. The output is identical: an excluded holding records only its MISSING dates, any other holding records its ESTIMATED dates. The diff against the original is now 136 insertions and the same 3 deletions.                                                   | —                                                                                                                                                     |
| `apps/api/src/services/exchange-rate-data/exchange-rate-data.service.spec.ts` | Extracted a `usdEurMarketData` constant that replaced three identical 7-line market-data blocks                                                                                                                                                                                                                                                                                                                          | The fourth block uses a different symbol and stays as it is                                                                                           |

Checked and left alone:

- No unused locals, parameters or imports in any changed file (`tsc --noUnusedLocals --noUnusedParameters` reports none for them).
- The two near-identical `<details>` blocks in `fx-rate-warning.component.html`: merging them needs a parameterised `ng-template` plus per-case translated text, which is harder to read than the repetition.
- `canReadValues` in `portfolio.controller.ts` repeats a condition that exists inline elsewhere in that controller; refactoring the existing code is outside this change.
- The `as any` casts in spec mocks follow the pattern used by the repo's existing specs.
- Generated migration SQL, which is not hand-edited.
