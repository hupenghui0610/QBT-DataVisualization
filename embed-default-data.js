/**
 * 将 data/features-output.json 与 data/features-brand-top10.json 打包为 data/default-data.js，
 * 供本地 file:// 打开页面时使用（浏览器会阻止 fetch 本地文件，脚本方式可加载）。
 * 运行: node embed-default-data.js
 * 需先有 data/features-output.json 和 data/features-brand-top10.json。
 */

const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'data');
const dapanPath = path.join(dir, 'features-output.json');
const brandPath = path.join(dir, 'features-brand-top10.json');
const outPath = path.join(dir, 'default-data.js');

let dapan, brand;
try {
  dapan = fs.readFileSync(dapanPath, 'utf8');
} catch (e) {
  console.error('未找到 data/features-output.json，请先运行 extract-features.js 并输出到 data/');
  process.exit(1);
}
try {
  brand = fs.readFileSync(brandPath, 'utf8');
} catch (e) {
  console.error('未找到 data/features-brand-top10.json，请先运行 extract-features-brand-top10.js 并输出到 data/');
  process.exit(1);
}

// 不挂到 window.__DEFAULT_*，改为调用页面预置的 __registerEmbeddedDefaults，数据写入不可枚举的 __QBT_EMB_
const js = [
    '// 由 embed-default-data.js 生成，供本地打开页面时加载默认数据',
    '(function () {',
    '  var d = ' + dapan.trim() + ';',
    '  var b = ' + brand.trim() + ';',
    "  if (typeof window !== 'undefined' && typeof window.__registerEmbeddedDefaults === 'function') {",
    '    window.__registerEmbeddedDefaults({ dapan: d, brand: b });',
    '  }',
    '})();',
].join('\n');

fs.writeFileSync(outPath, js, 'utf8');
console.log('已生成 data/default-data.js');
