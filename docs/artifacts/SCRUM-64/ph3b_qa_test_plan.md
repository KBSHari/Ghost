# QA Test Plan: Advanced Portfolio Rebalancing & Target Allocation Planner

## Meta

- Ticket: SCRUM-64
- Classification: Large Feature
- Phase: 3b (QA Test Generation)
- Generated at: 2026-10-30
- Test management: Zephyr Scale (no tool profile available — plan only, no test issues created)
- Automation stack (from intake): scope UI; Python; Playwright; Allure

## Inputs Summary

- Source ACs: 23 acceptance criteria (AC-001a to AC-013) from `ph1_problem_spec.md` covering REQ-001 to REQ-013.
- Design inputs: `ph2_design_spec.md` (REST contracts for `/rebalancing/models` and `/rebalancing/plan`, data models, security table, testing strategy) and the codebase scan in the artifact digest.
- Services/areas touched: `apps/api` (new rebalancing endpoints), `apps/client` (Portfolio > Rebalancing tab), `libs/common` (validation, export builders, permissions), `prisma` (new table), existing `/import` (contract only).
- Edge cases from the problem spec used: EC-001 to EC-006. Conditions from the design review (C-1 cash source, C-2 symbol resolver, C-3 nested DTO validation, C-4 throttling) are added as extra edge cases below.

## Existing Zephyr Matches (JQL filter 28319)

Not queried — no Zephyr Scale tool profile is available, so duplicate detection could not run. All test cases are marked `decision: new`. Before registering, a QA engineer should run filter 28319 and mark overlaps.

## AC → Test Matrix

| AC      | Positive     | Negative     | Edge         | Regression | Decision |
| ------- | ------------ | ------------ | ------------ | ---------- | -------- |
| AC-001a | TC-001       | TC-002       | TC-003       | no         | new      |
| AC-001b | TC-004       | TC-005       | TC-006       | no         | new      |
| AC-002a | TC-007       | TC-008       | TC-009       | no         | new      |
| AC-002b | TC-010       | TC-011       | TC-012       | no         | new      |
| AC-003a | TC-013       | TC-014       | TC-015       | no         | new      |
| AC-003b | TC-016       | TC-017       | TC-018       | no         | new      |
| AC-004a | TC-019       | TC-020       | TC-021       | no         | new      |
| AC-004b | TC-022       | TC-023       | TC-024       | no         | new      |
| AC-005a | TC-025       | TC-026       | TC-027       | no         | new      |
| AC-005b | TC-028       | TC-029       | TC-030       | no         | new      |
| AC-006a | TC-031       | TC-032       | TC-033       | no         | new      |
| AC-006b | TC-034       | TC-035       | TC-036       | no         | new      |
| AC-007a | TC-037       | TC-038       | TC-039       | no         | new      |
| AC-007b | TC-040       | TC-041       | TC-042       | no         | new      |
| AC-008a | TC-043 (reg) | TC-044       | TC-045 (reg) | yes (2)    | new      |
| AC-008b | TC-046       | TC-047       | TC-048       | no         | new      |
| AC-009a | TC-049 (reg) | TC-050       | TC-051       | yes (1)    | new      |
| AC-009b | TC-052       | TC-053       | TC-054       | no         | new      |
| AC-010  | TC-055       | TC-056       | TC-057       | no         | new      |
| AC-011a | TC-058 (reg) | TC-059 (reg) | TC-060 (reg) | yes (3)    | new      |
| AC-011b | TC-061       | TC-062       | TC-063       | no         | new      |
| AC-012  | TC-064       | TC-065       | TC-066       | no         | new      |
| AC-013  | TC-067       | TC-068       | TC-069       | no         | new      |

## Test Cases

All cases use `decision: new`. Columns: id, title, type, preconditions and steps, expected result, related AC, priority, automation layer, regression. "Reg" = regression subset.

| ID     | Title                                      | Type          | Preconditions → Steps                                                         | Expected                                                                            | AC      | Priority | Layer | Reg |
| ------ | ------------------------------------------ | ------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------- | -------- | ----- | --- |
| TC-001 | Save a named model                         | functional    | User with flag on → POST valid model "Growth" → sign out and in → list models | "Growth" is listed with saved targets                                               | AC-001a | critical | api   | no  |
| TC-002 | Reject duplicate model name                | functional    | Model "Growth" exists → POST another "Growth"                                 | 409 conflict, original unchanged                                                    | AC-001a | high     | api   | no  |
| TC-003 | Many models, name length limit             | functional    | Create 20 models; name of 101 chars                                           | 20 listed in order; 101-char name rejected with 400                                 | AC-001a | medium   | api   | no  |
| TC-004 | Owner reads own model                      | functional    | Model owned by user A → A GETs by id                                          | 200 with model                                                                      | AC-001b | critical | api   | no  |
| TC-005 | Other user cannot read/update/delete model | functional    | A's model id → user B GET/PUT/DELETE                                          | 404 for all three, no data returned                                                 | AC-001b | critical | api   | no  |
| TC-006 | Deleted user's models removed              | integration   | User with models → delete user                                                | Models no longer exist (cascade)                                                    | AC-001b | medium   | api   | no  |
| TC-007 | Hierarchical model saves                   | functional    | Equity 60 / Fixed Income 30 / Crypto sub-class 10 with symbol targets → POST  | 201; all levels stored with optional min/max                                        | AC-002a | critical | api   | no  |
| TC-008 | Band is optional                           | functional    | Model with targets without min/max → POST                                     | 201; bands null                                                                     | AC-002a | high     | api   | no  |
| TC-009 | Crypto under Liquidity class               | functional    | Sub-class CRYPTOCURRENCY under EQUITY → POST                                  | 400 hierarchy error; under LIQUIDITY accepted                                       | AC-002a | high     | api   | no  |
| TC-010 | Symbols within sub-class target            | functional    | Symbols sum equals sub-class target → POST                                    | 201                                                                                 | AC-002b | high     | api   | no  |
| TC-011 | Symbols exceed sub-class target            | functional    | Symbols sum above sub-class target → POST                                     | 400 naming the sub-class and excess                                                 | AC-002b | critical | api   | no  |
| TC-012 | Unknown symbol or class mismatch           | functional    | Symbol not in profiles, or ETF placed under BOND → POST                       | 400 UNKNOWN_SYMBOL / mismatch (design C-2)                                          | AC-002b | high     | api   | no  |
| TC-013 | Targets sum to 100% accepted               | functional    | Class level sums to 100 → save and run                                        | Accepted                                                                            | AC-003a | critical | api   | no  |
| TC-014 | Targets sum to 99% blocked                 | functional    | Class level sums to 99 → save; run                                            | Both blocked; message names level and shortfall of 1                                | AC-003a | critical | api   | no  |
| TC-015 | Rounding tolerance                         | functional    | Three targets of 33.33 → save                                                 | Accepted (within ±0.01 pp, EC-004); 33.30 each rejected                             | AC-003a | high     | api   | no  |
| TC-016 | Valid band accepted                        | functional    | Target 10, band 8–12 → save                                                   | Accepted                                                                            | AC-003b | high     | api   | no  |
| TC-017 | Band excludes target                       | functional    | Target 10, band 12–15 → save                                                  | 400 with specific band error                                                        | AC-003b | critical | api   | no  |
| TC-018 | Band boundary equals target                | functional    | Target 10, band 10–10 or 0–100 → save                                         | Accepted                                                                            | AC-003b | medium   | api   | no  |
| TC-019 | Account filter limits scope                | functional    | Two accounts, model, filter on account 1 → run                                | Only account 1 holdings and cash valued and traded                                  | AC-004a | critical | api   | no  |
| TC-020 | Filter for other user's account            | functional    | accountIds includes another user's account → run                              | Rejected or ignored; no foreign data                                                | AC-004a | critical | api   | no  |
| TC-021 | Filter on empty account                    | functional    | Account with no holdings and no cash → run                                    | Empty plan with message, no error                                                   | AC-004a | medium   | api   | no  |
| TC-022 | Whole portfolio when no filter             | functional    | Several accounts → run without filter                                         | All holdings and cash used                                                          | AC-004b | critical | api   | no  |
| TC-023 | Excluded accounts handled                  | functional    | Account excluded from portfolio → run                                         | Consistent with portfolio views (design C-1)                                        | AC-004b | high     | api   | no  |
| TC-024 | Cash included in total value               | integration   | Holdings 80k, cash 20k → run                                                  | Weights computed on 100k, not 80k (design C-1)                                      | AC-004b | critical | api   | no  |
| TC-025 | Trades hit targets with fees               | functional    | Off-target holdings, fee 5 flat + 0.1% → run                                  | Each trade has fee; post-trade weights within bands or closest possible             | AC-005a | critical | api   | no  |
| TC-026 | Fee larger than trade skipped              | functional    | Fee 50 flat, small deviation → run                                            | Trade skipped, listed below threshold (EC-003)                                      | AC-005a | high     | api   | no  |
| TC-027 | Fee conversion for foreign asset           | integration   | USD asset, EUR base, fee in EUR → run                                         | Fee converted to asset currency in export                                           | AC-005a | high     | api   | no  |
| TC-028 | Reserve above cash blocks buys             | functional    | Reserve 10k, cash 5k → run                                                    | No buy breaches reserve; shortfall reported                                         | AC-005b | critical | api   | no  |
| TC-029 | Percentage plus fixed reserve              | functional    | Reserve 1k + 2% of value → run                                                | Reserve = both combined                                                             | AC-005b | high     | api   | no  |
| TC-030 | Sells fund buys above reserve              | functional    | Reserve set, overweight asset → run                                           | Cash after trades ≥ reserve                                                         | AC-005b | high     | api   | no  |
| TC-031 | Buy-only has no sells                      | functional    | Overweight asset, buy-only on → run                                           | List contains no SELL                                                               | AC-006a | critical | api   | no  |
| TC-032 | Allow sells includes sells                 | functional    | Same, sells allowed → run                                                     | SELL appears                                                                        | AC-006a | high     | api   | no  |
| TC-033 | Buy-only with no cash                      | functional    | Buy-only, zero spare cash → run                                               | Empty buys, warning explains                                                        | AC-006a | medium   | api   | no  |
| TC-034 | Whole shares are integers                  | functional    | Whole-share mode → run                                                        | All quantities are integers                                                         | AC-006b | critical | api   | no  |
| TC-035 | Fractional keeps decimals                  | functional    | Fractional mode → run                                                         | Decimal quantities                                                                  | AC-006b | high     | api   | no  |
| TC-036 | Rounding residual reported                 | functional    | Whole shares leave 37.20 unspent → run                                        | Residual shown, no oversell (EC-005)                                                | AC-006b | high     | api   | no  |
| TC-037 | Trade rows complete                        | functional    | Successful run → view result                                                  | Each row has symbol, side, quantity, value, fee; before/after and cash shown        | AC-007a | critical | ui    | no  |
| TC-038 | Missing fields never blank                 | functional    | Trade with foreign currency → view                                            | Currency and value shown                                                            | AC-007a | medium   | ui    | no  |
| TC-039 | Long list display                          | functional    | 100 trades → view                                                             | List scrolls/paginates; totals correct                                              | AC-007a | medium   | ui    | no  |
| TC-040 | Already within bands                       | functional    | All holdings within bands → run                                               | Empty list and "portfolio already within targets"                                   | AC-007b | high     | api   | no  |
| TC-041 | Empty portfolio                            | functional    | No holdings, no cash → run                                                    | Empty list with message, no error (EC-001)                                          | AC-007b | high     | api   | no  |
| TC-042 | One holding only                           | functional    | Single holding, class-only targets → run                                      | Valid plan or message                                                               | AC-007b | medium   | api   | no  |
| TC-043 | Export accepted by import dry run          | integration   | Plan result → export JSON → POST /import?dryRun=true                          | Accepted with no format changes                                                     | AC-008a | critical | api   | yes |
| TC-044 | Tampered export rejected by import         | integration   | Export with removed symbol → import dry run                                   | Import validation error (shows contract is strict)                                  | AC-008a | medium   | api   | no  |
| TC-045 | Multi-account export omits accountId       | integration   | Run across two accounts → export                                              | Activities valid without accountId; single-account run includes it                  | AC-008a | high     | api   | yes |
| TC-046 | CSV has header and rows                    | functional    | Run with 5 trades → export CSV                                                | Header plus 5 rows, same fields                                                     | AC-008b | critical | ui    | no  |
| TC-047 | CSV formula injection neutralised          | functional    | Symbol starting with "=" → export CSV                                         | Cell prefixed so it is not evaluated                                                | AC-008b | high     | ui    | no  |
| TC-048 | Empty plan export                          | functional    | Empty plan → export CSV/JSON                                                  | Header only / empty activities list                                                 | AC-008b | medium   | ui    | no  |
| TC-049 | Tab visible with flag on                   | functional    | Flag on, permitted → open Portfolio                                           | Rebalancing tab present; existing tabs unchanged                                    | AC-009a | critical | ui    | yes |
| TC-050 | Full flow in UI                            | e2e           | Create model, set bounds per level, run, export                               | All steps possible in UI                                                            | AC-009a | critical | ui    | no  |
| TC-051 | Edit and delete model in UI                | functional    | Existing model → edit then delete                                             | Changes saved; delete removes from list                                             | AC-009a | high     | ui    | no  |
| TC-052 | Inline errors on invalid input             | functional    | Targets sum 99 → submit                                                       | Inline error shown                                                                  | AC-009b | critical | ui    | no  |
| TC-053 | Nothing saved after invalid submit         | functional    | Invalid submit → reload                                                       | Model list unchanged                                                                | AC-009b | high     | ui    | no  |
| TC-054 | Errors clear after fix                     | functional    | Fix input after error → submit                                                | Saved, errors gone                                                                  | AC-009b | medium   | ui    | no  |
| TC-055 | Foreign-currency converted                 | integration   | Position in other currency → run                                              | Values in base currency                                                             | AC-010  | high     | api   | no  |
| TC-056 | No asset class flagged                     | functional    | Holding without class → run                                                   | Excluded with NO_ASSET_CLASS warning                                                | AC-010  | critical | api   | no  |
| TC-057 | Missing price flagged                      | functional    | Holding without price → run                                                   | Excluded with NO_PRICE warning; unheld target symbol without price flagged (EC-002) | AC-010  | critical | api   | no  |
| TC-058 | Flag on grants access                      | functional    | Flag on, role USER → call API and open tab                                    | Permitted; feature visible                                                          | AC-011a | critical | api   | yes |
| TC-059 | Flag off denies                            | functional    | Flag off → call API; open Portfolio                                           | API 403; tab hidden; other permissions unchanged                                    | AC-011a | critical | ui    | yes |
| TC-060 | Restricted view and DEMO denied            | functional    | Restricted-view user; DEMO user → call API                                    | 403 for both (DEMO per F-002)                                                       | AC-011a | critical | api   | yes |
| TC-061 | Logs contain no portfolio data             | functional    | Run plan with known symbols/amounts → inspect logs                            | No symbols, quantities or amounts                                                   | AC-011b | critical | api   | no  |
| TC-062 | Error path logging                         | functional    | Force a calculation error → inspect logs                                      | Error logged without data                                                           | AC-011b | high     | api   | no  |
| TC-063 | Failed validation logging                  | functional    | Invalid model → inspect logs                                                  | Only codes/ids, no payload                                                          | AC-011b | medium   | api   | no  |
| TC-064 | 500 holdings within 2 s                    | integration   | Synthetic 500 holdings → run                                                  | Response under 2 s (scope per F-004)                                                | AC-012  | high     | api   | no  |
| TC-065 | Over-limit input rejected                  | functional    | 501 leaf targets → save                                                       | 400 limit error                                                                     | AC-012  | medium   | api   | no  |
| TC-066 | Throttled plan endpoint                    | functional    | Repeated plan runs over limit → run                                           | 429 after limit (design C-4)                                                        | AC-012  | medium   | api   | no  |
| TC-067 | Keyboard operation                         | accessibility | Editor and result screens → keyboard only                                     | All controls reachable, visible focus                                               | AC-013  | high     | ui    | no  |
| TC-068 | Screen-reader labels                       | accessibility | Screen reader on both screens                                                 | Controls and errors announced                                                       | AC-013  | high     | ui    | no  |
| TC-069 | Translation of new strings                 | functional    | Switch language → open planner                                                | New strings translated or fall back cleanly                                         | AC-013  | medium   | ui    | no  |

## Regression Subset

Rule applied (Step 5): type is functional or integration, AND (the AC modifies an existing endpoint or component confirmed by the codebase scan, OR it asserts a backward-compatibility invariant).

| Test ID | Jira key    | Rule fired                                                                  | Automation layer | Repo location                                                                      |
| ------- | ----------- | --------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| TC-043  | not created | backward-compat invariant (existing `/import` accepts the export unchanged) | api              | not automated — outside Automation Scope (UI) and no QA automation repo configured |
| TC-045  | not created | backward-compat invariant (import with and without `accountId`)             | api              | not automated — outside Automation Scope (UI) and no QA automation repo configured |
| TC-049  | not created | modifies existing component (Portfolio page tabs and routes)                | ui               | not automated — no QA automation repo configured                                   |
| TC-058  | not created | modifies existing component (`UserService` permission calculation)          | api              | not automated — outside Automation Scope (UI) and no QA automation repo configured |
| TC-059  | not created | modifies existing component (`UserService`) and Portfolio page              | ui               | not automated — no QA automation repo configured                                   |
| TC-060  | not created | modifies existing component (`UserService`, restricted-view handling)       | api              | not automated — outside Automation Scope (UI) and no QA automation repo configured |

Six regression tests; the rest are new-feature tests that become regression candidates once the feature leaves experimental status.

## Jira Issues Created / Linked

| Jira key | Action                                                                                                         | Parent link |
| -------- | -------------------------------------------------------------------------------------------------------------- | ----------- |
| none     | No Zephyr Scale tool profile is available; the test plan is plan-only. No Test issues were created or updated. | SCRUM-64    |

## Automation PR

- Branch: n/a
- PR URL: skipped — no QA automation repo configured (`client-notes/qa-test-generation.md` does not exist and intake does not give a repo path)
- Language / framework / reporting: Python / Playwright / Allure (from intake; not applied)
- Lint status: skipped

## Sign-Off

- Status: partial-(no-pr)
- Notes:
  - Zephyr Scale registration was not possible (plan-only). A QA engineer should register the 69 cases in Zephyr, run JQL filter 28319 for overlaps, and link them to SCRUM-64.
  - To enable automation, create `client-notes/qa-test-generation.md` with the Playwright suite path, stream mapping and lint command. Only UI-layer regression cases (TC-049, TC-059) are in automation scope.
  - Skill Step 7 (separate summary comment on the story) was skipped on purpose: the pipeline posts one combined Phase 3 + 3b comment.
  - Cases TC-009, TC-012, TC-024, TC-066 verify the design-review conditions C-1 to C-4; update them if Phase 4 changes those conditions.
