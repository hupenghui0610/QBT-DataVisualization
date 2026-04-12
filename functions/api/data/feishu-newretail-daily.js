import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';
import { fetchSheetValuesV2, fetchSpreadsheetSheetsV3 } from '../../_lib/feishu.js';
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
  aggregateFuwuByChannelWeekly,
  aggregateFuwuByChannelMonthly,
  aggregateDpByChannel,
  aggregateDpByChannelWeekly,
  aggregateDpByChannelMonthly,
  aggregateDpByDarenMonthly,
  aggregateModelDistributionByDay,
  aggregateModelDistributionByDayFiltered,
  aggregateModelDistributionByDaren,
  aggregateRefundRateByDayAndCategory,
  aggregateRefundRateByWeek,
  aggregateRefundRateByMonth,
  aggregateFuwuRefundRateByChannel,
  aggregateDpRefundRateByChannel,
  calculateTotalsByCategory,
  calculateFuwuTotalsByChannel,
  calculateDpTotalsByChannel
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
    // 重置未匹配达人ID统计（每次请求开始时清空）
    globalThis.__unmatchedDarenIds = new Set();
    globalThis.__unmatchedDarenStats = {};

    // DEBUG: 先列出所有sheet，确认sheetId
    var sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
    console.log('[DEBUG] 飞书表格所有sheet列表:');
    if (sheetsJson && sheetsJson.code === 0 && sheetsJson.data && sheetsJson.data.sheets) {
      sheetsJson.data.sheets.forEach(function(sheet) {
        console.log('  sheet_id:', sheet.sheet_id, 'title:', sheet.title);
      });
    } else {
      console.log('  获取失败:', sheetsJson?.code, sheetsJson?.msg);
    }

    // 1. 读取渠道映射表
    var chRange = CHANNEL_MAP_CONFIG.sheetId + '!A1:E2000';
    var chJson = await fetchSheetValuesV2(env, spreadsheetToken, chRange, { valueRenderOption: 'FormattedValue' });
    if (!chJson || chJson.code !== 0) {
      return jsonResponse({ error: chJson?.msg || '渠道映射表读取失败', feishuCode: chJson?.code }, 502, origin);
    }
    var chValues = chJson.data?.valueRange?.values || [];
    var channelMaps = buildChannelMaps(chValues);

    // 从渠道映射表提取达人昵称清单（D列，排除直营/自营类别）
    // 同时构建达人ID -> 达人昵称的映射（用于非视频号平台）
    var darenNicknamesFromChannelMap = [];
    var darenIdToDarenNameMap = {}; // 达人ID -> 达人昵称
    var shipinhaoNameToDarenNameMap = {}; // 视频号达人昵称（唯一标识）-> 达人昵称
    for (var r = 1; r < chValues.length; r++) {
      var row = chValues[r] || [];
      var channelName = String(row[0] || '').trim();
      var platform = String(row[1] || '').trim();
      var darenName = String(row[3] || '').trim();
      var darenId = String(row[4] || '').trim();
      // 排除直营和自营类别的渠道，其他都包含
      if (channelName && channelName.indexOf('直营') !== 0 && channelName.indexOf('自营') !== 0) {
        if (darenName) {
          darenNicknamesFromChannelMap.push(darenName);
          // 视频号：用达人昵称本身作为key
          if (platform === '视频号' && darenId) {
            shipinhaoNameToDarenNameMap[darenId] = darenName;
          }
          // 其他平台：用达人ID作为key
          else if (darenId) {
            darenIdToDarenNameMap[darenId] = darenName;
          }
        }
      }
    }
    // 去重并排序
    darenNicknamesFromChannelMap = darenNicknamesFromChannelMap.filter(function(item, idx, arr) {
      return arr.indexOf(item) === idx;
    }).sort(function(a, b) {
      return a.localeCompare(b, 'zh-CN');
    });

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
          console.log('[' + platform + '] 飞书返回: code=' + (result?.code) + ', rows=' + (result?.data?.valueRange?.values?.length || 0));
          if (result && result.code === 0) {
            return { platform: platform, values: result.data?.valueRange?.values || [] };
          }
          console.error('[' + platform + '] 飞书读取失败:', result?.code, result?.msg);
          return { platform: platform, values: [] };
        })
        .catch(function(e) {
          console.error('读取 ' + platform + ' 失败:', e.message);
          return { platform: platform, values: [] };
        });
    });

    var platformResults = await Promise.all(platformPromises);

    // DEBUG: 详细输出抖音数据情况
    platformResults.forEach(function(result) {
      if (result.platform === 'douyin' && result.values && result.values.length > 1) {
        console.log('[DEBUG-douyin] 总行数(含表头):', result.values.length);
        console.log('[DEBUG-douyin] 表头列数:', result.values[0].length);
        console.log('[DEBUG-douyin] 第一行数据列数:', result.values[1].length);
        console.log('[DEBUG-douyin] 需要的最小列索引(AO=40):', PLATFORM_CONFIG.douyin.cols.darenId);
        console.log('[DEBUG-douyin] 第一行数据样例(0-10列):', result.values[1].slice(0, 11));
        console.log('[DEBUG-douyin] 第一行AO列(40)值:', result.values[1][40]);
        console.log('[DEBUG-douyin] 第一行AK列(36)值:', result.values[1][36]);
        // 检查是否有行被截断
        let truncatedRows = 0;
        for (let i = 1; i < Math.min(result.values.length, 10); i++) {
          if (result.values[i].length <= 40) truncatedRows++;
        }
        console.log('[DEBUG-douyin] 前10行中列数<=40的行数:', truncatedRows);
      }
    });

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
    var weeklyPointsGmv = aggregateByWeek(dailyPointsGmv);
    var monthlyPointsGmv = aggregateByMonth(dailyPointsGmv);

    // 4b. 按日期和类别汇总 - GSV
    var dailyPointsGsv = aggregateByDayAndCategory(allOrdersGsv);
    var weeklyPointsGsv = aggregateByWeek(dailyPointsGsv);
    var monthlyPointsGsv = aggregateByMonth(dailyPointsGsv);

    // 4c. 计算退款率（四平台合并）
    var dailyRefundRate = aggregateRefundRateByDayAndCategory(dailyPointsGmv, dailyPointsGsv);
    var weeklyRefundRate = aggregateRefundRateByWeek(dailyPointsGmv, dailyPointsGsv);
    var monthlyRefundRate = aggregateRefundRateByMonth(dailyPointsGmv, dailyPointsGsv);

    // 4d. 服务商按渠道汇总
    var fuwuByChannel = aggregateFuwuByChannel(allOrdersGmv);
    var fuwuByChannelWeekly = aggregateFuwuByChannelWeekly(fuwuByChannel.data);
    var fuwuByChannelMonthly = aggregateFuwuByChannelMonthly(fuwuByChannel.data);
    var fuwuByChannelGsv = aggregateFuwuByChannel(allOrdersGsv);
    var fuwuByChannelGsvWeekly = aggregateFuwuByChannelWeekly(fuwuByChannelGsv.data);
    var fuwuByChannelGsvMonthly = aggregateFuwuByChannelMonthly(fuwuByChannelGsv.data);

    // 4e. 服务商退款率（使用日度/周度/月度GMV和GSV分别计算）
    var fuwuRefundRateDaily = aggregateFuwuRefundRateByChannel(fuwuByChannel, fuwuByChannelGsv);
    var fuwuRefundRateWeekly = aggregateFuwuRefundRateByChannel(fuwuByChannelWeekly, fuwuByChannelGsvWeekly);
    var fuwuRefundRateMonthly = aggregateFuwuRefundRateByChannel(fuwuByChannelMonthly, fuwuByChannelGsvMonthly);

    // 4f. 计算总计（用于前端正确计算总退款率）
    var fourPlatformTotals = calculateTotalsByCategory(dailyPointsGmv, dailyPointsGsv);
    var fuwuTotalsDaily = calculateFuwuTotalsByChannel(fuwuByChannel, fuwuByChannelGsv);
    var fuwuTotalsWeekly = calculateFuwuTotalsByChannel(fuwuByChannelWeekly, fuwuByChannelGsvWeekly);
    var fuwuTotalsMonthly = calculateFuwuTotalsByChannel(fuwuByChannelMonthly, fuwuByChannelGsvMonthly);

    // 4g. DP按渠道汇总（仿照服务商）
    var dpByChannel = aggregateDpByChannel(allOrdersGmv);
    var dpByChannelWeekly = aggregateDpByChannelWeekly(dpByChannel.data);
    var dpByChannelMonthly = aggregateDpByChannelMonthly(dpByChannel.data);
    var dpByChannelGsv = aggregateDpByChannel(allOrdersGsv);
    var dpByChannelGsvWeekly = aggregateDpByChannelWeekly(dpByChannelGsv.data);
    var dpByChannelGsvMonthly = aggregateDpByChannelMonthly(dpByChannelGsv.data);

    // 4h. DP退款率（按渠道计算）
    var dpRefundRateDaily = aggregateDpRefundRateByChannel(dpByChannel, dpByChannelGsv);
    var dpRefundRateWeekly = aggregateDpRefundRateByChannel(dpByChannelWeekly, dpByChannelGsvWeekly);
    var dpRefundRateMonthly = aggregateDpRefundRateByChannel(dpByChannelMonthly, dpByChannelGsvMonthly);

    // 4i. DP各渠道总计
    var dpTotalsDaily = calculateDpTotalsByChannel(dpByChannel, dpByChannelGsv);
    var dpTotalsWeekly = calculateDpTotalsByChannel(dpByChannelWeekly, dpByChannelGsvWeekly);
    var dpTotalsMonthly = calculateDpTotalsByChannel(dpByChannelMonthly, dpByChannelGsvMonthly);

    // 4j. DP类按达人月度汇总（原有功能）
    var dpByDarenMonthly = aggregateDpByDarenMonthly(allOrdersGmv, allOrdersGsv);

    // 4e. 读取产品型号映射表并聚合型号分布
    var modelMappingRange = 'NYYiAs!A1:B1000';
    var modelMappingJson = await fetchSheetValuesV2(env, spreadsheetToken, modelMappingRange, { valueRenderOption: 'FormattedValue' });
    var modelMapping = [];
    if (modelMappingJson && modelMappingJson.code === 0) {
      var modelValues = modelMappingJson.data?.valueRange?.values || [];
      for (var i = 1; i < modelValues.length; i++) {
        var row = modelValues[i] || [];
        var keyword = String(row[0] || '').trim();
        var model = String(row[1] || '').trim();
        if (keyword && model) {
          modelMapping.push({ keyword: keyword, model: model });
        }
      }
    }

    // 4f. 聚合四平台型号分布数据（按日）
    var modelDistributionResult = aggregateModelDistributionByDay(allOrdersGmv, modelMapping);
    var modelDistributionGsvResult = aggregateModelDistributionByDay(allOrdersGsv, modelMapping);

    // 4g. 聚合三个新的型号分布数据集（GSV口径）
    // DP-沐成
    var modelDistDpMuchengResult = aggregateModelDistributionByDayFiltered(allOrdersGsv, modelMapping, function(order) {
      return order.category === 'dp' && order.channel && order.channel.includes('沐成');
    });
    // DP-逐梦
    var modelDistDpZhumengResult = aggregateModelDistributionByDayFiltered(allOrdersGsv, modelMapping, function(order) {
      return order.category === 'dp' && order.channel && order.channel.includes('逐梦');
    });
    // 达人（直对 + 服务商）
    var modelDistDarenResult = aggregateModelDistributionByDayFiltered(allOrdersGsv, modelMapping, function(order) {
      return order.category === 'zhidui' || order.category === 'fuwu';
    });

    // 按达人昵称分别聚合型号分布数据（用于筛选功能）
    var modelDistDarenByDaren = aggregateModelDistributionByDaren(allOrdersGsv, modelMapping, function(order) {
      return order.category === 'zhidui' || order.category === 'fuwu' || order.category === 'dp';
    }, darenNicknamesFromChannelMap, darenIdToDarenNameMap, shipinhaoNameToDarenNameMap);

    // 输出未匹配达人ID的详细统计
    if (globalThis.__unmatchedDarenStats && Object.keys(globalThis.__unmatchedDarenStats).length > 0) {
      console.log('\n=== 未匹配到渠道的达人ID统计 ===');
      console.log('未匹配达人数量:', Object.keys(globalThis.__unmatchedDarenStats).length);

      // 转换为数组并排序（按GMV+GSV总额降序）
      const sortedStats = Object.values(globalThis.__unmatchedDarenStats)
        .sort((a, b) => (b.gmv + b.gsv) - (a.gmv + a.gsv));

      // 打印详细列表
      console.log('\n达人ID | 平台 | 订单数 | GMV金额(元) | GSV金额(元) | 总额(元)');
      console.log('-'.repeat(90));

      let totalGmv = 0;
      let totalGsv = 0;
      let totalCount = 0;

      sortedStats.forEach(stat => {
        const rowTotal = stat.gmv + stat.gsv;
        totalGmv += stat.gmv;
        totalGsv += stat.gsv;
        totalCount += stat.count;

        console.log(
          `${stat.darenId.padEnd(20)} | ` +
          `${stat.platform.padEnd(8)} | ` +
          `${String(stat.count).padStart(6)} | ` +
          `${String(stat.gmv.toFixed(2)).padStart(12)} | ` +
          `${String(stat.gsv.toFixed(2)).padStart(12)} | ` +
          `${rowTotal.toFixed(2)}`
        );
      });

      console.log('-'.repeat(90));
      console.log(`合计 | - | ${totalCount} | ${totalGmv.toFixed(2)} | ${totalGsv.toFixed(2)} | ${(totalGmv + totalGsv).toFixed(2)}`);
      console.log('\n注：以上达人ID在渠道映射表中未找到对应关系，被归类到"服务商"类别');
    }

    var payload = {
      mode: 'daily',
      // 顶层 daily/weekly/monthly 用于兼容前端旧版渲染
      daily: dailyPointsGsv,
      weekly: weeklyPointsGsv,
      monthly: monthlyPointsGsv,
      gmv: {
        daily: dailyPointsGmv,
        weekly: weeklyPointsGmv,
        monthly: monthlyPointsGmv,
      },
      gsv: {
        daily: dailyPointsGsv,
        weekly: weeklyPointsGsv,
        monthly: monthlyPointsGsv,
      },
      refundRate: {
        daily: dailyRefundRate,
        weekly: weeklyRefundRate,
        monthly: monthlyRefundRate,
      },
      fuwuGmv: {
        daily: fuwuByChannel,
        weekly: fuwuByChannelWeekly,
        monthly: fuwuByChannelMonthly
      },
      fuwuGsv: {
        daily: fuwuByChannelGsv,
        weekly: fuwuByChannelGsvWeekly,
        monthly: fuwuByChannelGsvMonthly
      },
      fuwuRefundRate: {
        daily: fuwuRefundRateDaily,
        weekly: fuwuRefundRateWeekly,
        monthly: fuwuRefundRateMonthly
      },
      dpGmv: {
        daily: dpByChannel,
        weekly: dpByChannelWeekly,
        monthly: dpByChannelMonthly
      },
      dpGsv: {
        daily: dpByChannelGsv,
        weekly: dpByChannelGsvWeekly,
        monthly: dpByChannelGsvMonthly
      },
      dpRefundRate: {
        daily: dpRefundRateDaily,
        weekly: dpRefundRateWeekly,
        monthly: dpRefundRateMonthly
      },
      totals: {
        fourPlatform: fourPlatformTotals,
        fuwuDaily: fuwuTotalsDaily,
        fuwuWeekly: fuwuTotalsWeekly,
        fuwuMonthly: fuwuTotalsMonthly,
        dpDaily: dpTotalsDaily,
        dpWeekly: dpTotalsWeekly,
        dpMonthly: dpTotalsMonthly
      },
      dpGmvGsv: {
        monthly: dpByDarenMonthly
      },
      modelDistribution: modelDistributionResult,
      modelDistributionGsv: modelDistributionGsvResult,
      modelDistDpMucheng: modelDistDpMuchengResult,
      modelDistDpZhumeng: modelDistDpZhumengResult,
      modelDistDaren: modelDistDarenResult,
      modelDistDarenByDaren: modelDistDarenByDaren,
      meta: {
        spreadsheetToken: spreadsheetToken,
        totalOrdersGmv: allOrdersGmv.length,
        totalOrdersGsv: allOrdersGsv.length,
        platformStatsGmv: platformStatsGmv,
        platformStatsGsv: platformStatsGsv,
        platforms: platformKeys,
        cached: false,
        debugUnmatchedDarenIds: globalThis.__unmatchedDarenIds ? Array.from(globalThis.__unmatchedDarenIds) : [],
        debugUnmatchedDarenStats: globalThis.__unmatchedDarenStats || {}
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
