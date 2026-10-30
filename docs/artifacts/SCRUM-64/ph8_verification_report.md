# Verification Report: SCRUM-64

## Meta

- **Ticket:** SCRUM-64 (FEAT-0001), Advanced Portfolio Rebalancing & Target Allocation Planner
- **Phase:** 8 (Verification)
- **Date:** 2026-10-30
- **Verifier:** Claude Code (sdlc-verification), read-only run; tests re-executed by the verifier
- **Branch:** `SCRUM-64-rebalancing-planner` (nothing committed or pushed)
- **Codebase location:** repository root (Nx monorepo `ghostfolio`)
- **Inputs read:** ph1 problem spec, ph2 design spec, ph3 design review (C-1..C-4), ph3b QA plan, ph4 plan (with "Plan Deviations (Phase 5)"), ph5_6 manifest, ph7 review summary
- **Not available:** `test_report.json` and `security_audit.json` (Phase 7 results are in `ph7_review_summary.md` and were used instead). `client-notes/verification.md` is absent.
- **Skipped skill steps (by instruction):** updating `pipeline_state_SCRUM-64.json` (orchestrator owns it); `scripts/extract-sections.py` was not used (known encoding problem, noted in Phase 7); the files were read directly.

## Summary

| Item                     | Value                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| **Overall score**        | **92 / 100**                                                                                          |
| **Status**               | **passed_with_warnings**                                                                              |
| Blocking recommendations | 0                                                                                                     |
| Requirement Coverage     | 52 / 60 (20 of 23 ACs passed; 3 ACs verified statically only)                                         |
| Test Pass Rate           | 40 / 40 (948 of 948 tests pass)                                                                       |
| Wiring                   | 18 of 18 code components fully wired; COMP-019 (translations) is an accepted deviation; no deductions |
| Edge cases               | 6 of 6 tested                                                                                         |

**Why `passed_with_warnings` and not `passed`:** the numeric score (92), the test pass rate (100%) and the absence of blocking items would satisfy rule 4 of the status table. However, REQ-009 (P0, the UI) has no automated or browser-run test for AC-009a and AC-009b. Read strictly, Gate 1 ("every P0 requirement has at least one passed AC") would fail for REQ-009. The user has accepted that the client project has no Jest tests, and the client was verified by `nx build client`, a strict Angular template compile and lint, plus a code inspection by this verifier. Gate 1 is therefore treated as a documented waiver for REQ-009 and the status is capped at `passed_with_warnings`. A manual browser run-through (Recommendation 1) is the way to turn this into a clean pass.

## Test Results

All commands were run by the verifier from the repo root with `npx dotenv-cli -e .env.example -- npx nx test <project> --skip-nx-cache --output-style=static` (ANSI codes stripped).

| Project   | Suites | Tests                  | Failed | Snapshots | Result                      |
| --------- | ------ | ---------------------- | ------ | --------- | --------------------------- |
| common    | 7      | 242                    | 0      | 0         | pass                        |
| api       | 89     | 700                    | 0      | 1 passed  | pass                        |
| ui        | 2      | 6                      | 0      | 0         | pass                        |
| client    | none   | none (no Jest project) | n/a    | n/a       | "No tests found", by design |
| **Total** | **98** | **948**                | **0**  |           | **100% pass rate**          |

- `npm run database:validate-schema`: `The schema at prisma\schema.prisma is valid`.
- Numbers match `ph5_6_impl_manifest.md` (api 700 / 89 suites, common 242 / 7 suites, ui 6) exactly. Baseline before the feature was api 560, common 178, so the feature added 140 api tests and 64 common tests.
- The api run printed a Jest warning, "A worker process has failed to exit gracefully". It does not fail the run and was not isolated to this feature (the manifest and Phase 7 do not mention it). Treat it as pre-existing unless shown otherwise (Recommendation 6).
- Feature tests: calculator 64, validation 27, export 13, DTO 18, model service 15, plan service 15, models controller 22, plan controller 8, user service 8 (counts per manifest; the Phase 7 fixes added the rest, giving 360 feature tests per `ph7_review_summary.md`).
- Coverage (from Phase 7, not re-measured): all rebalancing api files 92.06% lines, 80.97% branches; calculator 92.98% / 84.67%; validator 100% / 93.42%; both controllers 100%.
- Not executed by the verifier: `nx build client`, lint and the strict Angular compile (taken from the manifest; the client build is the only automated evidence for the UI).
- Execution mode: real execution, not static analysis only.

## Wiring Verification (Step 2.5)

All 19 components of `ph2_design_spec.md` were checked for existence, substance and wiring. Files are real implementations (smallest are the 3-line `update-target-allocation-model.dto.ts` that extends the create DTO, and 3-line SCSS files, which is intended).

| Component                  | File(s)                                                                                                                 | Existence | Substance                             | Wiring evidence                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| COMP-001 Validator         | `libs/common/src/lib/target-allocation/target-allocation-validation.ts` (357 lines)                                     | exists    | substantive                           | imported by `target-allocation-model.service.ts:19` and `target-allocation-editor.component.ts:11`                                                 |
| COMP-002 Export builders   | `.../rebalancing-export.ts` (73)                                                                                        | exists    | substantive                           | `rebalancing-result.component.ts:9`; used at lines 61 and 70 for CSV and JSON download                                                             |
| COMP-003 DTOs              | `create-target-allocation-model.dto.ts` (210), `update-...dto.ts` (3), `create-rebalancing-plan.dto.ts` (88)            | exists    | substantive                           | exported in `dtos/index.ts:13,15,35,51,53,73`; used by both controllers and `data.service.ts:7,9,22`                                               |
| COMP-004 Interfaces        | `target-allocation-model.interface.ts` (84), `rebalancing-plan.interface.ts` (76)                                       | exists    | substantive                           | exported in `interfaces/index.ts:41-50,119-129,226-254`                                                                                            |
| COMP-005 Route             | `libs/common/src/lib/routes/routes.ts:222-225`                                                                          | exists    | substantive                           | used by `portfolio-page.routes.ts:38` and `portfolio-page.component.ts:83-85`                                                                      |
| COMP-006 Schema            | `prisma/schema.prisma:312-325,343`; migration `20261030000000_added_target_allocation_model/migration.sql`              | exists    | substantive                           | `User.targetAllocationModels` relation; cascade FK, unique `(userId, name)`, index on `userId`; `prisma validate` passes; additive only            |
| COMP-007 Model service     | `apps/api/.../rebalancing/target-allocation-model.service.ts` (253)                                                     | exists    | substantive                           | provider in `rebalancing.module.ts:25`; used by both the models controller and `rebalancing.service.ts:27`                                         |
| COMP-008 Calculator        | `.../rebalancing-calculator.ts` (796)                                                                                   | exists    | substantive                           | imported by `rebalancing.service.ts:26`                                                                                                            |
| COMP-009 Plan service      | `.../rebalancing.service.ts` (240)                                                                                      | exists    | substantive                           | provider in module; injected into `rebalancing-plan.controller.ts:26`                                                                              |
| COMP-010 Permission        | `libs/common/src/lib/permissions.ts:9,22,36,74,87,101,110,127,146-174`; `apps/api/src/app/user/user.service.ts:404-411` | exists    | substantive                           | `without(...)` removes the four permissions when `isExperimentalFeatures` is off; used by `@HasPermission` and the client tab                      |
| COMP-011 Models controller | `.../target-allocation-models.controller.ts` (126)                                                                      | exists    | substantive                           | declared in `rebalancing.module.ts:20`                                                                                                             |
| COMP-012 Plan controller   | `.../rebalancing-plan.controller.ts` (75)                                                                               | exists    | substantive                           | declared in `rebalancing.module.ts:20`                                                                                                             |
| COMP-013 Module            | `.../rebalancing.module.ts` (31); `app.module.ts:62,137`                                                                | exists    | substantive                           | `RebalancingModule` imported and registered; route-security snapshot updated and passes                                                            |
| COMP-014 Data client       | `libs/ui/src/lib/services/data.service.ts:382,872,878,950,958,1014`                                                     | exists    | substantive                           | six methods; used by the rebalancing page                                                                                                          |
| COMP-015 Page              | `apps/client/.../pages/portfolio/rebalancing/*` (317 + 164 lines + routes)                                              | exists    | substantive                           | lazy route at `portfolio-page.routes.ts:38-40`                                                                                                     |
| COMP-016 Editor            | `apps/client/.../components/target-allocation-editor/*` (476 + 464)                                                     | exists    | substantive                           | imported by `rebalancing-page.component.ts:5`                                                                                                      |
| COMP-017 Result            | `apps/client/.../components/rebalancing-result/*` (76 + 242)                                                            | exists    | substantive                           | imported by `rebalancing-page.component.ts:1`                                                                                                      |
| COMP-018 Navigation        | `portfolio-page.component.ts:79-85`; `portfolio-page.routes.ts:38-40`                                                   | exists    | substantive                           | tab shown only when `accessRebalancing` is held                                                                                                    |
| COMP-019 Translations      | `apps/client/src/locales/messages.xlf`                                                                                  | exists    | **not modified (accepted deviation)** | `i18n` attributes are in templates (24 in editor, 37 in result, 15 in page); strings not extracted, per repo convention of separate locale commits |

Result: 18 of 18 code components fully wired; COMP-019 is a documented deviation (not a wiring defect). Totals: fully wired 18, stubs 0, missing 0, imported-not-used 0. No wiring deductions. No circular imports were found in the new files.

Workspace hygiene checked: the temporary `apps/client/tsconfig.rebalancing-check.json` no longer exists, and `git status` shows no changes under `apps/client/src/locales`. The open cleanup item in the manifest is resolved.

## Requirement Coverage

Legend: **P** = passed (test exists, passes, validates the criterion); **P\*** = passed with a caveat; **S** = statically verified only (build, strict compile, lint, code inspection), no automated or browser test.

### Per requirement

| REQ                                       | Pri | Implementation (evidence)                                                                                                                                                                                                        | ACs              | Coverage                                                                                           |
| ----------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------- |
| REQ-001 CRUD of named models per user     | P0  | `target-allocation-model.service.ts`, `target-allocation-models.controller.ts:40-100`, schema `@@unique([userId, name])`, cascade delete                                                                                         | 001a P, 001b P   | fully_covered                                                                                      |
| REQ-002 Hierarchy with bands              | P0  | `target-allocation-validation.ts`; hierarchy from `ASSET_CLASS_MAPPING`; JSONB `targets`                                                                                                                                         | 002a P, 002b P   | fully_covered                                                                                      |
| REQ-003 Validation before save and run    | P0  | validator used at save (`validateTargets`, service) and re-run before every plan (`rebalancing.service.spec.ts:241,252`); tolerance `TARGET_ALLOCATION_SUM_TOLERANCE = 0.01` (`:12`)                                             | 003a P, 003b P   | fully_covered                                                                                      |
| REQ-004 Whole portfolio or account filter | P0  | `rebalancing.service.ts` (account filter, ownership check); tests at `rebalancing.service.spec.ts:174,188,207`                                                                                                                   | 004a P, 004b P   | fully_covered                                                                                      |
| REQ-005 Fee- and cash-aware calculation   | P0  | `rebalancing-calculator.ts:158-159` (reserve), `:241-245` (fee), `:289-350` (budget settling, bounded at 20 iterations)                                                                                                          | 005a P, 005b P   | fully_covered                                                                                      |
| REQ-006 Toggles, min trade, drift, bands  | P0  | `:179-188` (band / drift), `:246-252` (min value, fee > value), `:257-261` (buy-only), `:781-791` (whole / fractional)                                                                                                           | 006a P, 006b P   | fully_covered                                                                                      |
| REQ-007 Trade list and before / after     | P0  | `RebalancingTrade` (symbol, side, quantity, value, fee), `allocationBefore/After`, `cash`, `summary.residualCash`; message at `:487-491`                                                                                         | 007a P, 007b P   | fully_covered                                                                                      |
| REQ-008 Export JSON and CSV               | P0  | `rebalancing-export.ts:16-71`; download wired in `rebalancing-result.component.ts:60-70`                                                                                                                                         | 008a P\*, 008b P | fully_covered (caveat below)                                                                       |
| REQ-009 UI                                | P0  | `apps/client/.../rebalancing/*`, editor and result components; inline `errors` computed from the shared validator (`target-allocation-editor.component.ts:70-73`), save gated at `:122`; server-side 400 with no write is tested | 009a S, 009b S   | **verified statically only** (waiver, see Summary)                                                 |
| REQ-010 Data-quality flags                | P1  | `rebalancing-calculator.ts:100-120` (`NO_ASSET_CLASS`, `NO_PRICE`); foreign-currency conversion in the service                                                                                                                   | 010 P            | fully_covered                                                                                      |
| REQ-011 Gating, restricted view, privacy  | P0  | `user.service.ts:404-411`; `isRestrictedView` in `target-allocation-models.controller.ts:119` and `rebalancing-plan.controller.ts`; impersonation write-block; `rebalancing.service.ts:129-132` logs counts and duration only    | 011a P, 011b P\* | fully_covered (caveat below)                                                                       |
| REQ-012 Under 2 s for 500 holdings        | P1  | `rebalancing-calculator.spec.ts:698-731` (500 holdings, asserts under 2000 ms)                                                                                                                                                   | 012 P\*          | covered (caveat below)                                                                             |
| REQ-013 WCAG 2.1 AA and translation       | P2  | `i18n` on template text, `aria-label` on inputs, `role="alert"` / `role="status"`, `aria-labelledby` on sections                                                                                                                 | 013 S            | **partially covered** (server messages English-only; strings not extracted; no screen reader test) |

### Per acceptance criterion (23)

| AC      | Status                   | Evidence                                                                                                                                                                                                       |
| ------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-001a | passed                   | `target-allocation-model.service.spec.ts:110` (stores for the user), `:224` (list sorted by name); migration creates the table (persistence is the database row)                                               |
| AC-001b | passed                   | `target-allocation-model.service.spec.ts:212,272,312` (foreign id behaves as not found), `rebalancing.service.spec.ts:231`; every query scoped by `userId`                                                     |
| AC-002a | passed                   | `target-allocation-validation.spec.ts:101` (valid hierarchy with crypto under liquidity), `:198` (bands); DTO spec                                                                                             |
| AC-002b | passed                   | `target-allocation-validation.spec.ts:163,186` (symbols exceed sub-class; sub-classes exceed class)                                                                                                            |
| AC-003a | passed                   | `target-allocation-validation.spec.ts:117` (99% rejected, names level and shortfall); service spec `:130` stores nothing                                                                                       |
| AC-003b | passed                   | `target-allocation-validation.spec.ts:214,228`; DTO spec asserts the failing property                                                                                                                          |
| AC-004a | passed                   | `rebalancing.service.spec.ts:188` (holdings and cash limited to chosen accounts), `:207` (foreign account rejected)                                                                                            |
| AC-004b | passed                   | `rebalancing.service.spec.ts:174`                                                                                                                                                                              |
| AC-005a | passed                   | `rebalancing-calculator.spec.ts:137` (flat plus % fee on every trade, within budget); invariants block at `:644`                                                                                               |
| AC-005b | passed                   | `rebalancing-calculator.spec.ts:228,241,286` (no buy breaches the reserve; shortfall reported)                                                                                                                 |
| AC-006a | passed                   | `rebalancing-calculator.spec.ts:254,273`                                                                                                                                                                       |
| AC-006b | passed                   | `rebalancing-calculator.spec.ts:303` (whole shares, residual reported), `:316` (fractional keeps decimals)                                                                                                     |
| AC-007a | passed                   | `rebalancing-calculator.spec.ts:113` (before / after), `:122`; trade fields in `RebalancingTrade`; rendering in the result component is static-only                                                            |
| AC-007b | passed                   | `rebalancing-calculator.spec.ts:426,603` (empty list with message); BUG-001 fixed and covered at `:273,286`                                                                                                    |
| AC-008a | passed with caveat       | `rebalancing.service.spec.ts:489` validates the export against `ImportDataDto`; no test runs the real import service in dry-run mode (carried from Phase 7)                                                    |
| AC-008b | passed                   | `rebalancing-export.spec.ts` (13 tests: header row, one row per trade, formula escaping)                                                                                                                       |
| AC-009a | statically verified only | build, strict `strictTemplates` compile, lint; not run in a browser                                                                                                                                            |
| AC-009b | statically verified only | inline errors come from the same tested validator; server rejects with 400 and no write (`target-allocation-model.service.spec.ts:130,238`); the template rendering of errors is untested                      |
| AC-010  | passed                   | `rebalancing-calculator.spec.ts:501,519`; `rebalancing.service.spec.ts:422,442,327`                                                                                                                            |
| AC-011a | passed                   | `rebalancing-plan.controller.spec.ts:44,112`; controller spec `:149` (restricted view); `user.service.spec.ts` (8 tests, permission removal); the hidden tab (`portfolio-page.component.ts:79`) is static-only |
| AC-011b | passed with caveat       | `rebalancing.service.spec.ts:474` spies on `log` only, not `warn`, `error` or `debug`; code inspection of `rebalancing.service.ts:129-132` confirms counts and duration only                                   |
| AC-012  | passed with caveat       | `rebalancing-calculator.spec.ts:698` measures calculation only; Phase 7 states orchestration with stubbed data loading is also well under a second; real data loading (holdings, quotes) is not measured       |
| AC-013  | statically verified only | see REQ-013                                                                                                                                                                                                    |

Counts: passed 20 (including 3 with caveats), statically verified only 3, failed 0, skipped 0, not_implemented 0.

### Design-review conditions

| Condition                                                          | Status      | Evidence                                                                                                                               |
| ------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| C-1 cash from `AccountService.getCashDetails`, V = holdings + cash | met         | `rebalancing.service.ts:125` (`cashDetails.balanceInBaseCurrency`); `rebalancing-calculator.ts:137`; service spec `:156`               |
| C-2 validator takes a symbol resolver, unresolved symbols rejected | met         | `TargetAllocationSymbolResolver`; service spec `:149,165,418`                                                                          |
| C-3 nested decorated DTOs with size caps                           | met         | `create-target-allocation-model.dto.ts` (210 lines), size check added in Phase 7 (`getTargetAllocationSizeError`)                      |
| C-4 per-user throttling on `POST /rebalancing/plan`                | met, opt-in | `rebalancing-plan.controller.ts` `@Throttle` keyed on `user.id`, 30 per 60 s; enforced only when `ENABLE_FEATURE_RATE_LIMITING` is set |

## Edge Case Coverage

| EC                                          | Status | Evidence                                                                                                                                    |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| EC-001 Empty portfolio                      | tested | `rebalancing-calculator.spec.ts:572`; implementation `rebalancing-calculator.ts:139-155` returns empty list plus message, no error          |
| EC-002 Unheld target symbol                 | tested | `rebalancing-calculator.spec.ts:472,479`; `rebalancing.service.spec.ts:280,327,390`                                                         |
| EC-003 Fee exceeds trade value or minimum   | tested | `rebalancing-calculator.spec.ts:154,324`; `isTooSmall` at `:246-252`, `BELOW_THRESHOLD` warning at `:399-404`                               |
| EC-004 Sum to 100% after rounding (±0.01)   | tested | `target-allocation-validation.spec.ts:139,151`                                                                                              |
| EC-005 Whole-share residual cash            | tested | `rebalancing-calculator.spec.ts:303`; `summary.residualCash` at `:501`                                                                      |
| EC-006 Multi-sector fund, weighted exposure | tested | `rebalancing-calculator.spec.ts:615` (reports weighted exposure, creates no trades); sector targets are advisory by accepted decision F-001 |

6 of 6 tested, none failed. Gate 3 passes.

## Quality Gates

| Gate                                               | Result                                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Every P0 requirement has at least one passed AC | **Passes for REQ-001..008 and REQ-011; REQ-009 waived** (two ACs verified statically only; user accepted the no-client-tests constraint). Strict reading would fail this gate. |
| 2. Test pass rate of at least 80%                  | pass, 100% (948 of 948)                                                                                                                                                        |
| 3. No failed edge cases                            | pass, 6 of 6 tested                                                                                                                                                            |

## Score

| Dimension            | Calculation                              | Points |
| -------------------- | ---------------------------------------- | ------ |
| Requirement Coverage | 20 passed of 23 ACs, 20 / 23 x 60 = 52.2 | 52     |
| Test Pass Rate       | 948 / 948 x 40                           | 40     |
| Wiring deductions    | none                                     | 0      |
| **Total**            |                                          | **92** |

The 3 unautomated UI ACs are scored as not passed, which is the conservative choice. Status follows the Summary reasoning: `passed_with_warnings`.

## Residual Risks (accepted by the user, noted only)

- Three extra write permissions (`createRebalancingModel`, `updateRebalancingModel`, `deleteRebalancingModel`) beyond `accessRebalancing`; they are removed together with `accessRebalancing` when `isExperimentalFeatures` is off.
- Rate limiting is opt-in (`ENABLE_FEATURE_RATE_LIMITING`); with it off, the plan endpoint can trigger quote fetches for up to 500 unheld symbols per call (SEC-003).
- DEMO role excluded; sector targets advisory only; `accountId` in the export only when exactly one account is in scope.
- Translation strings are not extracted and server-built messages (warnings, exclusions, validation errors) are English-only.
- Behaviours flagged for confirmation at review: holdings outside the model get a 0% target and are sold in full when sells are allowed; targets are percentages of total value including cash; whole-share mode rounds down except for full liquidations.
- Formatting churn in `prisma/schema.prisma` (20 realigned `User` lines) and the pre-existing `package-lock.json` modification should stay out of, or be clearly separated in, the feature commit.

## Recommendations

| #   | Priority | Blocking                     | Category    | Action                                                                                                                                                                                                                                                                              | Rationale                                                                                                                                   |
| --- | -------- | ---------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 3        | No (required before release) | coverage    | Run a manual browser smoke test of the planner against a local PostgreSQL and Redis: create a model, trigger an inline validation error, run a plan with account filter, export JSON and CSV, and check keyboard navigation and a screen reader pass. Record the outcome in the PR. | AC-009a, AC-009b and AC-013 (REQ-009 is P0) are verified only by build, compile and lint. This is the only gap preventing a clean `passed`. |
| 2   | 3        | No                           | coverage    | Add a test that feeds the exported JSON to the real import service in dry-run mode (or `ImportService.import` with `isDryRun`), not only `ImportDataDto` validation.                                                                                                                | AC-008a is only partly proven; the spec asks for "submitting it to the existing import with dry run succeeds".                              |
| 3   | 3        | No                           | security    | Enable `ENABLE_FEATURE_RATE_LIMITING` in production and state it in the PR and release notes; consider caching quotes for unheld symbols.                                                                                                                                           | The C-4 throttle (30 per minute per user) is inactive by default (SEC-003).                                                                 |
| 4   | 4        | No                           | coverage    | Extend the log-hygiene test to spy on `warn`, `error` and `debug` as well as `log`, and make the currency mock apply a real rate in the calculator and service specs.                                                                                                               | AC-011b evidence is only as strong as the spy; conversion is only exercised in the service-level tests.                                     |
| 5   | 4        | No                           | performance | Measure the 500-holding plan end to end (with real `PortfolioService.getDetails` and quote loading) on a seeded database, or document the 2 s target as calculation-only.                                                                                                           | AC-012 and design flag F-004: only calculation and stubbed orchestration are measured.                                                      |
| 6   | 4        | No                           | wiring      | Run `nx test api --detectOpenHandles` once, or compare with `main`, to confirm that the "worker process failed to exit gracefully" warning pre-dates this branch.                                                                                                                   | It appeared in the verifier's api run; not shown to be caused by the feature.                                                               |
| 7   | 4        | No                           | coverage    | Follow up with the locale extraction commit (`npm run extract-locales` in a separate change) and a plan for translating server-built messages.                                                                                                                                      | REQ-013 is only partly met without extracted strings and translatable server messages.                                                      |
| 8   | 5        | No                           | security    | Optional: harden CSV escaping for full-width `＝＋－＠` and `\|` leading characters (SEC-005).                                                                                                                                                                                      | Info-level finding from Phase 7, not fixed.                                                                                                 |

There are no blocking recommendations. The pipeline may proceed to Phase 9 (Risk) with the warnings above carried into the PR description.
