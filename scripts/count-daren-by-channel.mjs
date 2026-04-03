/**
 * 渠道映射表：按 A 列渠道名统计 E 列达人 ID 数量（默认去重；见环境变量）。
 * FEISHU_APP_ID / FEISHU_APP_SECRET 必填。
 */
const SPREADSHEET_TOKEN =
  process.env.FEISHU_CHANNEL_ORDER_SPREADSHEET_TOKEN || 'P1zusUMg2haMGctskH6cydLqn5e';
const CHANNEL_RANGE = process.env.FEISHU_CHANNEL_MAP_RANGE || 'ghju03!A1:E2000';
const SKIP_ROWS = Math.max(0, parseInt(process.env.FEISHU_CHANNEL_ORDER_SKIP_ROWS || '1', 10) || 1);
/** 设为 0 则按行数计（同一达人重复多行会多次计入） */
const UNIQUE_PER_CHANNEL = process.env.COUNT_UNIQUE_DAREN !== '0';

async function getTenantToken(appId, appSecret) {
  const tr = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: String(appId), app_secret: String(appSecret) }),
  });
  const tj = await tr.json();
  if (tj.code !== 0) throw new Error('tenant_token: ' + (tj.msg || tj.code));
  return tj.tenant_access_token;
}
async function fetchRange(token, spreadsheetToken, range) {
  const vro = encodeURIComponent('FormattedValue');
  const qs = '?value_render_option=' + vro + '&valueRenderOption=' + vro;
  const url =
    'https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/' +
    encodeURIComponent(spreadsheetToken) +
    '/values/' +
    encodeURIComponent(range) +
    qs;
  const sr = await fetch(url, {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=utf-8' },
  });
  return sr.json();
}

async function main() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) {
    console.error('缺少 FEISHU_APP_ID / FEISHU_APP_SECRET');
    process.exit(1);
  }
  const token = await getTenantToken(appId, appSecret);
  const chJson = await fetchRange(token, SPREADSHEET_TOKEN, CHANNEL_RANGE);
  if (!chJson || chJson.code !== 0) {
    console.error('渠道表失败', chJson);
    process.exit(2);
  }
  const chValues = (chJson.data && chJson.data.valueRange && chJson.data.valueRange.values) || [];

  /** @type {Map<string, Set<string>>} */
  const uniqueByCh = new Map();
  /** @type {Map<string, number>} */
  const rowsByCh = new Map();

  for (let r = SKIP_ROWS; r < chValues.length; r++) {
    const crow = chValues[r] || [];
    const chName = String(crow[0] || '').trim();
    const darenId = String(crow[4] || '').trim();
    if (!chName || !darenId) continue;
    rowsByCh.set(chName, (rowsByCh.get(chName) || 0) + 1);
    if (!uniqueByCh.has(chName)) uniqueByCh.set(chName, new Set());
    uniqueByCh.get(chName).add(darenId);
  }

  const channels = [...uniqueByCh.keys()].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  console.log('范围', CHANNEL_RANGE);
  console.log('口径', UNIQUE_PER_CHANNEL ? '每渠道不重复达人 ID 数（E 列）' : '每渠道有效行数（A、E 均非空）');
  console.log('---');
  let sumU = 0;
  let sumR = 0;
  for (const ch of channels) {
    const u = uniqueByCh.get(ch).size;
    const row = rowsByCh.get(ch) || 0;
    sumU += u;
    sumR += row;
    console.log(ch + '\t' + (UNIQUE_PER_CHANNEL ? u : row));
  }
  console.log('---');
  console.log('渠道数', channels.length);
  if (UNIQUE_PER_CHANNEL) {
    console.log('不重复达人 ID 合计（跨渠道重复会计多次）', sumU);
    const allIds = new Set();
    for (const s of uniqueByCh.values()) for (const id of s) allIds.add(id);
    console.log('全表不重复达人 ID 数', allIds.size);
  } else {
    console.log('有效行合计', sumR);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
