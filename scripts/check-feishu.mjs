/**
 * 本地校验飞书 tenant_token + 读表（与 functions/_lib/feishu.js 逻辑一致）
 * 用法：FEISHU_APP_ID=xxx FEISHU_APP_SECRET=xxx node scripts/check-feishu.mjs
 * 勿将密钥写入仓库。
 */
const SPREADSHEET_TOKEN = process.env.FEISHU_SPREADSHEET_TOKEN || 'EBwmsjjArhutvWtM2E9cLUMGnYd';
const RANGE = process.env.FEISHU_SHEET_RANGE || '0VWscb!A1:Z20';

const appId = process.env.FEISHU_APP_ID;
const appSecret = process.env.FEISHU_APP_SECRET;

async function main() {
  if (!appId || !appSecret) {
    console.error('缺少环境变量 FEISHU_APP_ID / FEISHU_APP_SECRET');
    process.exit(1);
  }
  const tr = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: String(appId), app_secret: String(appSecret) }),
  });
  const tj = await tr.json();
  if (tj.code !== 0) {
    console.error('tenant_access_token 失败', { code: tj.code, msg: tj.msg });
    process.exit(2);
  }
  const token = tj.tenant_access_token;
  const url =
    'https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/' +
    encodeURIComponent(SPREADSHEET_TOKEN) +
    '/values/' +
    encodeURIComponent(RANGE);
  const sr = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
  const sj = await sr.json();
  if (sj.code !== 0) {
    console.error('读表失败', { code: sj.code, msg: sj.msg });
    process.exit(3);
  }
  const vr = sj.data && sj.data.valueRange;
  const rows = vr && vr.values ? vr.values.length : 0;
  const cols = vr && vr.values && vr.values[0] ? vr.values[0].length : 0;
  console.log('OK 飞书拉数正常');
  console.log('范围:', vr && vr.range);
  console.log('行数:', rows, '列数:', cols, 'revision:', sj.data && sj.data.revision);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
