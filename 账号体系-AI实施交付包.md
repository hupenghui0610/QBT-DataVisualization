# 账号体系 AI 实施交付包（单文档版）

**用途**：将本文档**整份**发给负责实现的 AI 或工程师，在目标项目中复刻 **QBT-DataVisualization** 的账号能力，并使 **登录页、登录后左上角用户信息条、修改密码与管理员相关弹窗** 的 **布局与视觉样式** 与参考实现一致。

**优先级**：  
1）**视觉**：下列「设计令牌」与「账号相关 CSS」「HTML 结构」须一致（类名、颜色、间距、圆角、z-index）。  
2）**行为**：下列「前端交互要点」「后端与 API」须一致。  
3）目标栈可为任意 HTTPS 后端；若用 Cloudflare Pages + D1，可直接对齐下文 DDL 与环境变量。

---

## 一、给实现者的硬性要求

1. **登录门** `#auth-gate`：全屏遮罩 + 居中白卡片；背景为深蓝紫渐变，卡片圆角 12px、主按钮色 `#4a69bd`。  
2. **用户信息条** `.user-session-bar`：位于**页面主标题区域左上角**（`position: absolute; left: 0; top: 0`），父容器须 **`position: relative`**（参考下方 `.page-header`）。  
3. **弹窗** `.xbs-modal`：遮罩 + 居中白盒；改密、访问记录、登录安全、账号管理四套结构保持下文 HTML。  
4. **管理员按钮**：`账号管理` / `访问记录` / `登录安全` 默认 `display:none`，仅当 `user.is_admin === true` 时显示。  
5. **Token**：`localStorage` 键名 **`xbs_token`**；请求头 `Authorization: Bearer <token>`，`Content-Type: application/json`。  
6. **API**：`POST /api/auth/login`、`POST /api/auth/ping`、`POST /api/auth/change-password`；管理员见第六节表格。`ping` 为 **POST**，不是 GET。

---

## 二、设计令牌（须保持一致）

| 用途 | 值 |
|------|-----|
| 主色（主按钮、链接按钮文字） | `#4a69bd`；hover `#3d5aa0` |
| 标题/强调文字 | `#1a1a2e` |
| 次要说明文字 | `#64748b` |
| 正文灰 | `#334155` |
| 边框/输入框 | `#ddd` |
| 用户条按钮边框 | `#c5cee8`；hover 背景 `#f0f3fb` |
| 错误文案 | `#c0392b` |
| 登录页背景渐变 | `linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)` |
| 弹窗遮罩 | `rgba(0,0,0,0.45)` |
| 卡片阴影（登录盒） | `0 20px 60px rgba(0,0,0,0.3)` |
| 弹窗盒阴影 | `0 20px 60px rgba(0,0,0,0.25)` |
| 圆角（卡片/输入/主按钮） | `8px`～`12px` |
| z-index | 登录门 `10001`；全局 loading `10000`；弹窗 `10002` |

---

## 三、账号相关 CSS（请原样使用，可与全局样式合并）

以下从参考实现提取；**类名请勿随意改名**，便于与设计稿及验收对照。

```css
/* 主标题区：供左上角用户条绝对定位 */
.page-header {
  position: relative;
  text-align: center;
  margin-bottom: 20px;
  padding-right: 0;
}

#auth-gate {
  position: fixed;
  inset: 0;
  z-index: 10001;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}
#auth-gate .auth-box {
  background: #fff;
  border-radius: 12px;
  padding: 24px 30px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  width: 50%;
  max-width: 360px;
  min-width: 240px;
  box-sizing: border-box;
}
#auth-gate .auth-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0 0 12px 0;
  text-align: center;
}
#auth-gate .auth-hint {
  font-size: 12px;
  color: #64748b;
  text-align: center;
  margin: 0 0 12px 0;
  line-height: 1.45;
}
#auth-gate .auth-error {
  font-size: 13px;
  color: #c0392b;
  margin-top: 12px;
  text-align: center;
  display: none;
}
#auth-gate .auth-error.show {
  display: block;
}
#auth-gate input[type="password"],
#auth-gate input[type="tel"] {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 15px;
  margin-bottom: 12px;
  box-sizing: border-box;
}
#auth-gate input[type="password"] {
  margin-bottom: 15px;
}
#auth-gate button {
  width: 100%;
  padding: 9px 15px;
  background: #4a69bd;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  cursor: pointer;
  font-family: inherit;
}
#auth-gate button:hover {
  background: #3d5aa0;
}

.user-session-bar {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 6;
  display: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  font-size: 13px;
  color: #334155;
  max-width: calc(100% - 130px);
  text-align: left;
}
.user-session-bar .user-display-name {
  font-weight: 600;
  color: #1a1a2e;
}
.user-session-btn {
  padding: 4px 10px;
  font-size: 12px;
  color: #4a69bd;
  background: #fff;
  border: 1px solid #c5cee8;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
}
.user-session-btn:hover {
  background: #f0f3fb;
}

.xbs-modal {
  position: fixed;
  inset: 0;
  z-index: 10002;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
}
.xbs-modal.show {
  display: flex;
}
.xbs-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
}
.xbs-modal-box {
  position: relative;
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  min-width: 280px;
  max-width: 520px;
  width: 100%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}
.xbs-modal-box h3 {
  margin: 0 0 16px 0;
  font-size: 1.1rem;
  color: #1a1a2e;
}
.xbs-modal-heading-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 16px 0;
  flex-wrap: wrap;
}
.xbs-modal-heading-row h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #1a1a2e;
}
.xbs-modal-hint {
  font-size: 13px;
  color: #64748b;
  white-space: nowrap;
  flex-shrink: 0;
}
.xbs-modal-box input[type="password"] {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 10px;
  font-size: 14px;
  box-sizing: border-box;
}
.xbs-modal-error {
  font-size: 13px;
  color: #c0392b;
  margin: 0 0 10px 0;
  min-height: 1.2em;
}
.xbs-modal-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.xbs-modal-actions button {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  font-family: inherit;
  border: none;
}
.xbs-modal-actions .primary {
  background: #4a69bd;
  color: #fff;
}
.xbs-modal-actions .secondary {
  background: #e2e8f0;
  color: #334155;
}
.admin-logs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.admin-logs-table th,
.admin-logs-table td {
  padding: 8px;
  border-bottom: 1px solid #eef2f7;
  text-align: left;
  vertical-align: top;
}
.admin-access-logs-table {
  table-layout: auto;
}
.admin-access-logs-table th:nth-child(1),
.admin-access-logs-table td:nth-child(1) {
  max-width: 8em;
}
.admin-access-logs-table th:nth-child(2),
.admin-access-logs-table td:nth-child(2) {
  white-space: nowrap;
}
.admin-access-logs-table th:nth-child(3),
.admin-access-logs-table td:nth-child(3) {
  white-space: nowrap;
  min-width: 10.5em;
}
.admin-access-logs-table th:nth-child(4),
.admin-access-logs-table td:nth-child(4) {
  white-space: nowrap;
  font-family: ui-monospace, 'Cascadia Mono', 'Consolas', monospace;
  font-size: 11px;
}
.admin-logs-wrap {
  max-height: min(60vh, 400px);
  overflow: auto;
  margin-top: 12px;
}
.admin-logs-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  gap: 12px;
  font-size: 13px;
  color: #64748b;
  flex-wrap: wrap;
}
.admin-logs-pager button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.admin-users-wrap {
  max-height: min(50vh, 320px);
  overflow: auto;
  margin-top: 12px;
}
.xbs-modal-box .admin-users-add {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #e2e8f0;
}
.xbs-modal-box .admin-users-add h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #334155;
  font-weight: 600;
}
.xbs-modal-box .admin-users-add input[type="text"],
.xbs-modal-box .admin-users-add input[type="tel"],
.xbs-modal-box .admin-users-add input[type="password"] {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 10px;
  font-size: 14px;
  box-sizing: border-box;
}

/* 移动端：与参考实现一致时可加上（根节点需有 class mobile-client 等效判断） */
html.mobile-client .page-header {
  margin-bottom: 14px;
  padding-top: 32px;
}
html.mobile-client .user-session-bar {
  max-width: 72%;
  font-size: 11px;
  gap: 6px;
}
html.mobile-client #auth-gate .auth-box {
  min-width: auto;
  width: calc(100vw - 32px);
  max-width: min(420px, 100vw - 32px);
  margin: 16px;
  padding: 24px 22px;
  box-sizing: border-box;
}
html.mobile-client #auth-gate .auth-title {
  font-size: 1.25rem;
}
```

---

## 四、账号相关 HTML 结构（id / 类名保持一致）

登录门：

```html
<div id="auth-gate">
  <div class="auth-box">
    <h2 class="auth-title">希倍思内部平台</h2>
    <p class="auth-hint">暂未开放注册，如需使用请联系胡鹏辉</p>
    <input type="tel" id="auth-phone" placeholder="手机号" autocomplete="username" inputmode="numeric" />
    <input type="password" id="auth-password" placeholder="密码" autocomplete="current-password" />
    <button type="button" id="auth-submit">进入</button>
    <p class="auth-error" id="auth-error">登录失败，如需开通账号请联系管理员</p>
  </div>
</div>
```

主内容区标题栏内左上角用户条（**必须**放在带 `.page-header` 且 `position: relative` 的容器内）：

```html
<div class="page-header">
  <div class="user-session-bar" id="userSessionBar">
    <span class="user-display-name" id="userDisplayName"></span>
    <button type="button" class="user-session-btn" id="authChangePwdBtn">修改密码</button>
    <button type="button" class="user-session-btn" id="authLogoutBtn">退出登录</button>
    <button type="button" class="user-session-btn" id="adminUsersBtn" style="display:none">账号管理</button>
    <button type="button" class="user-session-btn" id="adminLogsBtn" style="display:none">访问记录</button>
    <button type="button" class="user-session-btn" id="adminSecurityBtn" style="display:none">登录安全</button>
  </div>
  <!-- 其余：站点标题、副标题、导航等 -->
</div>
```

修改密码：

```html
<div id="modalChangePwd" class="xbs-modal" aria-hidden="true">
  <div class="xbs-modal-backdrop"></div>
  <div class="xbs-modal-box">
    <h3>修改密码</h3>
    <input type="password" id="changePwdOld" placeholder="原密码" autocomplete="current-password" />
    <input type="password" id="changePwdNew" placeholder="新密码（至少 6 位）" autocomplete="new-password" />
    <input type="password" id="changePwdNew2" placeholder="确认新密码" autocomplete="new-password" />
    <p class="xbs-modal-error" id="changePwdErr"></p>
    <div class="xbs-modal-actions">
      <button type="button" class="primary" id="changePwdSubmit">确定</button>
      <button type="button" class="secondary" id="changePwdCancel">取消</button>
    </div>
  </div>
</div>
```

访问记录（管理员，宽 760px）：

```html
<div id="modalAdminLogs" class="xbs-modal" aria-hidden="true">
  <div class="xbs-modal-backdrop"></div>
  <div class="xbs-modal-box" style="max-width:760px">
    <div class="xbs-modal-heading-row">
      <h3>访问记录</h3>
      <span class="xbs-modal-hint">仅管理员可见</span>
    </div>
    <div class="admin-logs-wrap">
      <table class="admin-logs-table admin-access-logs-table">
        <thead>
          <tr><th>姓名</th><th>手机号</th><th>时间</th><th>IP</th></tr>
        </thead>
        <tbody id="adminLogsTbody"></tbody>
      </table>
    </div>
    <div class="admin-logs-pager">
      <span id="adminLogsPagerInfo"></span>
      <div>
        <button type="button" class="secondary" id="adminLogsPrev">上一页</button>
        <button type="button" class="secondary" id="adminLogsNext">下一页</button>
      </div>
    </div>
    <div class="xbs-modal-actions" style="margin-top:16px">
      <button type="button" class="primary" id="adminLogsClose">关闭</button>
    </div>
  </div>
</div>
```

登录安全事件（管理员，宽 980px）：

```html
<div id="modalAdminSecurity" class="xbs-modal" aria-hidden="true">
  <div class="xbs-modal-backdrop"></div>
  <div class="xbs-modal-box" style="max-width:980px">
    <div class="xbs-modal-heading-row">
      <h3>登录安全事件</h3>
      <span class="xbs-modal-hint">仅管理员可见</span>
    </div>
    <div class="admin-logs-wrap">
      <table class="admin-logs-table">
        <thead>
          <tr><th>时间</th><th>事件</th><th>范围</th><th>账号</th><th>IP</th><th>附加信息</th></tr>
        </thead>
        <tbody id="adminSecurityTbody"></tbody>
      </table>
    </div>
    <div class="admin-logs-pager">
      <span id="adminSecurityPagerInfo"></span>
      <div>
        <button type="button" class="secondary" id="adminSecurityPrev">上一页</button>
        <button type="button" class="secondary" id="adminSecurityNext">下一页</button>
      </div>
    </div>
    <div class="xbs-modal-actions" style="margin-top:16px">
      <button type="button" class="primary" id="adminSecurityClose">关闭</button>
    </div>
  </div>
</div>
```

账号管理（管理员，宽 520px）：

```html
<div id="modalAdminUsers" class="xbs-modal" aria-hidden="true">
  <div class="xbs-modal-backdrop"></div>
  <div class="xbs-modal-box" style="max-width:520px">
    <div class="xbs-modal-heading-row">
      <h3>账号管理</h3>
      <span class="xbs-modal-hint">仅管理员可见</span>
    </div>
    <div class="admin-users-wrap">
      <table class="admin-logs-table">
        <thead>
          <tr><th>用户名</th><th>账号（手机）</th><th>用户身份</th></tr>
        </thead>
        <tbody id="adminUsersTbody"></tbody>
      </table>
    </div>
    <div class="admin-users-add">
      <h4>新增用户</h4>
      <input type="text" id="adminNewName" placeholder="用户名（姓名）" autocomplete="name" />
      <input type="tel" id="adminNewPhone" placeholder="账号（11 位手机号）" autocomplete="off" inputmode="numeric" />
      <input type="password" id="adminNewPwd" placeholder="初始密码（至少 6 位）" autocomplete="new-password" />
      <p class="xbs-modal-error" id="adminUsersErr" style="margin-top:0"></p>
      <div class="xbs-modal-actions" style="margin-top:0">
        <button type="button" class="primary" id="adminUsersAddBtn">添加</button>
        <button type="button" class="secondary" id="adminUsersClose">关闭</button>
      </div>
    </div>
  </div>
</div>
```

弹层显示：给对应 `.xbs-modal` 加 class **`show`**，并设 `aria-hidden="false"`；关闭时去掉 `show`，`aria-hidden="true"`。

---

## 五、前端交互逻辑（须实现等价行为）

1. **`updateUserBar()`**  
   - 有用户时：`userSessionBar.style.display = 'flex'`；`userDisplayName.textContent = user.name || user.phone`；若 `user.is_admin` 为真，显示三个管理员按钮，否则隐藏。  
2. **登录**  
   - `POST /api/auth/login`，成功则 `localStorage.setItem('xbs_token', token)`，保存 `currentUser`，隐藏 `#auth-gate`，进入主界面。  
3. **启动**  
   - 无 token → 显示 `#auth-gate`；有 token → `POST /api/auth/ping`，成功则恢复 `currentUser` 并进入主界面，失败则清除 token 并回登录门。  
4. **退出**  
   - 清除 token 与 `currentUser`，显示 `#auth-gate`。  
5. **修改密码**  
   - 新密码至少 6 位且两次一致；`POST /api/auth/change-password`；成功后清除 token、关弹窗、回登录门（因服务端会递增 `token_version`）。  
6. **管理员**  
   - 列表：`GET /api/admin/users`；新增：`POST /api/admin/users`（body：`name, phone, password`，11 位手机号）；访问记录与安全事件：`GET` 对应接口，分页 `limit`/`offset`（默认 20）。  
7. **事件类型中文映射（安全事件表展示）**（示例）：`login_failed`→登录失败，`login_success`→登录成功，`account_locked`→账号锁定，`ip_blocked`→IP 封禁，`login_rejected`→登录拒绝。

实现时可参考原仓库 [`js/auth-client.js`](js/auth-client.js) 的请求路径与 method；跨域时 API 根用环境变量或 `localStorage['QBT_API_ORIGIN']` 覆盖。

---

## 六、后端与 API 摘要

### 6.1 产品规则

- 无自助注册；账号 = 11 位手机号 `/^1\d{10}$/`，唯一。  
- 展示名 `name`，顶栏优先显示 `name` 否则 `phone`。  
- `is_admin`：管理员可访问 `/api/admin/*`；创建用户接口新建用户恒为普通用户。  
- 密码至少 6 位。

### 6.2 密码与 JWT

- 存储：**PBKDF2-HMAC-SHA256**，100000 迭代，32 字节；格式 `pbkdf2$sha256$100000$<salt_hex>$<hash_hex>`。  
- JWT：**HS256**，`JWT_SECRET`；约 **30 天**有效；payload 含 `sub`,`phone`,`name`,`adm`,`tv`（须与 DB `token_version` 一致）。改密时 `token_version++` 使用户旧 token 全部失效。

### 6.3 主要路由

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/auth/login` | POST | body: `phone`,`password` → `{ token, user }` |
| `/api/auth/ping` | POST | Bearer，body `{}` → `{ ok, user }` |
| `/api/auth/change-password` | POST | Bearer，`oldPassword`,`newPassword` |
| `/api/admin/users` | GET/POST | 管理员；POST 创建用户 |
| `/api/admin/access-logs` | GET | 管理员 |
| `/api/admin/login-security-events` | GET | 管理员 |

登录失败计数、IP/账号临时封禁、安全事件表等逻辑见原仓库 `functions/_lib/login-security.js`（若需完全对齐）。

### 6.4 数据库 DDL（SQLite / D1）

**用户与访问日志：**

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  accessed_at TEXT NOT NULL,
  city TEXT,
  country TEXT,
  client_ip TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_access_logs_user_id ON access_logs(user_id);
CREATE INDEX idx_access_logs_accessed_at ON access_logs(accessed_at DESC);
```

**登录安全（可选但原实现包含）：**

```sql
CREATE TABLE login_security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_type TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  phone TEXT,
  user_id INTEGER,
  client_ip TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_login_security_events_scope_time
  ON login_security_events(scope_type, scope_key, created_at DESC);
CREATE INDEX idx_login_security_events_event_time
  ON login_security_events(event_type, created_at DESC);

CREATE TABLE login_security_blocks (
  scope_type TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  blocked_until TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (scope_type, scope_key)
);
CREATE INDEX idx_login_security_blocks_until ON login_security_blocks(blocked_until);
```

### 6.5 多独立域名（若前端与 API 不同源）

- API 侧配置 **`ALLOWED_ORIGINS`**：逗号分隔的完整 Origin 列表。  
- 浏览器跨域时须正确 CORS；实现可参考原仓库 `resolveCorsOrigin` 思路。

---

## 七、验收清单（UI + 功能）

- [ ] 登录页视觉与本文第三节 CSS 一致（渐变背景、白卡片、主色按钮）。  
- [ ] 登录后用户信息在**主标题区域左上角**，按钮样式为灰边小 pill。  
- [ ] 管理员三项仅在 `is_admin` 时出现；三个弹窗宽度与表格列与 HTML 一致。  
- [ ] 登录 / ping / 改密 / 管理员 API 行为与第六节一致；`xbs_token` 与 Bearer 一致。

---

## 八、原文档与仓库（深入对齐时查阅）

同一仓库内还可对照：**[`账号体系需求规格-复刻用.md`](账号体系需求规格-复刻用.md)**（完整业务与边界）、**[`后台接口描述.md`](后台接口描述.md)**（接口字段）、**[`验证与接入指南.md`](验证与接入指南.md)**（多站接入步骤）。实现细节以 **`functions/`** 与 **`js/auth-client.js`** 源码为准。

---

*文档版本：与 QBT-DataVisualization 仓库同步生成，用于对外交付 AI/第三方复刻。*
