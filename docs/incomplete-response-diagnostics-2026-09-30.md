# Production `response_incomplete` diagnostics — 2026-09-30

> 歷史紀錄：本報告只適用於正文指定的revision與當次測試。「目前／本輪／未提交」描述當時狀態。2026-10-02歸檔時保留原始正文，現況與其他版本結果見[歷史索引](release-evidence-index.md)。

## Scope and prior incident

Public Beta remained paused throughout this work. The prior fixed-fixture incident returned HTTP 500 `analysis_failed` with request ID `2c824492-9e31-45f1-984f-36ca4fc5b540`, `failureKind=schema`, and `schemaFailureStage=response_incomplete`. The earlier telemetry did not distinguish the Provider response status, incomplete reason, output-text presence, or any failure-path usage.

This change only adds safe server-side diagnostics and failure-path token propagation. It does not change the model, prompt, Structured Outputs schema or pattern, structural-debris validation, output-token limit, timeout values, or retry policy.

## Implementation

- Branch: `codex/refine-incomplete-response-diagnostics`
- Commit and final `origin/main`: `6357aed8787d80af0db55adf152c36b7363bd44c`
- Commit title: `feat(ai): refine incomplete response diagnostics`
- `providerResponseStatus` is restricted to `completed`, `incomplete`, `failed`, `cancelled`, `queued`, `in_progress`, or `other`.
- `providerIncompleteReason` is restricted to `max_output_tokens`, `max_messages`, `content_filter`, `steered`, `other`, or `none`.
- `providerOutputTextPresent` is a boolean.
- Unknown Provider values map to `other`; raw values and raw Provider objects are not logged.
- When a Provider response includes usage, integer input/output tokens are propagated through the server-only error diagnostics to telemetry. Missing usage remains unknown and is not reported as zero.
- Public HTTP error bodies remain unchanged and do not expose these fields.

## Privacy properties

Telemetry uses a fixed allowlist. It does not record Provider output text, the raw Provider response, decoded analysis outcome, summary, signal reasons, recommendations, prompt or system instructions, image bytes or base64, API keys, Redis credentials, HMAC secrets, or the temporary WAF header secret. Logging failure does not change the HTTP response.

## Automated verification

The following checks ran with Node 24.19.0 and npm 12.0.2 before the commit and deployment:

| Check | Result |
| --- | --- |
| `npm ci` | PASS — 391 packages, 0 vulnerabilities |
| `npm run typecheck` | PASS |
| `npm run lint -- --ignore-pattern 'deliverables/**'` | PASS |
| `npm test` | PASS — 414 tests in 15 files |
| New deterministic diagnostic/usage regressions | PASS — 13 tests added relative to the 401-test baseline |
| `npm run build` | PASS |
| `npm run verify:bundle` | PASS — 37 client files checked, 0 server markers |
| `npm run test:e2e` | PASS — 20 tests |
| `git diff --check` | PASS |
| Tracked-file known-secret scan | PASS — 175 files, 0 exact matches |

Tests cover Provider response-status/reason mapping, completed-without-output handling, failure-path usage present and absent, parse and structural-debris failures, telemetry refinements and allowlisting, and unchanged public error bodies. Tests use deterministic Provider substitutes and make no real AI calls.

## Production deployment and isolation

The diagnostic patch was first deployed with both AI gates off. Deployment `dpl_DLvHhJG3E6oxGqre2bagfezVroyK` was READY at SHA `6357aed8787d80af0db55adf152c36b7363bd44c`, and the canonical alias matched. Homepage and Privacy returned 200. An AI-OFF POST returned 503 `analysis_disabled`, `Cache-Control: no-store`, a request ID, and `providerEntered=false`.

A temporary private-header WAF rule then rejected unapproved POST requests with 403 while allowing only the controlled diagnostic request to reach the application. Homepage, Demo, and Privacy remained public. Before the paid call, deployment `dpl_2dUc5etYTrTBs18gLuVU7XFpJYqC` was READY on the same SHA, the deployment gate was on, the Redis runtime gate remained disabled, and a controlled POST still returned 503 with `providerEntered=false`.

## Single Production diagnostic call

- Fixture: `high-risk-delivery-fee`
- Provider calls: 1 of 1
- Retries: 0 automatic, 0 manual
- HTTP: 500 `analysis_failed`
- Request ID: `a43e42a2-c718-4a71-b38a-ba56f31dcd09`
- Application duration: 18,701 ms
- `providerEntered`: `true`
- `failureKind`: `schema`
- `schemaFailureStage`: `response_incomplete`
- `schemaFailureField`: not present
- `providerResponseStatus`: `incomplete`
- `providerIncompleteReason`: `max_output_tokens`
- `providerOutputTextPresent`: `true`
- `usageKnown`: `true`
- Input tokens: 1,939
- Output tokens: 2,400
- Conservative estimated cost: US$0.0080773
- Global daily quota: 3 before, 4 after
- `quotaOutcome`: `started`
- `leaseDisposition`: `released`
- Active leases after the call: 0
- Redis runtime immediately after the request: `disabled`, TTL `-1`

The estimate uses the conservative price reservation recorded before the call and is not a Provider billing hard cap. Official references used for the preflight were the [GPT-4.1 mini model page](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [API pricing](https://developers.openai.com/api/docs/pricing), and [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs).

## Diagnosis

`INCOMPLETE_RESPONSE_DIAGNOSTIC = ROOT_CAUSE_IDENTIFIED_MAX_OUTPUT_TOKENS`

The Provider returned an `incomplete` response before the 20-second Provider timeout, with output text present and the output-token count equal to the configured 2,400-token limit. This evidence identifies the incomplete reason without retaining the partial Provider text. Per scope, this round did not increase the token limit, change the prompt or schema, change timeouts, or retry.

## Final safe state

- Final Production deployment: `dpl_3Sm1bRNQGYEip1ZLpRKNSLjwqt4P`
- Git SHA: `6357aed8787d80af0db55adf152c36b7363bd44c`
- Deployment state: READY; canonical alias matched
- `ANALYSIS_ENABLED=false`
- Redis runtime: `disabled`; TTL `-1`
- AI timeout: 20,000 ms
- Application timeout: 25,000 ms
- Temporary WAF: removed; firewall disabled, custom rules `0`, draft absent
- Local WAF secret: deleted
- Homepage, Demo, and Privacy: HTTP 200
- Final public POST: HTTP 503 `analysis_disabled`, `Cache-Control: no-store`
- Final Request ID: `f5ec152d-0096-4b64-8bd9-65bcbdf29dc1`
- Final telemetry: `providerEntered=false`
- Public Beta: `PAUSED`

## Gates

| Gate | Result | Evidence |
| --- | --- | --- |
| `PROVIDER_TIMEOUT_ROBUSTNESS` | INCONCLUSIVE | The single response arrived before the Provider timeout; timeout behavior was not exercised. |
| `STRUCTURED_SCHEMA_CONSTRAINT` | FAIL | The fixed case did not produce a completed contract-valid response. |
| `SCHEMA_FAILURE_DIAGNOSTICS` | PASS | Telemetry recorded `response_incomplete`. |
| `INCOMPLETE_RESPONSE_DIAGNOSTICS` | PASS | Fixed status, reason, output-presence, and available usage fields were recorded without raw Provider content. |
| `STRUCTURED_TEXT_RELIABILITY_REGRESSION` | FAIL | The fixed Production case returned HTTP 500. |
| `AI_QUALITY_GATE` | NOT_RUN | No valid analysis result was produced for quality review. |
| `PRODUCTION_ACCEPTANCE` | BLOCKED | Paid analysis remains disabled after a reproducible incomplete response. |
| `PUBLIC_BETA_REOPEN_READINESS` | BLOCKED | A separate, explicitly approved fix and regression round is required. |
| `PUBLIC_BETA` | PAUSED | Both AI gates are off. |
