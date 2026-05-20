import { getFeishuLoginUser, upsertFeishuUser, verifyFeishuState } from '../../../_lib/feishu-auth.js';
import { registerSuccessfulLogin } from '../../../_lib/login-security.js';

function htmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function scriptJson(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c');
}

function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch (e) {
    return false;
  }
}

function withTokenFragment(returnTo, token, user) {
  var u = new URL(returnTo);
  var hash = new URLSearchParams(u.hash ? u.hash.slice(1) : '');
  hash.set('xbs_token', token);
  hash.set('xbs_auth', 'feishu');
  if (user && user.name) hash.set('xbs_user', user.name);
  u.hash = hash.toString();
  return u.toString();
}

function successHtml(returnTo, token, user, callbackUrl) {
  var same = sameOrigin(returnTo, callbackUrl);
  var target = same ? returnTo : withTokenFragment(returnTo, token, user);
  return new Response(
    '<!doctype html><html><head><meta charset="utf-8"><title>飞书登录中</title></head><body>' +
      '<p>飞书登录成功，正在进入系统...</p>' +
      '<script>' +
      'var token=' + scriptJson(token) + ';' +
      'var target=' + scriptJson(target) + ';' +
      'try{localStorage.setItem("xbs_token",token);sessionStorage.removeItem("xbs_feishu_auto_login_attempted");}catch(e){}' +
      'location.replace(target);' +
      '</script>' +
      '</body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function failureHtml(returnTo, message) {
  var target = new URL(returnTo);
  target.searchParams.set('feishu_login_error', message);
  return new Response(
    '<!doctype html><html><head><meta charset="utf-8"><title>飞书登录失败</title></head><body>' +
      '<p>' + htmlEscape(message) + '</p>' +
      '<script>' +
      'try{sessionStorage.setItem("xbs_feishu_login_error",' + scriptJson(message) + ');sessionStorage.setItem("xbs_feishu_auto_login_attempted","1");}catch(e){}' +
      'location.replace(' + scriptJson(target.toString()) + ');' +
      '</script>' +
      '</body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var u = new URL(request.url);
  var fallbackReturnTo = u.origin + '/';
  var statePayload = null;

  try {
    var state = u.searchParams.get('state') || '';
    if (!state) throw new Error('missing_state');
    statePayload = await verifyFeishuState(env, state);
  } catch (e) {
    return failureHtml(fallbackReturnTo, '飞书登录状态已失效，请重试');
  }

  var returnTo = statePayload.return_to || fallbackReturnTo;
  try {
    var code = u.searchParams.get('code') || '';
    if (!code) throw new Error(u.searchParams.get('error') || 'missing_code');
    var feishuUser = await getFeishuLoginUser(env, code);
    var session = await upsertFeishuUser(env, feishuUser);
    await registerSuccessfulLogin(env, request, session.row);
    return successHtml(returnTo, session.token, session.user, request.url);
  } catch (e) {
    var msg = e && e.message === 'FEISHU_PHONE_REQUIRED'
      ? '飞书未返回手机号，请确认应用已开通手机号权限并重新发布'
      : '飞书登录失败，请稍后重试或使用手机号密码登录';
    return failureHtml(returnTo, msg);
  }
}
