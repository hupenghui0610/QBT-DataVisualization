/**
 * 与 Cloudflare Pages Functions /api/auth/* 配合；页面需先加载本文件再执行内联逻辑。
 */
(function (global) {
  var TOKEN_KEY = 'xbs_token';
  /** 本地打开页面时与 /api 不同源，跨域指向正式站（见下方 isLocalPageOrigin） */
  var REMOTE_API_ORIGIN = 'https://qbt-datavisualization.pages.dev';
  /** 可选：仅在本地页下生效，覆盖正式 API 根（如预览环境），需在控制台设置 localStorage */
  var LS_API_ORIGIN_KEY = 'QBT_API_ORIGIN';

  /** 是否应走远程 API：file://、本机回环、常见局域网 IP（Live Server 等） */
  function isLocalPageOrigin() {
    try {
      var loc = typeof location !== 'undefined' ? location : null;
      if (!loc) return false;
      if (loc.protocol === 'file:') return true;
      var h = loc.hostname || '';
      if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return true;
      if (/^10\./.test(h)) return true;
      if (/^192\.168\./.test(h)) return true;
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  function getApiBase() {
    try {
      if (!isLocalPageOrigin()) return '';
      var custom = null;
      try {
        custom = localStorage.getItem(LS_API_ORIGIN_KEY);
      } catch (e) {}
      if (custom && typeof custom === 'string') {
        var t = custom.trim().replace(/\/$/, '');
        if (/^https:\/\/.+/i.test(t)) return t;
      }
      return REMOTE_API_ORIGIN;
    } catch (e) {}
    return '';
  }

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function setToken(t) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  function authHeaders() {
    var h = { 'Content-Type': 'application/json' };
    var tok = getToken();
    if (tok) h['Authorization'] = 'Bearer ' + tok;
    return h;
  }

  /**
   * GET + Bearer，整段请求含「下载并读取响应体」限时。
   * 注意：若仅用 AbortController+fetch().finally(clearTimeout)，fetch 在收到响应头后即 resolve，
   * 会提前清掉定时器，导致 r.json() 读大 body 时不再 abort——表现为长时间卡在「加载中」。
   * 优先 AbortSignal.timeout（规范上在读取 body 期间仍会中止）；否则 AbortController 且不在 fetch resolve 时清定时器。
   */
  function fetchGetWithTimeout(path, timeoutMs) {
    var ms = timeoutMs != null ? timeoutMs : 90000;
    var url = getApiBase() + path;
    var opts = { method: 'GET', headers: authHeaders() };
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      try {
        opts.signal = AbortSignal.timeout(ms);
        return fetch(url, opts);
      } catch (e) {}
    }
    var ctrl = new AbortController();
    var tid = setTimeout(function () {
      try {
        ctrl.abort();
      } catch (e) {}
    }, ms);
    opts.signal = ctrl.signal;
    return fetch(url, opts);
  }

  /** 性能监控：包装 fetch 请求，记录耗时 */
  function timedFetch(name, fetchFn) {
    return function () {
      var args = arguments;
      var start = performance.now();
      var label = '[API] ' + name;
      console.time(label);
      return fetchFn.apply(null, args).then(
        function (res) {
          var duration = performance.now() - start;
          console.timeEnd(label);
          console.log('[Perf] ' + name + ' 耗时: ' + duration.toFixed(2) + 'ms');
          return res;
        },
        function (err) {
          var duration = performance.now() - start;
          console.timeEnd(label);
          console.log('[Perf] ' + name + ' 失败, 耗时: ' + duration.toFixed(2) + 'ms');
          throw err;
        }
      );
    };
  }

  global.XbsAuth = {
    TOKEN_KEY: TOKEN_KEY,
    /** 调试用：在控制台看当前 API 根，空字符串表示与页面同源（线上） */
    getApiBase: getApiBase,
    getToken: getToken,
    setToken: setToken,
    clearSession: function () {
      setToken(null);
    },
    login: timedFetch('login', function (phone, password) {
      return fetch(getApiBase() + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone, password: password }),
      });
    }),
    ping: timedFetch('ping', function () {
      return fetch(getApiBase() + '/api/auth/ping', {
        method: 'POST',
        headers: authHeaders(),
        body: '{}',
      });
    }),
    changePassword: timedFetch('changePassword', function (oldPassword, newPassword) {
      return fetch(getApiBase() + '/api/auth/change-password', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ oldPassword: oldPassword, newPassword: newPassword }),
      });
    }),
    fetchAccessLogs: timedFetch('fetchAccessLogs', function (limit, offset) {
      var l = limit != null ? limit : 20;
      var o = offset != null ? offset : 0;
      return fetch(
        getApiBase() + '/api/admin/access-logs?limit=' + encodeURIComponent(l) + '&offset=' + encodeURIComponent(o),
        {
          method: 'GET',
          headers: authHeaders(),
        }
      );
    }),
    fetchLoginSecurityEvents: timedFetch('fetchLoginSecurityEvents', function (limit, offset) {
      var l = limit != null ? limit : 20;
      var o = offset != null ? offset : 0;
      return fetch(
        getApiBase() + '/api/admin/login-security-events?limit=' + encodeURIComponent(l) + '&offset=' + encodeURIComponent(o),
        {
          method: 'GET',
          headers: authHeaders(),
        }
      );
    }),
    fetchAdminUsers: timedFetch('fetchAdminUsers', function () {
      return fetch(getApiBase() + '/api/admin/users', {
        method: 'GET',
        headers: authHeaders(),
      });
    }),
    createAdminUser: timedFetch('createAdminUser', function (name, phone, password) {
      return fetch(getApiBase() + '/api/admin/users', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name: name, phone: phone, password: password }),
      });
    }),
    /** 需登录；默认大盘 JSON（与 data/features-output.json 同源，经 Functions 鉴权） */
    fetchFeaturesOutput: timedFetch('fetchFeaturesOutput', function (refresh) {
      var qs = refresh ? '?refresh=1' : '';
      return fetch(getApiBase() + '/api/data/features-output' + qs, {
        method: 'GET',
        headers: authHeaders(),
      });
    }),
    /** 需登录；默认分品牌 JSON */
    fetchFeaturesBrandTop10: timedFetch('fetchFeaturesBrandTop10', function (refresh) {
      var qs = refresh ? '?refresh=1' : '';
      return fetch(getApiBase() + '/api/data/features-brand-top10' + qs, {
        method: 'GET',
        headers: authHeaders(),
      });
    }),
    /** 需登录；飞书日销在线表格（Pages Functions 代理飞书 API） */
    fetchFeishuDailySales: timedFetch('fetchFeishuDailySales', function () {
      return fetchGetWithTimeout('/api/data/feishu-daily-sales', 90000);
    }),
    /** 需登录；飞书天猫在线表格（Pages Functions 代理飞书 API） */
    fetchFeishuTmallSales: timedFetch('fetchFeishuTmallSales', function () {
      return fetchGetWithTimeout('/api/data/feishu-tmall-sales', 90000);
    }),
    /** 需登录；天猫 A:G/H + 京东表第三 sheet A:F（F 列 GMV，服务端合并公式计算值） */
    fetchFeishuGmvCombined: timedFetch('fetchFeishuGmvCombined', function () {
      return fetchGetWithTimeout('/api/data/feishu-gmv-combined', 90000);
    }),
    /** 需登录；抖音自播 GMV（三张 sheet） */
    fetchFeishuDouyinSales: timedFetch('fetchFeishuDouyinSales', function () {
      return fetchGetWithTimeout('/api/data/feishu-douyin-sales', 90000);
    }),
    /** 需登录；抖音日度趋势（DP/达人） */
    fetchFeishuDouyinDailyTrend: timedFetch('fetchFeishuDouyinDailyTrend', function () {
      return fetchGetWithTimeout('/api/data/feishu-douyin-daily-trend', 90000);
    }),
    /** 需登录；抖音订单 DP/达人 型号金额分布（sheet3 映射 + 订单宽表） */
    fetchFeishuDouyinModelDistribution: timedFetch('fetchFeishuDouyinModelDistribution', function (start, end) {
      var qs = '';
      if (start && end && String(start) <= String(end)) {
        qs =
          '?start=' +
          encodeURIComponent(String(start)) +
          '&end=' +
          encodeURIComponent(String(end));
      }
      return fetchGetWithTimeout('/api/data/feishu-douyin-model-distribution' + qs, 120000);
    }),
    /** 需登录；渠道×日订单支付金额（飞书订单明细+渠道映射聚合） */
    /** 达播趋势：与页面 CHANNEL_ORDER_TREND_FETCH_TIMEOUT_MS、看门狗一致（当前 600s） */
    fetchFeishuChannelOrderTrend: timedFetch('fetchFeishuChannelOrderTrend', function () {
      return fetchGetWithTimeout('/api/data/feishu-channel-order-trend', 600000);
    }),
    /** 需登录；新零售四平台GMV/GSV日趋势（DP/直对/服务商分类） */
    fetchFeishuNewretailDaily: timedFetch('fetchFeishuNewretailDaily', function () {
      return fetchGetWithTimeout('/api/data/feishu-newretail-daily', 120000);
    }),
    /** 需登录；直播间转化漏斗（sheet4 B/H/K/X/Y 按主播聚合） */
    fetchFeishuLivestreamFunnel: timedFetch('fetchFeishuLivestreamFunnel', function () {
      return fetchGetWithTimeout('/api/data/feishu-livestream-funnel', 90000);
    }),
  };
})(typeof window !== 'undefined' ? window : globalThis);
