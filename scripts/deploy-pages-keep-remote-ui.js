/**
 * 部署 Pages：静态资源从线上 BASE_URL 原样拉取（不打包本地 index/charts），
 * 仅更新仓库中的 Pages Functions + wrangler.toml 里的 [vars]（如 FEISHU_SHEET_RANGE）。
 * 用于：回滚后修复飞书读表范围/接口，而不改 Cloudflare 上的图表 HTML。
 *
 * 用法：node scripts/deploy-pages-keep-remote-ui.js
 * 可选环境变量：BASE_URL（默认 https://qbt-datavisualization.pages.dev）
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const vendorSrc = path.join(root, 'vendor');

var baseUrl = (process.env.BASE_URL || 'https://qbt-datavisualization.pages.dev').replace(/\/$/, '');

async function fetchText(url) {
  var res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(url + ' -> HTTP ' + res.status);
  return await res.text();
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function copyVendor() {
  var dest = path.join(dist, 'vendor');
  if (!fs.existsSync(vendorSrc)) {
    console.warn('警告：仓库无 vendor/，跳过 Font Awesome 拷贝');
    return;
  }
  fs.cpSync(vendorSrc, dest, { recursive: true });
}

function copyWechatVerify() {
  var name = 'c21ee759ec581077f679ce2033a5a2c0.txt';
  var src = path.join(root, name);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dist, name));
}

async function main() {
  console.log('BASE_URL =', baseUrl);
  if (fs.existsSync(dist)) fs.rmSync(dist, { recursive: true, force: true });
  ensureDir(path.join(dist, 'js'));

  var indexHtml = await fetchText(baseUrl + '/index.html');
  var chartsHtml = await fetchText(baseUrl + '/charts.html');
  var authJs = await fetchText(baseUrl + '/js/auth-client.js');

  fs.writeFileSync(path.join(dist, 'index.html'), indexHtml, 'utf8');
  fs.writeFileSync(path.join(dist, 'charts.html'), chartsHtml, 'utf8');
  fs.writeFileSync(path.join(dist, 'js', 'auth-client.js'), authJs, 'utf8');

  copyVendor();
  copyWechatVerify();

  var dataReadme = path.join(root, 'data', 'README.md');
  if (fs.existsSync(dataReadme)) {
    ensureDir(path.join(dist, 'data'));
    fs.copyFileSync(dataReadme, path.join(dist, 'data', 'README.md'));
  }

  console.log('dist/ 已从线上拉取静态页 + 本地 vendor，即将部署 Functions（仓库当前 functions/ + wrangler.toml）…');
  execSync(
    'npx wrangler pages deploy dist --project-name=qbt-datavisualization --commit-dirty=true',
    { stdio: 'inherit', cwd: root }
  );
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
