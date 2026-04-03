// 直接复制函数代码进行测试

function parseDateFromPlatform(value, platform) {
  if (value == null || value === '') return null;

  if (typeof value === 'number') {
    return parseExcelSerial(value);
  }

  const str = String(value).trim();
  if (!str) return null;

  const numOnly = parseFloat(str);
  if (!isNaN(numOnly) && /^-?\d+(\.\d+)?$/.test(str) && numOnly >= 40000 && numOnly < 60000) {
    return parseExcelSerial(numOnly);
  }

  return parseStandardDate(str);
}

function parseExcelSerial(serial) {
  const utcDays = Math.floor(serial - 25569);
  const d = new Date(utcDays * 86400 * 1000);
  if (isNaN(d.getTime())) return null;
  return formatDate(d);
}

function parseStandardDate(str) {
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T\s](\d{2}):(\d{2}):(\d{2})/);
  if (isoMatch) {
    const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    if (!isNaN(d.getTime())) return formatDate(d);
  }

  const normalized = str.replace(/\//g, '-');
  const datePart = normalized.split(/[\sT]/)[0];

  const m = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
      return formatDate(d);
    }
  }

  const timestamp = Date.parse(normalized);
  if (!isNaN(timestamp)) {
    return formatDate(new Date(timestamp));
  }

  return null;
}

function formatDate(d) {
  return d.getFullYear() + '-' +
         String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

function parseAmount(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return value;
  const str = String(value).replace(/[,，\s]/g, '');
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function parseDarenId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object') return '';
  const str = String(value).trim();
  return str === '-' ? '' : str;
}

function buildChannelMaps(chValues) {
  const darenIdToChannel = {};
  const shipinhaoNameToChannel = {};

  for (let r = 1; r < chValues.length; r++) {
    const row = chValues[r] || [];
    const channelName = String(row[0] || '').trim();
    const platform = String(row[1] || '').trim();
    const darenName = String(row[3] || '').trim();
    const darenId = String(row[4] || '').trim();

    if (!channelName) continue;

    if (platform === '视频号' && darenName) {
      shipinhaoNameToChannel[darenName] = channelName;
    }

    if (darenId) {
      darenIdToChannel[darenId] = channelName;
    }
  }

  return { darenIdToChannel, shipinhaoNameToChannel };
}

function classifyOrder(darenId, darenName, platform, channelMaps) {
  let channelName = null;

  if (platform === 'shipinhao') {
    if (darenName && channelMaps.shipinhaoNameToChannel[darenName]) {
      channelName = channelMaps.shipinhaoNameToChannel[darenName];
    }
  } else {
    if (darenId && channelMaps.darenIdToChannel[darenId]) {
      channelName = channelMaps.darenIdToChannel[darenId];
    }
  }

  if (!channelName) {
    return { category: 'fuwu', channel: '未知' };
  }

  if (channelName.indexOf('直营') === 0) {
    return { category: null, channel: channelName, skip: true };
  }

  if (channelName.indexOf('DP') === 0) {
    return { category: 'dp', channel: channelName, skip: false };
  }

  if (channelName.indexOf('直对') === 0) {
    return { category: 'zhidui', channel: channelName, skip: false };
  }

  return { category: 'fuwu', channel: channelName, skip: false };
}

// ==================== 测试开始 ====================

console.log('========== 测试日期解析 ==========\n');

const excelTests = [
  { value: 46099.4708912037, platform: 'xiaohongshu', expected: '2026-03-18' },
  { value: 46113.65350694444, platform: 'shipinhao', expected: '2026-04-01' },
  { value: 46110.814780092594, platform: 'kuaishou', expected: '2026-03-29' },
];

console.log('Excel序列号格式:');
excelTests.forEach(t => {
  const result = parseDateFromPlatform(t.value, t.platform);
  const status = result === t.expected ? '✓' : '✗';
  console.log(`${status} ${t.platform}: ${t.value} → ${result} (期望: ${t.expected})`);
});

const dateTests = [
  { value: '2026/3/18 11:18:05', platform: 'xiaohongshu', expected: '2026-03-18' },
  { value: '2026/4/1 15:41:03', platform: 'shipinhao', expected: '2026-04-01' },
  { value: '2026/3/29 13:33:50', platform: 'kuaishou', expected: '2026-03-29' },
];

console.log('\n标准日期格式:');
dateTests.forEach(t => {
  const result = parseDateFromPlatform(t.value, t.platform);
  const status = result === t.expected ? '✓' : '✗';
  console.log(`${status} ${t.platform}: "${t.value}" → ${result}`);
});

console.log('\n空值处理:');
const emptyTests = [
  { value: '', expected: null },
  { value: null, expected: null },
  { value: undefined, expected: null },
];
emptyTests.forEach(t => {
  const result = parseDateFromPlatform(t.value, 'douyin');
  const status = result === t.expected ? '✓' : '✗';
  console.log(`${status} ${JSON.stringify(t.value)} → ${result}`);
});

console.log('\n========== 测试金额解析 ==========\n');
const amountTests = [
  { value: 2269, expected: 2269 },
  { value: 2999, expected: 2999 },
  { value: '1,299.50', expected: 1299.5 },
  { value: '', expected: 0 },
];
amountTests.forEach(t => {
  const result = parseAmount(t.value);
  const status = result === t.expected ? '✓' : '✗';
  console.log(`${status} ${JSON.stringify(t.value)} → ${result} (期望: ${t.expected})`);
});

console.log('\n========== 测试达人ID解析 ==========\n');
const darenTests = [
  { value: '284088526715758', expected: '284088526715758' },
  { value: '5dd769ea000000000100143e', expected: '5dd769ea000000000100143e' },
  { value: '-', expected: '' },
  { value: {}, expected: '' },
  { value: '', expected: '' },
];
darenTests.forEach(t => {
  const result = parseDarenId(t.value);
  const status = result === t.expected ? '✓' : '✗';
  console.log(`${status} ${JSON.stringify(t.value)} → "${result}" (期望: "${t.expected}")`);
});

console.log('\n========== 测试渠道映射 ==========\n');
const chValues = [
  ['渠道名称', '平台', '', '团长/达人昵称', 'id/uid'],
  ['四季', '抖音', '', '我是光年', '71190683121'],
  ['四季', '视频号', '', '我是光年', 'sphkKR6VA4B4x8N'],
  ['四季', '小红书', '', '我是光年', '5b6971389cfe280001501fb5'],
  ['启领', '快手', '', '大庆金牌月嫂葛淑波', '433365562'],
  ['DP-光年', '抖音', '', '我是光年', '284088526715758'],
  ['直对-某达人', '抖音', '', '某达人', '123456'],
  ['直营-某店', '抖音', '', '某店', '999999'],
];

const channelMaps = buildChannelMaps(chValues);
console.log('达人ID映射:');
console.log('  71190683121 →', channelMaps.darenIdToChannel['71190683121']);
console.log('  433365562 →', channelMaps.darenIdToChannel['433365562']);
console.log('  284088526715758 →', channelMaps.darenIdToChannel['284088526715758']);
console.log('\n视频号昵称映射:');
console.log('  我是光年 →', channelMaps.shipinhaoNameToChannel['我是光年']);

console.log('\n========== 测试分类逻辑 ==========\n');
const classifyTests = [
  { darenId: '71190683121', darenName: '', platform: 'douyin', expected: 'fuwu' },
  { darenId: '284088526715758', darenName: '', platform: 'douyin', expected: 'dp' },
  { darenId: '123456', darenName: '', platform: 'douyin', expected: 'zhidui' },
  { darenId: '999999', darenName: '', platform: 'douyin', expected: null, skip: true },
  { darenId: '', darenName: '我是光年', platform: 'shipinhao', expected: 'fuwu' },
  { darenId: 'unknown', darenName: '', platform: 'douyin', expected: 'fuwu' },
];

classifyTests.forEach(t => {
  const result = classifyOrder(t.darenId, t.darenName, t.platform, channelMaps);
  const expectedSkip = t.skip || false;
  const status = (result.category === t.expected && result.skip === expectedSkip) ? '✓' : '✗';
  const skipText = result.skip ? '(跳过)' : '';
  console.log(`${status} ${t.platform} id=${t.darenId} name="${t.darenName}" → ${result.category} ${skipText}`);
});

console.log('\n========== 测试完成 ==========');
