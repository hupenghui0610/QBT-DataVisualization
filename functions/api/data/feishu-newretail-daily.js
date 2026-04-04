import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';
import { fetchSheetValuesV2 } from '../../_lib/feishu.js';
import {
  PLATFORM_CONFIG,
  CHANNEL_MAP_CONFIG,
  buildChannelMaps,
  processPlatformOrders,
  processPlatformOrdersGsv,
  aggregateByDayAndCategory,
  aggregateByWeek,
  aggregateByMonth,
  aggregateFuwuByChannel,
  aggregateFuwuByChannelMonthly
} from './newretail-gmv-logic.js';

var DEFAULT_SPREADSHEET_TOKEN = 'WNp4wbOI3ib7J7kiX2fcZf6Fn8b';

function numToColLetter(n) {
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s || 'A';
}

async function sha256Hex(s) {
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  var arr = new Uint8Array(buf);
  var hex = '';
  for (var i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
  return hex;
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
  var maxRows = parseInt(env.FEISHU_NEWRETAIL_MAX_ROWS || '20000', 10);
  if (isNaN(maxRows) || maxRows < 1000) maxRows = 20000;

  var cacheTtlSec = parseInt(env.FEISHU_NEWRETAIL_CACHE_TTL_SEC || '120', 10);
  if (isNaN(cacheTtlSec) || cacheTtlSec < 0) cacheTtlSec = 120;

  // 构建缓存键
  var cacheRequest = null;
  if (cacheTtlSec > 0 && auth.user && auth.user.id != null) {
    var keyPayload = 'nrd:' + auth.user.id + ':' + spreadsheetToken + ':' + maxRows;
    var hash = await sha256Hex(keyPayload);
    cacheRequest = new Request('https://feishu-newretail-daily.cache/' + hash);
    var hit = await caches.default.match(cacheRequest);
    if (hit) {
      var body = await hit.text();
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'private, no-store',
          'X-QBT-Newretail-Cache': 'HIT',
          ...corsHeaders(origin),
        },
      });
    }
  }

  try {
    // 1. 读取渠道映射表
    var chRange = CHANNEL_MAP_CONFIG.sheetId + '!A1:E2000';
    var chJson = await fetchSheetValuesV2(env, spreadsheetToken, chRange, { valueRenderOption: 'FormattedValue' });
    if (!chJson || chJson.code !== 0) {
      return jsonResponse({ error: chJson?.msg || '渠道映射表读取失败', feishuCode: chJson?.code }, 502, origin);
    }
    var chValues = chJson.data?.valueRange?.values || [];
    var channelMaps = buildChannelMaps(chValues);

    // 2. 并行读取四平台订单数据
    var platformKeys = ['douyin', 'xiaohongshu', 'shipinhao', 'kuaishou'];
    var platformPromises = platformKeys.map(function(platform) {
      var cfg = PLATFORM_CONFIG[platform];
      if (!cfg) return Promise.resolve({ platform: platform, values: [] });

      var maxCol = Math.max(...Object.values(cfg.cols));
      var colLetter = numToColLetter(maxCol);
      var range = cfg.sheetId + '!A1:' + colLetter + maxRows;

      return fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: 'FormattedValue' })
        .then(function(result) {
          if (result && result.code === 0) {
            return { platform: platform, values: result.data?.valueRange?.values || [] };
          }
          return { platform: platform, values: [] };
        })
        .catch(function(e) {
          console.error('读取 ' + platform + ' 失败:', e.message);
          return { platform: platform, values: [] };
        });
    });

    var platformResults = await Promise.all(platformPromises);

    // 3. 处理订单数据 - GMV（所有订单）
    var allOrdersGmv = [];
    var platformStatsGmv = {};
    var gmvDebugStats = {};
    platformResults.forEach(function(result) {
      if (result.values && result.values.length > 0) {
        var gmvResult = processPlatformOrders(result.values, result.platform, channelMaps);
        allOrdersGmv = allOrdersGmv.concat(gmvResult.orders);
        platformStatsGmv[result.platform] = {
          totalRows: result.values.length - 1,
          validOrders: gmvResult.orders.length
        };
        if (result.platform === 'xiaohongshu' || result.platform === 'douyin') {
          gmvDebugStats[result.platform] = gmvResult.stats;
        }
      }
    });

    // 3b. 处理订单数据 - GSV（剔除关闭/取消订单）
    var allOrdersGsv = [];
    var platformStatsGsv = {};
    var gsvDebugInfo = {};
    platformResults.forEach(function(result) {
      if (result.values && result.values.length > 0) {
        var gsvResult = processPlatformOrdersGsv(result.values, result.platform, channelMaps);
        allOrdersGsv = allOrdersGsv.concat(gsvResult.orders);
        platformStatsGsv[result.platform] = {
          totalRows: result.values.length - 1,
          validOrders: gsvResult.orders.length,
          skippedCount: gsvResult.skipCount
        };
        gsvDebugInfo[result.platform] = gsvResult.debugSkipped;
      }
    });

    // 4. 按日期和类别汇总 - GMV
    var dailyPointsGmv = aggregateByDayAndCategory(allOrdersGmv);
    var monthlyPointsGmv = aggregateByMonth(dailyPointsGmv);

    // 4b. 按日期和类别汇总 - GSV
    var dailyPointsGsv = aggregateByDayAndCategory(allOrdersGsv);
    var monthlyPointsGsv = aggregateByMonth(dailyPointsGsv);

    // 4c. 服务商按渠道汇总
    var fuwuByChannel = aggregateFuwuByChannel(allOrdersGmv);
    var fuwuByChannelMonthly = aggregateFuwuByChannelMonthly(fuwuByChannel.data);

    var payload = {
      mode: 'daily',
      gmv: {
        daily: dailyPointsGmv,
        monthly: monthlyPointsGmv,
      },
      gsv: {
        daily: dailyPointsGsv,
        monthly: monthlyPointsGsv,
      },
      fuwuGmv: {
        daily: fuwuByChannel,
        monthly: fuwuByChannelMonthly
      },
      meta: {
        spreadsheetToken: spreadsheetToken,
        totalOrdersGmv: allOrdersGmv.length,
        totalOrdersGsv: allOrdersGsv.length,
        platformStatsGmv: platformStatsGmv,
        platformStatsGsv: platformStatsGsv,
        platforms: platformKeys,
        cached: false,
      }
    };

    var jsonBody = JSON.stringify(payload);
    var res = new Response(jsonBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-QBT-Newretail-Cache': 'MISS',
        ...corsHeaders(origin),
      },
    });

    // 写入缓存
    if (cacheRequest && cacheTtlSec > 0) {
      try {
        await caches.default.put(
          cacheRequest,
          new Response(jsonBody, {
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'max-age=' + cacheTtlSec,
            },
          })
        );
      } catch (ePut) {}
    }

    return res;
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
