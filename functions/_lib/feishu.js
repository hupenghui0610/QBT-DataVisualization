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
 * 乐观大范围 + 分块兜底：先按大范围一次性读取，如果返回行数达到上限则继续补读
 * @param {object} env
 * @param {string} spreadsheetToken
 * @param {string} range - 格式: sheetId!A1:Z50000
 * @param {object} options - { valueRenderOption }
 * @param {number} [initialMaxRows=50000] - 初始读取行数上限
 * @param {number} [chunkSize=5000] - 补读时每块行数
 * @returns {Promise<object>} 与 fetchSheetValuesV2 相同格式
 */
export async function fetchRangeChunked(env, spreadsheetToken, range, options, initialMaxRows, chunkSize) {
  initialMaxRows = initialMaxRows || 50000;
  chunkSize = chunkSize || 5000;

  // 解析 range 提取 sheetId 和列范围
  var match = range.match(/^([a-zA-Z0-9]+)!([A-Z]+)\d+:([A-Z]+)(\d*)$/);
  if (!match) {
    // 无法解析，退回单次读取
    return fetchSheetValuesV2(env, spreadsheetToken, range, options);
  }
  var sheetId = match[1];
  var startCol = match[2];
  var endCol = match[3];

  // 先尝试一次性读取，如果超出10MB则自动缩小行数
  var shrinkCaps = [initialMaxRows, 20000, 12000, 8000, 5000, 3000];
  var result = null;
  var values = [];
  var usedMaxRows = initialMaxRows;

  for (var si = 0; si < shrinkCaps.length; si++) {
    usedMaxRows = shrinkCaps[si];
    var tryRange = sheetId + '!' + startCol + '1:' + endCol + usedMaxRows;
    result = await fetchSheetValuesV2(env, spreadsheetToken, tryRange, options);
    if (!result || result.code !== 0) {
      var msg = String((result && result.msg) || '');
      if (msg.indexOf('data exceeded') >= 0 || msg.indexOf('10485760') >= 0) {
        // 超出10MB，缩小行数重试
        console.log('[fetchRangeChunked] 超出10MB, 缩小到 ' + (shrinkCaps[si + 1] || 'N/A') + ' 行重试');
        continue;
      }
      // 其他错误，直接返回
      return result;
    }
    values = (result.data && result.data.valueRange && result.data.valueRange.values) || [];
    break;
  }

  if (!result || result.code !== 0) return result;

  // 如果返回行数未达到当前上限，说明数据已读完
  if (values.length < usedMaxRows) return result;

  // 分块补读
  var offset = usedMaxRows + 1;
  var hasMore = true;
  while (hasMore) {
    var endRow = offset + chunkSize - 1;
    var chunkRange = sheetId + '!' + startCol + offset + ':' + endCol + endRow;
    var chunkResult = await fetchSheetValuesV2(env, spreadsheetToken, chunkRange, options);
    if (!chunkResult || chunkResult.code !== 0) {
      // 补读失败（可能也是10MB），缩小chunkSize重试
      if (chunkSize > 2000) {
        chunkSize = Math.floor(chunkSize / 2);
        continue;
      }
      break;
    }

    var chunkValues = (chunkResult.data && chunkResult.data.valueRange && chunkResult.data.valueRange.values) || [];
    if (chunkValues.length === 0) break;

    values = values.concat(chunkValues);

    if (chunkValues.length < chunkSize) {
      hasMore = false;
    } else {
      offset += chunkSize;
    }
  }

  result.data.valueRange.values = values;
  return result;
}

/**
 * 单列分块读取：先读大范围，读满则补读
 * @param {object} env
 * @param {string} spreadsheetToken
 * @param {string} sheetId
 * @param {string} colLetter - 列字母，如 'A', 'AH'
 * @param {object} options - { valueRenderOption }
 * @param {number} [initialMaxRows=50000]
 * @param {number} [chunkSize=5000]
 * @returns {Promise<{success: boolean, values: Array, error?: string}>}
 */
export async function fetchSingleColumnChunked(env, spreadsheetToken, sheetId, colLetter, options, initialMaxRows, chunkSize) {
  initialMaxRows = initialMaxRows || 50000;
  chunkSize = chunkSize || 5000;

  // 先一次性读取
  var range = sheetId + '!' + colLetter + '1:' + colLetter + initialMaxRows;
  var result = await fetchSheetValuesV2(env, spreadsheetToken, range, options || { valueRenderOption: 'FormattedValue' });
  if (!result || result.code !== 0) {
    return { success: false, error: result?.msg || '读取失败', code: result?.code };
  }
  var values = (result.data && result.data.valueRange && result.data.valueRange.values) || [];

  // 如果返回行数未达到上限，数据已读完
  if (values.length < initialMaxRows) {
    return { success: true, values: values };
  }

  // 分块补读
  var offset = initialMaxRows + 1;
  var hasMore = true;
  while (hasMore) {
    var endRow = offset + chunkSize - 1;
    var chunkRange = sheetId + '!' + colLetter + offset + ':' + colLetter + endRow;
    var chunkResult = await fetchSheetValuesV2(env, spreadsheetToken, chunkRange, options || { valueRenderOption: 'FormattedValue' });
    if (!chunkResult || chunkResult.code !== 0) break;

    var chunkValues = (chunkResult.data && chunkResult.data.valueRange && chunkResult.data.valueRange.values) || [];
    if (chunkValues.length === 0) break;

    values = values.concat(chunkValues);

    if (chunkValues.length < chunkSize) {
      hasMore = false;
    } else {
      offset += chunkSize;
    }
  }

  return { success: true, values: values };
}

/**
 * GET /open-apis/sheets/v3/spreadsheets/{token}/sheets/query
 * 用于按工作表标题解析 sheet_id（例如”亲子屏日报数” -> “xxxxxx”）
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
