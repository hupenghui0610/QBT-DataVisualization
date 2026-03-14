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
   npx wrangler pages deploy dist --project-name=QBT-DataVisualization
   ```

3. **首次部署**  
   若项目不存在，Wrangler 会提示创建；按提示输入或确认即可。部署成功后会给出页面地址，例如：  
   `https://qbt-datavisualization.pages.dev`

---

## 方式二：在 Cloudflare 后台用 Git 部署（不依赖本机网络到 Cloudflare API）

若你当前网络无法解析 `api.cloudflare.com`（公司网络、DNS 限制等），可以用「连 Git」的方式，在 Cloudflare 后台完成部署：

1. 打开 https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
2. 选择 **GitHub**，授权后选择仓库 **hupenghui0610/QBT-DataVisualization**。
3. **Build settings**：
   - Framework preset: **None**
   - Build command: 留空
   - Build output directory: **`/`**
4. 点击 **Save and Deploy**。

之后每次 `git push` 到该仓库，Cloudflare 会自动重新部署；访问地址会在该 Pages 项目里显示（如 `https://qbt-datavisualization.pages.dev`）。

---

若部署时报错「Unable to resolve Cloudflare's API hostname」，说明本机访问 Cloudflare API 被限制，请用 **方式二** 在浏览器里连接 Git 部署。
