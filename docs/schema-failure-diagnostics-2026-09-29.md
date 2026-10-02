# Production schema failure diagnostics — 2026-09-29

> 歷史紀錄：本報告只適用於正文指定的revision與當次測試。「目前／本輪／未提交」描述當時狀態。2026-10-02歸檔時保留原始正文，現況與其他版本結果見[歷史索引](release-evidence-index.md)。

Status: **SCHEMA_FAILURE_DIAGNOSTICS = ROOT_CAUSE_IDENTIFIED for the one new call; Public Beta PAUSED; Production AI OFF.** This file records only safe metadata. It does not contain Provider output, image data, prompt text, secrets, or analysis prose.

## Incident and revision

- Launch revision: `f1eb9a3150d3418b895a3cf31c2033dbbe90085a`.
- Launch failure Request ID: `2d1641b7-a87d-4556-816c-36d8a2fe78f5`; HTTP 500 `analysis_failed`, telemetry `failureKind=schema`, `providerEntered=true`, usage 1760 input / 267 output tokens, global daily quota 8 → 9, lease released. No retry.
- **The exact stage of the 2026-09-29 Launch 500 cannot be recovered from old telemetry.** Synthetic local tests cover possible stages; they are not a reconstruction of that Provider response.
- Diagnostic revision: `b39768fb322f6516af8097c9871a4fe0656a1fd3` on `codex/schema-failure-diagnostics` and fast-forwarded `main`.
- Production auto deployment: `dpl_ESatXKec2VZWahdKrFqG7M6U6P4W`, `https://scamshield-rjeap7cnu-sakanano.vercel.app`, READY, canonical alias `https://scamshield-ai-fawn.vercel.app` points to it.

## Internal stage definitions

`schemaFailureStage` is an allowlisted **server telemetry** value, not an API response field. `schemaFailureField` appears only for `structural_debris` and is restricted to `summary`, `signal_reason`, or `recommendation`. The public error remains `analysis_failed` with its existing message and `retryable=false`.

| Stage | Meaning |
| --- | --- |
| `response_incomplete` | Completed status or `output_text` is missing; explicit Provider refusal keeps its existing insufficient-evidence handling. |
| `output_json_parse` | Nonempty `output_text` cannot be parsed as JSON. |
| `envelope` | Parsed JSON fails the strict `{ outcome: ... }` envelope. |
| `provider_outcome` | Envelope is valid but `providerOutcomeSchema` rejects `outcome`. |
| `structural_debris` | A schema-valid summary, signal reason, or recommendation ends with the existing multi-delimiter debris pattern. Only the field name is logged. |
| `public_contract` | Provider data and text checks pass, but the unchanged public analysis schema rejects the normalized result. |
| `provider_adapter` | Unexpected adapter/SDK behavior reaches the existing generic schema failure path. This keeps schema errors classifiable without logging an exception. |

The existing debris regex was **not changed**. Tests confirm the requested natural-language examples, embedded delimiters, normal punctuation and whitespace, and a single closing `}` at the end pass; malformed `}],`, `]},`, `},]`, `}},`, and `]],` tails remain rejected. A nested JSON example ending directly in `]}` could still match the conservative rule; no regex change was authorized in this diagnostic revision.

Telemetry allowlisting excludes raw `output_text`, decoded objects, summary, signal reasons, recommendations, image bytes/base64, prompt, API/Redis/HMAC secrets and private contact data. Invalid telemetry is dropped and telemetry failure does not affect HTTP behavior or trigger another Provider call.

## Local evidence

Environment: Node 24.19.0, npm 12.0.2. `npm ci` PASS, 391 packages installed, audit found 0 vulnerabilities. `npm run typecheck` PASS; `npm run lint -- --ignore-pattern 'deliverables/**'` PASS without warnings; `npm test` PASS (14 files, 365 tests, including 22 real Next.js + loopback Provider HTTP tests); `npm run build` PASS; `npm run verify:bundle` PASS (37 browser deliverable files scanned, zero server-only markers); `npm run test:e2e` PASS (9 shell + 11 remote UI tests). `git diff --check` PASS. Changed-file secret-pattern scan found zero credential-like values. No real Provider call was made by local tests.

The fixed diagnostic fixture remains `high-risk-delivery-fee`, 900 × 650 PNG, SHA-256 `cae73040153fc77e976edec09475b3003ec439cac31eb96e5bfee9cd3c8b318f`. Model `gpt-4.1-mini-2025-04-14`, prompt version `scam-analysis-v1`, `max_output_tokens=2400`, `temperature=0`, `store=false`, tools empty, and retries 0 are unchanged. The prior reservation of 8,988 input / 2,400 output tokens for this fixed image bounds a conservative double-standard-rate estimate to US$0.01636 including 10% contingency, below the authorized US$0.02 for **one** call. This is an estimate, not a Provider monetary hard cap. Sources checked on 2026-09-29: [model pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [image patch rules](https://developers.openai.com/api/docs/guides/images-vision), [Fast mode](https://developers.openai.com/api/docs/guides/fast-mode).

## Production AI-OFF acceptance and temporary isolation

- Deployment setting `ANALYSIS_ENABLED=false`; Redis control key `disabled`, TTL `-1`.
- Canonical homepage HTTP 200; `/privacy` HTTP 200.
- Canonical direct POST `/analyze`: HTTP 503 `analysis_disabled`, `Cache-Control: no-store`, Request ID `b6a4ae74-7735-4ff2-a7a8-ae73d1cb2d6d`; matching telemetry `providerEntered=false`, `usageKnown=false`, quota denied.
- The user separately authorized one temporary WAF window for this diagnostic. A newly generated 256-bit private header was held only in an ignored local file. The temporary project rule denied POSTs without that header or with the wrong value; GET pages remained available. Before enabling AI, canonical unauthorized and wrong-header `/analyze` POSTs returned platform HTTP 403 with no application Request ID; an authorized POST reached the application and returned 503 `analysis_disabled` with `providerEntered=false`. Homepage, Demo and Privacy returned 200, and the homepage Google Forms feedback link was present. This stronger all-project-POST rule also affected other project POST paths during the window; it did not affect the external Google Form.
- With the deployment gate true but Redis still disabled, same-SHA deployment `dpl_HWHgqEZwXZFUaoFpmcDNovbeaiFF` was READY on the canonical alias. Its authorized safe POST returned 503 `analysis_disabled`, Request ID `75fdd456-bb16-4566-a964-0cb10aa55798`, telemetry `providerEntered=false`. Missing/wrong-header canonical POSTs still returned WAF 403.

## One-call diagnostic and final safe state

The one-call runtime window opened at `2026-09-29T12:40:00.169Z` and closed at `12:40:05.438Z`. Exactly one controlled application POST was submitted; automatic and manual retries were zero. Fixed fixture: `high-risk-delivery-fee` (the hash above). Result: HTTP 500 `analysis_failed`, Request ID `2a15acfa-e928-4da2-8c56-62512fee3953`, `Cache-Control: no-store`. Public JSON did **not** expose diagnostic metadata. Matching Production telemetry: `providerEntered=true`, `failureKind=schema`, `schemaFailureStage=structural_debris`, `schemaFailureField=signal_reason`, `usageKnown=true`, 1760 input / 265 output tokens, `quotaOutcome=started`, `leaseDisposition=released`, duration 3236 ms. The new diagnostic has therefore located a schema-valid Provider signal reason rejected by the unchanged structural-debris rule. It does **not** prove the old Launch 500 had the same stage, because the old response was not retained.

At the [published standard model rates](https://developers.openai.com/api/docs/models/gpt-4.1-mini), observed usage estimates **US$0.001128**; a conservative 2× rate estimates **US$0.002256**, or **US$0.002482** with 10% contingency. Actual invoice amount and service tier are unavailable here. The Redis global daily count moved from **9 to 10**, receipt state was `started` with a positive TTL, and active leases returned to **0**. Quota was retained for this failed analysis attempt, as designed.

Immediately after the HTTP result, Redis was set to `disabled` and read back with TTL `-1`; `ANALYSIS_ENABLED` was then set to `false`. Same-SHA safe redeployment `dpl_5iHqZXJddc4J2sMQea8bdKKJSDZC` reached READY and the canonical alias. Its protected safe POST returned 503 `analysis_disabled`, Request ID `b624e0f9-366e-41de-b819-2e189ad99e0a`, telemetry `providerEntered=false`. Only then was the temporary WAF removed: firewall disabled, zero custom rules, no draft. The ignored local secret file was deleted. After removal, public anonymous homepage, Demo and Privacy returned 200 and feedback remained linked; an ordinary `/analyze` POST reached the app but returned 503 `analysis_disabled`, Request ID `3bda773a-95b4-4487-b38f-464e27565b9b`, `no-store`, telemetry `providerEntered=false`.

**Final gates:** `SCHEMA_FAILURE_DIAGNOSTICS = ROOT_CAUSE_IDENTIFIED` for this revision's single call; `PUBLIC_BETA = PAUSED`. The current conservative validation intentionally rejects malformed text instead of repairing it. No second call, regex/prompt/model change, or Beta reopening occurred. Further behavior change requires a separate decision and regression plan.
