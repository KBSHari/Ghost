# Review Summary: SCRUM-65

## Meta

- **Ticket:** SCRUM-65 (FEAT-0002), Multi-Currency FX Conversion & Base Currency Normalization
- **Branch:** `SCRUM-65-fx-normalization` (from `main`), nothing committed
- **Date:** 2026-11-06
- **How the review was done:** The skill dispatches three independent reviewer agents (spec, tests, security). They were launched, but the user stopped them before they reported, so none of their output was used. The three reviews were then done inline by the same agent that wrote the code. That is less independent than the skill intends, so the review leaned on evidence that does not depend on judgement: mutation testing (18 deliberate breakages), empirical comparison against the existing lookup, coverage measurement and searches over the diff.
- **Model:** the session ran on Sonnet instead of the configured Haiku (recorded as a deviation in the pipeline state).

## Verdict

| Review          | Result                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Spec compliance | **Compliant.** 10 of 10 requirements met, conditions C-1 to C-5 met, no non-goal violated. One defect (BUG-001) found and fixed. |
| Tests           | **Adequate; gaps found and closed.** 2 gaps (TEST-001, TEST-002) fixed. 18 of 18 mutants killed after the fixes.                 |
| Security        | **Pass, no critical, high or medium findings.** 1 informational item and 1 low accepted risk.                                    |

## Spec Compliance

Gate decision: `spec_compliant: true`, `violations_found: []`, `over_built: []`, `under_built: []`, `path_mismatches: []`.

### Requirements

| Req                                                                         | Status                      | Evidence                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 table, unique per pair, date and source                             | Met                         | `prisma/schema.prisma:167` (model) and `:177` (unique key); store validation `exchange-rate-store.service.ts:101`; 18 store tests                                                                                                                     |
| REQ-002 stored first, then `MarketData`, values unchanged                   | Met                         | Precedence in `exchange-rate-resolver.ts` (stored rows added last); **bit-identical to the existing lookup on 12 pairs x 70 dates under three base currencies** (BUG-001 fixed to reach this); permanent test in `exchange-rate-data.service.spec.ts` |
| REQ-003 transaction-date and latest-rate conversion                         | Met                         | Already the calculator's behaviour for the "with currency effect" series (ASM-003); tested in `portfolio-calculator-fx-multi-currency.spec.ts` (300.52 investment, 333.54 value)                                                                      |
| REQ-004 carry forward earlier rate and flag, never 1:1, exclude and warn    | Met for the calculator path | `exchange-rate-resolver.ts:204` (`resolveLeg`) and `:253` (estimated flag); exclusion at `portfolio-calculator.ts:443`; totals asserted by test. `toCurrency` unchanged by design (F-001)                                                             |
| REQ-005 base currency per user, validated, recalculates                     | Met                         | Existing validator; `user.controller.ts:224` also clears the cache on a flag change; test with `ZZZ`                                                                                                                                                  |
| REQ-006 backfill through the gathering job, idempotent                      | Met                         | `data-gathering.processor.ts:165` calls `:199` (`syncExchangeRates`); unique-key upsert; 6 processor tests                                                                                                                                            |
| REQ-007 USD, EUR, GBP, CHF including cross pairs                            | Met                         | Cross pairs tested; all combinations bit-identical to the existing lookup in the parity probe                                                                                                                                                         |
| REQ-008 500 holdings under 2 s                                              | Met                         | Measured about 307 ms with providers mocked (test keeps a loose guard)                                                                                                                                                                                |
| REQ-009 gated by `isExperimentalFeatures`, off means identical              | Met                         | Flag check at `portfolio-calculator.ts:317`; all 36 existing calculator suites unchanged; flag-off test asserts no new field and the legacy call                                                                                                      |
| REQ-010 no personal data, writes only through gathering, no amounts in logs | Met                         | No route, DTO or permission added (searched); only writer is `syncExchangeRates`; every new log call is static text or symbol, data source and counts                                                                                                 |

### Design review conditions

| Condition                                           | Status | Evidence                                                                                                                                                          |
| --------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-1 holdings without a rate removed from all totals | Met    | `portfolio-calculator.ts:443`; test asserts total value 43,099.70 and investment 50,000 with a CHF holding excluded; mutant M01 (remove the `continue`) is caught |
| C-2 additive wiring, existing specs unchanged       | Met    | `@Optional()` trailing parameters (`exchange-rate-data.service.ts:63`); 36 calculator and 2 processor suites unchanged                                            |
| C-3 sync failures never rethrown                    | Met    | `data-gathering.processor.ts:244`; mutant M10 (rethrow) caught                                                                                                    |
| C-4 one date key, time-zone test                    | Met    | Shared key function in the resolver; 3 tests in `America/New_York`                                                                                                |
| C-5 migration written, not applied                  | Met    | SQL generated by Prisma's schema diff; never applied                                                                                                              |

### Non-goals and surface

No portfolio-profile entity, no per-activity override, no new provider; `MarketData` is untouched (schema diff is one added model). `package.json`, environment variables and permissions are unchanged. No new HTTP route.

### Accepted limitations (not violations)

- `toCurrency` is unchanged (F-001).
- A holding with a missing rate is excluded as a whole (F-004).
- Rates are read from 30 days before a range start.
- The account-balance history conversion uses `ExchangeRateDataService` lookups that this change does not alter.
- The user interface has not been run in a browser.

## Findings and Fixes

| ID       | Severity | Finding                                                                                                                                                                                                                                                       | Status                                                                                                       |
| -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| BUG-001  | Low      | Cross and inverse rates were computed as `b / a` and `1 / a` through `big.js`, which differs from the existing `(1 / a) * b` and `1 / a` in the last bit for 35 to 45 percent of dates (relative difference about 2e-16). AC-002b says results equal today's. | **Fixed**: same float arithmetic as the existing lookup; 5 regression tests added; re-measured bit-identical |
| TEST-001 | Medium   | No test covered `PortfolioService` passing `fxWarnings` through `getDetails` and `getPerformance`; deleting either line left all tests green (mutants M16, M17 survived).                                                                                     | **Fixed**: 4 tests; both mutants now caught                                                                  |
| TEST-002 | Low      | The design promised a check that no write route exists (AC-010a); it was never written.                                                                                                                                                                       | **Fixed**: test that neither service is a controller and no method is a route                                |
| TEST-003 | Low      | AC-006b ("provider fails mid-run") is not tested directly. The processor fetches first and writes once, so a provider failure throws before any row is written; the store-failure path is tested.                                                             | Open, accepted                                                                                               |
| TEST-004 | Info     | AC-008 asserts only a loose 15 s guard, to avoid a flaky timing test; the 2 s budget was verified by measurement (about 307 ms).                                                                                                                              | Accepted                                                                                                     |
| SEC-001  | Info     | With the flag on, a holding excluded for a missing rate is also absent from the public portfolio page. Warnings are deliberately not exposed to public viewers, so only the owner sees why.                                                                   | Open, informational                                                                                          |
| SEC-002  | Low      | Rates from the provider are checked to be finite and positive but have no upper plausibility bound. The same is true of `MarketData` today.                                                                                                                   | Accepted                                                                                                     |

## Test Review

### Coverage of new and changed logic

| File                             | Lines                                                                           | Branches                                                |
| -------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `exchange-rate-store.service.ts` | 100%                                                                            | 100%                                                    |
| `exchange-rate-resolver.ts`      | 98.9%                                                                           | 98.4% (only line 316, the overflow guard, is uncovered) |
| `exchange-rate-data.service.ts`  | both new methods fully covered (uncovered lines are existing methods)           |                                                         |
| `data-gathering.processor.ts`    | `syncExchangeRates` fully covered (uncovered lines are existing error branches) |                                                         |
| `portfolio-calculator.ts`        | `getExchangeRateWarnings` and the new rate branch fully covered                 |                                                         |

### Mutation testing

18 deliberate breakages, one at a time, each followed by the relevant specs. A first run reported some false "survivors" because the mutated code did not compile (an unused variable, unreachable code) or because of Windows line endings; those mutants were redesigned to compile, so every result below means the tests ran.

| Result                                | Count | Mutants                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caught by the original tests          | 16    | excluded holding stays in totals, end date ignored, flag ignored, warning cap, performance and details privacy omissions, flag true for any value, rate of zero accepted, carried-forward rows mirrored, sync rethrows, later rate used, staleness boundary, cache not cleared, weekend not flagged, source filter dropped, identical currencies accepted |
| Survived, then caught after new tests | 2     | service drops `fxWarnings` in `getPerformance` and in `getDetails`                                                                                                                                                                                                                                                                                        |

Every source file was restored byte-for-byte after each run (checksums compared).

## Security Review

Checked and found sound:

- **Secrets:** none in the diff or the new files.
- **Injection:** Prisma parameterised queries only; no raw SQL; the migration is purely additive; currency codes are validated by the existing helper.
- **Authorization and exposure:** `fxWarnings` leaves the API only through the two intended endpoints. Both omit it for restricted views and without the value scope; the performance endpoint also omits it in ZEN mode. The public portfolio endpoint and the MCP tools pick explicit fields and never return the field. In shared-access flows the flag is read for the viewed user, and the controller still withholds the field from viewers without the value scope.
- **Write path:** no new endpoint, DTO or permission; the only writer is the gathering processor, which uses provider data.
- **Logging and PII:** every new log call is static text or contains only a symbol, a data source or a count. The sync error log omits the underlying error text.
- **Denial of service:** at most 100 warnings per response; queries are bounded by the portfolio date range and a small set of currency pairs; the sync writes in batches of 500 and never retries a failed job.
- **Cross-site scripting:** the notice uses Angular interpolation only; no `innerHTML`, `bypassSecurityTrust` or similar.
- **Failure modes:** a failure to read the flag falls back to the existing behaviour; a missing store falls back to `MarketData`.

## Verification

| Suite  | Baseline        | After review fixes          |
| ------ | --------------- | --------------------------- |
| api    | 560 (83 suites) | 669 (90 suites), 1 snapshot |
| common | 178             | 178                         |
| ui     | 6               | 14                          |
| lint   | 0 errors        | 0 errors                    |

`tsc --noEmit` on the API app reports 0 errors; Prettier is clean on all 32 touched code files; no scratch or probe files remain.

## Open Items for Verification

1. Run the user interface in a browser (a weekend EUR or GBP activity with the flag on) and confirm the notice and the excluded-holding behaviour.
2. Apply the migration and run the admin "gather max" once, then confirm the new table fills.
3. Decide whether SEC-001 (public page silently omitting an excluded holding) needs a follow-up.
4. Translations are not extracted.
