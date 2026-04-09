import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';
import { fetchSheetValuesV2 } from '../../_lib/feishu.js';

/** 与 wiki WNp4wbOI3ib7J7kiX2fcZf6Fn8b、抖音日度趋势（feishu-douyin-daily-trend）同源电子表；可用 FEISHU_LIVESTREAM_FUNNEL_SPREADSHEET_TOKEN 覆盖 */
var DEFAULT_SPREADSHEET_TOKEN = 'P1zusUMg2haMGctskH6cydLqn5e';
/** wiki 链接 ?sheet=fBPMjm 对应 sheet_id；列 B/G/I/U/V/AD */
var DEFAULT_RANGE = 'fBPMjm!A1:AD20000';

var COL_B = 1;   // 主播昵称
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
 * @returns {{ name: string, exposure: number, view: number, productExposure: number, productClick: number, order: number }[]}
 */
function aggregateByAnchor(values) {
  var map = Object.create(null);
  var start = 0;
  if (values.length > 0 && isHeaderRow(values[0])) start = 1;
  for (var r = start; r < values.length; r++) {
    var row = values[r];
    if (!row || !row.length) continue;
    var name = String(row[COL_B] != null ? row[COL_B] : '').trim();
    if (!name) continue;
    // 漏斗五层数据
    var exposure = parseNumberCell(row[COL_G]);        // 直播间曝光人数
    var view = parseNumberCell(row[COL_I]);            // 直播间观看人数
    var productExposure = parseNumberCell(row[COL_U]); // 直播间商品曝光人数
    var productClick = parseNumberCell(row[COL_V]);    // 直播间商品点击人数
    var order = parseNumberCell(row[COL_AD]);          // 直播间成交人数
    if (!map[name]) {
      map[name] = { name: name, exposure: 0, view: 0, productExposure: 0, productClick: 0, order: 0 };
    }
    var m = map[name];
    m.exposure += exposure;
    m.view += view;
    m.productExposure += productExposure;
    m.productClick += productClick;
    m.order += order;
  }
  var list = Object.keys(map).map(function (k) {
    return map[k];
  });
  list.sort(function (a, b) {
    return String(a.name).localeCompare(String(b.name), 'zh-CN');
  });
  return list;
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
    var anchors = aggregateByAnchor(values);
    var payload = {
      spreadsheetToken: spreadsheetToken,
      range: range,
      revision: data.revision,
      anchors: anchors,
    };
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
  var origin = context.request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
