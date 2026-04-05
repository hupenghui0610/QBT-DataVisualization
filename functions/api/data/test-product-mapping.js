import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';
import { fetchSheetValuesV2 } from '../../_lib/feishu.js';

var DEFAULT_SPREADSHEET_TOKEN = 'WNp4wbOI3ib7J7kiX2fcZf6Fn8b';

export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get('Origin') || undefined;

  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;

  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return jsonResponse(
      { error: '服务器未配置飞书应用' },
      503,
      origin
    );
  }

  var spreadsheetToken = env.FEISHU_NEWRETAIL_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN;

  try {
    // 1. 读取产品型号映射表
    // 根据飞书URL，sheet ID是 'NYYiAs'
    var productSheetId = 'NYYiAs';
    var productRange = productSheetId + '!A1:B1000';
    console.log('正在读取产品型号映射表:', productRange);
    var productJson = await fetchSheetValuesV2(env, spreadsheetToken, productRange, { valueRenderOption: 'FormattedValue' });

    var productMapping = [];
    if (productJson && productJson.code === 0) {
      var values = productJson.data?.valueRange?.values || [];
      console.log('产品型号映射表原始数据:', JSON.stringify(values.slice(0, 20), null, 2));

      for (var i = 1; i < values.length; i++) {
        var row = values[i] || [];
        var keyword = String(row[0] || '').trim();
        var model = String(row[1] || '').trim();
        if (keyword && model) {
          productMapping.push({ keyword: keyword, model: model });
        }
      }
    }

    // 3. 读取四个平台的抽样订单数据（各取前10行）
    var platformSamples = {};
    var platforms = [
      { key: 'douyin', name: '抖音', sheetId: 'tuec5U', productCol: 2 },
      { key: 'xiaohongshu', name: '小红书', sheetId: 'v3JEoi', productCol: 17 },
      { key: 'shipinhao', name: '视频号', sheetId: 'LoahCg', productCol: 40 },
      { key: 'kuaishou', name: '快手', sheetId: '7uRPyy', productCol: 25 }
    ];

    for (var p of platforms) {
      try {
        var range = p.sheetId + '!A1:' + String.fromCharCode(65 + p.productCol) + '20';
        var result = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: 'FormattedValue' });
        if (result && result.code === 0) {
          var values = result.data?.valueRange?.values || [];
          var samples = [];
          for (var i = 1; i < Math.min(values.length, 11); i++) {
            var row = values[i] || [];
            var product = String(row[p.productCol] || '');
            if (product) {
              // 测试映射逻辑
              var matchedModel = null;
              for (var mapping of productMapping) {
                var kw = mapping.keyword;
                if (kw === 'V2') {
                  // V2特殊逻辑：包含V2但不能包含V20
                  if (product.includes('V2') && !product.includes('V20')) {
                    matchedModel = mapping.model;
                    break;
                  }
                } else if (product.includes(kw)) {
                  matchedModel = mapping.model;
                  break;
                }
              }
              samples.push({
                product: product.length > 50 ? product.substring(0, 50) + '...' : product,
                matchedModel: matchedModel || '未匹配'
              });
            }
          }
          platformSamples[p.key] = {
            name: p.name,
            samples: samples
          };
        }
      } catch (e) {
        platformSamples[p.key] = { name: p.name, error: e.message };
      }
    }

    return jsonResponse({
      productMapping: productMapping,
      platformSamples: platformSamples
    }, 200, origin);

  } catch (e) {
    return jsonResponse(
      { error: '数据读取失败', detail: e?.message || String(e) },
      502,
      origin
    );
  }
}

export async function onRequestOptions(context) {
  var origin = context.request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
