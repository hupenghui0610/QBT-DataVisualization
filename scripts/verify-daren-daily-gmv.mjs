/**
 * 验证：订单表（默认 tuec5U，业务常称 sheet2）中，达人 ID 按日支付金额合计，剔除「已关闭」。
 * 渠道表（默认 ghju03 A:E，业务常称 sheet4 E 列达人 ID）用于核对该 ID 是否在映射中。
 * 用法：FEISHU_APP_ID=xxx FEISHU_APP_SECRET=xxx node scripts/verify-daren-daily-gmv.mjs
 */
const TARGET = (process.env.DAREN_ID || '284088526715758').trim();
const SPREADSHEET_TOKEN =
  process.env.FEISHU_CHANNEL_ORDER_SPREADSHEET_TOKEN || 'P1zusUMg2haMGctskH6cydLqn5e';
const CHANNEL_RANGE = process.env.FEISHU_CHANNEL_MAP_RANGE || 'ghju03!A1:E2000';
const ORDER_RANGE = process.env.FEISHU_ORDER_DETAIL_RANGE || 'tuec5U!I1:AO20000';
const SKIP_ROWS = Math.max(0, parseInt(process.env.FEISHU_CHANNEL_ORDER_SKIP_ROWS || '1', 10) || 1);

const COL_I_FULL = 8, COL_AO_FULL = 40, COL_AH_FULL = 33, COL_AK_FULL = 36;
const COL_I_NARROW = 0, COL_AO_NARROW = 32, COL_AH_NARROW = 25, COL_AK_NARROW = 28;

function orderRangeUsesIColumnOrigin(orderRange) {
  const bang = orderRange.indexOf('!');
  if (bang < 0) return false;
  return /I[0-9]*:/i.test(orderRange.slice(bang + 1));
}
function pad2(n) { return n < 10 ? '0' + n : String(n); }
/**
 * AH: UnformattedValue Excel serial; string e.g. 2026/1/1 22:18:14
 */
function ymdFromExcelSerial(serial) {
  var whole = Math.floor(Number(serial));
  if (whole < 1 || whole > 6000000) return null;
  var utc_days = whole - 25569;
  var ms = utc_days * 86400 * 1000;
  var dt = new Date(ms);
  if (isNaN(dt.getTime())) return null;
  return dt.getFullYear() + "-" + pad2(dt.getMonth() + 1) + "-" + pad2(dt.getDate());
}

function parseDayFromAH(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && !isNaN(v)) return ymdFromExcelSerial(v);
  var str = String(v).trim();
  if (!str) return null;
  var numOnly = parseFloat(str);
  if (!isNaN(numOnly) && /^-?\d+(\.\d+)?$/.test(str.trim()) && numOnly >= 1 && numOnly < 6000000) {
    var fromSerial = ymdFromExcelSerial(numOnly);
    if (fromSerial) return fromSerial;
  }
  var part = str.split(/\s+/)[0];
  var parts = part.split(/[\/\-]/);
  if (parts.length >= 3) {
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    if (y && m && d) return y + "-" + pad2(m) + "-" + pad2(d);
  }
  var t = Date.parse(str.replace(/\//g, "-"));
  if (!isNaN(t)) {
    var dt2 = new Date(t);
    return dt2.getFullYear() + "-" + pad2(dt2.getMonth() + 1) + "-" + pad2(dt2.getDate());
  }
  return null;
}

function parseAmount(v) {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}
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
async function fetchRange(token, spreadsheetToken, range, valueRenderOption) {
  const vro = encodeURIComponent(String(valueRenderOption));
  const qs = '?value_render_option=' + vro + '&valueRenderOption=' + vro;
  const url =
    'https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/' +
    encodeURIComponent(spreadsheetToken) +
    '/values/' +
    encodeURIComponent(range) + qs;
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
  const narrow = orderRangeUsesIColumnOrigin(ORDER_RANGE);
  const colI = narrow ? COL_I_NARROW : COL_I_FULL;
  const colAO = narrow ? COL_AO_NARROW : COL_AO_FULL;
  const colAH = narrow ? COL_AH_NARROW : COL_AH_FULL;
  const colAK = narrow ? COL_AK_NARROW : COL_AK_FULL;
  const token = await getTenantToken(appId, appSecret);
  const [chJson, ordJson] = await Promise.all([
    fetchRange(token, SPREADSHEET_TOKEN, CHANNEL_RANGE, 'FormattedValue'),
    fetchRange(token, SPREADSHEET_TOKEN, ORDER_RANGE, 'UnformattedValue'),
  ]);
  if (!chJson || chJson.code !== 0) { console.error('渠道表失败', chJson); process.exit(2); }
  if (!ordJson || ordJson.code !== 0) { console.error('订单表失败', ordJson); process.exit(3); }
  const chValues = (chJson.data && chJson.data.valueRange && chJson.data.valueRange.values) || [];
  const ordValues = (ordJson.data && ordJson.data.valueRange && ordJson.data.valueRange.values) || [];
  let inMap = false, mapChannel = null;
  for (let r = SKIP_ROWS; r < chValues.length; r++) {
    const crow = chValues[r] || [];
    const id = String(crow[4] || '').trim();
    if (id === TARGET) { inMap = true; mapChannel = String(crow[0] || '').trim() || null; break; }
  }
  const byDay = {};
  let rowsOpen = 0, rowsClosed = 0, rowsNoDay = 0;
  for (let ri = SKIP_ROWS; ri < ordValues.length; ri++) {
    const row = ordValues[ri] || [];
    const needLen = colAO > colAK ? colAO : colAK;
    if (row.length <= needLen) continue;
    const daren = String(row[colAO] || '').trim();
    if (daren !== TARGET) continue;
    const status = String(row[colAK] || '').trim();
    if (status === '已关闭') { rowsClosed++; continue; }
    const day = parseDayFromAH(row[colAH]);
    if (!day) { rowsNoDay++; continue; }
    byDay[day] = (byDay[day] || 0) + parseAmount(row[colI]);
    rowsOpen++;
  }
  const dates = Object.keys(byDay).filter(Boolean).sort();
  console.log('=== 达人日 GMV（与 feishu-channel-order-trend 列规则一致）===');
  console.log('token', SPREADSHEET_TOKEN);
  console.log('渠道范围', CHANNEL_RANGE);
  console.log('订单范围', ORDER_RANGE);
  console.log('达人 ID', TARGET);
  console.log('渠道表 E 列是否含该 ID', inMap, inMap ? 'A列渠道=' + mapChannel : '(线上会因无映射而跳过该达人订单)');
  console.log('列下标 I,AO,AH,AK 窄表=', narrow, [colI, colAO, colAH, colAK]);
  console.log('计入行', rowsOpen, '已关闭跳过', rowsClosed, '无有效日期', rowsNoDay);
  console.log('--- 按日 ---');
  if (dates.length === 0) console.log('无数据：检查 AO 是否匹配、或扩大 ORDER_RANGE 行数');
  else {
    let sum = 0;
    for (const d of dates) { console.log(d, byDay[d]); sum += byDay[d]; }
    console.log('合计', sum);
  }
}
main().catch((e) => { console.error(e); process.exit(99); });