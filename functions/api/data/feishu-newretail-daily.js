import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';
import { fetchSheetValuesV2 } from '../../_lib/feishu.js';
import {
  PLATFORM_CONFIG,
  CHANNEL_MAP_CONFIG,
  buildChannelMaps,
  classifyOrder,
  processPlatformOrders,
  aggregateByDayAndCategory,
  aggregateByWeek
} from './newretail-gmv-logic.js';

var DEFAULT_SPREADSHEET_TOKEN = 'WNp4wbOI3ib7J7kiX2fcZf6Fn8b';

/** 计算周起始（周一） */
function weekStartFromDateStr(ds) {
  var m = String(ds).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  var d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  var wd = d.getDay();
  var diff = wd === 0 ? 6 : wd - 1;
  d.setDate(d.getDate() - diff);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateYmd(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function numToColLetter(n) {
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s || 'A';
}

export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get('Origin') || undefined;

  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;

  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return jsonResponse(
      { error: '服务器未配置飞书应用，请在 Pages 环境变量中设置 FEISHU_APP_ID、FEISHU_APP_SECRET' },
      503,
      origin
    );
  }

  var spreadsheetToken = env.FEISHU_NEWRETAIL_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN;
  var mode = 'daily'; // daily or weekly

  try {
    // 1. 读取渠道映射表
    var chRange = (CHANNEL_MAP_CONFIG.sheetId) + '!A1:E2000';
    var chJson = await fetchSheetValuesV2(env, spreadsheetToken, chRange, { valueRenderOption: 'FormattedValue' });
    if (!chJson || chJson.code !== 0) {
      return jsonResponse({ error: chJson?.msg || '渠道映射表读取失败', feishuCode: chJson?.code }, 502, origin);
    }
    var chValues = chJson.data?.valueRange?.values || [];
    var channelMaps = buildChannelMaps(chValues);

    // 2. 读取四平台订单数据
    var platformKeys = ['douyin', 'xiaohongshu', 'shipinhao', 'kuaishou'];
    var allOrders = [];

    for (var i = 0; i < platformKeys.length; i++) {
      var platform = platformKeys[i];
      var cfg = PLATFORM_CONFIG[platform];
      if (!cfg) continue;

      // 计算需要的列范围
      var maxCol = Math.max(...Object.values(cfg.cols));
      var colLetter = numToColLetter(maxCol);
      var range = cfg.sheetId + '!A1:' + colLetter + '50000';

      try {
        var result = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: 'FormattedValue' });
        if (result && result.code === 0) {
          var values = result.data?.valueRange?.values || [];
          var orders = processPlatformOrders(values, platform, channelMaps);
          allOrders = allOrders.concat(orders);
        }
      } catch (e) {
        console.error('读取 ' + platform + ' 失败:', e.message);
      }
    }

    // 3. 按日期和类别汇总
    var dailyPoints = aggregateByDayAndCategory(allOrders);

    // 4. 计算周度数据
    var weeklyPoints = aggregateByWeek(dailyPoints);

    // 5. 计算最近30天/4周的汇总
    var now = new Date();
    var last30Days = [];
    var last4Weeks = [];

    for (var j = 0; j < 30; j++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - j);
      last30Days.push(formatDateYmd(d));
    }

    for (var k = 0; k < 4; k++) {
      var w = new Date(now.getFullYear(), now.getMonth(), now.getDate() - k * 7);
      last4Weeks.push(weekStartFromDateStr(formatDateYmd(w)));
    }

    var summary30d = { dp: 0, zhidui: 0, fuwu: 0, total: 0 };
    dailyPoints.forEach(function(p) {
      if (last30Days.includes(p.date)) {
        summary30d.dp += p.dp;
        summary30d.zhidui += p.zhidui;
        summary30d.fuwu += p.fuwu;
        summary30d.total += p.total;
      }
    });

    var summary4w = { dp: 0, zhidui: 0, fuwu: 0, total: 0 };
    weeklyPoints.forEach(function(p) {
      if (last4Weeks.includes(p.date)) {
        summary4w.dp += p.dp;
        summary4w.zhidui += p.zhidui;
        summary4w.fuwu += p.fuwu;
        summary4w.total += p.total;
      }
    });

    var payload = {
      mode: mode,
      daily: dailyPoints,
      weekly: weeklyPoints,
      summary: {
        last30Days: summary30d,
        last4Weeks: summary4w,
      },
      meta: {
        spreadsheetToken: spreadsheetToken,
        totalOrders: allOrders.length,
        platforms: platformKeys,
      }
    };

    return jsonResponse(payload, 200, origin);
  } catch (e) {
    return jsonResponse(
      { error: '新零售数据聚合失败', detail: e?.message || String(e) },
      502,
      origin
    );
  }
}

export async function onRequestOptions(context) {
  var origin = context.request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
