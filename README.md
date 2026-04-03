# 电商大盘及竞争数据 - 多维度可视化

登录后从飞书实时读取行业数据与业务图表数据，在浏览器中查看多维度可视化结果。

## 本地使用

- 在仓库根目录启动静态 HTTP 服务，如 `npx serve .`
- 浏览器访问 `http://127.0.0.1:端口/index.html`
- 登录后页面会自动从后端接口拉取飞书数据

## 部署到 Cloudflare Pages（跨电脑访问）

1. 在 Cloudflare Pages 中创建站点并完成部署。

2. **访问网站**
   - 部署完成后会得到地址：`https://qbt-datavisualization.pages.dev`（或你自定义的项目名）。
   - 任意电脑打开该链接并登录后即可查看图表。

## 可选：自定义域名

在 Pages 项目 → **Custom domains** 中添加你自己的域名即可。
