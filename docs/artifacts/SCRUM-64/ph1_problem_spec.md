# Problem Specification: Advanced Portfolio Rebalancing & Target Allocation Planner

## Meta

- **Ticket ID:** SCRUM-64
- **Feature ID:** FEAT-0001
- **Title:** Advanced Portfolio Rebalancing & Target Allocation Planner
- **Classification:** Large Feature
- **Date:** 2026-10-30
- **Author:** Claude Code (sdlc-requirements), requested by KBSHari
- **Status:** Approved by user (2026-10-30T13:28:23+0530)
- **Scope:** Named target models, validated target hierarchy with optional bands, fee- and cash-aware trade calculation, trade list, export as import-JSON and CSV, and the UI for all of these.
- **Platforms:** Web client (Angular) and API.

## Problem Statement

Wealth managers cannot define a target asset allocation or get exact buy/sell recommendations to reach it. Ghostfolio only shows current allocation, so rebalancing is done by hand.

## Requirements

| ID      | Type           | Priority | Description                                                                                                                                                                                                                                                   |
| ------- | -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 | functional     | P0       | The system shall let a user create, view, edit and delete multiple named target allocation models, each saved per user.                                                                                                                                       |
| REQ-002 | functional     | P0       | A model shall hold a target % per asset class, asset sub-class and symbol, each with an optional min/max tolerance band. Symbol targets shall sum into their parent sub-class, and sub-class targets into their asset class.                                  |
| REQ-003 | functional     | P0       | The system shall validate a model before saving or running it. Sibling targets must sum to 100%, a band must contain its target, and the hierarchy must be consistent.                                                                                        |
| REQ-004 | functional     | P0       | A user shall apply a model to the whole portfolio or to an account filter chosen at run time.                                                                                                                                                                 |
| REQ-005 | functional     | P0       | The system shall calculate buy/sell recommendations that bring current valuations to target weights, taking into account configurable transaction fees (flat plus %) and a cash reserve (fixed amount, %, or both), in the user's base currency.              |
| REQ-006 | functional     | P0       | A user shall be able to turn on or off whole-share-only trades and sell recommendations (buy-only mode), and set an optional minimum trade value and drift threshold. Holdings within their band shall not be traded.                                         |
| REQ-007 | functional     | P0       | The result shall be an actionable trade list showing each trade's symbol, side, quantity, estimated value and fee, plus allocation before and after and the cash remaining.                                                                                   |
| REQ-008 | functional     | P0       | The trade list shall be exportable as (a) JSON accepted by the existing Ghostfolio import, and (b) CSV.                                                                                                                                                       |
| REQ-009 | functional     | P0       | A UI shall let users manage models, set targets and bounds per level, run the calculation, and view and export the result.                                                                                                                                    |
| REQ-010 | functional     | P1       | The system shall flag holdings with no asset class, warn about missing prices, convert other-currency holdings to the base currency, and report when cash is insufficient.                                                                                    |
| REQ-011 | non-functional | P0       | The feature shall be available to any authenticated user, only when `isExperimentalFeatures` is on. It shall be blocked for `isRestrictedView` users, each user shall see only their own models, and no holdings, quantities or amounts shall appear in logs. |
| REQ-012 | non-functional | P1       | A calculation shall complete in under 2 seconds for portfolios of up to 500 holdings.                                                                                                                                                                         |
| REQ-013 | non-functional | P2       | The UI shall meet WCAG 2.1 AA and use the existing translation mechanism.                                                                                                                                                                                     |

## Acceptance Criteria

- **AC-001a (REQ-001):** Given a logged-in user, when they save a model named "Growth", then it appears in their model list and is still there after sign-out and sign-in.
- **AC-001b (REQ-001):** Given another user's model ID, when this user requests it, then access is denied and no data is returned.
- **AC-002a (REQ-002):** Given a model with Equity 60 / Fixed Income 30 / Crypto sub-class 10 and symbol targets under them, when saved, then each level stores its target and optional min/max.
- **AC-002b (REQ-002):** Given symbol targets under a sub-class that sum to more than that sub-class's target, when saved, then the save is rejected.
- **AC-003a (REQ-003):** Given sibling targets summing to 99%, when the user saves or runs, then the action is blocked with a message naming the level and the shortfall.
- **AC-003b (REQ-003):** Given a band that excludes its own target (e.g. target 10, band 12–15), when saved, then it is rejected with a specific error.
- **AC-004a (REQ-004):** Given a model and an account filter, when the user runs it, then only holdings in those accounts are valued and traded.
- **AC-004b (REQ-004):** Given no filter, when the user runs it, then the whole portfolio is used.
- **AC-005a (REQ-005):** Given holdings off target and a fee of 5 flat + 0.1%, when the plan runs, then every trade includes its fee and the post-trade weights are within the bands, or as close as possible.
- **AC-005b (REQ-005):** Given a cash reserve that exceeds available cash, when the plan runs, then no buy that would breach the reserve is recommended and the shortfall is reported.
- **AC-006a (REQ-006):** Given "buy-only" is on, when the plan runs, then the list contains no SELL trades.
- **AC-006b (REQ-006):** Given whole-share mode is on, when the plan runs, then every quantity is an integer, and fractional mode allows decimals.
- **AC-007a (REQ-007):** Given a successful run, when results show, then each trade row has symbol, side, quantity, value and fee, and before/after weights and remaining cash are shown.
- **AC-007b (REQ-007):** Given every holding is already within its band, when the plan runs, then an empty trade list is returned with a "portfolio already within targets" message.
- **AC-008a (REQ-008):** Given a trade list, when exported as JSON, then submitting it to the existing import with dry run succeeds with no format changes.
- **AC-008b (REQ-008):** Given a trade list, when exported as CSV, then it has a header row and one row per trade with the same fields.
- **AC-009a (REQ-009):** Given the feature is enabled, when the user opens the planner, then they can create a model, set targets and bounds at each level, run it, and export, all in the UI.
- **AC-009b (REQ-009):** Given invalid input, when the user submits, then inline errors appear and nothing is saved.
- **AC-010 (REQ-010):** Given a holding with no asset class, a missing price, and a foreign-currency position, when the plan runs, then the first two are flagged and excluded with a warning, and the third is converted to the base currency.
- **AC-011a (REQ-011):** Given `isExperimentalFeatures` is off, or the user is restricted-view, when they call the feature, then it is hidden in the UI and denied by the API.
- **AC-011b (REQ-011):** Given a calculation run, when logs are inspected, then they contain no symbols, quantities or amounts.
- **AC-012 (REQ-012):** Given 500 holdings, when the plan runs, then the response arrives in under 2 s.
- **AC-013 (REQ-013):** Given the planner screens, when checked with keyboard and screen reader, then every control is reachable and labelled, and all text is translatable.

## Constraints

- **Feature gating:** Released only behind the existing `isExperimentalFeatures` user setting; no separate feature-flag system is introduced.
- **Persistence:** Target models are stored in a new database table (several named models per user); the change is additive only (new tables and endpoints, no change to existing schema or behaviour).
- **Compatibility:** The JSON export must be accepted by the existing `POST /import` unchanged (BUY/SELL activities, dry run supported).
- **Codebase:** Single Nx monorepo (`prisma`, `apps/api`, `apps/client`, `libs/common`); existing JWT authentication and permission model apply.
- **Performance:** Calculation under 2 s for up to 500 holdings (REQ-012).
- **Security:** No holdings, quantities or amounts in logs; restricted-view users blocked (REQ-011).

## Non-Goals

- **NG-001:** Wealth managers planning for clients through shared access. Rationale: you chose "any logged-in user", and client access raises permission and audit questions.
- **NG-002:** Placing trades or broker integration. Rationale: output is a list only.
- **NG-003:** Tax-lot or tax-aware optimisation. Rationale: it needs cost-basis and jurisdiction rules that are out of the ticket.
- **NG-004:** Scheduled or automatic rebalancing and drift alerts. Rationale: the ticket asks for on-demand recommendations.
- **NG-005:** Changing the existing import/export formats or the current allocations page. Rationale: the feature must be additive.

## Assumptions

- **ASM-001:** Market prices exist for every held and target symbol. If not, the holding is flagged and excluded. (risk_if_wrong: medium; validation_needed: false)
- **ASM-002:** Exchange rates are available for conversion to the base currency. (risk_if_wrong: low; validation_needed: false)
- **ASM-003:** A sub-class's parent asset class is taken from the held assets' data, not a fixed mapping. (risk_if_wrong: medium; validation_needed: true)
- **ASM-004:** Fee and cash-reserve settings are stored per model and can be overridden at run time. (risk_if_wrong: low; validation_needed: false)
- **ASM-005:** CSV columns mirror the import activity fields. (risk_if_wrong: low; validation_needed: false)

## Edge Cases

- **EC-001 (REQ-007):** Empty portfolio. The result is an empty trade list with a message, and no error.
- **EC-002 (REQ-005):** A target symbol is not held yet. It is bought from market price, or flagged if no price exists.
- **EC-003 (REQ-006):** A fee exceeds the trade value or the minimum trade value. The trade is skipped and listed as "below threshold".
- **EC-004 (REQ-003):** Targets sum to 100% only after rounding (e.g. 33.33 × 3). Allowed within ±0.01 percentage points.
- **EC-005 (REQ-006):** Whole-share rounding leaves unspent cash. The residual is shown in the result.
- **EC-006 (REQ-002):** A multi-sector fund against sector targets. Its weighted exposure is used.

## Backward Compatibility

✅ No breaking changes identified. API, schema, shared libraries and configuration are additive: new table, endpoints, DTOs and UI behind `isExperimentalFeatures`. The existing import format is reused as is, there are no new env vars, and nothing changes for users with the flag off.

## Decision Log

| #      | Decision                                                                                               | Alternatives Considered                     | Why Chosen                                                                     | Q&A Round |
| ------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------ | --------- |
| DL-001 | New DB table, several named models per user                                                            | Settings JSON; unsaved                      | Your answer: multiple named models                                             | Round 1   |
| DL-002 | Targets with optional min/max band                                                                     | Exact target only                           | Your answer: both, band optional                                               | Round 1   |
| DL-003 | Strict hierarchy for class > sub-class > symbol                                                        | Independent targets                         | Your answer: strict hierarchy                                                  | Round 1   |
| DL-004 | Sector targets checked separately against each holding's weighted exposure, outside the hierarchy      | Single-sector only; drop sectors            | Multi-sector funds make a strict sector hierarchy undefined (accepted default) | Round 2   |
| DL-005 | Crypto allocated via the sub-class                                                                     | Six asset classes only                      | Your answer: class plus sub-class                                              | Round 1   |
| DL-006 | Model runs on the whole portfolio or an account filter                                                 | Whole portfolio only                        | Your answer: both                                                              | Round 1   |
| DL-007 | Fees are flat plus %; cash reserve is fixed, %, or both                                                | Single fee type                             | Your answers                                                                   | Round 1   |
| DL-008 | Whole/fractional and sells/buy-only are toggles; min trade and drift threshold are optional, default 0 | Fixed behaviour                             | Your answer, plus accepted default                                             | Round 2   |
| DL-009 | Export both import-JSON and CSV                                                                        | One format                                  | Your answer: both                                                              | Round 1   |
| DL-010 | Any authenticated user, behind `isExperimentalFeatures`; client-management is out of scope             | New permission; premium-only; client access | Your answers, plus accepted default                                            | Round 2   |
| DL-011 | Additive migration, new tables and endpoints only                                                      | No schema change                            | Your answer                                                                    | Round 1   |

## Glossary

- **Target allocation model:** A named, per-user set of target percentages (with optional bands) across asset class, sub-class and symbol.
- **Band (tolerance band):** Optional min/max percentage around a target; holdings inside it are not traded.
- **Drift threshold:** Optional deviation, in percentage points, below which no trade is recommended.
- **Cash reserve:** Cash (fixed amount, percentage, or both) that must remain after the recommended trades.
- **Asset class / sub-class:** Ghostfolio classification of a holding (e.g. `EQUITY`; sub-class `CRYPTOCURRENCY`).
- **Trade list:** The set of recommended BUY/SELL trades produced by a run, with quantity, value and fee.
- **Import payload:** JSON of BUY/SELL activities in the format accepted by the existing `POST /import`.
- **Restricted view (`isRestrictedView`):** User setting that limits what a user can see; these users are blocked from this feature.
- **Experimental features (`isExperimentalFeatures`):** User setting that gates this feature.

## Affected Repos

- Single-repo change ✅ (Ghostfolio Nx monorepo): `prisma` (new tables), `apps/api` (service, endpoints), `apps/client` (planner UI), `libs/common` (DTOs, interfaces, settings).
