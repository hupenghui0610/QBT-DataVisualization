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

## 方式二：在 Cloudflare 后台用 Git 连仓库（推荐，push 即自动部署）

1. 打开 **https://dash.cloudflare.com**，登录你的 Cloudflare 账号。
2. 左侧菜单点 **Workers & Pages**，再点 **Create** → **Pages** → **Connect to Git**。
3. 选 **GitHub**（或 GitHub 图标），按提示授权 Cloudflare 访问你的 GitHub。若已授权过，会直接进入选仓库。
4. 在仓库列表里选 **hupenghui0610/QBT-DataVisualization**（可搜索 `QBT`）。
5. 配置构建设置（本项目是纯静态，无需构建）：
   - **Production branch**：`main`（默认即可）
   - **Framework preset**：选 **None**
   - **Build command**：留空
   - **Build output directory**：填 **`/`** 或留空（表示直接使用仓库根目录作为站点根目录）
6. 点 **Save and Deploy**，等第一次部署完成。

之后每次往该仓库 **push**（例如 `git push origin main`），Cloudflare 会自动重新部署。  
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
