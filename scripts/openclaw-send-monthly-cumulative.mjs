import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// 加载 .env 文件（如果存在）
function loadEnvFile() {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      content.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match && !process.env[match[1].trim()]) {
          process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
        }
      });
    }
  } catch (e) {
    // ignore
  }
}
loadEnvFile();

function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeYear(twoOrFourDigitYear) {
  const y = Number(twoOrFourDigitYear);
  if (!Number.isFinite(y)) return null;
  if (y >= 1000) return y;
  if (y >= 0 && y <= 99) return 2000 + y;
  return null;
}

function resolveYearMonthFromInput(input) {
  const raw = String(input || '').trim();
  if (!raw) return currentYearMonth();
  const now = new Date();
  const currentYear = now.getFullYear();
  const normalized = raw.replace(/\s+/g, '');
  let m = normalized.match(/^(\d{2,4})[-/.年](\d{1,2})月?(?:数据)?$/);
  if (m) {
    const year = normalizeYear(m[1]);
    const month = Number(m[2]);
    if (!year || month < 1 || month > 12) throw new Error(`Invalid month input: ${raw}`);
    return `${year}-${String(month).padStart(2, '0')}`;
  }
  m = normalized.match(/^(\d{1,2})月(?:数据)?$/);
  if (m) {
    const month = Number(m[1]);
    if (month < 1 || month > 12) throw new Error(`Invalid month input: ${raw}`);
    return `${currentYear}-${String(month).padStart(2, '0')}`;
  }
  m = normalized.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}`;
  throw new Error(`Unsupported month input: ${raw}`);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function buildSignatureMessage(method, pathname, yearMonth, ts, nonce, key) {
  return [method.toUpperCase(), pathname, yearMonth, String(ts), nonce, key].join('\n');
}

async function main() {
  const apiUrl = new URL(requireEnv('OPENCLAW_MONTHLY_API_URL'));
  const apiKey = requireEnv('OPENCLAW_MONTHLY_API_KEY');
  const apiSecret = requireEnv('OPENCLAW_MONTHLY_API_SECRET');
  const webhookUrl = requireEnv('FEISHU_WEBHOOK_URL');
  const yearMonth = resolveYearMonthFromInput(process.env.OPENCLAW_MONTHLY_YEAR_MONTH || process.argv.slice(2).join(' '));
  const ts = Date.now();
  const nonce = crypto.randomBytes(8).toString('hex');
  const signText = buildSignatureMessage('GET', apiUrl.pathname, yearMonth, ts, nonce, apiKey);
  const sig = crypto.createHmac('sha256', apiSecret).update(signText).digest('hex');

  apiUrl.searchParams.set('yearMonth', yearMonth);
  apiUrl.searchParams.set('key', apiKey);
  apiUrl.searchParams.set('ts', String(ts));
  apiUrl.searchParams.set('nonce', nonce);
  apiUrl.searchParams.set('sig', sig);

  const summaryRes = await fetch(apiUrl, { method: 'GET' });
  const summaryJson = await summaryRes.json();
  if (!summaryRes.ok) {
    throw new Error(summaryJson.error || `Summary API failed: ${summaryRes.status}`);
  }
  if (!summaryJson.message) {
    throw new Error('Summary API returned empty message');
  }
  if (!summaryJson.summary || !(Number(summaryJson.summary.totalGmv) > 0 || Number(summaryJson.summary.totalGsv) > 0)) {
    throw new Error(`No data for ${yearMonth}`);
  }

  const webhookRes = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msg_type: 'text',
      content: {
        text: summaryJson.message,
      },
    }),
  });
  const webhookJson = await webhookRes.json().catch(() => ({}));
  if (!webhookRes.ok || webhookJson.code) {
    throw new Error(webhookJson.msg || webhookJson.message || `Feishu webhook failed: ${webhookRes.status}`);
  }

  console.log(`Sent monthly cumulative report for ${yearMonth}`);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
