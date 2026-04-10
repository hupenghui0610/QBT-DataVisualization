/**
 * 数据缓存管理模块
 * 提供缓存读取、写入、刷新等功能
 */

/**
 * 读取缓存
 * @param {Object} env - Cloudflare 环境对象
 * @param {string} key - 缓存键名
 * @returns {Promise<{data: Object, updatedAt: number} | null>} 缓存数据或null
 */
export async function getCache(env, key) {
  try {
    const row = await env.DB.prepare(
      'SELECT cache_data, updated_at FROM data_cache WHERE cache_key = ? AND expires_at > ?'
    ).bind(key, Date.now()).first();

    if (!row) return null;

    return {
      data: JSON.parse(row.cache_data),
      updatedAt: row.updated_at
    };
  } catch (e) {
    console.error('[Cache] getCache error:', e);
    return null;
  }
}

/**
 * 写入缓存
 * @param {Object} env - Cloudflare 环境对象
 * @param {string} key - 缓存键名
 * @param {Object} data - 要缓存的数据
 * @param {number} ttlHours - 缓存有效期（小时），默认48小时
 */
export async function setCache(env, key, data, ttlHours = 48) {
  try {
    const now = Date.now();
    const expires = now + ttlHours * 3600 * 1000;
    const cacheData = JSON.stringify(data);

    await env.DB.prepare(
      'INSERT OR REPLACE INTO data_cache (cache_key, cache_data, updated_at, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(key, cacheData, now, expires).run();

    console.log('[Cache] setCache success:', key, 'expires at', new Date(expires).toISOString());
  } catch (e) {
    console.error('[Cache] setCache error:', e);
  }
}

/**
 * 获取缓存状态
 * @param {Object} env - Cloudflare 环境对象
 * @param {string} key - 缓存键名
 * @returns {Promise<{updatedAt: number, isValid: boolean} | null>}
 */
export async function getCacheStatus(env, key) {
  try {
    const row = await env.DB.prepare(
      'SELECT updated_at, expires_at FROM data_cache WHERE cache_key = ?'
    ).bind(key).first();

    if (!row) return null;

    return {
      updatedAt: row.updated_at,
      isValid: row.expires_at > Date.now()
    };
  } catch (e) {
    console.error('[Cache] getCacheStatus error:', e);
    return null;
  }
}

/**
 * 获取所有缓存状态
 * @param {Object} env - Cloudflare 环境对象
 * @param {string[]} keys - 缓存键名数组
 * @returns {Promise<Object>} 各键名的状态对象
 */
export async function getAllCacheStatus(env, keys) {
  const result = {};

  for (const key of keys) {
    result[key] = await getCacheStatus(env, key);
  }

  return result;
}

/**
 * 删除缓存
 * @param {Object} env - Cloudflare 环境对象
 * @param {string} key - 缓存键名
 */
export async function deleteCache(env, key) {
  try {
    await env.DB.prepare('DELETE FROM data_cache WHERE cache_key = ?').bind(key).run();
    console.log('[Cache] deleteCache:', key);
  } catch (e) {
    console.error('[Cache] deleteCache error:', e);
  }
}

/**
 * 清理过期缓存
 * @param {Object} env - Cloudflare 环境对象
 */
export async function cleanExpiredCache(env) {
  try {
    const result = await env.DB.prepare(
      'DELETE FROM data_cache WHERE expires_at < ?'
    ).bind(Date.now()).run();

    console.log('[Cache] cleanExpiredCache:', result.changes || 0, 'items deleted');
  } catch (e) {
    console.error('[Cache] cleanExpiredCache error:', e);
  }
}

/**
 * 记录缓存更新日志
 * @param {Object} env - Cloudflare 环境对象
 * @param {string} key - 缓存键名
 * @param {string} status - 状态: success/failed
 * @param {number} durationMs - 执行耗时
 * @param {string} errorMsg - 错误信息
 */
export async function logCacheUpdate(env, key, status, durationMs, errorMsg = null) {
  try {
    await env.DB.prepare(
      'INSERT INTO cache_update_log (cache_key, status, duration_ms, error_msg, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(key, status, durationMs, errorMsg, Date.now()).run();
  } catch (e) {
    console.error('[Cache] logCacheUpdate error:', e);
  }
}

/**
 * 获取最近的缓存更新日志
 * @param {Object} env - Cloudflare 环境对象
 * @param {number} limit - 返回条数
 * @returns {Promise<Array>}
 */
export async function getRecentCacheLogs(env, limit = 50) {
  try {
    const rows = await env.DB.prepare(
      'SELECT * FROM cache_update_log ORDER BY created_at DESC LIMIT ?'
    ).bind(limit).all();

    return rows.results || [];
  } catch (e) {
    console.error('[Cache] getRecentCacheLogs error:', e);
    return [];
  }
}

/**
 * 刷新指定缓存
 * @param {Object} env - Cloudflare 环境对象
 * @param {string} key - 缓存键名
 * @param {Function} fetchFunction - 获取数据的函数
 * @returns {Promise<{success: boolean, duration: number, error?: string}>}
 */
export async function warmupCache(env, key, fetchFunction) {
  const startTime = Date.now();

  try {
    console.log('[Cache] Warming up:', key);
    const data = await fetchFunction(env);
    await setCache(env, key, data);
    const duration = Date.now() - startTime;
    await logCacheUpdate(env, key, 'success', duration);
    console.log('[Cache] Warmup success:', key, duration + 'ms');
    return { success: true, duration };
  } catch (e) {
    const duration = Date.now() - startTime;
    const errorMsg = e && e.message ? e.message : String(e);
    await logCacheUpdate(env, key, 'failed', duration, errorMsg);
    console.error('[Cache] Warmup failed:', key, errorMsg);
    return { success: false, duration, error: errorMsg };
  }
}
