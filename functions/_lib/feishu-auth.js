import { signJwt, verifyJwt, hashPassword, JWT_EXP_SECONDS } from './crypto.js';
import { publicUser } from './session.js';

var appTokenCache = { token: null, expireAtMs: 0 };

function authAppId(env) {
  return env.FEISHU_AUTH_APP_ID || '';
}

function authAppSecret(env) {
  return env.FEISHU_AUTH_APP_SECRET || '';
}

export function hasFeishuAuthConfig(env) {
  return !!(authAppId(env) && authAppSecret(env));
}

export function feishuAuthorizeUrl(env, redirectUri, state) {
  var u = new URL('https://accounts.feishu.cn/open-apis/authen/v1/authorize');
  u.searchParams.set('app_id', authAppId(env));
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set(
    'scope',
    'auth:user_access_token:read contact:user.base:readonly contact:user.phone:readonly'
  );
  u.searchParams.set('state', state);
  return u.toString();
}

export async function signFeishuState(env, payload) {
  var now = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      typ: 'feishu_oauth_state',
      return_to: payload.returnTo,
      iat: now,
      exp: now + 10 * 60,
    },
    env.JWT_SECRET
  );
}

export async function verifyFeishuState(env, state) {
  var payload = await verifyJwt(state, env.JWT_SECRET);
  if (!payload || payload.typ !== 'feishu_oauth_state') throw new Error('bad_state');
  return payload;
}

async function getFeishuAppAccessToken(env) {
  if (!hasFeishuAuthConfig(env)) throw new Error('FEISHU_AUTH_NOT_CONFIGURED');
  var now = Date.now();
  if (appTokenCache.token && appTokenCache.expireAtMs > now + 60000) return appTokenCache.token;

  var res = await fetch('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: authAppId(env), app_secret: authAppSecret(env) }),
  });
  var json = await res.json();
  if (json.code !== 0 || !json.app_access_token) {
    var err = new Error(json.msg || 'feishu_app_access_token_failed');
    err.feishuCode = json.code;
    throw err;
  }
  var expireSec = typeof json.expire === 'number' ? json.expire : 7200;
  appTokenCache.token = json.app_access_token;
  appTokenCache.expireAtMs = now + Math.max(60, expireSec - 120) * 1000;
  return appTokenCache.token;
}

async function exchangeUserAccessToken(env, code) {
  var appToken = await getFeishuAppAccessToken(env);
  var res = await fetch('https://open.feishu.cn/open-apis/authen/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + appToken,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: code,
    }),
  });
  var json = await res.json();
  if (json.code !== 0 || !json.data || !json.data.access_token) {
    var err = new Error(json.msg || 'feishu_user_access_token_failed');
    err.feishuCode = json.code;
    throw err;
  }
  return json.data.access_token;
}

async function fetchFeishuUserInfo(userAccessToken) {
  var res = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + userAccessToken,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
  var json = await res.json();
  if (json.code !== 0 || !json.data) {
    var err = new Error(json.msg || 'feishu_user_info_failed');
    err.feishuCode = json.code;
    throw err;
  }
  return json.data;
}

function normalizePhone(info) {
  var raw = info.mobile || info.phone || info.phone_number || '';
  raw = String(raw || '').trim();
  var digits = raw.replace(/[^\d]/g, '');
  if (digits.length > 11 && digits.slice(-11, -10) === '1') digits = digits.slice(-11);
  return /^1\d{10}$/.test(digits) ? digits : '';
}

function normalizeName(info, phone) {
  return String(info.name || info.en_name || info.display_name || phone || 'Feishu User').trim();
}

export async function getFeishuLoginUser(env, code) {
  var userAccessToken = await exchangeUserAccessToken(env, code);
  var info = await fetchFeishuUserInfo(userAccessToken);
  var phone = normalizePhone(info);
  if (!phone) {
    var err = new Error('FEISHU_PHONE_REQUIRED');
    err.feishuInfo = info;
    throw err;
  }
  return {
    name: normalizeName(info, phone),
    phone: phone,
    openId: info.open_id || '',
    unionId: info.union_id || '',
    userId: info.user_id || '',
    raw: info,
  };
}

async function signUserJwt(row, env) {
  var now = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      sub: row.id,
      phone: row.phone,
      name: row.name,
      adm: row.is_admin ? 1 : 0,
      tv: row.token_version,
      iat: now,
      exp: now + JWT_EXP_SECONDS,
    },
    env.JWT_SECRET
  );
}

async function randomDisabledPasswordHash() {
  var bytes = crypto.getRandomValues(new Uint8Array(24));
  var s = '';
  for (var i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return hashPassword('feishu-disabled-' + s);
}

export async function upsertFeishuUser(env, feishuUser) {
  var row = null;
  if (feishuUser.openId) {
    row = await env.DB.prepare(
      'SELECT id, name, phone, password_hash, token_version, is_admin, auth_provider, password_login_enabled FROM users WHERE feishu_open_id = ?'
    )
      .bind(feishuUser.openId)
      .first();
  }
  if (!row) {
    row = await env.DB.prepare(
      'SELECT id, name, phone, password_hash, token_version, is_admin, auth_provider, password_login_enabled FROM users WHERE phone = ?'
    )
      .bind(feishuUser.phone)
      .first();
  }

  if (row) {
    await env.DB.prepare(
      'UPDATE users SET name = COALESCE(NULLIF(name, \'\'), ?), feishu_open_id = COALESCE(feishu_open_id, ?), feishu_union_id = COALESCE(feishu_union_id, ?), feishu_user_id = COALESCE(feishu_user_id, ?), last_login_provider = ?, last_login_at = datetime(\'now\') WHERE id = ?'
    )
      .bind(
        feishuUser.name,
        feishuUser.openId || null,
        feishuUser.unionId || null,
        feishuUser.userId || null,
        'feishu',
        row.id
      )
      .run();
  } else {
    var pwdHash = await randomDisabledPasswordHash();
    await env.DB.prepare(
      'INSERT INTO users (name, phone, password_hash, token_version, is_admin, feishu_open_id, feishu_union_id, feishu_user_id, auth_provider, password_login_enabled, last_login_provider, last_login_at) VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?, 0, ?, datetime(\'now\'))'
    )
      .bind(
        feishuUser.name,
        feishuUser.phone,
        pwdHash,
        feishuUser.openId || null,
        feishuUser.unionId || null,
        feishuUser.userId || null,
        'feishu',
        'feishu'
      )
      .run();
  }

  var fresh = await env.DB.prepare(
    'SELECT id, name, phone, password_hash, token_version, is_admin, auth_provider, password_login_enabled FROM users WHERE phone = ?'
  )
    .bind(feishuUser.phone)
    .first();
  return {
    row: fresh,
    user: publicUser(fresh),
    token: await signUserJwt(fresh, env),
  };
}
