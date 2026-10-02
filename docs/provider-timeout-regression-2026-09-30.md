# Provider timeout regression — 2026-09-30

> 歷史紀錄：本報告只適用於正文指定的revision與當次測試。「目前／本輪／未提交」描述當時狀態。2026-10-02歸檔時保留原始正文，現況與其他版本結果見[歷史索引](release-evidence-index.md)。

Public Beta remains PAUSED. This file is local acceptance evidence, not a
new deployed revision. Final regression and cleanup results appear below.

## Baseline and latency review

Initial origin/main and Production: `0283fc6420754ce55739a4d05c49808a89e52a34`.
Canonical deployment `dpl_6YEYX7eJmkHVAZyMUvtRyZCbFkmR` was READY.
Production explicitly configured Provider 15000ms / application 20000ms;
ANALYSIS_ENABLED=false, Redis disabled, control TTL=-1, WAF inactive,
zero custom rules and no draft.

All durations below are **application/pipeline duration**, not separately
measured Provider latency. No Provider-only duration was available. HTTP422
and schema failures with usage are completed Provider responses, not timeouts.

| Historical case / Request ID | HTTP / outcome | Application ms | Input / output tokens | Evidence |
| --- | --- | ---: | --- | --- |
| 2026-09-05 delivery smoke; ID not recorded in report | 200, later debris noted | 7998 | 1760 / 280 | `ai-smoke-2026-09-05.md`, local pipeline |
| Six-call delivery / d47c8629-19c0-4ea6-9c36-d0f896cca027 | 200 | 5216 | 1760 / 263 | saved Production telemetry |
| Six-call OTP / ef8534c1-8917-4fe8-8956-461c6718e5e1 | 200 | 3037 | 1760 / 178 | saved Production telemetry |
| Six-call normal / ecd2eccd-7da3-4c62-8c94-56f278651ffc | 200 | 2461 | 1760 / 105 | saved Production telemetry |
| Six-call cropped / 0b5c20a3-fabd-4af3-8155-e8a33cd83479 | 422 insufficient evidence | 990 | 1760 / 17 | saved Production telemetry |
| Six-call blurred / 9071c039-2b73-401e-afbb-1c4d18f30265 | 422 insufficient evidence | 1238 | 1760 / 18 | saved Production telemetry |
| Six-call injection / 5717d95b-e812-416a-b29e-0e61b5250435 | 200 | 2730 | 1760 / 163 | saved Production telemetry |
| Debris regression delivery / 0e09cda1-8583-4154-b1d4-22eb4ae87168 | 200 | 3970 | 1760 / 263 | saved Production telemetry |
| Debris regression OTP / 0a0a5e38-83c1-49ea-8a16-ebcefb7c419a | 200 | 2382 | 1760 / 185 | saved Production telemetry |
| Launch delivery / 2d1641b7-a87d-4556-816c-36d8a2fe78f5 | 500 schema | 4228 | 1760 / 267 | launch report telemetry |
| Schema diagnostic / 2a15acfa-e928-4da2-8c56-62512fee3953 | 500 structural_debris / signal_reason | 3236 | 1760 / 265 | diagnostic report telemetry |
| Natural reset regression / 56dc7a54-2cac-48c8-8d94-f11158a554e2 | 500 structural_debris / signal_reason | 5217 | 1939 / 332 | current read of matching Production log |
| Pattern regression / 12faec31-e443-4a49-b87b-fb2c9204b5fd | 503 Provider timeout | 15185 | UNKNOWN | current read of matching Production log |

Source commits bbdcff4, 2b6e652, f1eb9a3, b39768f, a722340 and 0283fc6
were inspected: each uses detail=high and strict JSON Schema output;
code default/max timeouts were 15s/20s. This does not invent missing archived
environment overrides. The latest timeout's explicit Production values were
also read back. Sample size is small and mixed across revisions; there is no
statistically representative p95 or proof that a 20s timeout will suffice.
The 15.185s timeout is not evidence of pattern, prompt or debris failure.

## Design and implementation

The bounded 20s Provider / 25s application candidate was adopted. The API
clock starts at handler entry and includes quota preflight, upload parsing,
image validation, prompt loading, quota acquisition and runtime start.
The Provider budget remains min(configured timeout, remaining API budget
minus 2000ms). Normalization, release and response retain that margin;
Redis release retains its existing bounded timeout. The 30s route budget
leaves a further 5s platform allowance. The 60s lease remains sufficient;
remote work whose completion is unknown still holds its lease until expiry.
Client timeout remains 25s including upload/network and can fire before a
very late server reply; it never automatically resends a paid request.

The margin is a budget policy, not a guarantee against event-loop stalls,
platform cold-start overhead or remote computation continuing after abort.
[Vercel's duration documentation](https://vercel.com/docs/functions/configuring-functions/duration)
defines maxDuration as the platform execution limit. No route duration change
was needed or made.

- Branch: `codex/increase-provider-timeout`.
- Commit / final code SHA: `19c2aec5037a6f3a917799518845a401c6fed76a`.
- AI_TIMEOUT_MS default/max: 20000. ANALYSIS_TIMEOUT_MS default/max: 25000.
- Integer/positive bounds and Provider + 2000 <= API remain enforced.
- Unchanged: model, prompt, descriptions, pattern, validator, diagnostics,
  Redis scripts, quota, concurrency, route maxDuration=30 and zero retry.
- Updated config, `.env.example`, README, Runbook, Test Plan and SDD.
- Root working tree has pre-existing documentation edits. To preserve them,
  a clean local integration branch from origin/main was merged with
  `--ff-only` and pushed non-forced to remote main. The protected root local
  main checkout remains at 0283fc6; the managed feature worktree and remote
  main contain 19c2aec. No stash, clean, reset, or deliverables access occurred.

## Offline validation

Node 24.19.0 / npm 12.0.2 via Corepack.

| Command / check | Result |
| --- | --- |
| npm ci | PASS; 391 packages, 0 reported vulnerabilities |
| npm run typecheck | PASS after replacing a test-only Promise.withResolvers helper unsupported by the configured TS library; TS settings unchanged |
| npm run lint -- --ignore-pattern 'deliverables/**' | PASS |
| npm test | PASS: 401 tests / 15 files; includes existing HTTP and debris regressions |
| Timeout-specific tests | 31 PASS: 27 configuration cases, 4 fake-time handler cases |
| npm run build | PASS |
| npm run verify:bundle | PASS: 37 browser files, 0 server-only markers |
| npm run test:e2e | PASS: 20/20 |
| git diff --check / secrets scan | PASS; 175 tracked files checked against known secret values, 0 matches |

Fake time tests cover completion at 19999ms, expiry at 20000ms without retry,
ignored late success, unknown usage without fake token counts, held lease,
6000ms preflight reducing Provider time to 17000ms, and API preflight abort
at 25000ms before Provider entry. No paid calls were made by these tests.

## Deployment and regression preparation

Production's explicit old timeout environment values were updated to
20000/25000 while both AI gates stayed OFF. Environment confirmation preceded
main push. Initial new deployment `dpl_AukkwGGP5t9ZFFutcLs1HnY2Av8J` reached
READY, new SHA and canonical alias matched. Project settings were read back;
deployment metadata listed all three setting names (it does not expose their
effective values). Homepage/Privacy/Demo returned 200; safe POST returned
503 analysis_disabled, no-store, Request ID
`84fc3b8b-881a-48bf-8e61-8eac6a5a55d0`, providerEntered=false.

Private-header WAF HTTP verification: missing and wrong headers returned
403; controlled POST returned 503 analysis_disabled with Provider entry false.
GET pages stayed public. The secret is omitted from all evidence.

[Standard model pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
and [Fast pricing](https://openai.com/api-fast-mode/) were rechecked. Fixed
900x650 fixtures and prompt hashes matched. The estimate reserves 8988 input
and 2400 output tokens per call at the higher Fast price (US$0.70/2.80 per
million input/output tokens), plus 10% contingency: US$0.02862552 for two
calls against US$0.03 authorization. This is a conservative estimate, not a
Provider monetary hard limit. Unknown usage stops further requests.

## Current-round results and final safety

Controlled regression deployment `dpl_GcyffkCzLf6gMoxMMrSrUU6QhZb8`
reached READY on 19c2aec with the canonical alias. With the deployment gate
true and runtime still disabled, controlled POST returned 503
analysis_disabled, no-store, Request ID
`8cc9ac9c-53dc-45d1-bc3a-dd0dfd741923`, providerEntered=false.

### Call 1 — high-risk-delivery-fee

One request was submitted at 2026-09-29T17:31:42.719Z
(2026-09-30 01:31:42.719 Asia/Taipei). No automatic or manual retry occurred.

| Field | Observed |
| --- | --- |
| HTTP / Request ID | 500 analysis_failed / `2c824492-9e31-45f1-984f-36ca4fc5b540` |
| Application duration | 17876ms; no separately measured Provider duration |
| Provider entry / quota outcome | true / started |
| Failure kind | schema, **not timeout** |
| Schema stage / field | response_incomplete / not applicable |
| Usage | usageKnown=false; input and output token counts UNKNOWN |
| Estimated actual spend | UNKNOWN; must not be reported as zero |
| Daily global quota | 2 before → 3 after, same Taipei day |
| Lease | released; active leases 0 after request |
| Runtime after request | disabled, TTL=-1 |
| Risk score / level / category | No valid analysis result |
| Debris / recommendation / human quality review | NOT_RUN: no successful output available |

The Provider adapter received a response before its configured deadline, but
its existing guard rejected a non-completed response or absent output_text.
That guard groups these conditions under response_incomplete; the safe stage
does **not** identify which condition occurred or establish its cause. Do not
infer output-token exhaustion, malformed text, or a pattern failure from it.
The adapter throws before returning its response usage to the analysis
pipeline, so usageKnown=false does not establish that the Provider returned
no usage or charged nothing. No raw Provider output was logged or retained.

This confirms one non-timeout response, but not successful output reliability
or a two-call timeout gate. Total application time exceeded 15s; without a
separate Provider timer, it does not prove Provider processing alone exceeded
15s. The request counted toward daily quota; release did not refund it.

### Call 2 — high-risk-customer-otp

**NOT_RUN.** Call 1 failed the HTTP 200/review prerequisite. The local ledger
is stopped. No quota reset, IP change, alternate fixture or retry occurred.

### Accounting and gates

Provider calls: **1/2**. Automatic/manual retries: **0/0**. Known usage calls:
0; unknown usage calls: 1. Actual usage-based estimated spend is UNKNOWN.
Preflight reservation for the one attempted call was US$0.01431276 including
contingency, against US$0.03 authorization; this reservation is not measured
spend or proof of an invoice amount. Unknown usage stopped all further calls.

| Gate | This revision / round |
| --- | --- |
| DAILY_QUOTA_NATURAL_RESET | PRIOR PASS on a722340; NOT_RUN on this revision |
| PROVIDER_TIMEOUT_ROBUSTNESS | INCONCLUSIVE: one response without timeout, second call not run |
| STRUCTURED_SCHEMA_CONSTRAINT | INCONCLUSIVE: no valid generated result; incomplete stage does not establish pattern acceptance or rejection |
| SCHEMA_FAILURE_DIAGNOSTICS | PASS: the actual 500 carried fixed safe stage response_incomplete |
| STRUCTURED_TEXT_RELIABILITY_REGRESSION | FAIL: Call 1 HTTP 500; Call 2 not run |
| AI_QUALITY_GATE | NOT_RUN: no valid analysis available for human quality review |
| PRODUCTION_ACCEPTANCE | FAIL for reopening: required output reliability gate unmet |
| PUBLIC_BETA_REOPEN_READINESS | NOT_READY |
| PUBLIC_BETA | PAUSED; not authorized to reopen in this round |

### Final safety restoration

Completed, verified at 2026-09-29T17:37:59.801Z
(2026-09-30 01:37:59.801 Asia/Taipei):

- Deployment gate ANALYSIS_ENABLED=false; runtime disabled, TTL=-1.
- Explicit timeout settings remain 20000/25000ms.
- Final deployment `dpl_FMLXVaNB3rbZJkMz9ErnMfkdY1KF` is READY, same SHA
  `19c2aec5037a6f3a917799518845a401c6fed76a` and canonical alias matched.
  Deployment URL: https://scamshield-512frpo1p-sakanano.vercel.app
  Canonical URL: https://scamshield-ai-fawn.vercel.app
- Before WAF removal, controlled POST returned 503 analysis_disabled,
  no-store, Request ID `0a891616-8c07-4974-b476-389ba389de1f`,
  providerEntered=false. Only after that verification was WAF removed.
- WAF is inactive, custom rules=0, draft=null. The local private-header
  secret file was deleted and its absence verified. Platform configuration
  and audit history may remain; no secret is present in this report.
- After removal, anonymous POST returned 503 analysis_disabled, no-store,
  Request ID `50cc70c2-be10-4387-8204-14818b1b0977`,
  providerEntered=false, quotaOutcome=denied. Homepage, Demo and Privacy
  were HTTP200; homepage feedback label and Google Forms link remained.
  This is an entry-point smoke, not another external form submission.
- Feature branch and remote main both read back as 19c2aec. The clean
  managed feature worktree has no tracked modifications. All 14 protected
  pre-existing root documents still match their initial hashes. The root's
  six pre-existing tracked edits remain; this new evidence file is local,
  uncommitted, and did not trigger another deployment. Local env files
  remain untracked. deliverables was not accessed or changed.
- Final known-secret scan: 176 tracked-source/evidence files, zero exact
  matches, no values printed; root and feature diff checks passed.

No further calls, model/prompt/schema changes or Public Beta reopening were
performed. The timeout implementation and safety restoration passed, while
the live reliability gate failed. Future diagnosis requires a separate
authorized scope; the current stage alone does not identify the underlying
Provider completion failure.
