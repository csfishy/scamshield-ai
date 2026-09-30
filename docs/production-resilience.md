# Production rate limits and provider resilience

This document describes the server-authoritative controls used by `POST /analyze`.
It contains no credentials and does not authorize a deployment or Redis migration.

## Request flow

1. Validate the HTTP method and create the request ID.
2. Resolve the trusted Vercel source IP, HMAC it, and atomically enforce the
   5-per-60-second burst limit plus the 150-request IP daily safety guard.
3. Parse and validate the multipart image and load local provider configuration.
4. Atomically reserve one device success, one global success, one of five
   provider concurrency leases, and circuit-breaker permission.
5. Recheck the runtime control key, then make exactly one provider call
   (`maxRetries: 0`).
6. On a normalized 200 result, atomically commit both success reservations and
   release the lease. On every other result, roll back both reservations,
   release the lease, and record at most one qualifying provider failure.

All Redis decisions use Lua plus Redis `TIME`. There is no process-local
authoritative fallback. If Redis cannot confirm a safety- or cost-sensitive
decision, the request fails closed with `rate_limit_unavailable` (503).

## Identity and limits

- The browser creates a random UUID with `crypto.randomUUID()` and stores it in
  same-origin `localStorage`. No fingerprinting inputs are used.
- The UUID and trusted IP are separately HMAC'd before they appear in Redis keys.
- Clients without a valid UUID use an HMAC'd IP-derived legacy device bucket.
- Burst: 5 accepted preflights per IP in a sliding 60-second window.
- Device: 30 successfully normalized analyses per Taipei day.
- IP: 150 accepted preflights per Taipei day. This is an abuse guard, so invalid
  image requests admitted through preflight still count here.
- Global: 3,000 successfully normalized analyses per Taipei day.
- Provider concurrency: five live distributed leases; excess requests fail fast.

Device/global quota checks use committed counts plus live reservation ZSETs.
The reservation and concurrency member share the provider lease expiry. A crash
therefore cannot leave a permanent slot or success reservation. Daily counters
expire one hour after the next Taipei midnight; minute windows expire after 60
seconds; receipts expire after about five minutes.

## Circuit breaker

The Redis-backed breaker has `CLOSED`, `OPEN`, and `HALF_OPEN` states. Defaults:

- five qualifying request-level failures in 60 seconds open the circuit;
- it remains open for 30 seconds;
- one half-open probe is allowed;
- a successful normalized probe closes the circuit and clears failures;
- a qualifying failed probe reopens it.

Qualifying failures are provider network failures, timeouts, HTTP 5xx responses,
and provider HTTP 429 responses. OpenAI 429 is included because it represents an
upstream capacity/account throttle at this boundary. Validation errors, local
rate/quota denials, cancellations, schema/refusal outcomes, concurrency denials,
and already-open circuit denials do not increment failures.

Circuit failure and probe ZSETs carry TTLs. OPEN/HALF_OPEN metadata has a bounded
TTL of at least one hour; ordinary closure deletes breaker state immediately.

## Error behavior

| Condition                  | Status | Code                               | `Retry-After`            |
| -------------------------- | -----: | ---------------------------------- | ------------------------ |
| Burst limit                |    429 | `client_rate_limited`              | Sliding-window remainder |
| Device daily success quota |    429 | `device_quota_exceeded`            | Taipei-day remainder     |
| IP daily safety guard      |    429 | `ip_safety_limit_exceeded`         | Taipei-day remainder     |
| Global daily success quota |    429 | `global_quota_exceeded`            | Taipei-day remainder     |
| Provider concurrency full  |    503 | `service_busy`                     | Earliest lease remainder |
| Circuit OPEN/probe full    |    503 | `provider_temporarily_unavailable` | Cooldown/probe remainder |
| Redis uncertainty          |    503 | `rate_limit_unavailable`           | Omitted                  |

Responses retain the v2 `{ error: { code, message, retryable } }` contract,
`Cache-Control: no-store`, and `X-Request-Id`. They never expose Redis keys,
failure counts, provider credentials, raw exceptions, or raw IPs.

## Production tuning

Thresholds are configured through the existing `QUOTA_*` naming convention and
the new `PROVIDER_CB_*` variables documented in `.env.example`. Keep the provider
lease longer than the API/provider deadline plus cleanup margin. Changes to
platform environment values require a new deployment; the existing runtime
control key remains the emergency stop. Preview and Production should use
separate Redis credentials/resources where possible.
