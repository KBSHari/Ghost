# Problem Specification: Multi-Currency FX Conversion & Base Currency Normalization

## Meta

- **Ticket ID:** SCRUM-65
- **Feature ID:** FEAT-0002
- **Title:** Multi-Currency FX Conversion & Base Currency Normalization
- **Classification:** Large Feature
- **Date:** 2026-11-05
- **Author:** Claude Code (sdlc-requirements), requested by KBSHari
- **Status:** Approved by user (2026-11-05T22:58:35+0530). All interrogation answers were delegated to the author, so every assumption below is unvalidated.
- **Scope:** A dedicated daily-close FX rate table, rate lookup with fallback to existing market data, transaction-date conversion rules for valuation, a safe missing-rate policy, historical backfill, base currency validation, and rollout behind `isExperimentalFeatures`.
- **Platforms:** API (NestJS) and Web client (Angular, where valuation warnings surface).

## Problem Statement

Users holding assets in several currencies (USD, EUR, GBP, CHF) need every transaction converted to one base currency at the rate on the transaction date. Ghostfolio already stores daily FX rates in `MarketData`, but missing-rate handling is inconsistent and can silently convert 1:1, and the dedicated rate table the ticket asks for does not exist.

## Requirements

| ID      | Type           | Priority | Description                                                                                                                                                                                                                                                            |
| ------- | -------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 | functional     | P0       | The system shall persist daily close FX rates (from currency, to currency, date, rate, source) in a PostgreSQL table managed via Prisma, unique per pair, date and source.                                                                                             |
| REQ-002 | functional     | P0       | The system shall resolve the rate for a supported pair and date from stored rates, falling back to existing `MarketData` rates, so values are unchanged wherever rates already exist.                                                                                  |
| REQ-003 | functional     | P0       | Valuation shall convert each non-base-currency activity's cost basis, investment and fees at the close rate on the activity date, and current value at the latest close rate.                                                                                          |
| REQ-004 | functional     | P0       | When no rate exists for a date, the system shall use the most recent earlier rate and flag the value as estimated. It shall never convert 1:1 silently. If no earlier rate exists, it shall exclude the affected amount and return a warning naming the pair and date. |
| REQ-005 | functional     | P0       | Base currency shall remain a per-user setting. It shall accept only supported currency codes, and changing it shall recalculate all converted values.                                                                                                                  |
| REQ-006 | functional     | P1       | The system shall backfill historical rates from the earliest activity date per held currency via the existing data-gathering job, idempotently.                                                                                                                        |
| REQ-007 | functional     | P0       | USD, EUR, GBP and CHF shall be guaranteed supported, including cross pairs (for example GBP to CHF). Currencies already supported shall keep working.                                                                                                                  |
| REQ-008 | non-functional | P1       | Valuing 500 holdings across 4 currencies shall complete within 2 s at p95, with rates read from the database only (excluding external provider calls).                                                                                                                 |
| REQ-009 | functional     | P0       | The new behaviour shall be gated behind `isExperimentalFeatures`. When off, results shall be identical to today's.                                                                                                                                                     |
| REQ-010 | security       | P0       | The FX table shall hold no personal data. Writes shall happen only through data gathering or admin permission. Logs shall not contain user amounts.                                                                                                                    |

## Acceptance Criteria

- **AC-001a (REQ-001):** Given a stored EURUSD rate for 2026-03-02, when the same pair, date and source is written again, then one row exists with the updated rate.
- **AC-001b (REQ-001):** Given a rate of 0, a negative rate or a non-ISO currency code, when written, then it is rejected and nothing is persisted.
- **AC-002a (REQ-002):** Given EURUSD for date D is stored, when a EUR activity on D is valued in USD, then it uses that rate.
- **AC-002b (REQ-002):** Given the rate exists only in `MarketData`, when the same activity is valued, then the result equals today's result.
- **AC-003a (REQ-003):** Given a EUR buy on date D with base USD, when valued, then investment equals quantity x price x rate(D).
- **AC-003b (REQ-003):** Given the EUR/USD rate moves after D, when valued, then investment is unchanged and current value uses the latest rate.
- **AC-004a (REQ-004):** Given an activity on a Saturday with no rate, when valued, then Friday's rate is used and the value is flagged estimated.
- **AC-004b (REQ-004):** Given no earlier rate exists, when valued, then the amount is excluded, a warning names the pair and date, and no 1:1 conversion occurs.
- **AC-005a (REQ-005):** Given base currency changes from USD to CHF, when values are read, then all converted values are in CHF at the rates of their respective dates.
- **AC-005b (REQ-005):** Given base currency "XXX", when the setting is submitted, then the request returns 400 and the setting is unchanged.
- **AC-006a (REQ-006):** Given activities since 2024-01-01 in EUR, when backfill runs twice, then exactly one row per day exists.
- **AC-006b (REQ-006):** Given the provider fails mid-run, when backfill stops, then rows already written stay valid and the failure is logged without user data.
- **AC-007a (REQ-007):** Given GBPUSD and CHFUSD rates, when GBP is converted to CHF, then the cross rate is applied.
- **AC-007b (REQ-007):** Given a pair the provider lacks, when it is converted, then REQ-004 handling applies.
- **AC-008 (REQ-008):** Given 500 holdings in 4 currencies, when the portfolio loads with provider calls mocked, then p95 is under 2 s.
- **AC-009a (REQ-009):** Given the flag is off, when valuations run, then outputs equal the pre-change snapshot.
- **AC-009b (REQ-009):** Given the flag is on, when valuations run, then the REQ-003 and REQ-004 rules apply.
- **AC-010a (REQ-010):** Given an unauthenticated or non-admin caller, when writing a rate, then it is rejected.
- **AC-010b (REQ-010):** Given any rate or valuation log line, when logs are inspected, then they contain no user amounts or identifiers.

## Constraints

- Any schema change must be additive only. No Prisma migration shall be created or applied until the user explicitly confirms it (client guardrail; see DL-005 and ASM-001).
- The existing `MarketData` schema and asset quote data shall not change.
- The existing rate provider setting `DATA_SOURCE_EXCHANGE_RATES` shall be kept; no new provider is introduced.
- Feature flag: `isExperimentalFeatures` (existing user setting). No new feature-flag system and no new environment variable.
- Valuation of 500 holdings across 4 currencies shall complete within 2 s at p95 (REQ-008).
- Compliance (PCI-DSS, HIPAA, GDPR): no personal data in the rate table; no user amounts in logs.
- Tests: run the API test suite after every changed file; no batching.

## Non-Goals

- **NG-001:** No new "portfolio profile" entity and no multi-profile support. Base currency stays per user. Rationale: the repo has no profile concept, and introducing one is a much larger change.
- **NG-002:** No per-activity manual rate override by users. Rationale: expands scope and creates a data-integrity surface.
- **NG-003:** No new rate provider. Rationale: avoids new vendor, API key and cost decisions.
- **NG-004:** No change to asset quote data or the `MarketData` schema. Rationale: the fallback to `MarketData` must keep today's numbers unchanged.
- **NG-005:** No realised FX gain/loss reporting. Rationale: separate analytics feature, not requested.

## Assumptions

All assumptions below carry `validation_needed: true`.

- **ASM-001 (risk_if_wrong: high, validation_needed: true):** Migration authorization will be given at a later gate. Without it the table cannot ship.
- **ASM-002 (risk_if_wrong: high, validation_needed: true):** "Per portfolio profile" in the ticket means per user. If a real profile entity is wanted, the scope is much larger.
- **ASM-003 (risk_if_wrong: high, validation_needed: true):** The calculator may not already use transaction-date rates for every metric. Architecture must characterise current behaviour before changing it.
- **ASM-004 (risk_if_wrong: medium, validation_needed: true):** The existing provider has data for EUR, GBP and CHF back to the earliest activity.
- **ASM-005 (risk_if_wrong: medium, validation_needed: true):** A 2 s budget for 500 holdings is achievable with database-only reads.
- **ASM-006 (risk_if_wrong: low, validation_needed: true):** FX rates are non-personal data, and a user's base currency is a preference deleted by the existing cascade delete.
- **ASM-007 (risk_if_wrong: medium, validation_needed: true):** The rate source for backfill is the same provider already configured.

## Edge Cases

- **EC-001 (REQ-006):** A new user with no activities triggers no rate fetch and no error.
- **EC-002 (REQ-004):** An activity on a weekend or holiday uses the previous available rate, flagged estimated.
- **EC-003 (REQ-004):** An activity dated before any available rate is excluded with a warning naming the pair and date.
- **EC-004 (REQ-003):** Same-currency conversion (for example USD to USD) uses a factor of 1 with no lookup.
- **EC-005 (REQ-002):** The derived currency GBp (pence) keeps its existing factor handling.
- **EC-006 (REQ-001):** A provider value of 0, negative or NaN is rejected and not stored.

## Backward Compatibility

No breaking changes identified. Analysis across the six dimensions:

1. **API contracts:** additive only (an optional "estimated" flag and warnings on valuation results).
2. **Data schemas:** one new additive table; no existing table changes.
3. **Shared libraries:** only additive changes to `libs/common` interfaces.
4. **Event contracts:** unchanged. The existing portfolio-changed event on base currency change is kept.
5. **Configuration:** no new environment variable or infrastructure.
6. **Behaviour:** with the flag off, behaviour is identical. With the flag on, the silent 1:1 fallback becomes a warning, which is an intended behaviour change.

## Decision Log

| #      | Decision                                                              | Alternatives Considered                  | Why Chosen                                                                                 | Q&A Round           |
| ------ | --------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------- |
| DL-001 | New additive rate table, with `MarketData` kept as fallback           | Reuse `MarketData` only; replace it      | The ticket asks for the table, and the fallback keeps today's numbers unchanged            | Round 1 (delegated) |
| DL-002 | Base currency stays per user                                          | New profile entity; per-account override | The repo has no profile concept, and the ticket's "profile" is read as the user's settings | Round 1 (delegated) |
| DL-003 | Missing rate: carry forward and flag, never 1:1                       | Log only; hard fail                      | The silent 1:1 fallback is the main defect, and a flag keeps the result usable             | Round 1 (delegated) |
| DL-004 | Keep the existing rate provider                                       | Add ECB or another provider              | Avoids new vendor, key and cost decisions                                                  | Round 1 (delegated) |
| DL-005 | No migration is created or applied until the user explicitly confirms | Authorize it now                         | Client guardrail: no schema change without explicit, confirmed instruction                 | Scan                |
| DL-006 | Gate behind `isExperimentalFeatures`                                  | Always on; new env flag                  | Precedent from SCRUM-64, and it keeps the off state identical                              | Round 1 (delegated) |

## Glossary

- **FX rate / close rate:** the exchange rate between two currencies at the end of a trading day.
- **Base currency:** the currency a user's portfolio values are expressed in; a per-user setting, default USD.
- **Cross pair / cross rate:** a rate between two non-USD currencies (for example GBPCHF) derived from their rates against USD.
- **Carry forward:** using the most recent earlier available rate when none exists for the requested date.
- **Estimated value:** a converted amount computed with a carried-forward rate and flagged as such.
- **MarketData:** the existing table of daily quotes, including FX pairs, keyed by data source, symbol and date.
- **Experimental features flag:** the existing `isExperimentalFeatures` user setting used to gate new behaviour.
- **Cost basis / investment:** the amount paid for an asset, converted at the transaction-date rate.
- **GBp:** British pence, a derived currency of GBP with a fixed factor of 100.

## Affected Repos

Single-repo change. All work is inside the `ghostfolio` Nx monorepo (prisma, api, client, libs/common). The rate provider is an external third party, so no change is possible there.
