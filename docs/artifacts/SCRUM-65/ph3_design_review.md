# Design Review: Multi-Currency FX Conversion & Base Currency Normalization

## Meta

- **Ticket ID:** SCRUM-65
- **Feature ID:** FEAT-0002
- **Date:** 2026-11-05
- **Reviewer:** Claude Code (sdlc-design-review)
- **Reviewed artifacts:** `ph1_problem_spec.md` (approved 2026-11-05T22:58:35+0530), `ph2_design_spec.md` (version 1, iteration 1)
- **Review mode:** B (Retroactive). `codebase_analyzed` is true, so the spec was checked against the actual files.
- **Review iteration:** 1

## Summary

- **Verdict:** `approve_with_concerns`
- **Overall design quality score:** 74/100
- **Critical findings:** 0 | **Major:** 3 | **Minor:** 3
- **Ready for implementation:** conditionally. Conditions C-1 to C-5 must be met, and the migration needs explicit user confirmation (C-5) before COMP-001 and COMP-002 are touched.

The overall shape is right. It reuses the existing service layering, leaves flag-off behaviour untouched through a parallel read path, adds no endpoint, permission or environment variable, and its read of the current calculator (ASM-003) is accurate. Reading the actual code found three mechanism problems that the spec describes incorrectly:

1. The "reuse the existing error path" exclusion does not exclude the amount (ARCH-001).
2. Adding a dependency to `ExchangeRateDataService` breaks 36 spec files at compile time, and the mock lacks the flag method (ARCH-002).
3. A failure in the new sync would fail every FX gathering job (ARCH-003).

Each has a small, specific fix, and I have made each a mandatory condition rather than rejecting.

**Judgment call at the severity boundary.** ARCH-001 and ARCH-002 are both close to critical. Left uncorrected, ARCH-001 would produce a silent 1:1 amount in portfolio totals (the defect this ticket exists to fix), and ARCH-002 would fail the compile of 36 specs. I rated them major because the design states the correct intent, a non-breaking fix is specified for each, and the design's own testing strategy (AC-004b, the 36-spec parity run) would catch either one before merge. If you prefer to see the corrections in a revised design before planning, choose "Revise" at the gate.

## Findings

### Codebase Validation (Dimension A)

| Spec claim                                                                                                                                                  | Check                                                                    | Status                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ExchangeRateDataService` methods and behaviour (`getExchangeRatesByCurrency`, `toCurrency`, `toCurrencyAtDate`, gap fill, `?? 1` end-of-function fallback) | Read the whole file                                                      | verified_exists, accurate                                                                                                                                                                                                                                        |
| "Injected into 20 files"                                                                                                                                    | Counted declarations of the injected type in non-spec code               | exists_but_differs: 35 files declare it (20 was the count of files calling its methods)                                                                                                                                                                          |
| "About 33 calculator specs use `ExchangeRateDataServiceMock`"                                                                                               | Counted                                                                  | exists_but_differs: 8 specs use the mock; 36 spec files instead construct the real service positionally with four `null` arguments                                                                                                                               |
| Calculator valuation: activity-date vs current rate series, about 11 `?? 1` sites                                                                           | Read `getHoldingValuation`, `getTotalsFromActivities`, the position loop | verified_exists, accurate                                                                                                                                                                                                                                        |
| "Reuse the holding-level error path (`errors`/`hasErrors`) to exclude a holding"                                                                            | Read the position loop (about lines 413-557)                             | exists_but_differs: a holding with `hasErrors` only has its performance fields set to null; it is still pushed into `positions` with `valueInBaseCurrency` computed using `?? 1`, and still populates `valuesByAssetProfileIdentifier` (net worth). See ARCH-001 |
| `DataGatheringProcessor` hook point after the market-data write                                                                                             | Read the processor                                                       | verified_exists. Two specs build it with four positional arguments. See ARCH-002                                                                                                                                                                                 |
| `DataGatheringModule` already imports `ExchangeRateDataModule`                                                                                              | Read module                                                              | verified_exists                                                                                                                                                                                                                                                  |
| `ExchangeRateDataModule` imports `PrismaModule` and `MarketDataModule`                                                                                      | Read module                                                              | verified_exists                                                                                                                                                                                                                                                  |
| Snapshot cache key omits any flag; `emitPortfolioChangedEvent` only for `baseCurrency`                                                                      | Read `RedisCacheService.getPortfolioSnapshotKey` and `UserController`    | verified_exists                                                                                                                                                                                                                                                  |
| `UpdateUserSettingDto.baseCurrency` uses `@IsCurrencyCode()`; `XXX` is accepted by `isISO4217CurrencyCode`                                                  | Read DTO and helper                                                      | verified_exists (consistent with F-002)                                                                                                                                                                                                                          |
| Migration naming `YYYYMMDDHHMMSS_description`, latest `20261030000000_added_target_allocation_model`                                                        | Listed `prisma/migrations`                                               | verified_exists                                                                                                                                                                                                                                                  |
| Client has no existing `hasErrors` UI                                                                                                                       | Searched `apps/client` and `libs/ui`                                     | verified_exists                                                                                                                                                                                                                                                  |
| `PortfolioService` `hasErrors` returns at about lines 900 and 1273; `AnalysisPage` fetches performance at about lines 323 and 354                           | Read/grep                                                                | verified_exists                                                                                                                                                                                                                                                  |
| No spec exists for `ExchangeRateDataService` itself                                                                                                         | Listed the folder                                                        | verified_exists                                                                                                                                                                                                                                                  |

`design_spec_accurate`: true for the architecture; false for two blast-radius numbers (corrected in ARCH-004).

### Architectural Review (Dimension B)

#### ARCH-001: Holding-level exclusion does not actually exclude the amount

- **Category:** data_flow | **Severity:** major | **Risk:** high | **Effort to fix:** small | **Blocking:** false
- **Finding:** ADR-005 says a holding with a missing rate is "added to `errors` and marked `hasErrors`, exactly like a holding without a market price". In the calculator, `hasErrors` nulls only the performance fields. The holding is still pushed into `positions` with `valueInBaseCurrency` and `marketPriceInBaseCurrency` computed through `?? 1`, and its values still flow into `valuesByAssetProfileIdentifier` and the net worth. Followed literally, a holding with no EUR rate would still be counted at 1:1 in current value, which breaks AC-004b ("no 1:1 conversion occurs") and the purpose of REQ-004.
- **Recommendation:** Specify that FX-excluded holdings are removed before the position loop: they are listed in `errors`, a MISSING warning is recorded, and they are skipped from `positions`, `valuesByAssetProfileIdentifier`, current value, investment and chart series. Add an AC-004b test that asserts the totals exclude the holding.
- **Alternatives:** Keep the holding in the output with value set to null and a flag (richer for the UI, but every consumer of `positions` must handle null values); fail the snapshot (rejected in ADR-005).

#### ARCH-002: New constructor dependency breaks 36 specs; mock lacks the flag method

- **Category:** maintainability | **Severity:** major | **Risk:** high | **Effort to fix:** small | **Blocking:** false
- **Finding:** COMP-006 depends on the new store service. `ExchangeRateDataService` is constructed positionally with four arguments in 36 spec files (including `portfolio.service.spec.ts` and all calculator specs), and `DataGatheringProcessor` is constructed positionally in two specs. A required fifth parameter fails TypeScript compilation in all of them. The blast-radius section does not mention constructors. Separately, the 8 specs that pass `ExchangeRateDataServiceMock` would call `isHistoricalFxEnabled` on a `Partial` mock that lacks it and throw, and in the 36 specs that build the real service with `null` dependencies the flag read would hit a null Prisma service.
- **Recommendation:** Use an additive change. Either append the store as a trailing optional constructor parameter, or put the new status-aware read and flag check in a separate small service that wraps the existing one, leaving its constructor untouched. Append any new `DataGatheringProcessor` parameters at the end as optional. The mock must also provide `isHistoricalFxEnabled` (returning false). The flag check must never throw (null Prisma, query failure) and must return false.
- **Alternatives:** Update all 38 specs to the new signature (mechanical but large, and noisy in review); pass the flag into `createCalculator` and avoid the service change (rejected in ADR-004, touches five call sites).

#### ARCH-003: Sync failure would fail every FX gathering job

- **Category:** reliability | **Severity:** major | **Risk:** medium | **Effort to fix:** trivial | **Blocking:** false
- **Finding:** The API contract says a store database error is thrown "so the Bull job retries". The sync runs after `MarketData` has already been written, and `MarketData` stays the authoritative fallback. If the new table is missing (code deployed before the migration) or the database errors, every FX pair job would be marked failed and retried indefinitely, adding noise to a queue shared with all other symbols, even for users who never enable the flag.
- **Recommendation:** Isolate the sync: catch errors around the store call, log the pair and counts only (no amounts), and never rethrow. State the deployment order explicitly: apply the migration before the code that writes to it.
- **Alternatives:** Rethrow and rely on retries (rejected: retries re-fetch provider data for no benefit); a separate queue job for the sync (more moving parts than the benefit warrants).

#### ARCH-004: Two blast-radius figures are wrong

- **Category:** maintainability | **Severity:** minor | **Risk:** low | **Effort to fix:** trivial | **Blocking:** false
- **Finding:** "Injected into 20 files" should be 35; "about 33 specs use the mock" should be 8 using the mock and 36 constructing the real service. The flag-off parity proof therefore rests on those 36 specs (not 33), and they need no edits only if ARCH-002 is followed.
- **Recommendation:** Correct the figures in the spec during the implementation plan; run the full API suite as the parity check.

#### ARCH-005: Date-key consistency between the two stores is unspecified

- **Category:** data_flow | **Severity:** minor | **Risk:** medium | **Effort to fix:** small | **Blocking:** false
- **Finding:** The gatherer stores `MarketData` dates as start-of-UTC-day, while `getExchangeRates` and the calculator key maps with `format(date, DATE_FORMAT)` in the server's local zone. The resolver merges two stores by date key; any zone mismatch could shift a rate by a day on a non-UTC server.
- **Recommendation:** Specify one date-key function (reuse the one used by `getExchangeRates`) for reading and for storing, and unit-test it under a non-UTC time zone (the repo already has `data-gathering.processor.time-zone.spec.ts` as a pattern).

#### ARCH-006: Flag read repeats per calculator creation

- **Category:** scalability | **Severity:** minor | **Risk:** low | **Effort to fix:** trivial | **Blocking:** false
- **Finding:** `PortfolioService` creates calculators several times per request, so the `Settings` lookup repeats.
- **Recommendation:** Resolve the flag once per calculation and pass it down, or cache it for the duration of a request. No separate cache layer is needed.

**Positive checks passed:** no circular dependency (graph is a DAG); every component has a single responsibility and an exact path; every data flow ends at a consumer; error paths exist for each store and resolver call; no new endpoint, permission, environment variable or dependency.

### Assumption Challenges (Dimension C)

| ID      | Assumption                                               | Challenge                                            | Likelihood wrong | Impact if wrong | Evidence                                                                                                       | Mitigation in design                                        | Validation strategy                               | Fallback                                               |
| ------- | -------------------------------------------------------- | ---------------------------------------------------- | ---------------- | --------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| ASM-001 | Migration authorization comes later                      | If never given, the table cannot ship                | medium           | high            | None (user delegated)                                                                                          | COMP-002 is gated; flag-off path needs no table             | Ask at this gate                                  | Ship the resolver over `MarketData` only (ALT-001)     |
| ASM-002 | "Portfolio profile" means per user                       | A real multi-profile request would invalidate NG-001 | medium           | high            | Ticket wording vs repo (no profile concept)                                                                    | Scope noted in F-008                                        | Confirm with the ticket author                    | Raise a follow-up epic                                 |
| ASM-003 | Calculator may not convert at transaction-date rates     | Was unverified                                       | resolved         | n/a             | Code read: it already does, via the "WithCurrencyEffect" series                                                | Design targets the real defects                             | Parity specs                                      | n/a                                                    |
| ASM-004 | Provider has EUR, GBP, CHF back to the earliest activity | A gap yields MISSING and excluded holdings           | medium           | medium          | `getEarliestDate` goes back to the earlier of first activity and 10 years, but provider coverage is unverified | MISSING warning plus holding exclusion (needs ARCH-001 fix) | Run "gather max" in a staging copy and count gaps | Manual data entry through the admin market-data screen |
| ASM-005 | 2 s achievable with database-only reads                  | Carry-forward over long ranges for many pairs        | low              | medium          | Two queries per calculation, daily granularity, four currencies                                                | Bounded range reads                                         | AC-008 synthetic test                             | Cache resolved series in Redis                         |
| ASM-006 | FX rates and base currency are non-personal              | A user-specific manual rate would change this        | low              | low             | Design has no user-keyed data                                                                                  | None needed                                                 | None                                              | n/a                                                    |
| ASM-007 | Backfill uses the already-configured provider            | Provider rate limits during a large backfill         | medium           | low             | Queue limiter is one job per 3 seconds per data source                                                         | Existing limiter applies                                    | Watch first backfill                              | Run off-hours                                          |

No assumption has critical impact without mitigation.

### Complexity Concerns (Dimension D)

| ID           | Area                                          | Current complexity                    | Concern                                                                                                                                                              | Simpler alternative                                | Justified                                                          | Recommendation                                                                                                  | Effort saved         |
| ------------ | --------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------- |
| COMP-001/004 | Second FX store beside `MarketData`           | Two tables, a sync, a precedence rule | Duplicated data whose functional gain over `MarketData` is mainly provenance and validation; the real defects (`?? 1` fallbacks, later-rate gap fill) do not need it | Fix those defects over `MarketData` only (ALT-001) | Partly: the ticket's first acceptance criterion asks for the table | Keep, but record in the PR that the table is mandated by the ticket and the read path is the substantive change | about 12 h           |
| COMP-007     | Module wiring                                 | One provider line                     | Trivial but listed as its own component                                                                                                                              | Fold into COMP-004's description                   | Yes (exact file is named for the implementer)                      | None                                                                                                            | n/a                  |
| COMP-014/015 | New client presenter and analysis-page change | One new presenter                     | The requirements say "return a warning"; a UI is implied only by "Platforms: Web"                                                                                    | Return warnings in the API only for this ticket    | Yes, minimal                                                       | Keep minimal; do not extend beyond the analysis page                                                            | about 6 h if dropped |

Essential complexity: rate rules (carry-forward, triangulation, derived currencies), the flag, cache invalidation. Accidental complexity: the dual store and the precedence rule (F-005).

### Alternative Approaches (Dimension E)

| ID      | Area                  | Current approach                                          | Alternative                                                         | Effort comparison                                        | Recommendation                                                                     |
| ------- | --------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| ALT-001 | Storage               | New table plus sync (about 40 h incl. migration and sync) | Resolver and warnings over `MarketData` only, no table (about 28 h) | -12 h                                                    | Keep the table (ticket AC1) unless the migration is declined; this is the fallback |
| ALT-002 | Exclusion granularity | Holding level (ADR-005)                                   | Single activity                                                     | Similar                                                  | Keep holding level; per-activity corrupts quantity and cost basis                  |
| ALT-003 | Cache invalidation    | Emit event on flag change (ADR-009)                       | Put the flag in the snapshot cache key                              | Alternative touches processor, listener and mocks (+4 h) | Keep the event                                                                     |
| ALT-004 | New dependency wiring | Constructor parameter on `ExchangeRateDataService`        | Separate wrapper service, or trailing optional parameter            | Alternative saves editing 38 specs (about 3 h)           | Use the alternative (see ARCH-002)                                                 |

### Missing Considerations (Dimension F)

| ID       | Area                                   | Missing                                                                                                      | Impact                                                                        | Recommendation                                                                                                                                                                       | Blocking                                                          |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| MISS-001 | Observability                          | Only logging is specified; no counters for missing-rate warnings, rejected rows or fallbacks to `MarketData` | Silent data quality decay                                                     | Define a fixed set of log events (rejected row count, fallback used, MISSING pair and date) at warning level; the codebase has no metrics stack, so logs are the available mechanism | No: logging exists and the codebase has no metrics infrastructure |
| MISS-002 | Migration and rollback                 | No explicit rollback statement                                                                               | Operators unsure how to back out                                              | State: set the flag off (identical behaviour) and optionally drop the additive table; no data migration is involved                                                                  | No: not a migration from an existing system                       |
| MISS-003 | Accessibility                          | No requirements for the warning notice                                                                       | WCAG 2.1 AA gap (REQ was dropped in this ticket, but the component is new UI) | Use a status role or live region, text not colour alone, keyboard-focusable details                                                                                                  | No                                                                |
| MISS-004 | Deployment order                       | Code before migration would break the sync                                                                   | Failing FX jobs                                                               | Covered by ARCH-003 and condition C-3/C-5                                                                                                                                            | No (resolved by conditions)                                       |
| MISS-005 | Stale snapshots after new rates arrive | A cached snapshot computed with MISSING rates stays until the next portfolio change                          | Users see an outdated warning                                                 | Accept and document (existing behaviour for `MarketData`); the admin cache reset endpoint exists                                                                                     | No                                                                |
| MISS-006 | Internationalisation of warnings       | Warnings carry codes and dates, no text                                                                      | None                                                                          | Keep the API language-neutral; translate in the presenter with `$localize`                                                                                                           | No                                                                |

## Design Quality Assessment

| Dimension       | Score  | Rationale                                                                                                 |
| --------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| Clarity         | 82     | Components, flows, rules and ADRs are explicit with exact paths                                           |
| Completeness    | 70     | All 10 requirements are traced; blast radius and failure isolation have gaps                              |
| Soundness       | 68     | Core approach is right, but two mechanisms (exclusion, constructor change) do not do what the spec claims |
| Simplicity      | 66     | Dual store adds accidental complexity, though mandated by the ticket                                      |
| Scalability     | 82     | Two queries per calculation, trivial table growth, bounded warnings                                       |
| Maintainability | 74     | Parallel path leaves flag-off code untouched; two paths to retire later                                   |
| **Overall**     | **74** | Average of the six, rounded                                                                               |

## Positive Aspects

- The spec resolved the highest-risk assumption (ASM-003) by reading the calculator and correctly redirected the work to the real defects.
- Flag-off parity is designed in: the existing method is untouched and cache invalidation on flag change is handled.
- No new endpoint, permission, environment variable or dependency; the write path is limited to the data-gathering job.
- Observed-only storage with estimates computed at read time avoids persisting guesses.
- Honest flags (F-001 to F-008) instead of silent scope decisions.

## Sign-Off

- **Verdict:** approve_with_concerns
- **Overall score:** 74/100
- **ready_for_implementation:** true, subject to the conditions below and to explicit user confirmation of the migration
- **confidence_score:** 80
- **estimated_refinement_time:** none required before planning; conditions are folded into the implementation plan (about 1 hour of plan edits)
- **next_review_needed:** false

### Blocking issues

None. There are no critical findings.

### Conditions (implementation must address)

- **C-1 (ARCH-001):** FX-excluded holdings must be removed from `positions`, `valuesByAssetProfileIdentifier`, current value, investment and chart series, not merely marked `hasErrors`. An AC-004b test must assert the totals exclude the holding.
- **C-2 (ARCH-002):** Make the DI change additive: no new required constructor parameter on `ExchangeRateDataService` or `DataGatheringProcessor`. Add `isHistoricalFxEnabled` to the mock (returning false). The flag check must never throw. The 36 specs that construct the real service must pass without edits.
- **C-3 (ARCH-003):** Sync failures are caught and logged (pair and counts only) and never rethrown; the `MarketData` write remains authoritative. Apply the migration before deploying code that writes to the table.
- **C-4 (ARCH-005):** Use one documented date-key function for reading and storing rates and test it under a non-UTC time zone.
- **C-5 (F-007):** No migration file is created or applied until the user explicitly confirms.

### Concerns (verification will check)

- ARCH-004: correct the blast-radius figures (35 injection sites; 8 mock specs, 36 real-service specs).
- ARCH-006: resolve the flag once per calculation.
- MISS-001 to MISS-003, MISS-005: define log events, state rollback, make the notice accessible, document stale-snapshot behaviour.
- Decisions for the open flags:
  - F-001: accept the narrow `toCurrency` scope, with a user-visible note in the PR.
  - F-002: agree; change the AC-005b example to a non-ISO value.
  - F-003: accept.
  - F-004: agree, with C-1.
  - F-005: accept the precedence (new table wins) and record the limitation.
  - F-006: the 5-day threshold is reasonable.
  - F-008: accept (per user).

### Recommended actions

1. [CRITICAL] Resolve C-1 to C-5 in the implementation plan.
2. [CRITICAL] Obtain explicit migration confirmation before COMP-001 and COMP-002.
3. [SUGGESTED] Change the AC-005b example from "XXX" to a non-ISO code.
4. [SUGGESTED] Record in the PR that the table is mandated by the ticket and the read-path rules are the substantive change.

## Review History

| Iteration | Date       | Verdict               | Score | Notes                                             |
| --------- | ---------- | --------------------- | ----- | ------------------------------------------------- |
| 1         | 2026-11-05 | approve_with_concerns | 74    | Three major findings with small fixes; 0 critical |
