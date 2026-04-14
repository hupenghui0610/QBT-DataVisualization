import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { fetchSheetValuesV2 } from '../../_lib/feishu.js';

function mergeMainAndModelData(mainValues, modelValues) {
  if (!mainValues || !mainValues.length) return mainValues || [];
  if (!modelValues || !modelValues.length) return mainValues;

  var result = [];
  var maxRows = Math.max(mainValues.length, modelValues.length);
  var AO_COLUMN_INDEX = 40;

  for (var i = 0; i < maxRows; i++) {
    var mainRow = mainValues[i] || [];
    var modelRow = modelValues[i] || [];
    var mergedRow = new Array(Math.max(mainRow.length, AO_COLUMN_INDEX + modelRow.length)).fill('');
    for (var j = 0; j < mainRow.length; j++) {
      mergedRow[j] = mainRow[j];
    }
    for (var k = 0; k < modelRow.length; k++) {
      mergedRow[AO_COLUMN_INDEX + k] = modelRow[k];
    }
    result.push(mergedRow);
  }
  return result;
}

export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get('Origin') || undefined;

  try {
    var spreadsheetToken = env.FEISHU_SPREADSHEET_TOKEN || 'EBwmsjjArhutvWtM2E9cLUMGnYd';
    var mainRange = env.FEISHU_SHEET_RANGE || '0VWscb!A1:H20000';
    var modelRange = env.FEISHU_SHEET_RANGE_MODEL || '0VWscb!AO1:BZ20000';

    // 读取主数据
    var mainResult = await fetchSheetValuesV2(env, spreadsheetToken, mainRange);

    // 读取型号数据
    var modelResult = await fetchSheetValuesV2(env, spreadsheetToken, modelRange);

    var mainValues = (mainResult.data && mainResult.data.valueRange && mainResult.data.valueRange.values) || [];
    var modelValues = (modelResult.data && modelResult.data.valueRange && modelResult.data.valueRange.values) || [];

    // 模拟完整的 payload 构造（与 feishu-daily-sales.js 完全一致）
    var mergedValues = mergeMainAndModelData(mainValues, modelValues);

    // 构造与 API 完全一致的 payload
    var data = mainResult.data || {};
    var payload = {
      spreadsheetToken: spreadsheetToken,
      range: mainRange,
      rangeModel: modelRange,
      valueRange: { range: mainRange, majorDimension: 'ROWS', values: mergedValues },
      revision: data.revision,
    };

    // 详细分析
    var analysis = {
      mainValues: {
        rowCount: mainValues.length,
        colCount: mainValues[0] ? mainValues[0].length : 0,
        firstRow: mainValues[0] ? mainValues[0].slice(0, 5) : [],
      },
      modelValues: {
        rowCount: modelValues.length,
        colCount: modelValues[0] ? modelValues[0].length : 0,
        firstRow: modelValues[0] ? modelValues[0].slice(0, 5) : [],
        lastRow: modelValues[modelValues.length - 1] ? modelValues[modelValues.length - 1].slice(0, 5) : [],
      },
      mergedValues: {
        rowCount: mergedValues.length,
        colCount: mergedValues[0] ? mergedValues[0].length : 0,
        firstRow_A: mergedValues[0] ? mergedValues[0].slice(0, 5) : [],
        firstRow_AO: mergedValues[0] ? mergedValues[0].slice(40, 45) : [],
        secondRow_AO: mergedValues[1] ? mergedValues[1].slice(40, 45) : [],
        dataRow_AO: mergedValues[2] ? mergedValues[2].slice(40, 45) : [],
      },
      payload: {
        hasValueRange: !!payload.valueRange,
        hasValues: !!(payload.valueRange && payload.valueRange.values),
        valuesLength: payload.valueRange && payload.valueRange.values ? payload.valueRange.values.length : 0,
        firstMergedRowLength: payload.valueRange && payload.valueRange.values && payload.valueRange.values[0] ? payload.valueRange.values[0].length : 0,
      }
    };

    return jsonResponse({
      success: true,
      analysis: analysis,
    }, 200, origin);
  } catch (e) {
    return jsonResponse({
      success: false,
      error: e && e.message ? e.message : String(e),
    }, 500, origin);
  }
}
