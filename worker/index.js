/**
 * Cloudflare Worker：AI 对话 + 邮箱验证码登录（白名单）+ 长期会话（KV）
 *
 * 环境变量（Secrets / wrangler.toml [vars]）：
 * - DASHSCOPE_API_KEY：通义 API（AI）
 * - RESEND_API_KEY：Resend 发信（https://resend.com）
 * - FROM_EMAIL：发件人，如 onboarding@resend.dev 或已验证域名下的地址
 * - ALLOWED_EMAILS：逗号分隔的白名单邮箱（小写比对）
 *
 * KV 绑定名：AUTH_KV（见 wrangler.toml）
 */

const DASHSCOPE_CHAT_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const MODEL = 'qwen-turbo';

const SYSTEM_PROMPT_PREFIX = `你是本报表的 AI 助手。必须仅根据下面提供的【数据上下文】用中文回答问题；若上下文没有相关信息则明确说「当前数据中无法得出」；不要编造数字。不要回答与页面本身相关的内容：不介绍或解释页面布局、界面设计、页面上已有的图表/报表有哪些或如何使用；只针对数据做针对性解读与回答。

【数据上下文】
`;

const OTP_TTL = 600; // 10 分钟
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 天
const SEND_COOLDOWN = 60; // 同一邮箱两次发码间隔（秒）

function corsHeaders(origin) {
  const o = origin || '*';
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function normalizeEmail(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

function isEmailAllowed(email, allowedRaw) {
  if (!allowedRaw || typeof allowedRaw !== 'string') return false;
  const set = new Set(
    allowedRaw.split(',').map((e) => normalizeEmail(e)).filter(Boolean)
  );
  return set.has(email);
}

function randomDigits6() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, '0');
}

function randomSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sendEmailResend(env, to, subject, html) {
  const key = env.RESEND_API_KEY;
  if (!key) {
    return { ok: false, error: 'RESEND_API_KEY 未配置' };
  }
  const from = env.FROM_EMAIL || 'onboarding@resend.dev';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text || res.statusText };
  }
  return { ok: true };
}

async function handleAuthSendCode(body, env, origin) {
  const kv = env.AUTH_KV;
  if (!kv) {
    return jsonResponse({ error: 'AUTH_KV 未绑定，请在 wrangler.toml 配置 KV' }, 500, origin);
  }
  const email = normalizeEmail(body.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: '请输入有效邮箱' }, 400, origin);
  }
  if (!isEmailAllowed(email, env.ALLOWED_EMAILS)) {
    return jsonResponse({ error: '该邮箱未开通访问权限' }, 403, origin);
  }

  const rlKey = 'rl:' + email;
  const existing = await kv.get(rlKey);
  if (existing) {
    return jsonResponse({ error: '发送过于频繁，请稍后再试' }, 429, origin);
  }

  const code = randomDigits6();
  await kv.put('otp:' + email, code, { expirationTtl: OTP_TTL });
  await kv.put(rlKey, '1', { expirationTtl: SEND_COOLDOWN });

  const send = await sendEmailResend(
    env,
    email,
    '希倍思数据平台 — 登录验证码',
    `<p>您的验证码为：<strong style="font-size:18px;letter-spacing:4px">${code}</strong></p><p>10 分钟内有效，请勿泄露给他人。</p>`
  );
  if (!send.ok) {
    await kv.delete('otp:' + email);
    return jsonResponse({ error: '邮件发送失败：' + (send.error || '未知错误') }, 502, origin);
  }

  return jsonResponse({ ok: true }, 200, origin);
}

async function handleAuthVerify(body, env, origin) {
  const kv = env.AUTH_KV;
  if (!kv) {
    return jsonResponse({ error: 'AUTH_KV 未绑定' }, 500, origin);
  }
  const email = normalizeEmail(body.email);
  const code = String(body.code || '').trim();
  if (!email || !code) {
    return jsonResponse({ error: '缺少邮箱或验证码' }, 400, origin);
  }
  if (!isEmailAllowed(email, env.ALLOWED_EMAILS)) {
    return jsonResponse({ error: '该邮箱未开通访问权限' }, 403, origin);
  }

  const key = 'otp:' + email;
  const stored = await kv.get(key);
  if (!stored || stored !== code) {
    return jsonResponse({ error: '验证码错误或已过期' }, 401, origin);
  }
  await kv.delete(key);

  const token = randomSessionToken();
  await kv.put(
    'session:' + token,
    JSON.stringify({ email, ts: Date.now() }),
    { expirationTtl: SESSION_TTL }
  );

  return jsonResponse({ ok: true, token, email }, 200, origin);
}

async function handleAuthValidate(body, env, origin) {
  const kv = env.AUTH_KV;
  if (!kv) {
    return jsonResponse({ error: 'AUTH_KV 未绑定' }, 500, origin);
  }
  const token = String(body.token || '').trim();
  if (!token) {
    return jsonResponse({ error: '缺少 token' }, 400, origin);
  }
  const raw = await kv.get('session:' + token);
  if (!raw) {
    return jsonResponse({ error: '登录已失效，请重新验证' }, 401, origin);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return jsonResponse({ error: '会话无效' }, 401, origin);
  }
  if (!data.email) {
    return jsonResponse({ error: '会话无效' }, 401, origin);
  }
  return jsonResponse({ ok: true, email: data.email }, 200, origin);
}

async function handleChat(body, env, origin) {
  const question = body.question;
  const context = body.context;
  if (typeof question !== 'string' || typeof context !== 'string') {
    return jsonResponse({ error: 'Missing question or context' }, 400, origin);
  }

  const apiKey = env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: 'Server missing API key' }, 500, origin);
  }

  const systemContent = SYSTEM_PROMPT_PREFIX + context;

  const res = await fetch(DASHSCOPE_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: question },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return jsonResponse({ error: 'Upstream error', detail: text }, 502, origin);
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid upstream response' }, 502, origin);
  }

  const reply =
    data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
      ? String(data.choices[0].message.content)
      : '';

  return jsonResponse({ reply }, 200, origin);
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || undefined;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ error: 'Invalid JSON' }, 400, origin);
    }

    const action = body.action;

    if (action === 'auth_send_code') {
      return handleAuthSendCode(body, env, origin);
    }
    if (action === 'auth_verify') {
      return handleAuthVerify(body, env, origin);
    }
    if (action === 'auth_validate') {
      return handleAuthValidate(body, env, origin);
    }

    if (body.question != null && body.context != null) {
      return handleChat(body, env, origin);
    }

    return jsonResponse({ error: 'Unknown action. Use action: auth_send_code | auth_verify | auth_validate, or send question+context for chat.' }, 400, origin);
  },
};
