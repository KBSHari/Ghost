# QA Test Plan: Multi-Currency FX Conversion & Base Currency Normalization

## Meta

- Ticket: SCRUM-65
- Classification: Large Feature
- Phase: 3b (QA Test Generation)
- Generated at: 2026-11-05T23:25:53.000+0530
- Test management: Zephyr Scale (no tool profile, plan-only)
- Automation intake: Playwright / Python / Allure, scope UI
- Fixture note: every rate and amount below is a fixed test fixture, not market data.

## Inputs Summary

- Acceptance criteria covered: 19 (AC-001a, AC-001b, AC-002a, AC-002b, AC-003a, AC-003b, AC-004a, AC-004b, AC-005a, AC-005b, AC-006a, AC-006b, AC-007a, AC-007b, AC-008, AC-009a, AC-009b, AC-010a, AC-010b).
- Requirements: REQ-001 to REQ-010 (see ph1_problem_spec.md).
- Components under test (ph2_design_spec.md): ExchangeRate table, ExchangeRateStoreService, ExchangeRateResolver, ExchangeRateDataService, PortfolioCalculator, PortfolioSnapshot and the portfolio responses, DataGatheringProcessor, UserController, GfFxRateWarningComponent and the Analysis page.
- Flag under test: isExperimentalFeatures (on, off, and toggled).
- Base currency scenarios: USD, CHF, EUR, TRY. Source currencies: EUR, GBP, CHF, GBp, JPY, TRY.
- Open design flags that affect expected results: F-002 (XXX), F-005 (store precedence), F-006 (5-day window).
- Case counts: 60 total = 3 per AC (functional positive, negative or validation, edge) = 57, plus 3 accessibility cases for the warning notice.

## Existing Zephyr Matches (JQL filter 28319)

Not queried - no Zephyr tool profile. Every case is therefore `decision: new`. Duplicates must be checked by a person against filter 28319 before registration.

## AC → Test Matrix

| AC      | Requirement | Test ids                       | Regression ids         | Decision |
| ------- | ----------- | ------------------------------ | ---------------------- | -------- |
| AC-001a | REQ-001     | TC-001, TC-002, TC-003         | -                      | new      |
| AC-001b | REQ-001     | TC-004, TC-005, TC-006         | -                      | new      |
| AC-002a | REQ-002     | TC-007, TC-008, TC-009         | TC-007, TC-008, TC-009 | new      |
| AC-002b | REQ-002     | TC-010, TC-011, TC-012         | TC-010, TC-011, TC-012 | new      |
| AC-003a | REQ-003     | TC-013, TC-014, TC-015         | TC-013, TC-014, TC-015 | new      |
| AC-003b | REQ-003     | TC-016, TC-017, TC-018         | TC-016, TC-017, TC-018 | new      |
| AC-004a | REQ-004     | TC-019, TC-020, TC-021, TC-022 | TC-019, TC-020, TC-021 | new      |
| AC-004b | REQ-004     | TC-023, TC-024, TC-025, TC-026 | TC-023, TC-024, TC-025 | new      |
| AC-005a | REQ-005     | TC-027, TC-028, TC-029         | TC-028, TC-029         | new      |
| AC-005b | REQ-005     | TC-030, TC-031, TC-032         | -                      | new      |
| AC-006a | REQ-006     | TC-033, TC-034, TC-035         | TC-033, TC-034, TC-035 | new      |
| AC-006b | REQ-006     | TC-036, TC-037, TC-038         | TC-036, TC-037, TC-038 | new      |
| AC-007a | REQ-007     | TC-039, TC-040, TC-041         | TC-039, TC-040, TC-041 | new      |
| AC-007b | REQ-007     | TC-042, TC-043, TC-044         | TC-042, TC-043, TC-044 | new      |
| AC-008  | REQ-008     | TC-045, TC-046, TC-047         | TC-045, TC-046, TC-047 | new      |
| AC-009a | REQ-009     | TC-048, TC-049, TC-050, TC-051 | TC-048, TC-049, TC-050 | new      |
| AC-009b | REQ-009     | TC-052, TC-053, TC-054         | TC-052, TC-053, TC-054 | new      |
| AC-010a | REQ-010     | TC-055, TC-056, TC-057         | -                      | new      |
| AC-010b | REQ-010     | TC-058, TC-059, TC-060         | -                      | new      |

## Test Cases

### TC-001 - Re-writing the same pair, date and source updates a single row

- type: integration
- related_acs: [AC-001a]
- priority: critical
- automation_layer: none
- feature flag (isExperimentalFeatures): n/a
- decision: new
- regression: false
- preconditions: Empty ExchangeRate table; store service wired to a test database.
- steps:
  1. Upsert EUR to USD, 2026-03-02, source YAHOO, rate 1.0800.
  2. Upsert the same key with rate 1.0810.
  3. Count rows for EUR/USD/2026-03-02/YAHOO.
- expected: Exactly 1 row; rate is 1.0810; updatedAt is later than createdAt; the call reports written=2, rejected=0.

### TC-002 - Two concurrent writes of the same key leave one row

- type: integration
- related_acs: [AC-001a]
- priority: high
- automation_layer: none
- feature flag (isExperimentalFeatures): n/a
- decision: new
- regression: false
- preconditions: Empty ExchangeRate table.
- steps:
  1. Fire two upserts in parallel for EUR to USD, 2026-03-02, YAHOO, with rates 1.0800 and 1.0810.
  2. Await both.
  3. Read the row.
- expected: Both calls resolve with no unique-constraint error; exactly 1 row exists; its rate is 1.0800 or 1.0810.

### TC-003 - Same pair and date from two different sources keeps two rows

- type: integration
- related_acs: [AC-001a]
- priority: medium
- automation_layer: none
- feature flag (isExperimentalFeatures): n/a
- decision: new
- regression: false
- preconditions: Empty table; two DataSource values available (YAHOO and one other configured source).
- steps:
  1. Upsert EUR to USD, 2026-03-02, 1.0800 with source YAHOO.
  2. Upsert the same pair and date, 1.0805, with the second source.
  3. Count rows.
- expected: 2 rows exist because the unique key includes source; neither write overwrites the other.

### TC-004 - A valid EUR to USD rate is accepted

- type: functional
- related_acs: [AC-001b]
- priority: critical
- automation_layer: none
- feature flag (isExperimentalFeatures): n/a
- decision: new
- regression: false
- preconditions: Empty ExchangeRate table.
- steps:
  1. Upsert EUR to USD, 2026-03-02, YAHOO, rate 1.0800.
  2. Read the table.
- expected: written=1, rejected=0; one row persisted with rate 1.0800.

### TC-005 - Zero, negative, NaN and malformed currency rows are rejected

- type: functional
- related_acs: [AC-001b]
- priority: critical
- automation_layer: none
- feature flag (isExperimentalFeatures): n/a
- decision: new
- regression: false
- preconditions: Empty ExchangeRate table.
- steps:
  1. Submit one batch of 5 rows: rate 0; rate -1.0800; rate NaN; currencyFrom "EURO"; currencyTo "us" (all dated 2026-03-02).
  2. Read the table and the captured logs.
- expected: written=0, rejected=5; the table is still empty; logs show counts and the pair only, no rate payload.

### TC-006 - Boundary values: smallest positive rate accepted, same-currency and impossible date rejected

- type: functional
- related_acs: [AC-001b]
- priority: high
- automation_layer: none
- feature flag (isExperimentalFeatures): n/a
- decision: new
- regression: false
- preconditions: Empty ExchangeRate table.
- steps:
  1. Submit three rows: EUR to USD rate 0.00000001; EUR to EUR rate 1; EUR to USD dated 2026-02-30.
  2. Read the table.
- expected: written=1 (the 0.00000001 row), rejected=2.

### TC-007 - A stored EURUSD rate is used for a EUR activity

- type: functional
- related_acs: [AC-002a]
- priority: critical
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Flag on; base currency USD; ExchangeRate has EUR to USD 2026-03-02 = 1.0800.
- steps:
  1. Value a 1000 EUR amount dated 2026-03-02 through the status-aware read.
- expected: 1080.00 USD; no ESTIMATED or MISSING warning.

### TC-008 - A store read failure falls back to MarketData

- type: integration
- related_acs: [AC-002a]
- priority: high
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Flag on; the store throws a database error; MarketData has USDEUR 2026-03-02 = 0.9200 (observed).
- steps:
  1. Value 1000 EUR dated 2026-03-02.
  2. Inspect the logs.
- expected: 1086.96 USD (1000 / 0.92); a warning is logged without amounts; the result is not 1000.00.

### TC-009 - When store and MarketData disagree the store wins

- type: integration
- related_acs: [AC-002a]
- priority: medium
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Flag on; ExchangeRate EUR to USD 2026-03-02 = 1.0800; MarketData USDEUR 2026-03-02 = 0.9100 (equivalent to 1.0989).
- steps:
  1. Value 1000 EUR dated 2026-03-02.
- expected: 1080.00 USD (design default for flag F-005).

### TC-010 - A MarketData-only rate gives the same result with the flag on and off

- type: functional
- related_acs: [AC-002b]
- priority: critical
- automation_layer: none
- feature flag (isExperimentalFeatures): both
- decision: new
- regression: true
- preconditions: ExchangeRate empty; MarketData USDEUR 2026-03-02 = 0.9200 (observed).
- steps:
  1. Value 1000 EUR dated 2026-03-02 with the flag off.
  2. Repeat with the flag on.
- expected: Both runs return 1086.96 USD.

### TC-011 - A carried-forward MarketData row keeps the number but is flagged estimated

- type: functional
- related_acs: [AC-002b]
- priority: high
- automation_layer: none
- feature flag (isExperimentalFeatures): both
- decision: new
- regression: true
- preconditions: MarketData USDEUR 2026-03-07 (Saturday) = 0.9250 with isCarriedForward true; ExchangeRate empty.
- steps:
  1. Value 1000 EUR dated 2026-03-07 with the flag off, then on.
- expected: Both return 1081.08 USD; the flag-on run adds an ESTIMATED warning for EUR/USD 2026-03-07; the flag-off run adds no warning.

### TC-012 - A cross pair through USD from MarketData is identical with the flag on and off

- type: functional
- related_acs: [AC-002b]
- priority: high
- automation_layer: none
- feature flag (isExperimentalFeatures): both
- decision: new
- regression: true
- preconditions: MarketData USDGBP 2026-03-02 = 0.7900 and USDEUR 2026-03-02 = 0.9200; ExchangeRate empty.
- steps:
  1. Value 1000 GBP to EUR dated 2026-03-02 with the flag off, then on.
- expected: Both return 1164.56 EUR (1000 x 0.92 / 0.79).

### TC-013 - EUR purchase investment uses the activity-date rate

- type: functional
- related_acs: [AC-003a]
- priority: critical
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Flag on; base USD; ExchangeRate EUR to USD 2026-03-02 = 1.0800 and 2026-11-05 = 1.1200.
- steps:
  1. Calculate a portfolio with BUY 10 units at 100 EUR dated 2026-03-02.
  2. Read the investment with currency effect.
- expected: Investment with currency effect = 1080.00 USD.

### TC-014 - A EUR fee is converted at the activity-date rate, not today's

- type: functional
- related_acs: [AC-003a]
- priority: high
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Same rates as above; the BUY carries a fee of 5 EUR.
- steps:
  1. Calculate the portfolio.
  2. Read feeInBaseCurrencyWithCurrencyEffect and feeInBaseCurrency.
- expected: Fee with currency effect = 5.40 USD (5 x 1.08); the plain fee uses today's rate = 5.60 USD (existing behaviour).

### TC-015 - A USD activity in a USD portfolio needs no rate lookup

- type: functional
- related_acs: [AC-003a]
- priority: medium
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Flag on; base USD; BUY 10 units at 100 USD dated 2026-03-02.
- steps:
  1. Calculate the portfolio with the store and MarketData spied on.
- expected: Investment 1000.00 USD; factor is 1; no store or MarketData query is made for USD to USD (EC-004).

### TC-016 - A later rate move leaves investment unchanged while current value follows the latest rate

- type: functional
- related_acs: [AC-003b]
- priority: critical
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Flag on; EUR to USD 2026-03-02 = 1.0800 and 2026-11-05 = 1.1200; BUY 10 at 100 EUR dated 2026-03-02; market price today 110 EUR.
- steps:
  1. Calculate the portfolio.
  2. Read investment with currency effect and current value.
- expected: Investment with currency effect = 1080.00 USD; current value = 10 x 110 x 1.12 = 1232.00 USD.

### TC-017 - The plain series still converts at today's rate

- type: functional
- related_acs: [AC-003b]
- priority: medium
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Same data as above.
- steps:
  1. Read the investment without currency effect.
- expected: 1120.00 USD (10 x 100 x 1.12); existing behaviour is unchanged.

### TC-018 - Today's rate window: a 3-day-old latest rate is not flagged, a 6-day-old one is

- type: functional
- related_acs: [AC-003b]
- priority: medium
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Flag on; today is 2026-11-05; run A: latest observed EUR to USD is 2026-11-02; run B: latest observed is 2026-10-30.
- steps:
  1. Calculate the same portfolio in run A and run B.
  2. Read fxWarnings for the end date 2026-11-05.
- expected: Run A: no warning for 2026-11-05. Run B: ESTIMATED warning for EUR/USD 2026-11-05 (F-006 5-day window).

### TC-019 - A Saturday activity uses Friday's rate and is flagged estimated

- type: functional
- related_acs: [AC-004a]
- priority: critical
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Flag on; ExchangeRate EUR to USD observed 2026-03-06 (Friday) = 1.0850; no rows for 2026-03-07 or 2026-03-08.
- steps:
  1. Calculate a portfolio with BUY 5 units at 200 EUR dated 2026-03-07.
  2. Read investment with currency effect and fxWarnings.
- expected: Investment = 1085.00 USD; fxWarnings contains EUR/USD 2026-03-07 ESTIMATED.

### TC-020 - A later Monday rate is never used for the Saturday

- type: functional
- related_acs: [AC-004a]
- priority: critical
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: As above, plus ExchangeRate EUR to USD 2026-03-09 (Monday) = 1.0900.
- steps:
  1. Calculate the same portfolio.
- expected: Investment is still 1085.00 USD, not 1090.00 USD (no later-rate fill).

### TC-021 - A ten-day gap carries the last observed rate once

- type: functional
- related_acs: [AC-004a]
- priority: high
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Last observed EUR to USD is 2026-03-06 = 1.0850; BUY 5 at 200 EUR dated 2026-03-16.
- steps:
  1. Calculate the portfolio.
  2. Read fxWarnings.
- expected: Investment 1085.00 USD; one ESTIMATED warning for 2026-03-16 (de-duplicated by pair, date and type).

### TC-022 - Estimated notice is announced politely and names the pair and date

- type: accessibility
- related_acs: [AC-004a]
- priority: high
- automation_layer: ui
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: false
- preconditions: Flag on; the user from the Saturday scenario is signed in.
- steps:
  1. Open Portfolio > Analysis.
  2. Inspect the notice with browser accessibility tools and a screen reader.
  3. Check contrast in light and dark themes.
- expected: The notice has role="status" (polite live region, not assertive); text names EUR/USD, 2026-03-07 and "estimated"; meaning is not conveyed by colour alone; text contrast is at least 4.5:1 in both themes.

### TC-023 - No earlier rate excludes the holding and returns a MISSING warning

- type: functional
- related_acs: [AC-004b]
- priority: critical
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Flag on; earliest stored EUR to USD is 2020-01-02; BUY 10 at 100 EUR dated 2019-01-02.
- steps:
  1. Calculate the portfolio.
  2. Read errors, hasErrors, performance values and fxWarnings.
- expected: The holding is in errors; hasErrors is true; its performance values are null; fxWarnings contains EUR/USD 2019-01-02 MISSING.

### TC-024 - The excluded amount is never converted 1:1

- type: functional
- related_acs: [AC-004b]
- priority: critical
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Same as above, plus a second USD holding worth 500.00 USD.
- steps:
  1. Calculate the portfolio.
  2. Read total investment and current value.
- expected: Totals equal the USD holding only (500.00 USD); 1000.00 does not appear as an unconverted EUR amount.

### TC-025 - A currency with no data at all (TRY) is missing for every relevant date while other holdings stay valued

- type: functional
- related_acs: [AC-004b]
- priority: high
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Flag on; no USDTRY rows anywhere; a TRY holding bought 2026-03-02 and a USD holding worth 500.00 USD.
- steps:
  1. Calculate the portfolio.
  2. Read errors and fxWarnings.
- expected: The TRY holding is excluded with MISSING warnings for its activity date and the end date; the USD holding is valued at 500.00 USD.

### TC-026 - Missing-rate notice is keyboard reachable and readable

- type: accessibility
- related_acs: [AC-004b]
- priority: high
- automation_layer: ui
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: false
- preconditions: Flag on; the user from the 2019 scenario is signed in; viewport 320 px wide, then desktop.
- steps:
  1. Open Portfolio > Analysis.
  2. Press Tab through the page.
  3. Activate any disclosure control with Enter and Space.
  4. Read the notice with a screen reader.
- expected: The notice or its control gets focus in logical order with a visible focus ring; Enter and Space work; the screen reader reads "Missing rate: EUR to USD on 2019-01-02"; contrast is at least 4.5:1 in both themes; no horizontal scroll at 320 px.

### TC-027 - Switching base currency from USD to CHF re-expresses values

- type: e2e
- related_acs: [AC-005a]
- priority: critical
- automation_layer: ui
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: false
- preconditions: Flag on; MarketData USDEUR 2026-03-02 = 0.9200 and USDCHF 2026-03-02 = 0.8800; BUY 10 at 100 EUR dated 2026-03-02; base currency USD.
- steps:
  1. Open Portfolio > Analysis and note the investment (1,086.96 USD).
  2. Open account settings and select CHF as base currency.
  3. Wait for the refresh (debounce 5 s plus recompute).
  4. Return to Analysis.
- expected: Investment shows 956.52 CHF (1000 x 0.88 / 0.92); the currency label is CHF on every figure.

### TC-028 - Switching to a currency with no rates reports MISSING instead of converting 1:1

- type: functional
- related_acs: [AC-005a]
- priority: high
- automation_layer: api
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Flag on; the portfolio holds EUR and USD assets; no TRY rates exist.
- steps:
  1. PUT the user setting baseCurrency = TRY.
  2. After the recompute, GET the portfolio performance.
- expected: Holdings that need a rate are excluded with MISSING warnings; no figure is silently equal to its unconverted amount.

### TC-029 - Rapid switching USD to CHF to EUR to CHF recomputes once with the final state

- type: integration
- related_acs: [AC-005a]
- priority: medium
- automation_layer: api
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Flag on; the portfolio-changed listener uses its 5 s debounce.
- steps:
  1. Within 5 seconds PUT baseCurrency CHF, EUR, then CHF.
  2. Wait for the recompute.
  3. GET the portfolio performance.
- expected: Exactly one portfolio-changed processing run for the user; all values are in CHF.

### TC-030 - A valid code is accepted

- type: functional
- related_acs: [AC-005b]
- priority: high
- automation_layer: api
- feature flag (isExperimentalFeatures): n/a
- decision: new
- regression: false
- preconditions: Signed-in user with updateUserSettings permission.
- steps:
  1. PUT the user setting baseCurrency = "CHF".
  2. GET the user.
- expected: HTTP 200; the stored base currency is CHF; the portfolio-changed event is emitted.

### TC-031 - Invalid codes are rejected with 400 and the setting is unchanged

- type: functional
- related_acs: [AC-005b]
- priority: critical
- automation_layer: api
- feature flag (isExperimentalFeatures): n/a
- decision: new
- regression: false
- preconditions: Signed-in user whose base currency is USD.
- steps:
  1. PUT baseCurrency = "ZZZ".
  2. PUT baseCurrency = "usd".
  3. PUT baseCurrency = "US".
  4. PUT baseCurrency = "".
  5. GET the user after each call.
- expected: Each call returns HTTP 400; the base currency stays USD. (This replaces the "XXX" example, see F-002.)

### TC-032 - Behaviour for "XXX" is recorded (pending F-002)

- type: functional
- related_acs: [AC-005b]
- priority: medium
- automation_layer: api
- feature flag (isExperimentalFeatures): n/a
- decision: new
- regression: false
- preconditions: Signed-in user whose base currency is USD.
- steps:
  1. PUT baseCurrency = "XXX" (the ISO 4217 code for "no currency").
  2. Record the response and the stored value.
- expected: Expected today: HTTP 200 because the existing validator accepts it. The test documents the actual result and is revisited when the F-002 decision is made.

### TC-033 - Backfill is idempotent

- type: integration
- related_acs: [AC-006a]
- priority: critical
- automation_layer: none
- feature flag (isExperimentalFeatures): n/a
- decision: new
- regression: true
- preconditions: EUR activities since 2024-01-01; the provider mock returns USDEUR for 2024-01-01 to 2026-11-04 with weekend days carried forward.
- steps:
  1. Run the existing "gather max" job.
  2. Count ExchangeRate rows.
  3. Run the job again.
  4. Count and group by currencyFrom, currencyTo, date, source.
- expected: Both counts are equal; every group has exactly 1 row.

### TC-034 - Carried-forward days are not mirrored

- type: integration
- related_acs: [AC-006a]
- priority: high
- automation_layer: none
- feature flag (isExperimentalFeatures): n/a
- decision: new
- regression: true
- preconditions: Same data; 2024-01-06 and 2024-01-07 are a weekend.
- steps:
  1. Run the job.
  2. Query ExchangeRate and MarketData for those two dates.
- expected: MarketData has rows flagged isCarriedForward; ExchangeRate has none for those dates.

### TC-035 - A user with no activities triggers no extra fetch and no error

- type: integration
- related_acs: [AC-006a]
- priority: medium
- automation_layer: none
- feature flag (isExperimentalFeatures): n/a
- decision: new
- regression: true
- preconditions: No activities and no accounts for any user (EC-001).
- steps:
  1. Run the job.
- expected: The job completes without error; no ExchangeRate rows exist for unused currencies.

### TC-036 - A provider failure mid-run keeps earlier rows valid

- type: integration
- related_acs: [AC-006b]
- priority: critical
- automation_layer: none
- feature flag (isExperimentalFeatures): n/a
- decision: new
- regression: true
- preconditions: Provider mock returns data for 2024-01-01 to 2024-06-30 and then throws.
- steps:
  1. Run the job.
  2. Inspect rows and logs.
- expected: The job fails and is eligible for retry; rows already written are valid (rate above 0, no duplicates); MarketData writes are unaffected; logs contain counts and the pair, no amounts.

### TC-037 - A retry after the failure completes without duplicates

- type: integration
- related_acs: [AC-006b]
- priority: high
- automation_layer: none
- feature flag (isExperimentalFeatures): n/a
- decision: new
- regression: true
- preconditions: State left by the previous test; the provider is healthy again.
- steps:
  1. Run the job again.
  2. Count rows grouped by key.
- expected: History is complete up to yesterday; every key has exactly 1 row.

### TC-038 - Invalid provider values are skipped and counted

- type: integration
- related_acs: [AC-006b]
- priority: medium
- automation_layer: none
- feature flag (isExperimentalFeatures): n/a
- decision: new
- regression: true
- preconditions: Provider returns 0 for 2024-03-04 and NaN for 2024-03-05; valid values elsewhere.
- steps:
  1. Run the job.
- expected: Those two days are rejected (rejected=2) and have no row; all other days are written; the job completes.

### TC-039 - GBP to CHF cross rate is applied

- type: functional
- related_acs: [AC-007a]
- priority: critical
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Flag on; USDGBP 2026-03-02 = 0.7900 and USDCHF 2026-03-02 = 0.8800.
- steps:
  1. Convert 1000 GBP to CHF dated 2026-03-02.
- expected: 1113.92 CHF (1000 x 0.88 / 0.79); observed, no warning.

### TC-040 - A cross where the CHF leg is missing is MISSING, not 1:1

- type: functional
- related_acs: [AC-007a]
- priority: high
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: USDGBP present on 2026-03-02; no USDCHF rows.
- steps:
  1. Convert 1000 GBP to CHF dated 2026-03-02.
- expected: A MISSING warning for GBP/CHF 2026-03-02; the result is not 1000.

### TC-041 - The derived currency GBp converts through GBP

- type: functional
- related_acs: [AC-007a]
- priority: medium
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Same rates as the first case in this group; derived factor 100 from DERIVED_CURRENCIES.
- steps:
  1. Convert 10000 GBp to CHF dated 2026-03-02.
- expected: 111.39 CHF (100 GBP x 1.113924).

### TC-042 - A pair the provider lacks (JPY) is handled as missing

- type: functional
- related_acs: [AC-007b]
- priority: high
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: No USDJPY rows; a JPY holding.
- steps:
  1. Calculate the portfolio.
- expected: MISSING warnings for the JPY pair; the holding is excluded; no 1:1.

### TC-043 - One estimated leg makes the pair estimated

- type: functional
- related_acs: [AC-007b]
- priority: high
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: USDGBP observed 2026-03-06 = 0.7900; USDCHF last observed 2026-03-05 = 0.8800.
- steps:
  1. Convert 1000 GBP to CHF dated 2026-03-06.
- expected: 1113.92 CHF flagged ESTIMATED (the CHF leg was carried forward).

### TC-044 - Only the inverse direction is stored

- type: functional
- related_acs: [AC-007b]
- priority: medium
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: ExchangeRate holds EUR to USD 2026-03-02 = 1.0800 only.
- steps:
  1. Convert 1000 USD to EUR dated 2026-03-02.
- expected: 925.93 EUR (1000 / 1.08); observed, no warning.

### TC-045 - 500 holdings in 4 currencies finish under 2 seconds at p95

- type: integration
- related_acs: [AC-008]
- priority: high
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: 125 holdings each in USD, EUR, GBP and CHF; one year of daily rows; store and MarketData mocked; flag on.
- steps:
  1. Run the calculation 20 times.
  2. Record durations and the number of data-store queries per calculation.
- expected: p95 is below 2000 ms; at most 2 data-store queries per calculation (store plus MarketData).

### TC-046 - Flag-on p95 is within 10% of flag-off p95

- type: integration
- related_acs: [AC-008]
- priority: medium
- automation_layer: none
- feature flag (isExperimentalFeatures): both
- decision: new
- regression: true
- preconditions: Same data as above.
- steps:
  1. Run 20 calculations with the flag off and 20 with it on.
- expected: Flag-on p95 is at most 1.10 times the flag-off p95 (informational, assumption ASM-005).

### TC-047 - A ten-year range stays under 2 seconds

- type: integration
- related_acs: [AC-008]
- priority: medium
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Same 500 holdings; portfolio start 2016-11-05.
- steps:
  1. Run the calculation 20 times.
- expected: p95 below 2000 ms; memory does not grow across runs.

### TC-048 - Flag off: snapshot equals the pre-change reference

- type: functional
- related_acs: [AC-009a]
- priority: critical
- automation_layer: none
- feature flag (isExperimentalFeatures): off
- decision: new
- regression: true
- preconditions: An existing multi-currency calculator reference portfolio with a stored pre-change snapshot; flag off.
- steps:
  1. Calculate the portfolio.
  2. Compare the serialised snapshot with the stored reference.
- expected: Identical numbers; no fxWarnings field.

### TC-049 - Flag off with a missing rate keeps the legacy behaviour

- type: functional
- related_acs: [AC-009a]
- priority: high
- automation_layer: none
- feature flag (isExperimentalFeatures): off
- decision: new
- regression: true
- preconditions: Flag off; EUR holding with no EUR to USD rate.
- steps:
  1. Calculate the portfolio.
- expected: Legacy outcome is unchanged (silent 1:1 plus an error log); no exclusion and no warnings.

### TC-050 - Toggling off, on, off restores the original numbers

- type: integration
- related_acs: [AC-009a]
- priority: high
- automation_layer: api
- feature flag (isExperimentalFeatures): both
- decision: new
- regression: true
- preconditions: A user with a Saturday EUR activity and an existing cached snapshot.
- steps:
  1. Record the performance response.
  2. PUT isExperimentalFeatures true; wait for the recompute; record.
  3. PUT isExperimentalFeatures false; wait; record.
- expected: Each toggle emits the portfolio-changed event and refreshes the snapshot; the first and last responses are identical; no stale cache is served.

### TC-051 - Flag off: no notice element and no announcement

- type: accessibility
- related_acs: [AC-009a]
- priority: high
- automation_layer: ui
- feature flag (isExperimentalFeatures): off
- decision: new
- regression: false
- preconditions: Flag off; the user from the Saturday scenario is signed in.
- steps:
  1. Open Portfolio > Analysis.
  2. Inspect the DOM and listen with a screen reader.
- expected: No fx-rate warning element exists; nothing is announced; values match those before the release.

### TC-052 - Flag on applies the transaction-date and missing-rate rules

- type: functional
- related_acs: [AC-009b]
- priority: critical
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: Flag on; the Saturday 2026-03-07 EUR activity scenario.
- steps:
  1. Calculate the portfolio.
- expected: Investment 1085.00 USD and an ESTIMATED warning, as in the Saturday scenario.

### TC-053 - Per-user isolation: user A on, user B off

- type: integration
- related_acs: [AC-009b]
- priority: high
- automation_layer: api
- feature flag (isExperimentalFeatures): both
- decision: new
- regression: true
- preconditions: Two users with identical activities; A has the flag on, B off.
- steps:
  1. GET the performance for A and for B in quick succession.
- expected: A receives fxWarnings and estimated handling; B receives legacy output; neither response is served from the other's cache.

### TC-054 - A snapshot cached before the release loads without error

- type: integration
- related_acs: [AC-009b]
- priority: medium
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: true
- preconditions: A Redis snapshot serialised without fxWarnings.
- steps:
  1. Load the snapshot and build the details and performance responses.
- expected: No error; fxWarnings is absent; the next portfolio change recomputes it.

### TC-055 - No HTTP route writes exchange rates

- type: functional
- related_acs: [AC-010a]
- priority: critical
- automation_layer: api
- feature flag (isExperimentalFeatures): n/a
- decision: new
- regression: false
- preconditions: Application started; route list captured before and after the change.
- steps:
  1. Diff the registered routes.
  2. Send POST, PUT and DELETE to the existing exchange-rates endpoint and to /exchange-rate paths.
- expected: Zero new routes; write requests return 404 or 405.

### TC-056 - Unauthenticated and non-admin callers cannot reach rate-adjacent actions

- type: functional
- related_acs: [AC-010a]
- priority: high
- automation_layer: api
- feature flag (isExperimentalFeatures): n/a
- decision: new
- regression: false
- preconditions: An unauthenticated client and a signed-in USER role client.
- steps:
  1. GET portfolio performance without a token.
  2. As the USER role call the existing admin data-gathering action.
- expected: HTTP 401 for the unauthenticated call; HTTP 403 for the non-admin admin-action call.

### TC-057 - The data-gathering job is the only writer

- type: integration
- related_acs: [AC-010a]
- priority: medium
- automation_layer: none
- feature flag (isExperimentalFeatures): n/a
- decision: new
- regression: false
- preconditions: Empty ExchangeRate table; an admin signed in.
- steps:
  1. Trigger the existing admin "gather max" action.
  2. Wait for the job.
  3. Read ExchangeRate.
- expected: Rows appear only after the job runs; no API path writes to the table directly.

### TC-058 - No amounts in logs during a valuation

- type: functional
- related_acs: [AC-010b]
- priority: critical
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: false
- preconditions: Holding of 12.3456 units at 100 EUR (value 1234.56 EUR); log capture enabled.
- steps:
  1. Calculate the portfolio with a MISSING and an ESTIMATED case present.
  2. Search the captured logs.
- expected: No log line contains "1234.56", "1,234.56" or "12.3456".

### TC-059 - A rejected write logs the pair and counts only

- type: functional
- related_acs: [AC-010b]
- priority: high
- automation_layer: none
- feature flag (isExperimentalFeatures): n/a
- decision: new
- regression: false
- preconditions: Log capture enabled.
- steps:
  1. Upsert EUR to USD with rate -1.0800.
- expected: The log names EUR, USD and rejected=1; it does not contain "-1.08".

### TC-060 - Warning logs carry pair and date but no quantities or user amounts

- type: functional
- related_acs: [AC-010b]
- priority: medium
- automation_layer: none
- feature flag (isExperimentalFeatures): on
- decision: new
- regression: false
- preconditions: A MISSING EUR/USD 2019-01-02 case; log capture enabled.
- steps:
  1. Calculate the portfolio.
  2. Inspect the warning log lines.
- expected: Lines include the pair and date; no quantity, price, total or user email.

## Regression Subset

Rules applied (Step 5): R-MOD = functional or integration case whose AC modifies an existing component confirmed in the codebase scan; R-BC = case asserting a backward-compatibility invariant. The ph1 spec marks no must-pass critical path, so that rule did not fire. Accessibility and e2e cases are excluded by type.

| Test id | Jira key             | Rule fired                                                                                                                                    | Automation layer | Repo location                                                                                                       |
| ------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| TC-007  | planned, not created | R-MOD: AC modifies existing ExchangeRateDataService                                                                                           | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-008  | planned, not created | R-MOD: AC modifies existing ExchangeRateDataService                                                                                           | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-009  | planned, not created | R-MOD: AC modifies existing ExchangeRateDataService                                                                                           | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-010  | planned, not created | R-MOD: AC modifies existing ExchangeRateDataService; R-BC: asserts a backward-compatibility invariant (REQ-009 parity / AC-002b)              | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-011  | planned, not created | R-MOD: AC modifies existing ExchangeRateDataService; R-BC: asserts a backward-compatibility invariant (REQ-009 parity / AC-002b)              | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-012  | planned, not created | R-MOD: AC modifies existing ExchangeRateDataService; R-BC: asserts a backward-compatibility invariant (REQ-009 parity / AC-002b)              | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-013  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator                                                                                               | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-014  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator                                                                                               | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-015  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator                                                                                               | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-016  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator                                                                                               | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-017  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator                                                                                               | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-018  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator                                                                                               | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-019  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator / ExchangeRateDataService                                                                     | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-020  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator / ExchangeRateDataService                                                                     | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-021  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator / ExchangeRateDataService                                                                     | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-023  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator / ExchangeRateDataService                                                                     | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-024  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator / ExchangeRateDataService                                                                     | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-025  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator / ExchangeRateDataService                                                                     | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-028  | planned, not created | R-MOD: AC modifies existing UserController / PortfolioCalculator                                                                              | api              | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-029  | planned, not created | R-MOD: AC modifies existing UserController / PortfolioCalculator                                                                              | api              | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-033  | planned, not created | R-MOD: AC modifies existing DataGatheringProcessor                                                                                            | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-034  | planned, not created | R-MOD: AC modifies existing DataGatheringProcessor                                                                                            | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-035  | planned, not created | R-MOD: AC modifies existing DataGatheringProcessor                                                                                            | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-036  | planned, not created | R-MOD: AC modifies existing DataGatheringProcessor                                                                                            | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-037  | planned, not created | R-MOD: AC modifies existing DataGatheringProcessor                                                                                            | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-038  | planned, not created | R-MOD: AC modifies existing DataGatheringProcessor                                                                                            | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-039  | planned, not created | R-MOD: AC modifies existing ExchangeRateDataService                                                                                           | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-040  | planned, not created | R-MOD: AC modifies existing ExchangeRateDataService                                                                                           | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-041  | planned, not created | R-MOD: AC modifies existing ExchangeRateDataService                                                                                           | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-042  | planned, not created | R-MOD: AC modifies existing ExchangeRateDataService                                                                                           | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-043  | planned, not created | R-MOD: AC modifies existing ExchangeRateDataService                                                                                           | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-044  | planned, not created | R-MOD: AC modifies existing ExchangeRateDataService                                                                                           | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-045  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator                                                                                               | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-046  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator                                                                                               | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-047  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator                                                                                               | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-048  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator / UserController; R-BC: asserts a backward-compatibility invariant (REQ-009 parity / AC-002b) | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-049  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator / UserController; R-BC: asserts a backward-compatibility invariant (REQ-009 parity / AC-002b) | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-050  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator / UserController; R-BC: asserts a backward-compatibility invariant (REQ-009 parity / AC-002b) | api              | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-052  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator / UserController                                                                              | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-053  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator / UserController                                                                              | api              | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |
| TC-054  | planned, not created | R-MOD: AC modifies existing PortfolioCalculator / UserController                                                                              | none             | not automated - outside Automation Scope (UI) and Step 6 skipped; covered by Jest suites in the implementation plan |

Regression subset size: 41 of 60 cases.

## Jira Issues Created / Linked

None created: Zephyr Scale has no tool profile, so this run is plan-only and no Atlassian tool was called. 60 tests are recorded as planned in `.state/qa_jira_issues.json` (created: false) with deterministic dedup keys.

| Jira key | Action           | Parent link |
| -------- | ---------------- | ----------- |
| -        | none (plan-only) | SCRUM-65    |

## Automation PR

- Branch: none
- PR URL: skipped - no QA automation repo configured (client-notes/qa-test-generation.md does not exist)
- Language / framework / reporting: n/a (intake lists Python, Playwright, Allure)
- Lint status: skipped

## Sign-Off

- Status: partial-(jira-only)
- Notes:
  - Both limits apply: no Zephyr tool profile (plan-only, nothing registered) and no QA automation repo (no PR).
  - Step 7 (Jira summary comment) skipped: the auto-mode classifier already blocked the Phase 1 comment on this ticket and the same outcome is not retried. The orchestrator reports the phase status to the user.
  - Intake mismatch: docs/intake-sources.md says Automation Exists: yes, while client-kb.md says Automation exists: no. Needs a person to confirm which is correct before any automation is built.
  - Most cases are calculator, service or API level; only 4 use the UI layer, so the UI-scoped Playwright suite would cover little of this feature.
  - Expected numbers are derived from the stated fixtures only; the XXX case (F-002) records actual behaviour and must be revisited after the design-review decision.
