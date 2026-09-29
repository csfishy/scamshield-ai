import "server-only";

// All keys are declared and share one hash tag. No client clock or dynamic keys.
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

export const PREFLIGHT_SCRIPT = `${clock}${types}
if not valid_type(KEYS[1], 'string') or not valid_type(KEYS[2], 'zset') then
  return {'unavailable', 0}
end
if redis.call('GET', KEYS[1]) ~= 'enabled' then return {'analysis_disabled', 0} end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now - 60000)
if redis.call('ZSCORE', KEYS[2], ARGV[1]) then return {'unavailable', 0} end
local size = redis.call('ZCARD', KEYS[2])
if size >= tonumber(ARGV[2]) then
  local offset = size - tonumber(ARGV[2])
  local first = redis.call('ZRANGE', KEYS[2], offset, offset, 'WITHSCORES')
  return {'client_rate_limited', math.max(1, math.ceil((tonumber(first[2]) + 60000 - now) / 1000))}
end
redis.call('ZADD', KEYS[2], now, ARGV[1])
redis.call('PEXPIRE', KEYS[2], 60000)
return {'ok', 0}
`;

export const ACQUIRE_SCRIPT = `${clock}${types}${TAIPEI_DAY_LUA}
if not valid_type(KEYS[1], 'string') or not valid_type(KEYS[2], 'hash') or
   not valid_type(KEYS[3], 'hash') or not valid_type(KEYS[4], 'zset') or
   not valid_type(KEYS[5], 'hash') then return {'unavailable', 0} end
if redis.call('GET', KEYS[1]) ~= 'enabled' then return {'analysis_disabled', 0} end
-- A repeated/uncertain operation must never mint another debit or AI permission.
if redis.call('EXISTS', KEYS[5]) == 1 then return {'unavailable', 0} end
local day, reset = taipei_day(now)
local function count(key)
  local previous = redis.call('HGET', key, 'day')
  local current = redis.call('HGET', key, 'count')
  if not previous and not current then return 0 end
  if not previous or not current or not tonumber(previous) or not tonumber(current) or
     tonumber(previous) < 0 or tonumber(previous) ~= math.floor(tonumber(previous)) or
     tonumber(current) < 0 or tonumber(current) ~= math.floor(tonumber(current)) then return nil end
  if tonumber(previous) > day then return nil end
  if tonumber(previous) ~= day then return 0 end
  return tonumber(current)
end
local ip_count, global_count = count(KEYS[2]), count(KEYS[3])
if not ip_count or not global_count then return {'unavailable', 0} end
local retry = math.max(1, math.ceil((reset - now) / 1000))
if ip_count >= tonumber(ARGV[2]) then return {'daily_quota_exceeded', retry} end
if global_count >= tonumber(ARGV[3]) then return {'global_quota_exceeded', retry} end
redis.call('ZREMRANGEBYSCORE', KEYS[4], '-inf', now)
local lease_count = redis.call('ZCARD', KEYS[4])
if lease_count >= tonumber(ARGV[4]) then
  local offset = lease_count - tonumber(ARGV[4])
  local first = redis.call('ZRANGE', KEYS[4], offset, offset, 'WITHSCORES')
  return {'analysis_busy', math.max(1, math.ceil((tonumber(first[2]) - now) / 1000))}
end
-- Conditions are all checked before any debit. Runtime Redis failures still fail closed.
redis.call('HSET', KEYS[5], 'token', ARGV[1], 'state', 'acquired')
redis.call('PEXPIRE', KEYS[5], 172800000)
redis.call('HSET', KEYS[2], 'day', day, 'count', ip_count + 1)
redis.call('PEXPIREAT', KEYS[2], reset + 3600000)
redis.call('HSET', KEYS[3], 'day', day, 'count', global_count + 1)
redis.call('PEXPIREAT', KEYS[3], reset + 3600000)
redis.call('ZADD', KEYS[4], now + tonumber(ARGV[5]), ARGV[1])
local latest = redis.call('ZRANGE', KEYS[4], -1, -1, 'WITHSCORES')
redis.call('PEXPIREAT', KEYS[4], tonumber(latest[2]) + 1000)
return {'ok', 0}
`;

export const START_SCRIPT = `${clock}${types}
if not valid_type(KEYS[1], 'string') or not valid_type(KEYS[2], 'zset') or
   not valid_type(KEYS[3], 'hash') then return {'unavailable', 0} end
if redis.call('GET', KEYS[1]) ~= 'enabled' then return {'analysis_disabled', 0} end
local expiry = tonumber(redis.call('ZSCORE', KEYS[2], ARGV[1]))
-- Even after a stalled instance resumes, the lease must cover the 20s API cap + margin.
if not expiry or expiry <= now + 25000 or redis.call('HGET', KEYS[3], 'token') ~= ARGV[1] or
   redis.call('HGET', KEYS[3], 'state') ~= 'acquired' then return {'unavailable', 0} end
redis.call('HSET', KEYS[3], 'state', 'started')
return {'ok', 0}
`;

export const RELEASE_SCRIPT = `
-- Ownership is the unguessable ZSET member; double release removes zero members.
return redis.call('ZREM', KEYS[1], ARGV[1])
`;
