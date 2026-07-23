# AI Workbench Config Sync

轻量配置同步服务，用账号密码管理 AI Workbench 的会话配置包。

## 设计

- 服务端只负责账号鉴权、版本号和配置包存储。
- 推荐 App 端先用账号密码派生密钥，加密本地配置后再上传 `encryptedPayload`。
- 配置包可包含会话 ID、服务器、工作目录、AI 类型、密码和 Key；服务端不会解析这些内容。
- 每次写入会递增 `revision`，客户端可以带 `baseRevision` 防止覆盖其他设备的更新。
- 会话分享会包含 SSH 登录密码，方便受信任的接收方直接使用；仍不包含 API Key 和聊天记录。
- 共享记录只应部署在 HTTPS 和受限访问的环境中，并按敏感凭据管理。

## API

### 健康检查

```bash
curl http://127.0.0.1:18088/health
```

### 登录或首次创建账号

```bash
curl -s http://127.0.0.1:18088/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"account":"demo@example.com","password":"change-me","deviceName":"Mac"}'
```

### 拉取配置

```bash
curl -s http://127.0.0.1:18088/v1/config \
  -H "Authorization: Bearer $TOKEN"
```

### 上传配置

```bash
curl -s -X PUT http://127.0.0.1:18088/v1/config \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
-d '{"baseRevision":0,"encryptedPayload":"base64-or-json-ciphertext","checksum":"sha256:...","deviceName":"Mac"}'
```

### 分享会话

登录后，拥有者可以把一个会话分享给指定账号。接收方调用 `GET /v1/shares` 查看共享会话；App 点击“下载云端配置”时会自动导入。删除共享使用 `DELETE /v1/shares/{shareId}`。

会话配置去重按 `ip/域名 + SSH 用户名 + 工作目录 + AI 类型` 判断；同一个目录下的 Codex 和 Claude 会被视为两个可同步会话。

```bash
curl -s -X POST http://127.0.0.1:18088/v1/shares \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"recipientAccount":"teammate@example.com","session":{"conversationId":"...","name":"后台项目","syncKey":"...","profile":{"host":"example.com","username":"root","password":"ssh-password","workdir":"/opt/project","agentId":"codex"}}}'
```

## systemd

默认部署路径：

- 程序：`/opt/ai-workbench-config-sync/app/aiwb_config_sync.py`
- 数据：`/opt/ai-workbench-config-sync/data`
- 服务：`ai-workbench-config-sync`

查看状态：

```bash
systemctl status ai-workbench-config-sync
journalctl -u ai-workbench-config-sync -f
```
