# ARC-04 本地模拟机构

只绑定 `127.0.0.1`，使用虚构密钥和数据，不连接 VPS、外部域名或 Telegram。

## 启动

在仓库根目录运行：

```powershell
node scripts/mock-institution/server.mjs --port 8799
```

默认接收 `POST http://127.0.0.1:8799/v0/events`。可用环境变量模拟网络行为：

- `MOCK_INSTITUTION_SECRET=test-only-secret-1`
- `MOCK_DELAY_MS=250`
- `MOCK_FAIL_RATIO=1`（每次返回 500）
- `MOCK_TIMEOUT=1`（保持请求不响应）
- `MOCK_DUPLICATE_RESPONSE=1`（成功响应标记为 duplicate）

## 发送回调

命令只允许目标主机为 `127.0.0.1`，默认目标是本地金融服务公司回调端：

```powershell
node scripts/mock-institution/server.mjs callback `
  --target http://127.0.0.1:8788/api/institution/callback `
  --event loan.approved `
  --partner-id partner-a `
  --secret test-only-secret-1 `
  --application-id app-001
```

`--event` 支持 `loan.approved`、`loan.rejected`、`funding.confirmed`、`repayment.confirmed`、`payment.failed`。
请求使用 ARC-04 的 HMAC-SHA256 规范化串和 `X-Partner-Id`、`X-Timestamp`、`X-Nonce`、`X-Idempotency-Key`、`X-Signature` 头。
请求还同时发送 `X-Institution-Id`（与 `X-Partner-Id` 同值），并在 body 中同时发送 `applicationId`、`loanId`（同值）和 `eventId`。在 HS-1 合并之前，接收端只认 `X-Institution-Id` 和 `loanId`。

## 测试向量

`tests/fixtures/arc04-v0/signing.json` 与 `events/` 是双方共享的虚构契约样例；运行：

```powershell
node --experimental-vm-modules --test tests/arc04-vectors.test.mjs
```
