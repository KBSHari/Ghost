# Verification Report: SCRUM-65

## Meta

- **Ticket:** SCRUM-65 (FEAT-0002), Multi-Currency FX Conversion & Base Currency Normalization
- **Date:** 2026-11-06
- **Verifier:** Claude Code (sdlc-verification), run inline in the main session because the sub-agents were stopped during the review phase
- **Branch:** `SCRUM-65-fx-normalization` (from `main`), nothing committed
- **Inputs:** `ph1_problem_spec.md`, `ph2_design_spec.md`, `ph3_design_review.md`, `ph5_6_impl_manifest.md`, `ph7_review_summary.md`, `.state/artifact-digest.md`. The optional `test_report.json` and `security_audit.json` do not exist (the Phase 7 agents never reported), so every analysis below was performed directly.

## Summary

- **Status:** `passed`
- **Score:** 97/100 (requirement coverage 57/60, test pass rate 40/40, wiring deductions 0)
- **Blocking issues:** 0
- **Acceptance criteria:** 18 of 19 passed, 1 partially covered (AC-006b)
- **Requirements:** 9 of 10 fully covered, 1 partially covered (REQ-006, P1)
- **Tests:** 861 of 861 passed (api 669, common 178, ui 14), 0 failed, 0 skipped
- **Edge cases:** 6 of 6 tested (EC-001 indirectly)
- **Wiring:** 16 of 16 components exist, are substantive and are wired

Not verified and therefore worth knowing about before a release (none blocks the pull request):

- **No real database.** The store, the upsert and the migration were tested against mocked Prisma. Idempotence relies on the unique key and on Prisma's upsert semantics.
- **No browser.** The warning notice is covered by 8 component tests and an AOT build; it has not been seen on a page.
- **AC-006b** is covered only for a failure in the sync stage, not for the stated trigger (the data provider failing mid-run).

## Requirement Coverage

### Per requirement

| Req     | Priority | Description                                                                      | Implementation                                                                        | Status            |
| ------- | -------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------- |
| REQ-001 | P0       | Persist daily close FX rates in a Prisma table, unique per pair, date and source | prisma/schema.prisma:167, exchange-rate-store.service.ts, migration.sql               | fully covered     |
| REQ-002 | P0       | Resolve from stored rates, fall back to MarketData, values unchanged             | exchange-rate-resolver.ts, exchange-rate-data.service.ts:151                          | fully covered     |
| REQ-003 | P0       | Convert at the activity-date rate, current value at the latest rate              | portfolio-calculator.ts (existing series, now complete)                               | fully covered     |
| REQ-004 | P0       | Carry forward and flag, never 1:1, exclude and warn                              | exchange-rate-resolver.ts:204, portfolio-calculator.ts:443, fx-rate-warning component | fully covered     |
| REQ-005 | P0       | Base currency per user, validated, recalculates                                  | user.controller.ts:224, existing DTO validator                                        | fully covered     |
| REQ-006 | P1       | Backfill through the gathering job, idempotently                                 | data-gathering.processor.ts:165,199                                                   | partially covered |
| REQ-007 | P0       | USD, EUR, GBP, CHF including cross pairs                                         | exchange-rate-resolver.ts (triangulation through USD)                                 | fully covered     |
| REQ-008 | P1       | 500 holdings across 4 currencies within 2 s                                      | resolver and data service; measured about 307 ms                                      | fully covered     |
| REQ-009 | P0       | Gated by isExperimentalFeatures; off means identical                             | portfolio-calculator.ts:317, exchange-rate-data.service.ts:288                        | fully covered     |
| REQ-010 | P0       | No personal data, writes only through gathering, no amounts in logs              | no new route; data-gathering.processor.ts:199; portfolio.controller.ts:216,534        | fully covered     |

### Per acceptance criterion

| AC      | Req     | Status            | Evidence (test file:line)                                                                                  |
| ------- | ------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| AC-001a | REQ-001 | passed            | `exchange-rate-store.service.spec.ts:96`                                                                   |
| AC-001b | REQ-001 | passed            | `exchange-rate-store.service.spec.ts:46`; `exchange-rate-store.service.spec.ts:61`                         |
| AC-002a | REQ-002 | passed            | `exchange-rate-resolver.spec.ts:46`; `exchange-rate-data.service.spec.ts:166`                              |
| AC-002b | REQ-002 | passed            | `exchange-rate-data.service.spec.ts:202`; `exchange-rate-data.service.spec.ts:298`                         |
| AC-003a | REQ-003 | passed            | `portfolio-calculator-fx-multi-currency.spec.ts:197`                                                       |
| AC-003b | REQ-003 | passed            | `portfolio-calculator-fx-multi-currency.spec.ts:229`                                                       |
| AC-004a | REQ-004 | passed            | `exchange-rate-resolver.spec.ts:111`; `portfolio-calculator-fx-multi-currency.spec.ts:266`                 |
| AC-004b | REQ-004 | passed            | `portfolio-calculator-fx-multi-currency.spec.ts:298`; `exchange-rate-resolver.spec.ts:152`                 |
| AC-005a | REQ-005 | passed            | `portfolio-calculator-fx-multi-currency.spec.ts:430`; `user.controller.spec.ts:33`                         |
| AC-005b | REQ-005 | passed            | `portfolio-calculator-fx-multi-currency.spec.ts:513`                                                       |
| AC-006a | REQ-006 | passed            | `data-gathering.processor.spec.ts:427`; `data-gathering.processor.spec.ts:300`                             |
| AC-006b | REQ-006 | partially covered | `data-gathering.processor.spec.ts:397`                                                                     |
| AC-007a | REQ-007 | passed            | `exchange-rate-resolver.spec.ts:186`; `exchange-rate-data.service.spec.ts:268`                             |
| AC-007b | REQ-007 | passed            | `exchange-rate-resolver.spec.ts:220`                                                                       |
| AC-008  | REQ-008 | passed            | `portfolio-calculator-fx-multi-currency.spec.ts:534`                                                       |
| AC-009a | REQ-009 | passed            | `portfolio-calculator-fx-multi-currency.spec.ts:464`; `portfolio-calculator-fx-multi-currency.spec.ts:484` |
| AC-009b | REQ-009 | passed            | `portfolio-calculator-fx-multi-currency.spec.ts:197`; `exchange-rate-data.service.spec.ts:61`              |
| AC-010a | REQ-010 | passed            | `exchange-rate-data.service.spec.ts:370`; `portfolio.controller.spec.ts:83`                                |
| AC-010b | REQ-010 | passed            | `exchange-rate-store.service.spec.ts:152`; `data-gathering.processor.spec.ts:397`                          |

Notes on evidence quality:

- AC-001a and AC-006a check that the same unique key is used on a second write, with a mocked database; the one-row-per-day outcome itself is the database's unique-index behaviour.
- AC-006b: the cited test proves that a failure in the sync stage is logged without the underlying error text and does not fail the job, with the market data already written. It does not exercise a failing data provider; that trigger throws before anything is written, so no partial rows are possible, but it is not asserted. Counted as partially covered.
- AC-008 asserts only a loose 15 s guard to avoid a timing-flaky test; the 2 s budget was met by measurement (about 307 ms for 500 holdings in 4 currencies, providers mocked).
- AC-010a holds because no write route exists; the test checks that neither service is a controller and no method is an HTTP route, and a search of the diff found no new route, DTO or permission.

## Wiring Verification

All 16 design components were checked at three levels. No component is missing, a stub, or unused.

| Component | File                                                        | Substantive | Wired                                                                                                                                                                     |
| --------- | ----------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| COMP-001  | `prisma/schema.prisma`                                      | yes         | `prisma.exchangeRate` used by the store                                                                                                                                   |
| COMP-002  | `migration.sql`                                             | yes         | entry point, applied by the user                                                                                                                                          |
| COMP-003  | `exchange-rate-warning.interface.ts`, `interfaces/index.ts` | yes         | used by 7 files                                                                                                                                                           |
| COMP-004  | `exchange-rate-store.service.ts`                            | yes         | imported by 3 files                                                                                                                                                       |
| COMP-005  | `exchange-rate-resolver.ts`                                 | yes         | imported by the data service                                                                                                                                              |
| COMP-006  | `exchange-rate-data.service.ts`                             | yes         | called by the calculator                                                                                                                                                  |
| COMP-007  | `exchange-rate-data.module.ts`                              | yes         | imported by 15 files, exports the store                                                                                                                                   |
| COMP-008  | `portfolio-calculator.ts`                                   | yes         | existing core class                                                                                                                                                       |
| COMP-009  | `portfolio-snapshot.ts`                                     | yes         | returned by the calculator                                                                                                                                                |
| COMP-010  | `portfolio.service.ts`                                      | yes         | passes the field through; the detector flagged it as a stub because of a pre-existing unrelated `TODO` at line 1907 (not in this change), which was checked and dismissed |
| COMP-011  | two response interfaces                                     | yes         | used by the service and the controller                                                                                                                                    |
| COMP-012  | `data-gathering.processor.ts`                               | yes         | Bull processor, calls `syncExchangeRates`                                                                                                                                 |
| COMP-013  | `user.controller.ts`                                        | yes         | registered Nest controller                                                                                                                                                |
| COMP-014  | `fx-rate-warning` component (4 files)                       | yes         | element used in the analysis page                                                                                                                                         |
| COMP-015  | `analysis-page.component.ts`, `.html`                       | yes         | imports and renders the notice                                                                                                                                            |
| COMP-016  | `exchange-rate-data.service.mock.ts`                        | yes         | used by 9 spec files                                                                                                                                                      |

## Test Results

| Suite     | Passed  | Failed | Skipped | Suites |
| --------- | ------- | ------ | ------- | ------ |
| api       | 669     | 0      | 0       | 90     |
| common    | 178     | 0      | 0       | 4      |
| ui        | 14      | 0      | 0       | 3      |
| **Total** | **861** | **0**  | **0**   | **97** |

- Executed fresh with the Nx cache bypassed. Baseline before this ticket: api 560, common 178, ui 6.
- Lint: 0 errors (4 projects). `tsc --noEmit` on the API app: 0 errors. Prettier clean on all 32 touched code files. Client build (development-en, AOT) succeeds.
- Coverage of new logic: store 100 percent, resolver 98.9 percent lines (one defensive guard uncovered), both new data service methods and `syncExchangeRates` fully covered.
- Mutation testing (Phase 7): 18 of 18 deliberate breakages are caught after the review fixes.
- No skipped or focused tests exist in the files this ticket added or changed.

## Edge Cases

| EC     | Req     | Status            | Evidence                                                                                                                                                                                                                    |
| ------ | ------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EC-001 | REQ-006 | tested (indirect) | `portfolio-calculator-no-activities.spec.ts:80` asserts no error and no positions; that no rate is fetched holds by code (the snapshot returns before the lookup, `portfolio-calculator.ts:261-279`) but no test asserts it |
| EC-002 | REQ-004 | tested            | `exchange-rate-resolver.spec.ts:111`; `portfolio-calculator-fx-multi-currency.spec.ts:266`                                                                                                                                  |
| EC-003 | REQ-004 | tested            | `exchange-rate-resolver.spec.ts:152`; `portfolio-calculator-fx-multi-currency.spec.ts:298`                                                                                                                                  |
| EC-004 | REQ-003 | tested            | `exchange-rate-resolver.spec.ts:32`                                                                                                                                                                                         |
| EC-005 | REQ-002 | tested            | `exchange-rate-resolver.spec.ts:234`                                                                                                                                                                                        |
| EC-006 | REQ-001 | tested            | `exchange-rate-store.service.spec.ts:46`; `exchange-rate-resolver.spec.ts:329`                                                                                                                                              |

No edge case failed.

## Quality Gates

| Gate                                               | Result                                         |
| -------------------------------------------------- | ---------------------------------------------- |
| 1. Every P0 requirement has at least one passed AC | Pass (all 8 P0 requirements are fully covered) |
| 2. Test pass rate at least 80 percent              | Pass (100 percent)                             |
| 3. No failed edge case                             | Pass (6 of 6 tested)                           |

Status determination: no P0 requirement lacks a passed AC, the score is above 70, there are no blocking recommendations and the pass rate is 100 percent, so the status is `passed`.

## Recommendations

| Priority | Blocking | Category    | Action                                                                                                                                                     | Rationale                                                                  |
| -------- | -------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 3        | No       | coverage    | Add a processor test where `getHistoricalRaw` rejects: the job rejects, nothing is written or mirrored, and the log line carries only the symbol.          | AC-006b is only partially covered (TEST-003)                               |
| 3        | No       | coverage    | Smoke-test the analysis page in a browser with the flag on and a weekend EUR or GBP activity, and with a currency that has no rate.                        | The notice and the excluded-holding behaviour have not been seen on a page |
| 3        | No       | coverage    | Apply the migration to a staging database, run the admin "gather max" twice, and confirm one row per pair and day and that the second run changes nothing. | AC-001a and AC-006a are verified with a mocked database only               |
| 4        | No       | coverage    | Run `npm run extract-locales` before a release so the notice strings are translated.                                                                       | The notice shows English text until extracted                              |
| 4        | No       | security    | Decide whether the public portfolio page should signal that a holding was left out for a missing rate (SEC-001).                                           | The owner sees why, public viewers do not                                  |
| 5        | No       | performance | If a hard 2 s guarantee is wanted, add a benchmark job instead of a unit test.                                                                             | The unit test keeps only a loose guard to stay stable                      |
