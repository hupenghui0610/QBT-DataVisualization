/**
 * 与 Cloudflare Pages Functions /api/auth/* 配合；页面需先加载本文件再执行内联逻辑。
 */
(function (global) {
  var TOKEN_KEY = 'xbs_token';

  function getApiBase() {
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

  global.XbsAuth = {
    TOKEN_KEY: TOKEN_KEY,
    getToken: getToken,
    setToken: setToken,
    clearSession: function () {
      setToken(null);
    },
    login: function (phone, password) {
      return fetch(getApiBase() + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone, password: password }),
      });
    },
    ping: function () {
      return fetch(getApiBase() + '/api/auth/ping', {
        method: 'POST',
        headers: authHeaders(),
        body: '{}',
      });
    },
    changePassword: function (oldPassword, newPassword) {
      return fetch(getApiBase() + '/api/auth/change-password', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ oldPassword: oldPassword, newPassword: newPassword }),
      });
    },
    fetchAccessLogs: function (limit, offset) {
      var l = limit != null ? limit : 20;
      var o = offset != null ? offset : 0;
      return fetch(
        getApiBase() + '/api/admin/access-logs?limit=' + encodeURIComponent(l) + '&offset=' + encodeURIComponent(o),
        {
          method: 'GET',
          headers: authHeaders(),
        }
      );
    },
    fetchAdminUsers: function () {
      return fetch(getApiBase() + '/api/admin/users', {
        method: 'GET',
        headers: authHeaders(),
      });
    },
    createAdminUser: function (name, phone, password) {
      return fetch(getApiBase() + '/api/admin/users', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name: name, phone: phone, password: password }),
      });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
