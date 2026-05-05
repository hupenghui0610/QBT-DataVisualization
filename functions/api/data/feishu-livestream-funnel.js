import { jsonResponse, corsHeaders, resolveCorsOrigin } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';
import { fetchSheetValuesV2 } from '../../_lib/feishu.js';
import { getCache, setCache } from '../../_lib/cache.js';

var CACHE_KEY = 'feishu-livestream-funnel';
var CACHE_TTL_HOURS = 48;

/** 与 wiki WNp4wbOI3ib7J7kiX2fcZf6Fn8b、抖音日度趋势（feishu-douyin-daily-trend）同源电子表；可用 FEISHU_LIVESTREAM_FUNNEL_SPREADSHEET_TOKEN 覆盖 */
var DEFAULT_SPREADSHEET_TOKEN = 'P1zusUMg2haMGctskH6cydLqn5e';
/** wiki 链接 ?sheet=fBPMjm 对应 sheet_id；列 B/D/G/I/U/V/AD */
var DEFAULT_RANGE = 'fBPMjm!A1:AD20000';

var COL_B = 1;   // 主播昵称
var COL_D = 3;   // 直播开始时间
var COL_G = 6;   // 直播间曝光人数
var COL_I = 8;   // 直播间观看人数
var COL_U = 20;  // 直播间商品曝光人数
var COL_V = 21;  // 直播间商品点击人数
var COL_AD = 29; // 直播间成交人数

function parseNumberCell(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && !isNaN(v)) return v;
  var s = String(v).replace(/,/g, '').replace(/\s/g, '').trim();
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function parseDateFromCell(v) {
  if (!v) return null;
  var s = String(v).trim();
  // 处理 2026/1/3 9:33:16 或 2026-01-03 格式
  var m = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) {
    return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
  }
  return null;
}

function isHeaderRow(row) {
  if (!row || !row.length) return true;
  var b = String(row[COL_B] || '').trim();
  if (!b) return false;
  var low = b.toLowerCase();
  if (low === '主播' || low === '主播昵称' || low.indexOf('昵称') >= 0) return true;
  if (b === 'B' || low === 'name') return true;
  return false;
}

/**
 * @param {unknown[][]} values
 * @returns {{ anchors: Object[], datesByAnchor: Object, dataByAnchorAndDate: Object }}
 */
function aggregateByAnchor(values) {
  var map = Object.create(null);  // 主播全部累加
  var dateMap = Object.create(null);  // 主播+日期累加
  var start = 0;
  if (values.length > 0 && isHeaderRow(values[0])) start = 1;

  for (var r = start; r < values.length; r++) {
    var row = values[r];
    if (!row || !row.length) continue;
    var name = String(row[COL_B] != null ? row[COL_B] : '').trim();
    if (!name) continue;

    // 解析日期
    var dateStr = parseDateFromCell(row[COL_D]);

    // 漏斗五层数据
    var exposure = parseNumberCell(row[COL_G]);        // 直播间曝光人数
    var view = parseNumberCell(row[COL_I]);            // 直播间观看人数
    var productExposure = parseNumberCell(row[COL_U]); // 直播间商品曝光人数
    var productClick = parseNumberCell(row[COL_V]);    // 直播间商品点击人数
    var order = parseNumberCell(row[COL_AD]);          // 直播间成交人数

    // 累加到主播全部
    if (!map[name]) {
      map[name] = { name: name, exposure: 0, view: 0, productExposure: 0, productClick: 0, order: 0 };
    }
    var m = map[name];
    m.exposure += exposure;
    m.view += view;
    m.productExposure += productExposure;
    m.productClick += productClick;
    m.order += order;

    // 累加到主播+日期
    if (dateStr) {
      if (!dateMap[name]) dateMap[name] = {};
      if (!dateMap[name][dateStr]) {
        dateMap[name][dateStr] = { exposure: 0, view: 0, productExposure: 0, productClick: 0, order: 0 };
      }
      var dm = dateMap[name][dateStr];
      dm.exposure += exposure;
      dm.view += view;
      dm.productExposure += productExposure;
      dm.productClick += productClick;
      dm.order += order;
    }
  }

  // 构建主播列表并排序
  var list = Object.keys(map).map(function (k) {
    return map[k];
  });
  list.sort(function (a, b) {
    return String(a.name).localeCompare(String(b.name), 'zh-CN');
  });

  // 构建日期列表
  var datesByAnchor = {};
  for (var name in dateMap) {
    datesByAnchor[name] = Object.keys(dateMap[name]).sort();
  }

  return {
    anchors: list,
    datesByAnchor: datesByAnchor,
    dataByAnchorAndDate: dateMap
  };
}

export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var origin = resolveCorsOrigin(request, env);

  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;

  // 禁用缓存，实时读取数据
  /*
  var cached = await getCache(env, CACHE_KEY);
  if (cached) {
    return new Response(JSON.stringify({ ...cached.data, _cached: true, _updatedAt: cached.updatedAt }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        ...corsHeaders(origin),
      },
    });
  }
  */

  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return jsonResponse(
      { error: '服务器未配置飞书应用，请在 Pages 环境变量中设置 FEISHU_APP_ID、FEISHU_APP_SECRET' },
      503,
      origin
    );
  }

  var spreadsheetToken = env.FEISHU_LIVESTREAM_FUNNEL_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN;

  var range = env.FEISHU_LIVESTREAM_FUNNEL_RANGE || DEFAULT_RANGE;

  try {
    var feishuJson = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: 'FormattedValue' });
    if (!feishuJson || feishuJson.code !== 0) {
      return jsonResponse(
        {
          error: (feishuJson && feishuJson.msg) || '飞书表格接口返回错误',
          feishuCode: feishuJson && feishuJson.code,
          range: range,
        },
        502,
        origin
      );
    }
    var data = feishuJson.data || {};
    var vr = data.valueRange || {};
    var values = vr.values || [];
    var result = aggregateByAnchor(values);
    var payload = {
      spreadsheetToken: spreadsheetToken,
      range: range,
      revision: data.revision,
      anchors: result.anchors,
      datesByAnchor: result.datesByAnchor,
      dataByAnchorAndDate: result.dataByAnchorAndDate,
    };

    // 写入缓存
    await setCache(env, CACHE_KEY, payload, CACHE_TTL_HOURS);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        ...corsHeaders(origin),
      },
    });
  } catch (e) {
    return jsonResponse(
      { error: '拉取直播间漏斗表失败', detail: e && e.message ? e.message : String(e) },
      502,
      origin
    );
  }
}

export async function onRequestOptions(context) {
  var origin = resolveCorsOrigin(context.request, context.env);
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
