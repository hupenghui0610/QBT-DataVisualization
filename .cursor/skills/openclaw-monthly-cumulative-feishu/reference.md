# Reference

## Fixed message template

```text
月度累计达成播报｜{YYYY年MM月}
统计日期：{YYYY-MM-DD}
统计口径：当月1日至统计日期累计
--------------
总GMV：{total_gmv_wan}万
总GSV：{total_gsv_wan}万
退款率：{refund_rate_pct}%
--------------
京东：GMV {jd_gmv_wan}万｜GSV {jd_gsv_wan}万｜退款率 {jd_refund_rate_pct}%
天猫：GMV {tmall_gmv_wan}万｜GSV {tmall_gsv_wan}万｜退款率 {tmall_refund_rate_pct}%
抖音自播：GMV {dy_self_gmv_wan}万｜GSV {dy_self_gsv_wan}万｜退款率 {dy_self_refund_rate_pct}%
抖音DP：GMV {dp_gmv_wan}万｜GSV {dp_gsv_wan}万｜退款率 {dp_refund_rate_pct}%
抖音达人：GMV {daren_gmv_wan}万｜GSV {daren_gsv_wan}万｜退款率 {daren_refund_rate_pct}%
生成时间：{generated_at}
```

Rules:

- Keep heading names unchanged
- Keep channel order unchanged
- Keep two decimal places for all amounts and rates
- Keep zero-value channels
- `统计日期` must mean the actual accumulation cutoff date for the requested month
- If the requested month is historical, `统计日期` should be that month's last day
- If the requested month is the current month, `统计日期` should be today
- If the requested month has no data, fail instead of generating a zero-value report
- Use `--------------` as separator lines
- Use `总GMV` and `总GSV` (not just `GMV`/`GSV`) in summary section
- `generated_at` format: `YYYY-MM-DD HH:mm` (without seconds)
- Remove section titles like "汇总" and "渠道明细"
- Minimize empty lines

## Month resolution rule

- No month specified: use current month
- `26年3月数据`: resolve to `2026-03`
- `3月数据`: resolve to `当前年份-03`
- If the year is omitted, default to current year

## API contract

Endpoint:

`GET /api/data/monthly-cumulative-summary`

Query params:

- `yearMonth=YYYY-MM`
- `key=<api key>`
- `ts=<unix ms>`
- `nonce=<random string>`
- `sig=<hmac sha256 hex>`

Response fields:

- `yearMonth`
- `statDate`
- `summary`
- `channels`
- `generatedAt`
- `message`

The skill should send only `message`.

## Signature rule

String to sign:

```text
GET
/api/data/monthly-cumulative-summary
{yearMonth}
{ts}
{nonce}
{key}
```

Algorithm:

- `HMAC_SHA256_HEX(secret, stringToSign)`

## OpenClaw schedule example

```json
{
  "schedules": [
    {
      "name": "monthly-cumulative-feishu",
      "cron": "0 9 * * *",
      "timezone": "Asia/Shanghai",
      "prompt": "Use the openclaw-monthly-cumulative-feishu skill and run node scripts/openclaw-send-monthly-cumulative.mjs to send today's monthly cumulative report to Feishu."
    }
  ]
}
```

## Suggested env vars

```text
OPENCLAW_MONTHLY_API_URL=https://qbt-datavisualization.pages.dev/api/data/monthly-cumulative-summary
OPENCLAW_MONTHLY_API_KEY=replace_me
OPENCLAW_MONTHLY_API_SECRET=replace_me
OPENCLAW_MONTHLY_YEAR_MONTH=
FEISHU_WEBHOOK_URL=replace_me
```
