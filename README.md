# KhmerX Licensed

The reverse proxy must overwrite `X-Real-IP` with the connected client address
before forwarding `/api/team/auth`. The application intentionally ignores
`X-Forwarded-For` and `CF-Connecting-IP` because clients can forge them.

## 本机启动（仅虚构数据）

在仓库根目录执行以下四步；所有服务只监听 `127.0.0.1`，不会连接外部系统：

```powershell
$env:PAYEASE_ENV='local'
$env:PAYEASE_AUTH_SECRET='仅在当前终端设置的本机测试密钥（至少 32 字符）'
npm run build
npm run migrate:local
node --experimental-strip-types scripts/local-e2e/seed-staff.mjs
npm start
```

`migrate:local` 按文件名顺序将 `drizzle/` 下的全部 `.sql` 应用到 `.wrangler/state` 的本地 D1；`seed-staff` 在终端输出虚构员工的登录信息（含放款员 `finance` 和放款复核员 `finance_checker`），不写入文件。重启 `npm start` 时继续使用同一个 `.wrangler/state`，数据应保留。健康检查：`GET http://127.0.0.1:8788/healthz`。
