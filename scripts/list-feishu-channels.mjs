/**
 * 列出渠道映射表 A 列所有不重复的渠道名（与线上一致：默认 ghju03!A1:E2000，跳过表头 1 行）。
 * FEISHU_APP_ID / FEISHU_APP_SECRET 必填。
 */
const SPREADSHEET_TOKEN =
  process.env.FEISHU_CHANNEL_ORDER_SPREADSHEET_TOKEN || 'P1zusUMg2haMGctskH6cydLqn5e';
const CHANNEL_RANGE = process.env.FEISHU_CHANNEL_MAP_RANGE || 'ghju03!A1:E2000';
const SKIP_ROWS = Math.max(0, parseInt(process.env.FEISHU_CHANNEL_ORDER_SKIP_ROWS || '1', 10) || 1);

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
  const set = new Set();
  for (let r = SKIP_ROWS; r < chValues.length; r++) {
    const name = String((chValues[r] || [])[0] || '').trim();
    if (name) set.add(name);
  }
  const list = [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  console.log('范围', CHANNEL_RANGE);
  console.log('不重复渠道数', list.length);
  console.log('---');
  for (const n of list) console.log(n);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
