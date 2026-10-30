# Implementation Manifest: SCRUM-64

## Summary

- Files created: 33 (24 source, 9 test)
- Files modified: 11
- Total lines added: about 7003
- Branch: `SCRUM-64-rebalancing-planner` (local; nothing committed or pushed)
- Review mode: per wave (Waves 0-5), accepted by the user; Waves 3 and 4 were reviewed together
- Plan deviations (all recorded in `ph4_implementation_plan.md` under "Plan Deviations (Phase 5)" or below): three write permissions added (user approved); route entry for the page moved from Wave 2 to Wave 5; translation extraction not committed (repo convention); route-security snapshot updated; client verified by lint, strict Angular compile and build because the client project has no unit tests

## Baseline Test Counts

| Repo                | Pass            | Fail |
| ------------------- | --------------- | ---- |
| ghostfolio / api    | 560 (83 suites) | 0    |
| ghostfolio / common | 178 (4 suites)  | 0    |
| ghostfolio / ui     | 6 (2 suites)    | 0    |
| ghostfolio / client | no tests found  | 0    |

## Final Test Counts

| Repo                | Pass                                     | Fail |
| ------------------- | ---------------------------------------- | ---- |
| ghostfolio / api    | 700 (89 suites), after the Phase 7 fixes | 0    |
| ghostfolio / common | 242 (7 suites), after the Phase 7 fixes  | 0    |
| ghostfolio / ui     | 6 (2 suites)                             | 0    |
| ghostfolio / client | no tests found                           | 0    |

Also verified: `prisma validate` passes; `nx build client` succeeds; the strict Angular compile (`strictTemplates`, `strictNullChecks`) passes for all new client files; lint reports 0 errors and no warnings in new code.

## Files Created

| Path                                                                                              | Component | Lines Added |
| ------------------------------------------------------------------------------------------------- | --------- | ----------- |
| `prisma/migrations/20261030000000_added_target_allocation_model/migration.sql`                    | COMP-006  | 21          |
| `libs/common/src/lib/interfaces/target-allocation-model.interface.ts`                             | COMP-004  | 84          |
| `libs/common/src/lib/interfaces/rebalancing-plan.interface.ts`                                    | COMP-004  | 76          |
| `libs/common/src/lib/target-allocation/target-allocation-validation.ts`                           | COMP-001  | 349         |
| `libs/common/src/lib/target-allocation/rebalancing-export.ts`                                     | COMP-002  | 73          |
| `libs/common/src/lib/dtos/create-target-allocation-model.dto.ts`                                  | COMP-003  | 206         |
| `libs/common/src/lib/dtos/update-target-allocation-model.dto.ts`                                  | COMP-003  | 3           |
| `libs/common/src/lib/dtos/create-rebalancing-plan.dto.ts`                                         | COMP-003  | 77          |
| `apps/api/src/app/endpoints/rebalancing/rebalancing-calculator.ts`                                | COMP-008  | 805         |
| `apps/api/src/app/endpoints/rebalancing/target-allocation-model.service.ts`                       | COMP-007  | 240         |
| `apps/api/src/app/endpoints/rebalancing/rebalancing.service.ts`                                   | COMP-009  | 239         |
| `apps/api/src/app/endpoints/rebalancing/target-allocation-models.controller.ts`                   | COMP-011  | 126         |
| `apps/api/src/app/endpoints/rebalancing/rebalancing-plan.controller.ts`                           | COMP-012  | 75          |
| `apps/api/src/app/endpoints/rebalancing/rebalancing.module.ts`                                    | COMP-013  | 31          |
| `apps/client/src/app/components/target-allocation-editor/target-allocation-editor.component.ts`   | COMP-016  | 476         |
| `apps/client/src/app/components/target-allocation-editor/target-allocation-editor.component.html` | COMP-016  | 464         |
| `apps/client/src/app/components/target-allocation-editor/target-allocation-editor.component.scss` | COMP-016  | 11          |
| `apps/client/src/app/components/rebalancing-result/rebalancing-result.component.ts`               | COMP-017  | 76          |
| `apps/client/src/app/components/rebalancing-result/rebalancing-result.component.html`             | COMP-017  | 242         |
| `apps/client/src/app/components/rebalancing-result/rebalancing-result.component.scss`             | COMP-017  | 3           |
| `apps/client/src/app/pages/portfolio/rebalancing/rebalancing-page.component.ts`                   | COMP-015  | 317         |
| `apps/client/src/app/pages/portfolio/rebalancing/rebalancing-page.html`                           | COMP-015  | 164         |
| `apps/client/src/app/pages/portfolio/rebalancing/rebalancing-page.scss`                           | COMP-015  | 3           |
| `apps/client/src/app/pages/portfolio/rebalancing/rebalancing-page.routes.ts`                      | COMP-015  | 15          |

## Files Modified

| Path                                                              | Component | Lines Changed |
| ----------------------------------------------------------------- | --------- | ------------- |
| `prisma/schema.prisma`                                            | COMP-006  | +35 / -20     |
| `libs/common/src/lib/interfaces/index.ts`                         | COMP-004  | +42 / -0      |
| `libs/common/src/lib/dtos/index.ts`                               | COMP-003  | +6 / -0       |
| `libs/common/src/lib/routes/routes.ts`                            | COMP-005  | +5 / -0       |
| `libs/common/src/lib/permissions.ts`                              | COMP-010  | +12 / -0      |
| `apps/api/src/app/user/user.service.ts`                           | COMP-010  | +7 / -4       |
| `apps/api/src/app/app.module.ts`                                  | COMP-013  | +2 / -0       |
| `apps/api/src/app/__snapshots__/app.module.spec.ts.snap`          | COMP-013  | +62 / -0      |
| `libs/ui/src/lib/services/data.service.ts`                        | COMP-014  | +43 / -0      |
| `apps/client/src/app/pages/portfolio/portfolio-page.component.ts` | COMP-018  | +15 / -0      |
| `apps/client/src/app/pages/portfolio/portfolio-page.routes.ts`    | COMP-018  | +5 / -0       |

## Test Files

| Path                                                                                 | Tests Component | Size                |
| ------------------------------------------------------------------------------------ | --------------- | ------------------- |
| `libs/common/src/lib/target-allocation/target-allocation-validation.spec.ts`         | COMP-001        | 27 tests, 381 lines |
| `libs/common/src/lib/target-allocation/rebalancing-export.spec.ts`                   | COMP-002        | 13 tests, 167 lines |
| `libs/common/src/lib/dtos/create-target-allocation-model.dto.spec.ts`                | COMP-003        | 18 tests, 181 lines |
| `apps/api/src/app/endpoints/rebalancing/rebalancing-calculator.spec.ts`              | COMP-008        | 64 tests, 646 lines |
| `apps/api/src/app/endpoints/rebalancing/target-allocation-model.service.spec.ts`     | COMP-007        | 15 tests, 317 lines |
| `apps/api/src/app/endpoints/rebalancing/rebalancing.service.spec.ts`                 | COMP-009        | 15 tests, 445 lines |
| `apps/api/src/app/endpoints/rebalancing/target-allocation-models.controller.spec.ts` | COMP-011        | 22 tests, 162 lines |
| `apps/api/src/app/endpoints/rebalancing/rebalancing-plan.controller.spec.ts`         | COMP-012        | 8 tests, 121 lines  |
| `apps/api/src/app/user/user.service.spec.ts`                                         | COMP-010        | 8 tests, 173 lines  |

## Known Conflicts

None. No Figma design tokens were involved in this ticket.

## Known Dependencies / Open Items

- **Pending cleanup (user action):** `npm run extract-locales` rewrote all 14 `apps/client/src/locales/messages.*.xlf` files, and a temporary `apps/client/tsconfig.rebalancing-check.json` remains. Neither belongs in this change. The user chose to run `git checkout -- apps/client/src/locales` and delete the temporary file. Confirm before Phase 6.
- **Not exercised in a browser:** the editor, result and page screens were compiled, built and linted but not run, because that needs PostgreSQL and Redis. Manual run-through is recommended before release.
- **Rate limiting is opt-in:** the plan endpoint is limited to 30 calls a minute per user, but the limit only applies when `ENABLE_FEATURE_RATE_LIMITING` is set (it defaults to off, as for the existing AI endpoint).
- **Impersonation:** write requests (including the plan call) are rejected with 403 while an impersonation is active; reads are not blocked and return the user's own models.
- **Formatting diff in `prisma/schema.prisma`:** `prisma format` realigned 20 existing lines of the `User` model (accepted by the user).
- **Run-time overrides in the UI** are limited to "allow sells" and "allow fractional"; the API accepts all eight parameters.
- **Behaviours to confirm at review:** holdings outside the model get a 0% target and are sold in full (when sells are allowed); targets are percentages of total value including cash; whole-share mode rounds down except for full liquidations; candidates in a class with no holdings share the buy equally.
- **Open design flags still undecided by the problem spec:** F-001 sector targets are advisory only; F-002 DEMO role excluded; F-004 the 2 s target is measured on calculation plus orchestration with stubbed data loading (500 holdings run in well under a second); F-005 `accountId` is only set when exactly one account is in scope.

## Simplification

Files reviewed: 43 | Files modified: 6 | Behaviour changes: none

| File                                                                                 | Changes                                                                                                                                                                                           | Skipped |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `apps/api/src/app/endpoints/rebalancing/rebalancing-calculator.ts`                   | [duplication] The "node has a band" check was repeated three times; extracted one `hasBand` predicate. [clarity] `isOutsideBand` uses `isNil` instead of four `!== undefined && !== null` checks. | —       |
| `libs/common/src/lib/target-allocation/target-allocation-validation.ts`              | [clarity] `isNil` instead of manual null checks. [dead code] Removed the `min > max` clause, which can never be true when the other two clauses are false.                                        | —       |
| `apps/api/src/app/endpoints/rebalancing/target-allocation-model.service.ts`          | [clarity] Replaced a derived type alias with the shared `AssetProfileIdentifier` interface; shortened a three-line doc comment to one line.                                                       | —       |
| `apps/api/src/app/endpoints/rebalancing/rebalancing.service.ts`                      | [clarity] Same shared `AssetProfileIdentifier` instead of an inline type.                                                                                                                         | —       |
| `apps/api/src/app/endpoints/rebalancing/target-allocation-models.controller.spec.ts` | [quality] Prototype typed as a record of route handlers (the pattern of `app.module.spec.ts`), removing 4 `unbound-method` lint warnings.                                                         | —       |
| `apps/api/src/app/endpoints/rebalancing/rebalancing-plan.controller.spec.ts`         | [quality] Same, removing 1 `unbound-method` warning.                                                                                                                                              | —       |
| Other 37 changed files                                                               | Reviewed; no simplification found worth the churn (lint already clean, no dead code or duplication over 5 lines).                                                                                 | —       |

Verification after simplification: common 236/236 tests pass; api rebalancing suites 124/124 pass; lint 0 errors and no warnings in new code (common warnings 87 -> 84, api 1434 -> 1429); client build succeeds.

Not changed on purpose: the two page/editor handlers that build account-id and node lists look similar but differ in intent, so extracting a helper would not reduce complexity.
