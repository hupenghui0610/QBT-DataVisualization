/**
 * 与 functions/api/data/feishu-channel-order-trend.js 同口径：并行读渠道表 + 订单表，
 * 再聚合 + JSON.stringify。用于估算「接口在缓存未命中时」服务端主要耗时。
 *
 * 用法：FEISHU_APP_ID=… FEISHU_APP_SECRET=… node scripts/bench-channel-order-trend.mjs
 *
 * 输出：冷启动（新 token + 双表）与热路径（复用 token 仅双表）各一轮；可选重复 N 次取平均。
 */
const SPREADSHEET_TOKEN =
  process.env.FEISHU_CHANNEL_ORDER_SPREADSHEET_TOKEN || 'P1zusUMg2haMGctskH6cydLqn5e';
const CHANNEL_RANGE = process.env.FEISHU_CHANNEL_MAP_RANGE || 'ghju03!A1:E2000';
const ORDER_RANGE = process.env.FEISHU_ORDER_DETAIL_RANGE || 'tuec5U!I1:AO20000';
const SKIP_ROWS = Math.max(0, parseInt(process.env.FEISHU_CHANNEL_ORDER_SKIP_ROWS || '1', 10) || 1);
const ORDER_VRO = process.env.FEISHU_CHANNEL_ORDER_VALUE_RENDER || 'UnformattedValue';
const REPEAT = Math.max(1, parseInt(process.env.BENCH_REPEAT || '3', 10) || 3);

const COL_I_FULL = 8,
  COL_AO_FULL = 40,
  COL_AH_FULL = 33,
  COL_AK_FULL = 36;
const COL_I_NARROW = 0,
  COL_AO_NARROW = 32,
  COL_AH_NARROW = 25,
  COL_AK_NARROW = 28;

function orderRangeUsesIColumnOrigin(orderRange) {
  const bang = orderRange.indexOf('!');
  if (bang < 0) return false;
  return /I[0-9]*:/i.test(orderRange.slice(bang + 1));
}
function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}
function ymdFromExcelSerial(serial) {
  const whole = Math.floor(Number(serial));
  if (whole < 1 || whole > 6000000) return null;
  const utc_days = whole - 25569;
  const ms = utc_days * 86400 * 1000;
  const dt = new Date(ms);
  if (isNaN(dt.getTime())) return null;
  return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
}
function parseDayFromAH(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && !isNaN(v)) return ymdFromExcelSerial(v);
  const str = String(v).trim();
  if (!str) return null;
  const numOnly = parseFloat(str);
  if (!isNaN(numOnly) && /^-?\d+(\.\d+)?$/.test(str.trim()) && numOnly >= 1 && numOnly < 6000000) {
    const fromSerial = ymdFromExcelSerial(numOnly);
    if (fromSerial) return fromSerial;
  }
  const part = str.split(/\s+/)[0];
  const parts = part.split(/[\/\-]/);
  if (parts.length >= 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (y && m && d) return y + '-' + pad2(m) + '-' + pad2(d);
  }
  const t = Date.parse(str.replace(/\//g, '-'));
  if (!isNaN(t)) {
    const dt2 = new Date(t);
    return dt2.getFullYear() + '-' + pad2(dt2.getMonth() + 1) + '-' + pad2(dt2.getDate());
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

async function fetchSheet(token, spreadsheetToken, range, valueRenderOption) {
  const vro = encodeURIComponent(String(valueRenderOption));
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

function aggregate(chValues, ordValues, narrow) {
  const colI = narrow ? COL_I_NARROW : COL_I_FULL;
  const colAO = narrow ? COL_AO_NARROW : COL_AO_FULL;
  const colAH = narrow ? COL_AH_NARROW : COL_AH_FULL;
  const colAK = narrow ? COL_AK_NARROW : COL_AK_FULL;

  const darenToChannel = {};
  for (let r = SKIP_ROWS; r < chValues.length; r++) {
    const crow = chValues[r] || [];
    const chName = String(crow[0] || '').trim();
    const darenId = String(crow[4] || '').trim();
    if (!chName || !darenId) continue;
    if (darenToChannel[darenId] === undefined) darenToChannel[darenId] = chName;
  }
  const channelSet = {};
  for (const d0 in darenToChannel) {
    channelSet[darenToChannel[d0]] = true;
  }
  const channels = Object.keys(channelSet).sort();
  const totals = {};
  for (let ri = SKIP_ROWS; ri < ordValues.length; ri++) {
    const row = ordValues[ri] || [];
    const needLen = colAO > colAK ? colAO : colAK;
    if (row.length <= needLen) continue;
    const status = String(row[colAK] || '').trim();
    if (status === '已关闭') continue;
    const daren = String(row[colAO] || '').trim();
    if (!daren) continue;
    const channel = darenToChannel[daren];
    if (!channel) continue;
    const day = parseDayFromAH(row[colAH]);
    if (!day) continue;
    const amt = parseAmount(row[colI]);
    if (!totals[day]) totals[day] = {};
    totals[day][channel] = (totals[day][channel] || 0) + amt;
  }
  const dates = Object.keys(totals)
    .filter(Boolean)
    .sort();
  const amountByChannel = {};
  for (let ci = 0; ci < channels.length; ci++) {
    const cname = channels[ci];
    amountByChannel[cname] = dates.map(function (dt) {
      return totals[dt] && totals[dt][cname] != null ? totals[dt][cname] : 0;
    });
  }
  return {
    spreadsheetToken: SPREADSHEET_TOKEN,
    channelRange: CHANNEL_RANGE,
    orderRange: ORDER_RANGE,
    dates,
    channels,
    amountByChannel,
  };
}

function nowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

async function main() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) {
    console.error('缺少 FEISHU_APP_ID / FEISHU_APP_SECRET');
    process.exit(1);
  }
  const narrow = orderRangeUsesIColumnOrigin(ORDER_RANGE);
  const vroOrder =
    ORDER_VRO === 'FormattedValue' || ORDER_VRO === 'UnformattedValue' || ORDER_VRO === 'ToString'
      ? ORDER_VRO
      : 'UnformattedValue';

  const coldSheets = [];
  const coldAgg = [];
  const coldTotal = [];
  const warmSheets = [];
  const warmAgg = [];
  const warmTotal = [];
  let lastBytes = 0;

  for (let i = 0; i < REPEAT; i++) {
    const t0 = nowMs();
    const tok = await getTenantToken(appId, appSecret);
    const tTok = nowMs();
    const [chJson, ordJson] = await Promise.all([
      fetchSheet(tok, SPREADSHEET_TOKEN, CHANNEL_RANGE, 'FormattedValue'),
      fetchSheet(tok, SPREADSHEET_TOKEN, ORDER_RANGE, vroOrder),
    ]);
    const tSheets = nowMs();
    if (!chJson || chJson.code !== 0) {
      console.error('渠道表失败', chJson);
      process.exit(2);
    }
    if (!ordJson || ordJson.code !== 0) {
      console.error('订单表失败', ordJson);
      process.exit(3);
    }
    const chValues = (chJson.data && chJson.data.valueRange && chJson.data.valueRange.values) || [];
    const ordValues = (ordJson.data && ordJson.data.valueRange && ordJson.data.valueRange.values) || [];
    const tAgg0 = nowMs();
    const payload = aggregate(chValues, ordValues, narrow);
    const tAgg1 = nowMs();
    const body = JSON.stringify(payload);
    const tEnd = nowMs();
    lastBytes = Buffer.byteLength(body, 'utf8');

    coldSheets.push(tSheets - tTok);
    coldAgg.push(tAgg1 - tAgg0);
    coldTotal.push(tEnd - t0);

    const tW0 = nowMs();
    const [chJson2, ordJson2] = await Promise.all([
      fetchSheet(tok, SPREADSHEET_TOKEN, CHANNEL_RANGE, 'FormattedValue'),
      fetchSheet(tok, SPREADSHEET_TOKEN, ORDER_RANGE, vroOrder),
    ]);
    const tWSheets = nowMs();
    const chV2 = (chJson2.data && chJson2.data.valueRange && chJson2.data.valueRange.values) || [];
    const ordV2 = (ordJson2.data && ordJson2.data.valueRange && ordJson2.data.valueRange.values) || [];
    const tWA0 = nowMs();
    const payload2 = aggregate(chV2, ordV2, narrow);
    const tWA1 = nowMs();
    const body2 = JSON.stringify(payload2);
    const tWEnd = nowMs();
    lastBytes = Buffer.byteLength(body2, 'utf8');

    warmSheets.push(tWSheets - tW0);
    warmAgg.push(tWA1 - tWA0);
    warmTotal.push(tWEnd - tW0);
  }

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const min = (arr) => Math.min(...arr);
  const max = (arr) => Math.max(...arr);

  console.log('=== bench：与 /api/data/feishu-channel-order-trend 同口径（飞书 + 聚合 + JSON）===');
  console.log('订单 value_render', vroOrder, '| 重复轮数', REPEAT);
  console.log('响应体约', lastBytes, 'bytes');
  console.log('');
  console.log('【冷路径】每轮：新 tenant_token + 并行双表 + 聚合 + stringify（近似 Worker 新实例、缓存 MISS）');
  console.log('  双表并行 ms — min/avg/max:', min(coldSheets).toFixed(0), '/', avg(coldSheets).toFixed(0), '/', max(coldSheets).toFixed(0));
  console.log('  聚合+序列化 ms — min/avg/max:', min(coldAgg).toFixed(0), '/', avg(coldAgg).toFixed(0), '/', max(coldAgg).toFixed(0));
  console.log('  总耗时 ms — min/avg/max:', min(coldTotal).toFixed(0), '/', avg(coldTotal).toFixed(0), '/', max(coldTotal).toFixed(0));
  console.log('');
  console.log('【热路径】每轮：复用同一 token，仅并行双表 + 聚合（近似 Worker 内 token 已缓存）');
  console.log('  双表并行 ms — min/avg/max:', min(warmSheets).toFixed(0), '/', avg(warmSheets).toFixed(0), '/', max(warmSheets).toFixed(0));
  console.log('  聚合+序列化 ms — min/avg/max:', min(warmAgg).toFixed(0), '/', avg(warmAgg).toFixed(0), '/', max(warmAgg).toFixed(0));
  console.log('  总耗时 ms — min/avg/max:', min(warmTotal).toFixed(0), '/', avg(warmTotal).toFixed(0), '/', max(warmTotal).toFixed(0));
  console.log('');
  console.log('说明：本机直连飞书，与 Cloudflare 边缘到飞书的 RTT 可能不同；浏览器整图时间还含登录、JWT、前端 setOption。');
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
