# QBT-DataVisualization 账号体系对接环境说明（给开发/验收 AI）

以下依据仓库内 [`wrangler.toml`](wrangler.toml)、[`wrangler.test.toml`](wrangler.test.toml)、[`js/auth-client.js`](js/auth-client.js)、[`DEPLOY-CLOUDFLARE.md`](DEPLOY-CLOUDFLARE.md) 整理。**行为以《账号体系需求规格-复刻用》/《账号体系-AI实施交付包》为准。**

---

## 1. 生产 / 测试 / 本地的 API 根 URL 与前端覆盖方式

| 环境 | 公开 Pages 域名（API 同源根） | 说明 |
|------|------------------------------|------|
| **生产** | `https://qbt-datavisualization.pages.dev` | 与 [`js/auth-client.js`](js/auth-client.js) 中 `REMOTE_API_ORIGIN` 默认值一致；若绑定自定义域，以 Cloudflare 控制台实际为准。 |
| **测试** | `https://qbt-datavisualization-test.pages.dev` | 见 [`wrangler.test.toml`](wrangler.test.toml)、[`项目技术说明.md`](项目技术说明.md)。 |
| **本地浏览器** | 同上生产 URL（默认） | 当页面为 `file://` / `localhost` / 局域网 IP 时，`getApiBase()` **非空**，请求发到 `REMOTE_API_ORIGIN`，除非在控制台设置 **`localStorage['QBT_API_ORIGIN']`** 为其他 **https** 根（如预览环境、测试站）。 |
| **与 Pages 同源打开** | `''`（相对路径） | 页面与 API 同 host 时 `getApiBase()` 返回空字符串，请求走当前站点 `/api/*`。 |

**MarketingProfitCalculator（或同类项目）方案 A**：前端把 API 根固定为上述**生产或测试**域名之一，或沿用 `auth-client` 逻辑 + `QBT_API_ORIGIN` 切换环境。**不要**混用生产库与测试库 token（两环境 **JWT_SECRET 与 D1 均独立**）。

---

## 2. D1：`database_id`、binding、display name；多项目是否共用

**生产**（[`wrangler.toml`](wrangler.toml)）：

```toml
[[d1_databases]]
binding = "DB"
database_name = "qbt-auth"
database_id = "8e33f508-e226-4040-a4ba-df1754713733"
```

**测试**（[`wrangler.test.toml`](wrangler.test.toml)）：

```toml
[[d1_databases]]
binding = "DB"
database_name = "qbt-auth-test"
database_id = "d4ba5d46-53b6-4eac-9a42-a15a5a268ad0"
```

- **Binding 名称**：均为 **`DB`**（Pages Functions 里 `env.DB`）。  
- **生产与测试是两个不同的 `database_id`**，用户数据不互通。  
- **方案 B「多站共用同一用户库」**：各 Cloudflare 项目须在各自 `wrangler` 中绑定**同一个** `database_id`，且 **`JWT_SECRET` 相同**；当前仓库**仅**描述单项目绑定，若独立部署 Functions，需在控制台为该项目添加同名 binding 指向目标库。

---

## 3. 环境变量：`JWT_SECRET`、`ALLOWED_ORIGINS` 挂在哪、生产/预览是否分开

- **`JWT_SECRET`**：**不**写在提交的 `wrangler.toml` 中；按 [`DEPLOY-CLOUDFLARE.md`](DEPLOY-CLOUDFLARE.md) 在 **Cloudflare Workers & Pages → 对应 Pages 项目 → Settings → Variables / Secrets** 配置（或使用 `wrangler pages secret put JWT_SECRET --project-name=...`）。**生产与测试是两个 Cloudflare 项目**，若仅在控制台分别配置，密钥可以不同。**本仓库**用 `scripts/deploy-pages-*.js` 时，从同一 `.env.deploy.local`（或同一 `JWT_SECRET` 环境变量）注入，**约定正式与测试使用同一 JWT_SECRET**；**D1 仍各绑各库**（`qbt-auth` / `qbt-auth-test`），用户数据不互通。  
- **`ALLOWED_ORIGINS`**：可选；在 [`wrangler.toml`](wrangler.toml) 中有注释示例，**实际以控制台 Environment variables 为准**（Production / Preview 可分别配置）。实现见 [`functions/_lib/http.js`](functions/_lib/http.js) `resolveCorsOrigin`。  
- **CORS 允许的 Origin**：生产已在 [`wrangler.toml`](wrangler.toml) 配置 **`ALLOWED_ORIGINS`**（含本站与常见本地开发端口；**新项目正式 https 域名上线后须追加**，见 [上线检查清单-多项目共用账号.md](上线检查清单-多项目共用账号.md)）。须为**逗号分隔的完整 Origin**（含 `https` 与端口）。**未配置**时行为与旧版兼容（按请求 Origin 回显或 `*`）。  
- **仓库未提交 Cloudflare Account ID**；需在仪表盘查看。

---

## 4. Token 与客户端

- **localStorage 键名**：**`xbs_token`**（[`js/auth-client.js`](js/auth-client.js) 中 `TOKEN_KEY`）。  
- **请求头**：`Authorization: Bearer <token>`，且需鉴权的请求带 `Content-Type: application/json`（与现网一致）。  
- **API 根覆盖键**：`localStorage['QBT_API_ORIGIN']`（仅 `isLocalPageOrigin()` 为真时参与 `getApiBase()`）。

---

## 5. 迁移与表结构

- **账号相关**：仓库提供 [`migrations/0001_init.sql`](migrations/0001_init.sql)（`users`、`access_logs`）、[`migrations/0002_login_security.sql`](migrations/0002_login_security.sql)（`login_security_events`、`login_security_blocks`）。部署说明推荐对远程库执行：  
  `wrangler d1 execute <database_name> --remote --file=./migrations/0001_init.sql` 等。  
- **额外**：另有 [`migrations/0003_cache_system.sql`](migrations/0003_cache_system.sql) 等，属**缓存等业务**，与账号登录无强绑定；若只对接账号，**至少 0001 + 0002**。若你方 D1 已手工改过表，以实际为准并与 `functions` 查询字段对齐。

---

## 6. 接入新项目时的检查清单（建议打印）

1. **选定环境**：生产或测试 API 根、对应 D1、对应 **`JWT_SECRET`（与该项目一致）**。  
2. **方案 A**：前端请求指向该 API 根；跨域则 **Cloudflare 上配置 `ALLOWED_ORIGINS` 含新业务站 Origin**。  
3. **方案 B**：各站 `wrangler` 绑定**同一 `database_id`** + 各站 **`JWT_SECRET` 相同** + Functions 代码版本对齐。  
4. **接口方法**：`/api/auth/ping` 为 **POST**（非 GET）；`/api/auth/login`、`/api/auth/change-password` 为 POST。  
5. **Token 键名**：若要与现网一致，使用 **`xbs_token`** + **Bearer**。  
6. **验收**：登录返回 `token` + `user`；改密后旧 token 失效；管理员接口需 `is_admin`。

---

## 7. 本机 Wrangler 连远程 D1 的常用命令与注意点

- **执行迁移/查数（远程）**：  
  `npx wrangler d1 execute qbt-auth --remote --file=./migrations/0001_init.sql`  
  （数据库名以你 `wrangler` 中 `database_name` 为准；测试库用 `qbt-auth-test`。）  
- **前提**：本机已 `wrangler login`，API Token 需含 **D1 编辑** 与 **Account** 权限（以 Cloudflare 文档为准）。  
- **只读 vs 写入**：`execute` 可跑只读 SQL；`INSERT/UPDATE` 会改生产/测试数据，**先在测试库验证**。  
- **本地 dev**：`wrangler pages dev` 可使用本地 D1 绑定；与远程数据分离，勿与「连 `--remote`」混淆。

---

## 8. 与《账号相关需求描述》文档的关系

- 完整业务与 UI：[账号体系需求规格-复刻用.md](账号体系需求规格-复刻用.md)、[账号体系-AI实施交付包.md](账号体系-AI实施交付包.md)。  
- 多域与验收步骤：[多域名共用账号-部署说明.md](多域名共用账号-部署说明.md)、[验证与接入指南.md](验证与接入指南.md)。

---

*对接方请整份复制本文；并在实施前**选定**使用生产或测试 API 根，勿混用两套环境的 Token 与用户数据。*
