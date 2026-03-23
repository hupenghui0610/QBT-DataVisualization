/**
 * PBKDF2-SHA256 password storage + HS256 JWT (Web Crypto).
 * Must stay in sync with scripts/hash-password.mjs for manual D1 inserts.
 */

export const PBKDF2_ITERATIONS = 100000;
export const PBKDF2_HASH_LEN = 32;
export const JWT_EXP_SECONDS = 30 * 24 * 60 * 60;

const enc = new TextEncoder();

function bytesToHex(u8) {
  return [...u8].map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToBase64Url(buf) {
  var bin = '';
  var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  for (var i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  var bin = atob(s);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function hashPassword(plain) {
  var salt = crypto.getRandomValues(new Uint8Array(16));
  var keyMaterial = await crypto.subtle.importKey('raw', enc.encode(plain), 'PBKDF2', false, ['deriveBits']);
  var bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    PBKDF2_HASH_LEN * 8
  );
  return 'pbkdf2$sha256$' + PBKDF2_ITERATIONS + '$' + bytesToHex(salt) + '$' + bytesToHex(new Uint8Array(bits));
}

export async function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== 'string') return false;
  var parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;
  var iterations = parseInt(parts[2], 10);
  if (iterations !== PBKDF2_ITERATIONS) return false;
  var salt = hexToBytes(parts[3]);
  var expected = hexToBytes(parts[4]);
  if (expected.length !== PBKDF2_HASH_LEN) return false;
  var keyMaterial = await crypto.subtle.importKey('raw', enc.encode(plain), 'PBKDF2', false, ['deriveBits']);
  var bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
    keyMaterial,
    PBKDF2_HASH_LEN * 8
  );
  var got = new Uint8Array(bits);
  if (got.length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
  return diff === 0;
}

function jsonToBase64Url(obj) {
  return bytesToBase64Url(enc.encode(JSON.stringify(obj)));
}

export async function signJwt(payload, secret) {
  var header = { alg: 'HS256', typ: 'JWT' };
  var h = jsonToBase64Url(header);
  var p = jsonToBase64Url(payload);
  var data = enc.encode(h + '.' + p);
  var key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  var sig = await crypto.subtle.sign('HMAC', key, data);
  return h + '.' + p + '.' + bytesToBase64Url(new Uint8Array(sig));
}

export async function verifyJwt(token, secret) {
  var parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('invalid_token');
  var data = enc.encode(parts[0] + '.' + parts[1]);
  var sig = base64UrlToBytes(parts[2]);
  var key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  var ok = await crypto.subtle.verify('HMAC', key, sig, data);
  if (!ok) throw new Error('bad_sig');
  var payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])));
  var now = Math.floor(Date.now() / 1000);
  if (payload.exp != null && now > payload.exp) throw new Error('expired');
  return payload;
}
