# 电商大盘及竞争数据 - 多维度可视化

上传 Excel（渠道、价格段、日期、销量、销售额）即可在浏览器中查看多维度图表。

## 本地使用

- 用浏览器打开 `index.html` 或 `charts.html`，点击「选择 Excel 文档」上传你的 xlsx 即可。

## 部署到 Cloudflare Pages（跨电脑访问）

代码已推送到：**https://github.com/hupenghui0610/QBT-DataVisualization**

1. **在 Cloudflare 绑定 Git 并发布**
   - 登录 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
   - 选择 **GitHub**，授权后选择仓库 **hupenghui0610/QBT-DataVisualization**。
   - **Build settings**：
     - Framework preset: **None**
     - Build command: 留空
     - Build output directory: **`/`**
   - 点击 **Save and Deploy**。

3. **访问网站**
   - 部署完成后会得到地址：`https://qbt-datavisualization.pages.dev`（或你自定义的项目名）。
   - 任意电脑打开该链接即可上传 Excel 查看图表。

## 可选：自定义域名

在 Pages 项目 → **Custom domains** 中添加你自己的域名即可。
