# Structured Outputs text `pattern` A/B — 2026-09-30

> 歷史紀錄：本報告只適用於正文指定的revision與當次測試。「目前／本輪／未提交」描述當時狀態。2026-10-02歸檔時保留原始正文，現況與其他版本結果見[歷史索引](release-evidence-index.md)。

## Status

- **Experiment result:** `CONFOUNDED_BY_LATENCY`
- **Public Beta:** `PAUSED`
- **Provider calls:** 2 / 2; automatic retries 0; manual retries 0
- **Final Production:** Variant A, double AI OFF, temporary WAF removed
- This is one fixed ordered pair. It is directional operational evidence, not a statistical or causal result.

## A. Baseline

| Item | Evidence |
| --- | --- |
| Repository | `csfishy/scamshield-ai` |
| `origin/main` before and after | `6357aed8787d80af0db55adf152c36b7363bd44c` |
| Production before | `dpl_3Sm1bRNQGYEip1ZLpRKNSLjwqt4P`, READY, canonical alias matched, same A SHA |
| Public Beta | `PAUSED` |
| Deployment gate | `ANALYSIS_ENABLED=false` |
| Runtime gate | Redis `disabled`, TTL `-1` |
| WAF before | inactive, 0 custom rules, no draft |

The local root checkout already contained user documentation changes and untracked evidence. They were preserved. `deliverables/` was not read, modified, staged, cleaned, or otherwise processed.

## B. Fixed invariants

| Invariant | Value |
| --- | --- |
| Model | `gpt-4.1-mini-2025-04-14` |
| Prompt version | `scam-analysis-v1` |
| Prompt Git-blob SHA-256 | `d06f9e3ac3ac93615217b75b2638e86d93f0d34c9597377153c5fe309a3ebe9d` |
| Fixture | `high-risk-delivery-fee`, PNG, 900 × 650, 35,830 bytes |
| Fixture SHA-256 | `cae73040153fc77e976edec09475b3003ec439cac31eb96e5bfee9cd3c8b318f` |
| Validator SHA-256 | `7bacff431f5b84e67a83d7a81c58e09dbffb94c7f2da2582958c75fa0566e1cd` |
| Variant A schema SHA-256 | `f316bbf6db275652c0d1cbf82205b9e3f6909cd8861bb3e24186e71bbeb47a87` |
| Variant B schema SHA-256 | `9dae7ac8152ac84c554247f928f9cc44d9a91de0153693da0948ac3783235621` |
| Structured output | `strict=true`; `store=false`; `tools=[]` |
| Temperature / token cap | `0` / `2400` |
| Provider / application / route timeout | 20s / 25s / 30s |
| Retry | `0` |
| Image detail | `high` |

The SDK serialization verifier used a fake transport and made 0 external Provider calls. It confirmed the prompt, fixture, validator and request invariants above.

## C. Variant B

| Item | Evidence |
| --- | --- |
| Branch | `codex/ab-no-structured-text-pattern` |
| Commit | `0159f944b4c521e22b4826e172d084b5d170561e` |
| Changed file | `lib/server/ai/providers/openai.ts` |
| Runtime semantic differences | Exactly the three JSON Schema paths below; other semantic differences 0 |
| Merge / push | Not merged into `main`; no remote branch contains this commit |

Removed paths:

- `$.properties.outcome.anyOf[0].properties.summary.pattern`
- `$.properties.outcome.anyOf[0].properties.signals.items.properties.reason.pattern`
- `$.properties.outcome.anyOf[0].properties.recommendations.items.pattern`

The unused `textTailPattern` constant and its comment were removed as the mechanical consequence of removing the three references. Descriptions, prompt, model, token cap, timeout, validator, telemetry, public contract and all other runtime behavior were unchanged.

Local B validation before deployment: clean install already completed with 0 vulnerabilities; typecheck, lint, 414 tests, build, `git diff --check`, secrets scan and actual SDK serialization/diff verifier passed. Paid calls: 0 during local validation.

## D. WAF and pre-call safety

A one-time, high-entropy private request header was stored only in an ignored local file. The temporary free custom WAF denied all project POST requests without the exact header; GET `/`, `/demo`, and `/privacy` remained anonymous HTTP 200. Before either paid call:

- no header → HTTP 403;
- wrong header → HTTP 403;
- correct header while Redis runtime was disabled → HTTP 503 `analysis_disabled`, `no-store`, Request ID present;
- request-correlated telemetry → `providerEntered=false`.

The header value was never written to Git, URLs, evidence, client code or public logs.

## E. Variant A Production

| Item | Result |
| --- | --- |
| Deployment | `dpl_8qHes8CyjFQ2qGfTKj9BwoPNdP2i` |
| SHA / alias | A `6357aed8787d80af0db55adf152c36b7363bd44c`; READY; canonical alias matched |
| Pre-call safe smoke | 503 `analysis_disabled`; `providerEntered=false` |
| Diagnostic Request ID | `c7902605-70d4-446a-b058-2ceeb1264c94` |
| HTTP / duration | 503 `provider_unavailable`; 20,102 ms |
| Provider | `providerEntered=true`; one call; failure kind `timeout` |
| Provider status fields | Not available because no definite Provider response was received |
| Usage | Unknown; input/output tokens unknown |
| Schema stage / field | Not reached / not applicable |
| Quota | `started`; global daily 4 → 5; receipt `started` |
| Lease | `held_until_expiry`; later active lease count 0 |
| Runtime after POST | `disabled`, TTL `-1` |
| Final class | `timeout` |

The first local guard incorrectly expected a body-level Request ID on an error response. That guard stopped before telemetry accounting, but the request itself was not retried. The existing header Request ID, allowlisted Production telemetry, quota delta and Redis receipt uniquely reconciled the already-sent A request. Raw Provider output was not read or stored.

## F. Variant B Production

| Item | Result |
| --- | --- |
| Deployment | `dpl_DmdKxmi31ixowVuV2Z7pM5SUQUqR` |
| Commit / alias | B `0159f944b4c521e22b4826e172d084b5d170561e`; READY; canonical alias matched during the test |
| Deployment reconciliation | CLI output lacked a uniquely parseable URL; no retry was issued. The one deployment carrying the unique `abVariant=B` and `abCommit` metadata was recovered by read-only API query. |
| Pre-call safe smoke | 503 `analysis_disabled`; `providerEntered=false` |
| Diagnostic Request ID | `3c919f82-242d-449f-905f-79f48288a7c4` |
| HTTP / duration | 500 `analysis_failed`; 3,445 ms |
| Provider | `providerEntered=true`; one call |
| Provider completion evidence | Direct telemetry status field absent. Control flow reached JSON parse, envelope validation and Provider outcome validation, which can only occur after the adapter accepted a completed response with output text. |
| Usage | Known: 1,939 input tokens; 323 output tokens |
| Schema stage / field | `structural_debris` / `signal_reason` |
| Validation | JSON parse PASS; envelope PASS; provider outcome PASS; normalizer FAIL; structural-debris validator FAIL; public contract NOT_REACHED |
| Quota | `started`; global daily 5 → 6; receipt `started` |
| Lease | `released`; active lease count 0 |
| Runtime after POST | `disabled`, TTL `-1` |
| Final class | `completed_but_server_rejected_debris` |

No model text, summary, signal reason, recommendation, raw response or image bytes are present in this evidence.

## G. Provider accounting

The preflight used the current GPT-4.1 mini standard price and a conservative Fast-price reservation, with an additional 10% contingency. This is an estimate, not a billing hard cap.

| Item | Value |
| --- | ---: |
| Calls | 2 / 2 |
| A / B calls | 1 / 1 |
| Retry | 0 |
| Known tokens | 1,939 input; 323 output (B only) |
| Unknown usage | 1 call (A) |
| A conservative reservation | US$0.01431276 |
| B conservative usage estimate | US$0.00226170 |
| Conservative accounted total | **US$0.01657446** |
| Authorized budget | US$0.03 |
| Pre-call two-call worst reservation | US$0.02862552 |

Pricing references: [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [API pricing](https://developers.openai.com/api/docs/pricing), [Fast mode](https://developers.openai.com/api/docs/guides/fast-mode).

## H. Result and interpretation

`PATTERN_COMPLETION_IMPACT = CONFOUNDED_BY_LATENCY`

### Proven by this run

- A reached the Provider once and ended at the configured Provider timeout. Usage is unknown and was charged to the experiment budget at the full conservative reservation.
- B reached the Provider once and returned quickly enough to pass JSON parse, envelope and Provider outcome validation.
- B still failed the backend structural-debris validator in `signal_reason`; it was not a deliverable Production result.
- Both paid attempts consumed daily quota under the documented attempt semantics. There were no retries and no third call.

### Directional evidence from this pair

Removing the three Provider schema patterns coincided with a completed B response instead of A's timeout. It also coincided with structural debris that the retained backend validator correctly rejected. This pair therefore shows a possible completion-versus-tail-quality tradeoff worth further controlled study.

### Still unknown

- This pair does not establish that the patterns caused A's timeout or B's completion.
- It does not estimate completion probability, latency distribution, debris rate or future cost.
- It does not show that Variant B is safe to publish. B failed the server validation gate.
- A lacked usage and a definite Provider response, so direct output-token or completion comparisons are unavailable.

## I. Final Production restore

| Check | Final evidence |
| --- | --- |
| Production code | Variant A / `main@6357aed8787d80af0db55adf152c36b7363bd44c` |
| Deployment | `dpl_4ueYqwWc9wYmkTuMtwZaY5GbGsDH`, READY, canonical alias matched |
| Deployment gate | `ANALYSIS_ENABLED=false` |
| Runtime gate | Redis `disabled`, TTL `-1` |
| WAF | inactive, custom rules 0, draft absent |
| Local WAF secret | deleted |
| Public GET smoke | `/`, `/privacy`, `/demo` all HTTP 200; homepage contains Google Forms feedback, Privacy and Demo links |
| Anonymous `/analyze` POST | 503 `analysis_disabled`, `no-store`, Request ID `db9a952f-e6d8-49d7-a873-d663dfb92ff9` |
| Final telemetry | `providerEntered=false` |
| Public Beta | `PAUSED` |

## J. Operations

- Production Provider calls: 2.
- Variant B merges into `main`: 0.
- Variant B pushes: 0.
- Production environment secret extraction: 0.
- Production `AI_API_KEY` downloads, reads, copies or outputs: 0.
- Redis quota mutations outside the application attempts: 0. Only the authorized runtime control key was toggled; final value is `disabled` with no TTL.
- Variant B is not the final Production deployment.
- No Production environment value other than the authorized `ANALYSIS_ENABLED` gate was changed; its final value is `false`.
