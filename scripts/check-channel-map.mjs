/**
 * 列出渠道映射表所有列的数据
 */
const SPREADSHEET_TOKEN = 'WNp4wbOI3ib7J7kiX2fcZf6Fn8b';
const CHANNEL_RANGE = 'ghju03!A1:E2000';

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

  console.log('渠道映射表数据：');
  console.log('行号 | A-渠道名 | B-平台 | C-? | D-达人昵称 | E-达人ID');
  console.log('-'.repeat(80));

  for (let r = 0; r < chValues.length; r++) {
    const row = chValues[r] || [];
    const colA = String(row[0] || '').trim();
    const colB = String(row[1] || '').trim();
    const colC = String(row[2] || '').trim();
    const colD = String(row[3] || '').trim();
    const colE = String(row[4] || '').trim();

    // 过滤包含 lina 的行，或者打印所有行
    const marker = colD.toLowerCase().includes('lina') ? ' <-- lina先生' : '';
    console.log(`${String(r).padStart(3)} | ${colA.padEnd(12)} | ${colB.padEnd(8)} | ${colC.padEnd(4)} | ${colD.padEnd(12)} | ${colE.padEnd(20)}${marker}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
