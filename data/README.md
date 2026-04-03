# 数据目录

本目录仅保留前端静态资源或非敏感辅助文件。

当前“行业数据”的大盘与品牌数据已改为**登录后直接读取飞书表并由服务端实时生成**，不再使用本地 Excel 转 JSON、`default-data.js` 嵌入回退或静态默认数据文件。

本地调试建议：

- 在仓库根目录启动静态 HTTP 服务，如 `npx serve .`
- 使用 `http://127.0.0.1:端口/index.html` 或 `http://localhost:端口/`
- 登录后通过 `/api/data/features-output` 与 `/api/data/features-brand-top10` 拉取实时数据

如需联调其它预览环境，可在本地页面控制台设置：

- `localStorage.setItem('QBT_API_ORIGIN','https://你的预览站.pages.dev')`

线上正式域名访问时不会读取该项。
