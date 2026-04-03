import { readFileSync } from 'fs';
import { resolve } from 'path';

// 加载 .env 文件
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const content = readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match && !process.env[match[1].trim()]) {
        process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
      }
    });
  } catch (e) {}
}
loadEnv();

const NEW_SPREADSHEET_TOKEN = 'ocn7iwsyixhz';

var tokenCache = { token: null, expireAtMs: 0 };

async function getFeishuTenantToken(env) {
  var appId = env.FEISHU_APP_ID;
  var appSecret = env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('FEISHU_NOT_CONFIGURED');
  }
  var now = Date.now();
  if (tokenCache.token && tokenCache.expireAtMs > now + 60000) {
    return tokenCache.token;
  }
  var res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: String(appId), app_secret: String(appSecret) }),
  });
  var text = await res.text();
  console.log('Token response:', text.substring(0, 200));
  var json = JSON.parse(text);
  if (json.code !== 0) {
    throw new Error(json.msg || 'feishu_tenant_token_failed');
  }
  var token = json.tenant_access_token;
  var expireSec = typeof json.expire === 'number' ? json.expire : 7200;
  tokenCache.token = token;
  tokenCache.expireAtMs = now + Math.max(60, expireSec - 120) * 1000;
  return token;
}

async function fetchSheetValuesV2(env, spreadsheetToken, range, options) {
  var token = await getFeishuTenantToken(env);
  var url = 'https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/' + encodeURIComponent(spreadsheetToken) + '/values/' + encodeURIComponent(range);
  var valueRenderOption = (options && options.valueRenderOption) || 'ToString';
  url += '?valueRenderOption=' + encodeURIComponent(valueRenderOption);
  var res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token },
  });
  var json = await res.json();
  return json;
}

async function fetchSpreadsheetSheetsV3(env, spreadsheetToken) {
  var token = await getFeishuTenantToken(env);
  // 使用 v2 API
  var url = 'https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/' + encodeURIComponent(spreadsheetToken) + '/sheets';
  var res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token },
  });
  var text = await res.text();
  console.log('Sheets API response preview:', text.substring(0, 300));
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('JSON parse error:', e.message);
    console.error('Raw response:', text);
    throw e;
  }
}

function numToColLetter(n) {
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s || 'A';
}

const PLATFORM_CONFIG = {
  douyin: {
    name: '抖音',
    sheetId: 'v3JEoi',  // 从URL中获取的sheet ID
    cols: { product: 2, amount: 8, time: 33, status: 36, darenId: 40 }
  },
  xiaohongshu: {
    name: '小红书',
    sheetId: 'xxx',  // 待确认
    cols: { product: 17, amount: 23, time: 34, status: 1, darenId: 15 }
  },
  shipinhao: {
    name: '视频号',
    sheetId: 'xxx',  // 待确认
    cols: { product: 40, amount: 18, time: 25, status: 5, darenName: 34 }
  },
  kuaishou: {
    name: '快手',
    sheetId: 'xxx',  // 待确认
    cols: { product: 25, amount: 7, time: 4, status: 6, darenId: 31 }
  }
};

async function testFetchPlatform(env, platform) {
  const cfg = PLATFORM_CONFIG[platform];
  console.log(`\n========== 测试 ${cfg.name} (Sheet: ${cfg.sheetId}) ==========`);

  try {
    const sheetId = cfg.sheetId;

    // 读取前20行数据来查看格式
    const maxCol = Math.max(...Object.values(cfg.cols));
    const colLetter = numToColLetter(maxCol);
    const range = `${sheetId}!A1:${colLetter}20`;

    console.log(`读取范围: ${range}`);

    const result = await fetchSheetValuesV2(env, NEW_SPREADSHEET_TOKEN, range, {
      valueRenderOption: 'FormattedValue'
    });

    if (!result || result.code !== 0) {
      console.error('读取失败:', result?.msg || result);
      return;
    }

    const values = result.data?.valueRange?.values || [];
    console.log(`读取到 ${values.length} 行数据`);

    // 打印表头
    if (values.length > 0) {
      console.log('\n表头 (第一行):');
      const headers = values[0];
      const relevantCols = Object.entries(cfg.cols).map(([k, v]) => `${k}=${headers[v] || '(空)'}`);
      console.log('  ' + relevantCols.join(', '));
    }

    // 分析日期字段
    console.log('\n日期字段样本 (支付完成时间列):');
    const timeCol = cfg.cols.time;
    values.slice(1, 8).forEach((row, idx) => {
      const timeVal = row[timeCol];
      const type = typeof timeVal;
      const preview = String(timeVal).substring(0, 30);
      console.log(`  行${idx + 2}: [${type}] "${preview}"`);
    });

    // 分析金额字段
    console.log('\n金额字段样本 (订单金额列):');
    const amtCol = cfg.cols.amount;
    values.slice(1, 8).forEach((row, idx) => {
      const amtVal = row[amtCol];
      console.log(`  行${idx + 2}: [${typeof amtVal}] "${amtVal}"`);
    });

    // 分析达人字段
    console.log('\n达人字段样本:');
    const darenCol = cfg.cols.darenId || cfg.cols.darenName;
    const darenType = cfg.cols.darenId ? '达人ID' : '达人昵称';
    values.slice(1, 8).forEach((row, idx) => {
      const darenVal = row[darenCol];
      console.log(`  行${idx + 2} (${darenType}): [${typeof darenVal}] "${darenVal}"`);
    });

    // 分析订单状态
    console.log('\n订单状态样本:');
    const statusCol = cfg.cols.status;
    const statusSet = new Set();
    values.slice(1).forEach(row => {
      if (row[statusCol]) statusSet.add(String(row[statusCol]));
    });
    console.log(`  唯一值: ${Array.from(statusSet).slice(0, 10).join(', ')}`);

  } catch (e) {
    console.error('测试失败:', e.message);
  }
}

async function main() {
  const env = {
    FEISHU_APP_ID: process.env.FEISHU_APP_ID,
    FEISHU_APP_SECRET: process.env.FEISHU_APP_SECRET
  };

  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    console.error('缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET，请检查 .env 文件');
    process.exit(1);
  }

  console.log('开始测试四平台数据读取...');
  console.log(`Spreadsheet Token: ${NEW_SPREADSHEET_TOKEN}`);

  for (const platform of ['douyin', 'xiaohongshu', 'shipinhao', 'kuaishou']) {
    await testFetchPlatform(env, platform);
    await new Promise(r => setTimeout(r, 500)); // 避免请求过快
  }

  console.log('\n========== 测试完成 ==========');
}

main().catch(console.error);
