/**
 * Cloudflare Pages Function：同源代理到 Worker API
 *
 * 境内网络直连 *.workers.dev 常出现连接超时，浏览器只访问本站 /api/worker，
 * 由边缘向 Worker 转发（Cloudflare 网内请求，通常可用）。
 *
 * 可选环境变量（Pages 项目 → Settings → Variables）：
 *   WORKER_API_URL = https://你的-worker.xxx.workers.dev
 * 未设置时使用下方默认地址。
 */

const DEFAULT_WORKER = 'https://qbt-ai-assistant.hupenghui1993.workers.dev';

export async function onRequest(context) {
  const { request, env } = context;
  const workerUrl = (env && env.WORKER_API_URL) || DEFAULT_WORKER;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const body = await request.text();
  const res = await fetch(workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const text = await res.text();
  const ct = res.headers.get('Content-Type') || 'application/json';

  return new Response(text, {
    status: res.status,
    headers: {
      'Content-Type': ct,
      'Access-Control-Allow-Origin': '*',
    },
  });
}
