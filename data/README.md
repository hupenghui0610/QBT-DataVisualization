# 默认数据目录

本目录用于存放页面打开时**自动加载**的默认数据。部署后或通过本地服务器打开时，页面会通过 `fetch` 加载 JSON；**本地直接双击打开 index.html（file://）时**，因浏览器安全限制无法 fetch 本地文件，页面会改用同目录下的 `default-data.js` 中嵌入的数据。

## 所需文件

| 文件名 | 说明 | 生成方式 |
|--------|------|----------|
| `features-output.json` | 大盘数据 | `node extract-features.js "电商大盘及竞争数据-情报通.xlsx" data/features-output.json` |
| `features-brand-top10.json` | 分品牌数据 | `node extract-features-brand-top10.js "情报通-三站分品牌分价格销量销售额.xlsx" data/features-brand-top10.json` |
| `default-data.js` | 嵌入用脚本（供本地 file:// 打开） | 生成好上述两个 JSON 后，在项目根目录执行：`node embed-default-data.js` |

将 `features-output.json`、`features-brand-top10.json` 与 `default-data.js` 一并部署即可。若缺少某文件，页面会提示「未加载默认 xxx 数据」，用户仍可通过页面上传 Excel/JSON。
