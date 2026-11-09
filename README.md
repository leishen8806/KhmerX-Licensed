# KhmerX Licensed

The reverse proxy must overwrite `X-Real-IP` with the connected client address
before forwarding `/api/team/auth`. The application intentionally ignores
`X-Forwarded-For` and `CF-Connecting-IP` because clients can forge them.
