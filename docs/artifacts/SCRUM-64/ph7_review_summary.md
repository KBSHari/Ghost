# Review Summary: SCRUM-64

## Meta

- Ticket: SCRUM-64
- Phase: 7 (Review)
- Date: 2026-10-30
- Reviewers: spec-reviewer, test-engineer, security-auditor (three parallel read-only agents)
- Model: claude-opus-5-5 (pipeline config: claude-haiku-4-5-20251001)

## Spec Compliance (gate)

- Verdict: **compliant**. 13 of 13 requirements met, with no violations, over-build or path mismatches.
- REQ-009 and REQ-013 are met in the code but have not been run in a browser.
- Design-review conditions C-1 to C-4 are all met. C-4 (rate limiting) only takes effect when `ENABLE_FEATURE_RATE_LIMITING` is on.
- AC-008a is partly met: the export is checked against `ImportDataDto` (the import's validation schema), but no test runs the import service in dry-run mode.
- Under-built:
  - `messages.xlf` has no new strings, because the extracted locale files were reverted at the user's request.
  - Messages built on the server (warnings, exclusions, validation errors) are English-only, so REQ-013 ("all text translatable") is only partly met.

## Test Coverage

- Verdict: **adequate with gaps**. 360 feature tests pass (236 in common, 124 in the api rebalancing suites), and all coverage targets are met.

| File                                 | Lines  | Branches |
| ------------------------------------ | ------ | -------- |
| `rebalancing-calculator.ts`          | 92.98% | 84.67%   |
| `target-allocation-validation.ts`    | 100%   | 93.42%   |
| `rebalancing-export.ts`              | 100%   | 91.66%   |
| `rebalancing.service.ts`             | 96.92% | 68.75%   |
| `target-allocation-model.service.ts` | 98.18% | 75%      |
| Both controllers                     | 100%   | 100%     |
| All rebalancing api files            | 92.06% | 80.97%   |

- Uncovered acceptance criteria: AC-009a, AC-009b and AC-013 (client UI; the client project has no unit tests).
- Highest-value missing tests:
  - Sub-class-level targets (calculator lines 560-575).
  - `updateModel` with an invalid target tree: expect 400 and no write.
  - An unheld target symbol in a foreign currency, with a real exchange-rate mock.
  - Blocked-trades messaging (see BUG-001).
- Weak tests:
  - DTO rejection tests only assert "some error"; they should name the field and constraint.
  - The log-hygiene test spies on `log` only, not `warn`, `error` or `debug`.
  - The currency mock is the identity function, so conversion is never really exercised.

## Security

Verdict: **pass with findings** (no critical or high).

| ID      | Severity | Finding                                                                                                                                                                                                                                      | Recommendation                                                                                                                 |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| SEC-001 | Medium   | The 500-target cap is applied after the symbol lookup. Nested DTO arrays of 500×500×500 nodes are bounded only by the 10 MB body limit, so a very large `OR` query is possible, which could exceed PostgreSQL's 32,767 bind-parameter limit. | Count targets before the database lookup and reject above 500. Cap `assetClasses` and `subClasses` at the size of their enums. |
| SEC-002 | Low      | Symbols are resolved across all users, so another user's MANUAL asset profile (UUID symbol) can be referenced and its name, currency and quote read.                                                                                         | Treat a MANUAL profile that the caller doesn't own as `UNKNOWN_SYMBOL`.                                                        |
| SEC-003 | Low      | Each plan run calls `getDetails` and fetches quotes for up to 500 unheld symbols. The throttle is opt-in.                                                                                                                                    | Document turning on rate limiting for production. Consider caching quotes.                                                     |
| SEC-004 | Low      | `overrides` has no `@IsObject`, so an array is accepted. Amounts have no upper limit, and ids have no length or UUID check.                                                                                                                  | Add `@IsObject`, sensible `@Max` values and `@MaxLength`.                                                                      |
| SEC-005 | Info     | CSV escaping is correct but doesn't cover a leading full-width `＝＋－＠` or `\|`.                                                                                                                                                           | Optional hardening.                                                                                                            |
| SEC-006 | Info     | Lockfile churn. This **predates the pipeline** (`package-lock.json` was already modified at session start) and is not part of this feature.                                                                                                  | Leave it out of the feature commit.                                                                                            |

Checks passed: authentication on every route; IDOR protection (userId scoping, 404 for foreign ids); no mass assignment or prototype pollution; gating for experimental features, restricted view, DEMO role and read-only mode; impersonation write-blocking; no raw SQL; no sensitive data in logs; no XSS sinks in templates; GDPR cascade delete; no new dependencies.

## Bugs

- **BUG-001 (confirmed):** `rebalancing-calculator.ts:487-490` sets the message "The portfolio is already within its targets" whenever the trade list is empty. That includes the case where trades were needed but blocked by buy-only mode, the cash budget or the reserve, which is misleading. The fix is to show the message only when no candidate trade existed.

## Not Done / Caveats

- The security reviewer's extracted context was partly unreadable because of a text-encoding error in `extract-sections.py`. It audited the source files directly instead.

## Fixes Applied (Phase 7)

The user chose to fix the bug, the security findings and the key test gaps before Verification.

| Finding  | Fix                                                                                                                                                                                                                                                | Tests added                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| BUG-001  | `rebalancing-calculator.ts`: "already within its targets" only when no trade was wanted and there are no warnings                                                                                                                                  | 2 (buy-only without cash; all buys blocked by the reserve)                             |
| SEC-001  | New `getTargetAllocationSizeError` in the shared validator; `TargetAllocationModelService.validateTargets` rejects an oversized tree before any symbol lookup; `assetClasses` and `subClasses` arrays capped at the size of their enums (6 and 11) | 3 (oversized tree is not looked up; 7 asset classes; 12 sub-classes)                   |
| SEC-002  | A MANUAL asset profile owned by another user resolves as `UNKNOWN_SYMBOL`; `validateTargets` now takes the `userId`                                                                                                                                | 2 (own custom profile accepted; foreign one rejected)                                  |
| SEC-004  | `@IsObject` on `overrides`; `@Max(1e12)` on cash reserve amount, flat fee and minimum trade value (model and overrides); `@MaxLength(64)` on `modelId` and each account id                                                                         | 4 (array overrides; huge fee override; long ids; huge flat fee)                        |
| Test gap | Sub-class-level targets                                                                                                                                                                                                                            | 2 (proportional spread within a sub-class; full sale of a sub-class outside the model) |
| Test gap | `updateModel` with invalid targets returns 400 and writes nothing                                                                                                                                                                                  | 1                                                                                      |
| Test gap | Unheld foreign-currency target with a real exchange-rate mock; fee asserted in the asset currency                                                                                                                                                  | 1                                                                                      |

New DTO tests assert the failing property and constraint, not just "some error".

Not fixed (carried to Verification and Risk as open items): SEC-003 (rate limiting is opt-in: enable `ENABLE_FEATURE_RATE_LIMITING` in production); SEC-005 (optional CSV hardening for full-width characters); server-side messages not translatable (REQ-013 partial); no test runs the real import service in dry-run mode (AC-008a partial); client UI not exercised in a browser; translation strings not yet extracted (repo convention: separate locale task).

Results after the fixes: api 700/700 tests (89 suites, route snapshot unchanged); common 242/242; ui 6/6; client build succeeds; lint shows no warnings in new code (common back to its baseline of 84 warnings).
