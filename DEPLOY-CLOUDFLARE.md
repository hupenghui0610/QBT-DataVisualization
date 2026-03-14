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
