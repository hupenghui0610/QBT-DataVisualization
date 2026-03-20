const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const dataDir = path.join(root, 'data');
const distData = path.join(dist, 'data');

if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(dist, 'index.html'));
fs.copyFileSync(path.join(root, 'charts.html'), path.join(dist, 'charts.html'));
// 页面引用 vendor/font-awesome（图表标题图标等），必须一并打包进 dist，否则线上图标不显示
const vendorDir = path.join(root, 'vendor');
const distVendor = path.join(dist, 'vendor');
if (fs.existsSync(vendorDir)) {
  fs.cpSync(vendorDir, distVendor, { recursive: true });
}
if (fs.existsSync(dataDir)) {
  if (!fs.existsSync(distData)) fs.mkdirSync(distData, { recursive: true });
  for (const name of fs.readdirSync(dataDir)) {
    const src = path.join(dataDir, name);
    if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(distData, name));
  }
  console.log('dist/ 已准备好（index.html, charts.html, vendor/, data/）');
} else {
  console.log('dist/ 已准备好（index.html, charts.html, vendor/）');
}
