import "server-only";

// Every script receives only declared keys under one Redis hash tag. Redis TIME
// is authoritative for windows, day rollover, leases, and circuit cooldowns.
const clock = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
`;
export const TAIPEI_DAY_LUA = `
local function taipei_day(now)
  local day = math.floor((now + 28800000) / 86400000)
  return day, (day + 1) * 86400000 - 28800000
end
`;
const types = `
local function valid_type(key, expected)
  local kind = redis.call('TYPE', key)['ok']
  return kind == 'none' or kind == expected
end
`;

// Burst and IP safety are request-oriented. Invalid uploads therefore consume
// the IP safety guard, but never consume a successful-analysis quota.
export const PREFLIGHT_SCRIPT = `${clock}${types}${TAIPEI_DAY_LUA}
if not valid_type(KEYS[1], 'string') or not valid_type(KEYS[2], 'zset') or
   not valid_type(KEYS[3], 'hash') then return {'unavailable', 0} end
if redis.call('GET', KEYS[1]) ~= 'enabled' then return {'analysis_disabled', 0} end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now - 60000)
if redis.call('ZSCORE', KEYS[2], ARGV[1]) then return {'unavailable', 0} end
local size = redis.call('ZCARD', KEYS[2])
if size >= tonumber(ARGV[2]) then
  local offset = size - tonumber(ARGV[2])
  local first = redis.call('ZRANGE', KEYS[2], offset, offset, 'WITHSCORES')
  return {'client_rate_limited', math.max(1, math.ceil((tonumber(first[2]) + 60000 - now) / 1000))}
end
local day, reset = taipei_day(now)
local previous = redis.call('HGET', KEYS[3], 'day')
local current = redis.call('HGET', KEYS[3], 'count')
if (previous and not current) or (current and not previous) then return {'unavailable', 0} end
if previous then
  previous, current = tonumber(previous), tonumber(current)
  if not previous or not current or previous < 0 or previous ~= math.floor(previous) or
     current < 0 or current ~= math.floor(current) or previous > day then return {'unavailable', 0} end
  if previous ~= day then current = 0 end
else
  current = 0
end
local retry = math.max(1, math.ceil((reset - now) / 1000))
if current >= tonumber(ARGV[3]) then return {'ip_safety_limit_exceeded', retry} end
redis.call('ZADD', KEYS[2], now, ARGV[1])
redis.call('PEXPIRE', KEYS[2], 60000)
redis.call('HSET', KEYS[3], 'day', day, 'count', current + 1)
redis.call('PEXPIREAT', KEYS[3], reset + 3600000)
return {'ok', 0}
`;

// Device/global successes use expiring reservations. The committed counter plus
// live reservations can never exceed the configured limit; crashed reservations
// disappear at lease expiry and are pruned atomically on the next admission.
export const ACQUIRE_SCRIPT = `${clock}${types}${TAIPEI_DAY_LUA}
if not valid_type(KEYS[1], 'string') or not valid_type(KEYS[2], 'hash') or
   not valid_type(KEYS[3], 'zset') or not valid_type(KEYS[4], 'hash') or
   not valid_type(KEYS[5], 'zset') or not valid_type(KEYS[6], 'zset') or
   not valid_type(KEYS[7], 'hash') or not valid_type(KEYS[8], 'hash') or
   not valid_type(KEYS[9], 'zset') or not valid_type(KEYS[10], 'zset') then
  return {'unavailable', 0}
end
if redis.call('GET', KEYS[1]) ~= 'enabled' then return {'analysis_disabled', 0} end
if redis.call('EXISTS', KEYS[7]) == 1 then return {'unavailable', 0} end
local day, reset = taipei_day(now)
local function quota(counter, reservations)
  local previous = redis.call('HGET', counter, 'day')
  local current = redis.call('HGET', counter, 'count')
  if (previous and not current) or (current and not previous) then return nil, nil end
  if previous then
    previous, current = tonumber(previous), tonumber(current)
    if not previous or not current or previous < 0 or previous ~= math.floor(previous) or
       current < 0 or current ~= math.floor(current) or previous > day then return nil, nil end
    if previous ~= day then
      current = 0
      redis.call('DEL', reservations)
    else
      redis.call('ZREMRANGEBYSCORE', reservations, '-inf', now)
    end
  else
    current = 0
    redis.call('DEL', reservations)
  end
  return current, redis.call('ZCARD', reservations)
end
local device_count, device_reserved = quota(KEYS[2], KEYS[3])
local global_count, global_reserved = quota(KEYS[4], KEYS[5])
if not device_count or not global_count then return {'unavailable', 0} end
local retry = math.max(1, math.ceil((reset - now) / 1000))
if device_count + device_reserved >= tonumber(ARGV[2]) then
  return {'device_quota_exceeded', retry}
end
if global_count + global_reserved >= tonumber(ARGV[3]) then
  return {'global_quota_exceeded', retry}
end
redis.call('ZREMRANGEBYSCORE', KEYS[6], '-inf', now)
local lease_count = redis.call('ZCARD', KEYS[6])
if lease_count >= tonumber(ARGV[4]) then
  local first = redis.call('ZRANGE', KEYS[6], 0, 0, 'WITHSCORES')
  return {'service_busy', math.max(1, math.ceil((tonumber(first[2]) - now) / 1000))}
end
local is_probe = 0
if ARGV[6] == '1' then
  redis.call('ZREMRANGEBYSCORE', KEYS[9], '-inf', now - tonumber(ARGV[8]))
  redis.call('ZREMRANGEBYSCORE', KEYS[10], '-inf', now)
  local state = redis.call('HGET', KEYS[8], 'state') or 'CLOSED'
  if state ~= 'CLOSED' and state ~= 'OPEN' and state ~= 'HALF_OPEN' then
    return {'unavailable', 0}
  end
  if state == 'OPEN' then
    local opened = tonumber(redis.call('HGET', KEYS[8], 'opened_at'))
    if not opened then return {'unavailable', 0} end
    if now < opened + tonumber(ARGV[9]) then
      return {'provider_temporarily_unavailable', math.max(1, math.ceil((opened + tonumber(ARGV[9]) - now) / 1000))}
    end
    state = 'HALF_OPEN'
    redis.call('HSET', KEYS[8], 'state', state)
    redis.call('PEXPIRE', KEYS[8], math.max(3600000, tonumber(ARGV[9]) + tonumber(ARGV[8]) + 60000))
  end
  if state == 'HALF_OPEN' then
    if redis.call('ZCARD', KEYS[10]) >= tonumber(ARGV[10]) then
      local first = redis.call('ZRANGE', KEYS[10], 0, 0, 'WITHSCORES')
      return {'provider_temporarily_unavailable', math.max(1, math.ceil((tonumber(first[2]) - now) / 1000))}
    end
    is_probe = 1
  end
end
local expiry = now + tonumber(ARGV[5])
local receipt_ttl = math.max(300000, tonumber(ARGV[5]) + 60000)
local function expire_after_latest(key)
  local latest = redis.call('ZRANGE', key, -1, -1, 'WITHSCORES')
  if latest[2] then redis.call('PEXPIREAT', key, tonumber(latest[2]) + 1000) end
end
redis.call('HSET', KEYS[7], 'token', ARGV[1], 'state', 'acquired', 'day', day, 'probe', is_probe)
redis.call('PEXPIRE', KEYS[7], receipt_ttl)
redis.call('HSET', KEYS[2], 'day', day, 'count', device_count)
redis.call('PEXPIREAT', KEYS[2], reset + 3600000)
redis.call('ZADD', KEYS[3], expiry, ARGV[1])
expire_after_latest(KEYS[3])
redis.call('HSET', KEYS[4], 'day', day, 'count', global_count)
redis.call('PEXPIREAT', KEYS[4], reset + 3600000)
redis.call('ZADD', KEYS[5], expiry, ARGV[1])
expire_after_latest(KEYS[5])
redis.call('ZADD', KEYS[6], expiry, ARGV[1])
expire_after_latest(KEYS[6])
if is_probe == 1 then
  redis.call('ZADD', KEYS[10], expiry, ARGV[1])
  expire_after_latest(KEYS[10])
end
if is_probe == 1 then return {'ok_half_open', 0} end
return {'ok', 0}
`;

export const START_SCRIPT = `${clock}${types}
if not valid_type(KEYS[1], 'string') or not valid_type(KEYS[2], 'zset') or
   not valid_type(KEYS[3], 'hash') then return {'unavailable', 0} end
if redis.call('GET', KEYS[1]) ~= 'enabled' then return {'analysis_disabled', 0} end
local expiry = tonumber(redis.call('ZSCORE', KEYS[2], ARGV[1]))
if not expiry or expiry <= now + tonumber(ARGV[2]) or
   redis.call('HGET', KEYS[3], 'token') ~= ARGV[1] or
   redis.call('HGET', KEYS[3], 'state') ~= 'acquired' then return {'unavailable', 0} end
redis.call('HSET', KEYS[3], 'state', 'started')
return {'ok', 0}
`;

// outcome: success | provider_failure | neutral_failure. Cleanup and quota
// settlement are one atomic operation. Provider failures are counted once per
// user request, regardless of any provider-internal behavior.
export const FINALIZE_SCRIPT = `${clock}${types}${TAIPEI_DAY_LUA}
if not valid_type(KEYS[1], 'hash') or not valid_type(KEYS[2], 'zset') or
   not valid_type(KEYS[3], 'hash') or not valid_type(KEYS[4], 'zset') or
   not valid_type(KEYS[5], 'zset') or not valid_type(KEYS[6], 'hash') or
   not valid_type(KEYS[7], 'hash') or not valid_type(KEYS[8], 'zset') or
   not valid_type(KEYS[9], 'zset') then return {'unavailable', 0} end
if ARGV[2] ~= 'success' and ARGV[2] ~= 'provider_failure' and
   ARGV[2] ~= 'neutral_failure' then return {'unavailable', 0} end
local state = redis.call('HGET', KEYS[6], 'state')
if redis.call('HGET', KEYS[6], 'token') ~= ARGV[1] or
   (state ~= 'acquired' and state ~= 'started') then return {'unavailable', 0} end
local receipt_day = tonumber(redis.call('HGET', KEYS[6], 'day'))
local probe = tonumber(redis.call('HGET', KEYS[6], 'probe'))
if not receipt_day or (probe ~= 0 and probe ~= 1) then return {'unavailable', 0} end
local function valid_counter(key)
  local day = tonumber(redis.call('HGET', key, 'day'))
  local count = tonumber(redis.call('HGET', key, 'count'))
  if not day or not count or day < 0 or day ~= math.floor(day) or
     count < 0 or count ~= math.floor(count) then return nil, nil end
  return day, count
end
local device_day, device_count = valid_counter(KEYS[1])
local global_day, global_count = valid_counter(KEYS[3])
if not device_day or not global_day then return {'unavailable', 0} end
local device_expiry = tonumber(redis.call('ZSCORE', KEYS[2], ARGV[1]))
local global_expiry = tonumber(redis.call('ZSCORE', KEYS[4], ARGV[1]))
local active = device_expiry and global_expiry and device_expiry > now and global_expiry > now
redis.call('ZREM', KEYS[2], ARGV[1])
redis.call('ZREM', KEYS[4], ARGV[1])
redis.call('ZREM', KEYS[5], ARGV[1])
redis.call('ZREM', KEYS[9], ARGV[1])
redis.call('HSET', KEYS[6], 'state', 'finalized')
redis.call('PEXPIRE', KEYS[6], 300000)
if ARGV[2] == 'success' then
  if not active then return {'unavailable', 0} end
  if device_day == receipt_day then redis.call('HINCRBY', KEYS[1], 'count', 1) end
  if global_day == receipt_day then redis.call('HINCRBY', KEYS[3], 'count', 1) end
end
if ARGV[3] ~= '1' then return {'ok', 0} end
local cb_state = redis.call('HGET', KEYS[7], 'state') or 'CLOSED'
if cb_state ~= 'CLOSED' and cb_state ~= 'OPEN' and cb_state ~= 'HALF_OPEN' then
  return {'unavailable', 0}
end
if ARGV[2] == 'success' and probe == 1 and cb_state == 'HALF_OPEN' then
  redis.call('DEL', KEYS[7], KEYS[8], KEYS[9])
  return {'ok_cb_closed', 0}
end
if ARGV[2] ~= 'provider_failure' then return {'ok', 0} end
redis.call('ZREMRANGEBYSCORE', KEYS[8], '-inf', now - tonumber(ARGV[5]))
redis.call('ZADD', KEYS[8], now, ARGV[1])
redis.call('PEXPIRE', KEYS[8], tonumber(ARGV[5]) + 1000)
if (probe == 1 and cb_state ~= 'OPEN') or
   (cb_state == 'CLOSED' and redis.call('ZCARD', KEYS[8]) >= tonumber(ARGV[4])) then
  redis.call('HSET', KEYS[7], 'state', 'OPEN', 'opened_at', now)
  redis.call('PEXPIRE', KEYS[7], math.max(3600000, tonumber(ARGV[6]) + tonumber(ARGV[5]) + 60000))
  redis.call('DEL', KEYS[9])
  return {'ok_cb_opened', 0}
end
return {'ok', 0}
`;

// Kept as a tiny compatibility primitive for isolated transport tests. Runtime
// settlement uses FINALIZE_SCRIPT so reservations and circuit state stay atomic.
export const RELEASE_SCRIPT = `return redis.call('ZREM', KEYS[1], ARGV[1])`;
