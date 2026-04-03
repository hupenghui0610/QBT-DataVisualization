/**
 * 飞书开放平台：tenant_access_token + 电子表格读取（sheets v2）
 * 文档：https://open.feishu.cn/document/server-docs/docs/sheets-v2/data-operation/reading-a-single-range
 */

var tokenCache = { token: null, expireAtMs: 0 };

/**
 * @param {object} env Cloudflare env，需 FEISHU_APP_ID、FEISHU_APP_SECRET
 * @returns {Promise<string>}
 */
export async function getFeishuTenantToken(env) {
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
  var json = await res.json();
  if (json.code !== 0) {
    var err = new Error(json.msg || 'feishu_tenant_token_failed');
    err.feishuCode = json.code;
    throw err;
  }
  var token = json.tenant_access_token;
  /** 剩余有效秒数，提前 120 秒刷新 */
  var expireSec = typeof json.expire === 'number' ? json.expire : 7200;
  tokenCache.token = token;
  tokenCache.expireAtMs = now + Math.max(60, expireSec - 120) * 1000;
  return token;
}

/**
 * GET /open-apis/sheets/v2/spreadsheets/{token}/values/{range}
 * range 示例：0VWscb!A1:Z20000（行号上限需覆盖实际数据行，否则后半表读不到）
 * @returns {Promise<object>} 飞书完整 JSON 响应体
 */
/**
 * @param {{ valueRenderOption?: 'ToString' | 'FormattedValue' | 'UnformattedValue' }} [options]
 * FormattedValue：公式单元格返回计算后的展示值（避免拿到公式文本导致前端解析为 0）
 */
export async function fetchSheetValuesV2(env, spreadsheetToken, range, options) {
  var accessToken = await getFeishuTenantToken(env);
  var pathToken = encodeURIComponent(spreadsheetToken);
  var pathRange = encodeURIComponent(range);
  var qs = '';
  if (options && options.valueRenderOption) {
    /** 须让飞书返回公式计算后的值；部分网关只认 camelCase，故双写查询参数 */
    var vro = encodeURIComponent(String(options.valueRenderOption));
    qs = '?value_render_option=' + vro + '&valueRenderOption=' + vro;
  }
  var url =
    'https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/' + pathToken + '/values/' + pathRange + qs;
  var res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
  var json = await res.json();
  return json;
}

/**
 * GET /open-apis/sheets/v3/spreadsheets/{token}/sheets/query
 * 用于按工作表标题解析 sheet_id（例如“亲子屏日报数” -> “xxxxxx”）
 * @returns {Promise<object>} 飞书完整 JSON 响应体
 */
export async function fetchSpreadsheetSheetsV3(env, spreadsheetToken) {
  var accessToken = await getFeishuTenantToken(env);
  var pathToken = encodeURIComponent(spreadsheetToken);
  var url = 'https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/' + pathToken + '/sheets/query';
  var res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
  var json = await res.json();
  return json;
}
