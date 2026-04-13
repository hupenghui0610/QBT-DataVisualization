#!/usr/bin/env node
/**
 * 缓存状态诊断脚本
 * 检查数据库中缓存的完整性和一致性
 */

const { execSync } = require('child_process');

const CACHE_KEYS = [
  'features-output',
  'features-brand-top10',
  'feishu-daily-sales',
  'feishu-tmall-sales',
  'feishu-douyin-sales',
  'feishu-douyin-daily-trend',
  'feishu-douyin-model-distribution',
  'feishu-gmv-combined',
  'feishu-channel-order-trend',
  'feishu-livestream-funnel',
  'feishu-newretail-daily',
];

async function runQuery(sql) {
  try {
    const result = execSync(
      `npx wrangler d1 execute qbt-auth --command="${sql}" --json`,
      { encoding: 'utf-8', cwd: 'D:\\cursorwork\\QBT-DataVisualization' }
    );
    return JSON.parse(result);
  } catch (e) {
    console.error('查询失败:', e.message);
    return null;
  }
}

async function checkCacheStatus() {
  console.log('=== 缓存状态诊断报告 ===\n');

  // 1. 检查 data_cache 表中的缓存
  console.log('1. 当前缓存数据状态:');
  console.log('-'.repeat(60));

  for (const key of CACHE_KEYS) {
    const result = await runQuery(
      `SELECT cache_key, updated_at, expires_at, LENGTH(cache_data) as data_size FROM data_cache WHERE cache_key = '${key}'`
    );

    if (result && result[0] && result[0].results && result[0].results.length > 0) {
      const row = result[0].results[0];
      const updatedAt = new Date(row.updated_at).toLocaleString('zh-CN');
      const expiresAt = new Date(row.expires_at).toLocaleString('zh-CN');
      const now = Date.now();
      const isValid = row.expires_at > now;
      const dataSize = row.data_size || 0;

      console.log(`✓ ${key}`);
      console.log(`  更新时间: ${updatedAt}`);
      console.log(`  过期时间: ${expiresAt}`);
      console.log(`  是否有效: ${isValid ? '是' : '否 (已过期)'}`);
      console.log(`  数据大小: ${(dataSize / 1024).toFixed(2)} KB`);
    } else {
      console.log(`✗ ${key} - 无缓存数据`);
    }
    console.log();
  }

  // 2. 检查更新日志
  console.log('\n2. 最近更新日志 (最近20条):');
  console.log('-'.repeat(60));

  const logsResult = await runQuery(
    `SELECT cache_key, status, duration_ms, error_msg, created_at FROM cache_update_log ORDER BY created_at DESC LIMIT 20`
  );

  if (logsResult && logsResult[0] && logsResult[0].results) {
    const logs = logsResult[0].results;
    for (const log of logs) {
      const time = new Date(log.created_at).toLocaleString('zh-CN');
      const status = log.status === 'success' ? '✓ 成功' : '✗ 失败';
      const duration = log.duration_ms ? `${log.duration_ms}ms` : 'N/A';
      console.log(`${status} | ${log.cache_key} | ${time} | ${duration}`);
      if (log.error_msg) {
        console.log(`  错误: ${log.error_msg}`);
      }
    }
  } else {
    console.log('无更新日志记录');
  }

  // 3. 统计汇总
  console.log('\n3. 统计汇总:');
  console.log('-'.repeat(60));

  const statsResult = await runQuery(
    `SELECT COUNT(*) as total FROM data_cache`
  );
  const totalCached = statsResult && statsResult[0] && statsResult[0].results ? statsResult[0].results[0].total : 0;

  const validResult = await runQuery(
    `SELECT COUNT(*) as valid FROM data_cache WHERE expires_at > ${Date.now()}`
  );
  const validCached = validResult && validResult[0] && validResult[0].results ? validResult[0].results[0].valid : 0;

  const logStatsResult = await runQuery(
    `SELECT status, COUNT(*) as count FROM cache_update_log GROUP BY status`
  );

  console.log(`总缓存键数: ${totalCached} / ${CACHE_KEYS.length}`);
  console.log(`有效缓存数: ${validCached}`);
  console.log(`缓存覆盖率: ${((totalCached / CACHE_KEYS.length) * 100).toFixed(1)}%`);

  if (logStatsResult && logStatsResult[0] && logStatsResult[0].results) {
    console.log('\n更新历史统计:');
    for (const row of logStatsResult[0].results) {
      console.log(`  ${row.status}: ${row.count} 次`);
    }
  }

  // 4. 检查问题
  console.log('\n4. 问题检查:');
  console.log('-'.repeat(60));

  const expiredResult = await runQuery(
    `SELECT cache_key, updated_at FROM data_cache WHERE expires_at <= ${Date.now()}`
  );
  if (expiredResult && expiredResult[0] && expiredResult[0].results && expiredResult[0].results.length > 0) {
    console.log(`⚠ 发现 ${expiredResult[0].results.length} 个过期缓存:`);
    for (const row of expiredResult[0].results) {
      console.log(`  - ${row.cache_key} (更新于 ${new Date(row.updated_at).toLocaleString('zh-CN')})`);
    }
  } else {
    console.log('✓ 无过期缓存');
  }

  const failedResult = await runQuery(
    `SELECT cache_key, error_msg, created_at FROM cache_update_log WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10`
  );
  if (failedResult && failedResult[0] && failedResult[0].results && failedResult[0].results.length > 0) {
    console.log(`\n⚠ 发现 ${failedResult[0].results.length} 个最近的失败记录:`);
    for (const row of failedResult[0].results) {
      console.log(`  - ${row.cache_key}: ${row.error_msg || '未知错误'}`);
    }
  } else {
    console.log('✓ 无失败记录');
  }
}

checkCacheStatus().catch(console.error);
