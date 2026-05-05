import { jsonResponse, corsHeaders, resolveCorsOrigin } from '../../_lib/http.js';
import { fetchSheetValuesV2 } from '../../_lib/feishu.js';

export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var origin = resolveCorsOrigin(request, env);

  try {
    var spreadsheetToken = 'WNp4wbOI3ib7J7kiX2fcZf6Fn8b';
    // 读取A145:F150范围，查看渠道名和商务人员的对应关系
    var range = 'ghju03!A145:F150';

    var result = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: 'FormattedValue' });

    return jsonResponse({
      success: true,
      range: range,
      result: result,
      values: result?.data?.valueRange?.values || []
    }, 200, origin);
  } catch (e) {
    return jsonResponse({
      success: false,
      error: e?.message || String(e)
    }, 500, origin);
  }
}
