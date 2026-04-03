import { clientIp } from './session.js';

export var ACCOUNT_FAIL_SHORT_WINDOW_MIN = 10;
export var ACCOUNT_FAIL_SHORT_LIMIT = 3;
export var ACCOUNT_FAIL_SHORT_LOCK_MIN = 5;

export var ACCOUNT_FAIL_LONG_WINDOW_MIN = 20;
export var ACCOUNT_FAIL_LONG_LIMIT = 5;
export var ACCOUNT_FAIL_LONG_LOCK_MIN = 15;

export var IP_FAIL_WINDOW_MIN = 10;
export var IP_FAIL_LIMIT = 20;
export var IP_FAIL_LOCK_MIN = 30;

export function nowIso() {
  return new Date().toISOString();
}

export function addMinutes(iso, minutes) {
  var d = new Date(iso);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString();
}

function laterIso(a, b) {
  if (!a) return b || '';
  if (!b) return a || '';
  return a > b ? a : b;
}

export async function sleepMs(ms) {
  if (!ms || ms <= 0) return;
  await new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

export function loginScopeKeyForIp(request) {
  return String(clientIp(request) || '').trim() || 'unknown';
}

export async function recordSecurityEvent(env, payload) {
  var metaJson = payload.meta ? JSON.stringify(payload.meta) : null;
  return env.DB.prepare(
    'INSERT INTO login_security_events (scope_type, scope_key, event_type, phone, user_id, client_ip, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(
      payload.scopeType,
      payload.scopeKey,
      payload.eventType,
      payload.phone || null,
      payload.userId != null ? payload.userId : null,
      payload.clientIp || null,
      metaJson,
      payload.createdAt || nowIso()
    )
    .run();
}

export async function getActiveBlock(env, scopeType, scopeKey, now) {
  var row = await env.DB.prepare(
    'SELECT scope_type, scope_key, blocked_until, reason FROM login_security_blocks WHERE scope_type = ? AND scope_key = ? AND blocked_until > ? LIMIT 1'
  )
    .bind(scopeType, scopeKey, now || nowIso())
    .first();
  return row || null;
}

export async function upsertBlock(env, scopeType, scopeKey, blockedUntil, reason, now) {
  var ts = now || nowIso();
  await env.DB.prepare(
    'INSERT INTO login_security_blocks (scope_type, scope_key, blocked_until, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(scope_type, scope_key) DO UPDATE SET blocked_until = excluded.blocked_until, reason = excluded.reason, updated_at = excluded.updated_at'
  )
    .bind(scopeType, scopeKey, blockedUntil, reason || null, ts, ts)
    .run();
}

export async function clearBlock(env, scopeType, scopeKey) {
  await env.DB.prepare('DELETE FROM login_security_blocks WHERE scope_type = ? AND scope_key = ?')
    .bind(scopeType, scopeKey)
    .run();
}

async function getLatestSuccessAt(env, phone) {
  if (!phone) return '';
  var row = await env.DB.prepare(
    "SELECT created_at FROM login_security_events WHERE scope_type = 'account' AND scope_key = ? AND event_type = 'login_success' ORDER BY created_at DESC LIMIT 1"
  )
    .bind(phone)
    .first();
  return (row && row.created_at) || '';
}

export async function countRecentAccountFailures(env, phone, windowMinutes, now) {
  if (!phone) return 0;
  var current = now || nowIso();
  var windowStart = addMinutes(current, -windowMinutes);
  var lastSuccessAt = await getLatestSuccessAt(env, phone);
  var effectiveStart = laterIso(windowStart, lastSuccessAt);
  var row = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM login_security_events WHERE scope_type = 'account' AND scope_key = ? AND event_type = 'login_failed' AND created_at >= ?"
  )
    .bind(phone, effectiveStart)
    .first();
  return row && typeof row.c === 'number' ? row.c : Number((row && row.c) || 0);
}

export async function countRecentIpFailures(env, ip, windowMinutes, now) {
  if (!ip) return 0;
  var current = now || nowIso();
  var windowStart = addMinutes(current, -windowMinutes);
  var row = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM login_security_events WHERE scope_type = 'ip' AND scope_key = ? AND event_type = 'login_failed' AND created_at >= ?"
  )
    .bind(ip, windowStart)
    .first();
  return row && typeof row.c === 'number' ? row.c : Number((row && row.c) || 0);
}

export async function registerFailedLogin(env, request, phone, userId) {
  var now = nowIso();
  var ip = loginScopeKeyForIp(request);

  if (phone) {
    await recordSecurityEvent(env, {
      scopeType: 'account',
      scopeKey: phone,
      eventType: 'login_failed',
      phone: phone,
      userId: userId,
      clientIp: ip,
      createdAt: now,
    });
  }

  await recordSecurityEvent(env, {
    scopeType: 'ip',
    scopeKey: ip,
    eventType: 'login_failed',
    phone: phone || null,
    userId: userId,
    clientIp: ip,
    createdAt: now,
  });

  var accountShortCount = phone ? await countRecentAccountFailures(env, phone, ACCOUNT_FAIL_SHORT_WINDOW_MIN, now) : 0;
  var accountLongCount = phone ? await countRecentAccountFailures(env, phone, ACCOUNT_FAIL_LONG_WINDOW_MIN, now) : 0;
  var ipCount = await countRecentIpFailures(env, ip, IP_FAIL_WINDOW_MIN, now);

  var accountLockedUntil = '';
  if (phone && accountLongCount >= ACCOUNT_FAIL_LONG_LIMIT) {
    accountLockedUntil = addMinutes(now, ACCOUNT_FAIL_LONG_LOCK_MIN);
    await upsertBlock(env, 'account', phone, accountLockedUntil, 'account_fail_long', now);
    await recordSecurityEvent(env, {
      scopeType: 'account',
      scopeKey: phone,
      eventType: 'account_locked',
      phone: phone,
      userId: userId,
      clientIp: ip,
      createdAt: now,
      meta: { rule: '20m_5x', blockedUntil: accountLockedUntil },
    });
  } else if (phone && accountShortCount >= ACCOUNT_FAIL_SHORT_LIMIT) {
    accountLockedUntil = addMinutes(now, ACCOUNT_FAIL_SHORT_LOCK_MIN);
    await upsertBlock(env, 'account', phone, accountLockedUntil, 'account_fail_short', now);
    await recordSecurityEvent(env, {
      scopeType: 'account',
      scopeKey: phone,
      eventType: 'account_locked',
      phone: phone,
      userId: userId,
      clientIp: ip,
      createdAt: now,
      meta: { rule: '10m_3x', blockedUntil: accountLockedUntil },
    });
  }

  var ipBlockedUntil = '';
  if (ipCount >= IP_FAIL_LIMIT) {
    ipBlockedUntil = addMinutes(now, IP_FAIL_LOCK_MIN);
    await upsertBlock(env, 'ip', ip, ipBlockedUntil, 'ip_fail_window', now);
    await recordSecurityEvent(env, {
      scopeType: 'ip',
      scopeKey: ip,
      eventType: 'ip_blocked',
      phone: phone || null,
      userId: userId,
      clientIp: ip,
      createdAt: now,
      meta: { rule: '10m_20x', blockedUntil: ipBlockedUntil },
    });
  }

  return {
    now: now,
    accountShortCount: accountShortCount,
    accountLongCount: accountLongCount,
    ipCount: ipCount,
    accountLockedUntil: accountLockedUntil,
    ipBlockedUntil: ipBlockedUntil,
  };
}

export async function registerSuccessfulLogin(env, request, row) {
  var now = nowIso();
  var ip = loginScopeKeyForIp(request);
  await clearBlock(env, 'account', row.phone);
  await recordSecurityEvent(env, {
    scopeType: 'account',
    scopeKey: row.phone,
    eventType: 'login_success',
    phone: row.phone,
    userId: row.id,
    clientIp: ip,
    createdAt: now,
  });
  await recordSecurityEvent(env, {
    scopeType: 'ip',
    scopeKey: ip,
    eventType: 'login_success',
    phone: row.phone,
    userId: row.id,
    clientIp: ip,
    createdAt: now,
  });
}

export async function getCurrentLoginRestrictions(env, request, phone) {
  var now = nowIso();
  var ip = loginScopeKeyForIp(request);
  return {
    now: now,
    ip: ip,
    accountBlock: phone ? await getActiveBlock(env, 'account', phone, now) : null,
    ipBlock: await getActiveBlock(env, 'ip', ip, now),
  };
}

export function failedLoginDelayMs(accountShortCount, ipCount) {
  var step = Math.max(Number(accountShortCount) || 0, Number(ipCount) || 0);
  if (step < 3) return 0;
  if (step === 3) return 1000;
  if (step === 4) return 2000;
  return 4000;
}
