const DASHSCOPE_CHAT_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const MODEL = 'qwen-turbo';

const SYSTEM_PROMPT_PREFIX = `你是本报表的 AI 助手。必须仅根据下面提供的【数据上下文】用中文回答问题；若上下文没有相关信息则明确说「当前数据中无法得出」；不要编造数字。不要回答与页面本身相关的内容：不介绍或解释页面布局、界面设计、页面上已有的图表/报表有哪些或如何使用；只针对数据做针对性解读与回答。

【数据上下文】
`;

function corsHeaders(origin) {
  const o = origin || '*';
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || undefined;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const question = body.question;
    const context = body.context;
    if (typeof question !== 'string' || typeof context !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing question or context' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const apiKey = env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Server missing API key' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const systemContent = SYSTEM_PROMPT_PREFIX + context;

    const res = await fetch(DASHSCOPE_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
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
      return new Response(JSON.stringify({ error: 'Upstream error', detail: text }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    let data;
    try {
      data = await res.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid upstream response' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ? String(data.choices[0].message.content) : '';

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  },
};
