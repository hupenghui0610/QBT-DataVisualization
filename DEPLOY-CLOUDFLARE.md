# 直接部署到 Cloudflare Pages

## 方式一：命令行部署（需本机可访问 api.cloudflare.com）

1. **登录 Cloudflare**（只需做一次）  
   在项目目录执行：
   ```bash
   npx wrangler login
   ```
   浏览器会打开，用你的 Cloudflare 账号登录并授权。

2. **执行部署**
   ```bash
   npm run deploy
   ```
   或手动：
   ```bash
   node scripts/prepare-dist.js
   npx wrangler pages deploy dist --project-name=qbt-datavisualization
   ```

3. **首次部署**  
   若项目不存在，Wrangler 会提示创建；按提示输入或确认即可。部署成功后会给出页面地址，例如：  
   `https://qbt-datavisualization.pages.dev`

---

## 方式二：在 Cloudflare 后台创建 Pages 项目

1. 打开 **https://dash.cloudflare.com**，登录你的 Cloudflare 账号。
2. 左侧菜单点 **Workers & Pages**，再点 **Create** → **Pages**。
3. 创建或选择你的项目来源后，配置构建设置（本项目是纯静态，无需构建）：
   - **Production branch**：`main`（默认即可）
   - **Framework preset**：选 **None**
   - **Build command**：留空
   - **Build output directory**：填 **`/`** 或留空（表示直接使用仓库根目录作为站点根目录）
4. 点 **Save and Deploy**，等第一次部署完成。

站点地址在项目详情里可见，一般为：**https://qbt-datavisualization.pages.dev**（若之前用命令行已创建过同名项目，会复用该项目）。

---

若部署时报错「Unable to resolve Cloudflare's API hostname」，说明本机访问 Cloudflare API 被限制，请用 **方式二** 在浏览器里连接 Git 部署。

---

## 登录功能（D1 + Pages Functions）

本仓库根目录包含 `functions/`（`/api/auth/*`）与 `migrations/`，需 **D1 数据库** 与 **`JWT_SECRET`** 环境变量。

### 1. 创建 D1 并执行迁移

```bash
npx wrangler d1 create qbt-auth
```

将输出的 `database_id` 填入根目录 [`wrangler.toml`](wrangler.toml) 中的 `database_id = "..."`。

```bash
npx wrangler d1 execute qbt-auth --remote --file=./migrations/0001_init.sql
```

若已是存量数据库，后续新增迁移也需按顺序执行，例如登录安全表：

```bash
npx wrangler d1 execute qbt-auth --remote --file=./migrations/0002_login_security.sql
```

（亦可用 `wrangler d1 migrations apply` 管理迁移；首次建表用 `execute --file` 最直观。）

**插入用户（示例）**：用 Node 生成密码哈希后写入 D1（勿将明文密码提交到仓库）：

```bash
node scripts/hash-password.mjs "初始密码"
```

将输出的哈希用于 `INSERT INTO users (name, phone, password_hash, token_version, is_admin) VALUES (...);`，管理员账号设置 `is_admin = 1`。

### 2. 绑定 D1 与密钥（Pages）

在 Cloudflare 控制台打开 **Workers & Pages** → 你的 Pages 项目 → **Settings** → **Functions**：

- **D1 database bindings**：Variable name 填 **`DB`**，选择数据库 `qbt-auth`。
- **Environment variables**（Production）：添加 **`JWT_SECRET`**，值为足够长的随机字符串（仅保存在控制台，勿写入仓库）。

或使用 Wrangler：

```bash
npx wrangler pages secret put JWT_SECRET --project-name=qbt-datavisualization
```

### 3. 部署时注意 Functions 与静态资源

- 命令行部署：在仓库根目录执行 `npm run deploy`（会先 `prepare-dist.js`，把 `js/` 打进 `dist/`）。**需在含 `functions/` 与 `wrangler.toml` 的根目录执行**，以便 Pages 带上 Functions。
- Git 连接部署：建议 **Build command** 填 `node scripts/prepare-dist.js`，**Build output directory** 填 **`dist`**，这样线上入口与本地 CLI 一致，且 `functions/` 仍在仓库根目录可被 Cloudflare 识别。

### 4. 新增账号

通过 Cursor 对话生成哈希与 `INSERT` SQL，在本机执行 `wrangler d1 execute --remote` 写入；勿使用已废弃的源码内明文密码。

### 5. 飞书日销在线表格（可选）

登录后页面会请求 `GET /api/data/feishu-daily-sales`，由 Pages Functions 使用飞书开放平台读取电子表格，**App Secret 仅保存在服务端**。

**飞书开放平台（一次性）**

1. 打开 [飞书开放平台](https://open.feishu.cn/) 创建企业自建应用，在「权限」中开通**电子表格**读取类能力（名称以控制台为准，如 `sheets:spreadsheet` 等），创建版本并发布。
2. 在管理后台安装应用到目标企业，并确保应用能访问目标表格（例如将应用加为文档协作者，以飞书文档说明为准）。

**Cloudflare Pages 环境变量**

在 **Workers & Pages** → 项目 → **Settings** → **Environment variables**（Production）中新增：

| 变量名 | 说明 |
|--------|------|
| `FEISHU_APP_ID` | 应用 App ID |
| `FEISHU_APP_SECRET` | 应用 Secret（建议仅控制台保存，勿写入仓库） |
| `FEISHU_SPREADSHEET_TOKEN` | （可选）表格 token，默认与代码中示例一致 |
| `FEISHU_SHEET_RANGE` | （可选）读取范围，如 `0VWscb!A1:Z20000`；若写成 `…Z500` 则第 501 行起不会被 API 返回 |

### 行业数据默认源（大盘 / 品牌）

登录后请求：

- `GET /api/data/features-output`：行业大盘，默认读取目标飞书表的 **sheet1**
- `GET /api/data/features-brand-top10`：行业品牌，默认读取目标飞书表的 **sheet2**

两者都会在服务端实时读取飞书后，复用原有清洗/聚合逻辑生成与历史 JSON **相同结构**的数据，因此前端页面无需改接口地址。

建议在 **Workers & Pages → 项目 → Settings → Environment variables** 中配置：

| 变量名 | 说明 |
|--------|------|
| `FEISHU_INDUSTRY_SPREADSHEET_TOKEN` | 行业数据所在电子表 token（同一本表，sheet1=大盘，sheet2=品牌）。 |
| `FEISHU_INDUSTRY_DAPAN_RANGE` | （可选）大盘读取范围；默认自动解析第 1 个 sheet，范围 `A1:E20000`。 |
| `FEISHU_INDUSTRY_BRAND_RANGE` | （可选）品牌读取范围；默认自动解析第 2 个 sheet，范围 `A1:G20000`。 |

若不配 `*_RANGE`，接口会先查询该电子表的工作表列表，再按 UI 顺序取前两张 sheet。

也可使用 Wrangler 写入敏感项（勿提交到 git）：

```bash
npx wrangler pages secret put FEISHU_APP_SECRET --project-name=qbt-datavisualization
```

非敏感项（如 `FEISHU_APP_ID`）在控制台以明文变量配置即可。若未配置 `FEISHU_APP_ID` / `FEISHU_APP_SECRET`，接口返回 503，前端会静默跳过（`window.__QBT_FEISHU_DAILY_SALES__` 为 `null`）。

### 直播间转化漏斗 `feishu-livestream-funnel`

登录后请求 `GET /api/data/feishu-livestream-funnel`。读取 wiki 中 **sheet4**（`sheet=fBPMjm`）范围，列 **B** 主播昵称、**H/K/X/Y** 曝光/观看/点击/成交订单；按昵称汇总后供「新零售」页下拉筛选。

| 变量名 | 说明 |
|--------|------|
| `FEISHU_LIVESTREAM_FUNNEL_SPREADSHEET_TOKEN` | （可选）默认与 [`feishu-douyin-daily-trend`](functions/api/data/feishu-douyin-daily-trend.js) 同源 wiki 表 token `P1zusUMg2haMGctskH6cydLqn5e`；若 sheet4 在**另一本**电子表中再覆盖。 |
| `FEISHU_LIVESTREAM_FUNNEL_RANGE` | （可选）默认 `fBPMjm!A1:Z20000`（含 Z 列直播间 GMV）。 |

未设置时接口使用代码与 [`wrangler.toml`](wrangler.toml) `[vars]` 中的默认值；仅当表迁移到其它 token 时需改环境变量。

**本地 / 跨域**：若从 `localhost`、局域网 IP 或 `file://` 打开页面，请求会发到 `https://qbt-datavisualization.pages.dev`（见 [`js/auth-client.js`](js/auth-client.js) `REMOTE_API_ORIGIN`）。鉴权失败等响应若 **未带 CORS 头**，浏览器会报 `Failed to fetch`。已在 [`functions/_lib/session.js`](functions/_lib/session.js) 为鉴权错误统一附加 `Access-Control-Allow-Origin`；**请重新部署 Functions** 后重试。

### 6. 天猫 GMV 合并接口 `feishu-gmv-combined`

登录后请求 `GET /api/data/feishu-gmv-combined`。除 `FEISHU_APP_ID`、`FEISHU_APP_SECRET` 外，**天猫表**相关变量在 **Workers & Pages → 项目 → Settings → Environment variables** 中配置。

| 变量名 | 说明 |
|--------|------|
| `FEISHU_TMALL_SPREADSHEET_TOKEN` | （可选）天猫在线表 token。未配置则用代码内默认。 |
| `FEISHU_TMALL_GMV_RANGE` | （可选）**首 sheet** 读取范围。服务端会在 G 列仅到 `G` 时扩展到 `H`（GSV），并保证右边界至少到 **N 列**（GMV：学习机 **K**、亲子屏 **M**；GSV：学习机 **L**、亲子屏 **N**）。若你在控制台写死 `…A1:H…`，会自动扩到至少 `…A1:N…`。 |

**京东表**：无需额外变量；接口会按飞书 sheet 的 `index` 排序后取第 1、2 个 tab 的 `A1:G20000`（GSV 学习机/亲子屏用 **G 列**），第三张表仍用于 GMV/GSV 店铺口径。

接口返回的 `tmallValuesMeta` 中含 `kColumnStatsMerged` / `mColumnStatsMerged` / `lColumnStatsMerged` / `nColumnStatsMerged`（K/M/L/N 列公式是否解析到数字），便于排查。

### 7. 达播服务商趋势 `feishu-channel-order-trend`

登录后请求 `GET /api/data/feishu-channel-order-trend`（新零售 tab「达播服务商趋势图」）。服务端**每次请求实时读取飞书**渠道映射表与订单明细并聚合，不经过 D1。

**聚合口径（与前端折线图一致）**：渠道映射表（`FEISHU_CHANNEL_MAP_RANGE`，默认 `ghju03!A1:E2000`，飞书里可能显示为 sheet4 等）**A 列为渠道名、E 列为达人 ID**。**E 列达人 ID 若为空则整行跳过**，不参与「达人 → 渠道」映射；订单明细表（默认 `tuec5U!I1:AO…`）**达人 ID 在 AO 列**；**AH 列为业务日**，飞书可能返回 Excel 序列（数字）或「2026/1/1 22:18:14」类字符串，服务端均会解析为日历日。与渠道表 E 列匹配后按日汇总金额（剔除「已关闭」）。

除 `FEISHU_APP_ID`、`FEISHU_APP_SECRET` 外，可在 **Environment variables** 中覆盖下表。

| 变量名 | 说明 |
|--------|------|
| `FEISHU_CHANNEL_ORDER_SPREADSHEET_TOKEN` | （可选）电子表 token，默认与代码内抖音 wiki 同源表一致。 |
| `FEISHU_CHANNEL_MAP_RANGE` | （可选）渠道映射表范围，默认 `ghju03!A1:E2000`。 |
| `FEISHU_ORDER_DETAIL_RANGE` | （可选）订单明细范围。默认 **`tuec5U!I1:AO20000`**（读 I～AO，达人 ID 在 **AO** 列；行数过小会漏单）。若仍使用 **`A1:AO…`** 全宽起始，服务端会自动按全表列下标解析。 |
| `FEISHU_CHANNEL_ORDER_SKIP_ROWS` | （可选）跳过的表头行数，默认 `1`。 |
| `FEISHU_CHANNEL_ORDER_VALUE_RENDER` | （可选）订单表 `value_render_option`：默认 **`UnformattedValue`**（减轻飞书计算）；若金额/公式异常，设为 **`FormattedValue`**。亦支持 `ToString`。 |
| `FEISHU_CHANNEL_ORDER_CACHE_TTL_SEC` | （可选）服务端 **Cache API** 缓存秒数，默认 **`120`**；设为 **`0`** 可关闭缓存。缓存按登录用户 + 上述 range 等维度区分，命中时响应头含 `X-QBT-Channel-Order-Trend-Cache: HIT`。 |

### 8. 抖音型号分布 `feishu-douyin-model-distribution`

登录后请求 `GET /api/data/feishu-douyin-model-distribution`（新零售「DP-型号分布」「达人-型号分布」）。服务端读取 **sheet3** 关键词→型号映射，以及**订单宽表**（须含 **C 商品名、E 商品数量**（按行累加到型号）、**AH 日、AK 状态、AO 达人**；统计量为数量而非 I 列金额）。**E 列可为文本格式数字**，接口会解析千分位、全角数字及首尾空白后再累加。

本项为 Functions 代码逻辑，**无需**在 Cloudflare 上新增环境变量。

| 变量名 | 说明 |
|--------|------|
| `FEISHU_DOUYIN_MODEL_ORDER_RANGE` | （可选）**仅用于本接口**的订单表范围，须从 **A/B/C 列起** 以包含商品名。默认与代码一致：`tuec5U!A2:AO20000`。未设置时回退为 `FEISHU_ORDER_DETAIL_RANGE`（若仍为 `I1:AO…` 则**不含 C 列**，接口会 400）。 |
| `FEISHU_DP_CUTOVER_DATE` | （可选）特殊达人 ID 切分日，默认 `2026-04-01`，与接口代码一致时可不配置。 |

**仓库内已写入**：根目录 [`wrangler.toml`](wrangler.toml) 的 `[vars]` 中配置了 `FEISHU_DOUYIN_MODEL_ORDER_RANGE`。使用 **`npm run deploy`** 或 **`npx wrangler pages deploy dist --project-name=qbt-datavisualization`** 部署时，该变量会进入 Pages Functions 环境。若你**仅用 Cloudflare 控制台连 Git 部署**且发现变量未生效，请在 **Settings → Environment variables** 中手动添加同名变量，或确认构建能读取仓库根目录的 `wrangler.toml`（本项目已包含该文件）。

### 9. OpenClaw 月度累计达成摘要 `monthly-cumulative-summary`

对外给 OpenClaw 使用的专用接口：

- `GET /api/data/monthly-cumulative-summary`

此接口**不走网页登录**，改为使用查询参数签名：

- `yearMonth`
- `key`
- `ts`
- `nonce`
- `sig`

Cloudflare Pages 需配置：

| 变量名 | 说明 |
|--------|------|
| `OPENCLAW_MONTHLY_API_KEY` | OpenClaw 请求该接口时使用的 key |
| `OPENCLAW_MONTHLY_API_SECRET` | 用于 HMAC-SHA256 签名校验的 secret |
| `OPENCLAW_INTERNAL_USER_ID` | 服务端内部调用现有登录接口时使用的用户 ID，建议填一个管理员账号 ID |

签名原文固定为：

```text
GET
/api/data/monthly-cumulative-summary
{yearMonth}
{ts}
{nonce}
{key}
```

服务端会校验：

- `ts` 在 5 分钟有效窗口内
- `sig = HMAC_SHA256_HEX(secret, 原文)`

返回 JSON 中已包含：

- 汇总字段
- 渠道明细字段
- 固定格式消息 `message`

OpenClaw skill 应直接发送 `message`，不要自行改写。

仓库内 project skill 位于：

- [`.cursor/skills/openclaw-monthly-cumulative-feishu/SKILL.md`](.cursor/skills/openclaw-monthly-cumulative-feishu/SKILL.md)
- [`.cursor/skills/openclaw-monthly-cumulative-feishu/reference.md`](.cursor/skills/openclaw-monthly-cumulative-feishu/reference.md)
