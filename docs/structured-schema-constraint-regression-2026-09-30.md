# Structured text tail schema regression — 2026-09-30

> 歷史紀錄：本報告只適用於正文指定的revision與當次測試。「目前／本輪／未提交」描述當時狀態。2026-10-02歸檔時保留原始正文，現況與其他版本結果見[歷史索引](release-evidence-index.md)。

Status: **STOPPED / Public Beta PAUSED**. This is evidence for the current
revision, not a release approval. No second paid request was sent.

## Baseline and change

- Baseline `origin/main`: `a7223400846d4e30b964c58545e5e921566280d4`.
  Its natural daily reset had previously passed, but its fixed
  `high-risk-delivery-fee` case returned
  `structural_debris / signal_reason`.
- Feature branch: `codex/constrain-structured-text-tail`.
- Commit and deployed SHA: `0283fc6420754ce55739a4d05c49808a89e52a34`.
  The feature branch was pushed; `main` advanced by fast-forward.
- The three field-specific OpenAI JSON Schema strings (`summary`,
  `signals[].reason`, `recommendations[]`) now use the runtime pattern
  `^[\s\S]*[^,，}\]]$` (backslashes are doubled in TypeScript and JSON
  literals). The original candidate omitted the fullwidth
  comma `，`; the deterministic test caught that gap. This is a simple
  trailing-character constraint and does not forbid braces or brackets
  within a natural-language sentence. A bare `{"ok":true}` is
  intentionally rejected as user-facing prose. Existing server-side
  structural-debris validation remains unchanged.
- Public API shape, prompt, model, temperature, quota, Redis behavior,
  provider retry policy, and output-token cap were unchanged.
- [OpenAI Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs)
  lists string `pattern` support and limits it for fine-tuned models;
  this deployment uses the pinned non-fine-tuned
  [GPT-4.1 mini snapshot](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
  The SDK transport test confirmed that the serialized request includes
  all three patterns with `strict: true`. **The Production timeout below
  did not establish that the live API accepted and enforced this schema.**

## Offline evidence

Node `24.19.0`, npm `12.0.2`:

| Check | Result |
| --- | --- |
| `npm ci` | PASS: 391 packages, 0 reported vulnerabilities |
| `npm run typecheck`, `npm run lint` | PASS |
| `npm test` | PASS: 370/370 in 14 files |
| `npm run test:integration` | PASS: 24/24 |
| `npm run build`, `npm run verify:bundle` | PASS; 37 browser deliverable files scanned, 0 server-only markers |
| `npm run test:e2e` | PASS: 20/20 |
| `git diff --check`, targeted secret-pattern scan | PASS |

The pattern test rejected the six requested malformed tails and bare JSON,
and accepted all seven requested natural-language examples. The SDK fake
transport test checked the actual sent schema; normalizer and HTTP
structural-debris regression tests still passed. These are offline tests,
not proof of live Provider generation.

The pre-existing 13 modified/untracked root documentation files had matching
SHA-256 hashes before and after the fast-forward. The unrelated
`deliverables/` directory was not read, changed, staged, or committed.

## Production isolation and single attempt

- Initial deployment `dpl_FEZL2avEB8oKywLZdWTkUTrCYtkZ` was READY on
  the new SHA with `ANALYSIS_ENABLED=false`, Redis runtime `disabled`,
  TTL `-1`. Homepage, Privacy and Demo returned 200; safe POST returned
  503 `analysis_disabled`, no-store, `providerEntered=false`.
- A temporary private-header WAF allowed only controlled POSTs. Missing or
  wrong header returned 403; the controlled POST reached the app and
  returned 503 while runtime was disabled. Homepage, Privacy and Demo
  remained available. The header value was kept in an ignored local file.
- The deployment gate was set true while runtime remained disabled.
  Deployment `dpl_GhEkbAu7FHjrFvekdmnADf71Xz9n` reached READY on the
  same SHA and canonical alias. A controlled POST still returned
  503 `analysis_disabled` with `providerEntered=false`.
- Both fixed fixtures and the prompt matched the preflight hashes. Current
  official [standard pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
  and [Fast pricing](https://openai.com/api-fast-mode/) were checked.
  The conservative two-call Fast reservation, including 10% contingency,
  was US$0.02862552 against the authorized US$0.03 estimate budget.
  This is an estimate, not a Provider spending cap.

### Call 1: `high-risk-delivery-fee`

One controlled request was sent; automatic and manual retries were **0**.
Request ID: `12faec31-e443-4a49-b87b-fb2c9204b5fd`.

| Field | Observed |
| --- | --- |
| HTTP | 503 `provider_unavailable` |
| `failureKind` | `timeout` |
| `providerEntered` | `true` |
| `usageKnown` | `false`; input/output tokens unavailable |
| Estimated actual spend | **UNKNOWN**; no usage was reported. The per-call preflight reservation was US$0.01431276 including contingency. |
| `schemaFailureStage` / field | Not observed; this was a Provider timeout, not a schema response |
| Daily global quota | 1 before → 2 after; the attempt counted |
| Lease | `held_until_expiry` per telemetry; subsequent read found no active lease |

Redis runtime was set back to `disabled` immediately after the request.
The server conservatively retained the lease until expiry because Provider
completion after the timeout could not be confirmed. No model result was
available for human safety or structural-debris review. Whether the Provider
completed work or charged for it cannot be determined from app telemetry.

### Call 2: `high-risk-customer-otp`

**NOT_RUN.** Call 1 did not meet its HTTP 200 and review conditions. No IP
change, quota reset, retry, or alternate fixture was used.

## Final safety state

- `ANALYSIS_ENABLED=false`; Redis runtime `disabled`, TTL `-1`.
- Final same-SHA deployment:
  `dpl_6YEYX7eJmkHVAZyMUvtRyZCbFkmR`, READY and canonical alias matched.
- Controlled final POST before WAF removal: 503 `analysis_disabled`,
  no-store, `providerEntered=false`.
- Temporary WAF removed: firewall disabled, custom rules 0, no draft.
  Its ignored local private-header file was deleted. WAF configuration
  history remains on the platform.
- Public POST after WAF removal: 503 `analysis_disabled`, no-store,
  Request ID `46301075-30c5-4af8-8405-04b526e8a2f7`,
  `providerEntered=false`. Homepage, Privacy and Demo returned 200.

## Gates for this revision

| Gate | Status | Reason |
| --- | --- | --- |
| DAILY_QUOTA_NATURAL_RESET | PRIOR PASS only | Established on baseline `a722340`; not rerun on this SHA |
| SCHEMA_FAILURE_DIAGNOSTICS | PRIOR PASS only | Earlier revision's evidence; this timeout had no schema stage to diagnose |
| STRUCTURED_SCHEMA_CONSTRAINT | INCONCLUSIVE | Offline and official-document checks passed; the only live request timed out |
| STRUCTURED_TEXT_RELIABILITY_REGRESSION | FAIL | Call 1 was HTTP 503; no result or review, Call 2 not run |
| AI_QUALITY_GATE | NOT_RUN on this SHA | No result to review |
| PRODUCTION_ACCEPTANCE | FAIL for reopen | Reliability gate unmet |
| PUBLIC_BETA_REOPEN_READINESS | NOT_READY | Live schema/reliability evidence absent |
| PUBLIC_BETA | PAUSED | Both AI gates OFF at end |

Next work requires a separately authorized plan. Do not count this timeout
as schema acceptance, make an unplanned retry, or reopen Public Beta from
offline tests alone.
