# 邮箱验证码登录（Cloudflare Worker）

站点登录已改为：**白名单邮箱 + 邮件验证码**，验证成功后浏览器 **localStorage** 保存会话令牌（约 **30 天**），同一浏览器再次打开无需重复收信。

## 已在本机完成的配置

| 项目 | 状态 |
|------|------|
| **KV 命名空间（生产）** | 已创建，`id` 已写入 `wrangler.toml` |
| **KV 预览（本地 dev）** | 已创建，`preview_id` 已写入 `wrangler.toml` |
| **Worker 部署地址** | `https://qbt-ai-assistant.hupenghui1993.workers.dev` |
| **前端 `WORKER_API_URL`** | `index.html` / `charts.html` 已填好上述地址 |

## 仍需你本地执行一次（密钥不能代填）

以下密钥**不会**出现在仓库里，需你在本机终端执行（交互式粘贴）：

1. **Resend**（https://resend.com）创建 API Key 后：

```bash
cd worker
npx wrangler secret put RESEND_API_KEY
```

2. **白名单邮箱**（逗号分隔、小写与否均可，服务端会规范化）：

```bash
npx wrangler secret put ALLOWED_EMAILS
# 粘贴示例：zhang@company.com,li@company.com
```

3. **通义千问**（若使用 AI 助手）：

```bash
npx wrangler secret put DASHSCOPE_API_KEY
```

配置完成后可再执行 `npx wrangler deploy`（改密钥后一般会自动生效，也可手动部署）。

---

## 本地开发（可选）

将 `worker/.dev.vars.example` 复制为 `worker/.dev.vars` 并填写同上变量名，然后：

```bash
cd worker
npx wrangler dev
```

`.dev.vars` 已加入 `.gitignore`。

---

## 历史：手动创建 KV（若需在新账号重建）

```bash
cd worker
npx wrangler kv namespace create "QBT_AUTH"
```

将输出中的 `id` 填入 `wrangler.toml` 里 `[[kv_namespaces]]` 的 `id = "..."`。

## 发件人 `FROM_EMAIL`（wrangler.toml 的 `[vars]`）

- 测试：可用 Resend 的 `onboarding@resend.dev`（以 Resend 当前文档为准）。
- 正式：在 Resend 验证域名后，改为 `noreply@你的域名`，并 `npx wrangler deploy`。

## 静态页部署

根目录执行 `node scripts/prepare-dist.js` 后，将 `dist/` 同步到 EdgeOne / Cloudflare Pages。Worker 地址已写入 HTML，一般无需再改。

## 安全说明

- 会话令牌存于 **localStorage**，清除站点数据或换浏览器需重新验证。
- 白名单与发信密钥均在 **Worker 环境**，勿写入前端仓库。
- 若需「退出登录」，可在页面增加清除 `localStorage` 中 `qbt_auth_token` 的按钮（当前未加，可自行扩展）。
