---
name: openclaw-monthly-cumulative-feishu
description: Fetch the signed monthly cumulative summary from QBT-Datavisualization and send a fixed-format Feishu robot message. Use when OpenClaw needs to push 月度累计达成 daily on a schedule to Feishu, especially for monthly cumulative achievement, monthly GMV/GSV summary, or fixed-format report delivery.
---

# OpenClaw Monthly Cumulative Feishu

## Purpose

Use this skill when OpenClaw needs to send the `月度累计达成` daily report to a Feishu robot on a schedule.

This skill must:

1. Call the signed endpoint `/api/data/monthly-cumulative-summary`
2. Use HMAC signing instead of website login
3. Send the returned fixed-format message to the Feishu robot

## Required env vars

- `OPENCLAW_MONTHLY_API_URL`
- `OPENCLAW_MONTHLY_API_KEY`
- `OPENCLAW_MONTHLY_API_SECRET`
- `FEISHU_WEBHOOK_URL`

Optional:

- `OPENCLAW_MONTHLY_YEAR_MONTH`
- command input like `26年3月数据` or `3月数据`

## Fixed output rule

The message format is fixed.

- Do not rename headings
- Do not change channel order
- Do not omit empty channels
- Do not add extra commentary before or after the report
- If required fields are missing, fail instead of improvising

The expected final message is the `message` field returned by the API.

## Execution steps

1. Resolve `yearMonth`
   - If user explicitly specifies a month like `26年3月数据`, resolve to `2026-03`
   - If user specifies `3月数据`, use the current year and resolve to `YYYY-03`
   - Else use `OPENCLAW_MONTHLY_YEAR_MONTH` if provided
   - Otherwise use the current month in `YYYY-MM`
2. Execute:

```bash
node scripts/openclaw-send-monthly-cumulative.mjs
```

Or with an explicit month:

```bash
node scripts/openclaw-send-monthly-cumulative.mjs "26年3月数据"
```

3. The script must:
   - Build the signature
   - GET the signed summary API
   - Read `message`
   - Send only `message` to Feishu webhook

## Failure handling

- If the API returns non-200, stop and report failure
- If `message` is missing or empty, stop and report failure
- If the requested month has no data, stop and report failure
- If Feishu webhook returns failure, retry once after a short delay
- Do not generate substitute text from partial fields unless the API already returned `message`

## Feishu sending

Send plain text or post-compatible text using the webhook expected by your OpenClaw setup.

Use the exact message body returned by the API.

## Additional reference

- See [reference.md](reference.md) for the fixed message template, signing details, and schedule example.
