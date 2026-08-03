# AI Workbench Config Sync

轻量配置同步服务，用账号密码管理 AI Workbench 的会话配置包。

## 设计

- 服务端只负责账号鉴权、版本号和配置包存储。
- 推荐 App 端先用账号密码派生密钥，加密本地配置后再上传 `encryptedPayload`。
- 配置包可包含会话 ID、服务器、工作目录、AI 类型、密码和 Key；服务端不会解析这些内容。
- 每次写入会递增 `revision`，客户端可以带 `baseRevision` 防止覆盖其他设备的更新。
- 会话分享会包含 SSH 登录密码，方便受信任的接收方直接使用；仍不包含 API Key 和聊天记录。
- 共享记录只应部署在 HTTPS 和受限访问的环境中，并按敏感凭据管理。
- Agent 任务不会经过此服务；它只保存 Agent 的升级登记信息。Agent 启动时登记自身 HTTPS/HTTP 地址、版本和独立升级凭证；发布新版本时，中心服务只调用 Agent 固定的自更新接口。离线时不会影响任务，恢复后重新登记即可补齐版本。

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

## Agent 更新控制面

Agent 启动后调用 `POST /v1/agent-control/register` 登记自身可访问地址和升级专用凭证。发布脚本在发布后调用
`POST /v1/agent-control/publish` 更新目标版本；中心服务异步调用版本落后的 Agent 的 `/v1/control/update`。

服务端需要在 `apns.env` 或独立环境文件中配置 `AIWB_AGENT_CONTROL_ADMIN_TOKEN`。该令牌只用于发布端，不能放进 App 或 Agent。中心保存的是只能触发固定自更新操作的凭证，不是 Agent 的任务 API Token。

## iPhone / iPad 任务通知

App 可以把一次性通知票据交给远端 Agent。任务进入完成、失败或已取消状态后，Agent
只回传任务标识和状态，由本服务通过 APNs 通知对应设备。通知中不包含任务正文、AI
返回正文、SSH 密码或其他凭据。

在 Apple Developer 创建启用了 APNs 的 `.p8` Provider Key，并把它放到：

```text
/opt/ai-workbench-config-sync/secrets/apns-auth-key.p8
```

再创建仅 root 可读的 `/opt/ai-workbench-config-sync/secrets/apns.env`：

```bash
AIWB_APNS_KEY_ID=YOUR_APNS_KEY_ID
AIWB_APNS_TEAM_ID=47T37CCFZ2
AIWB_APNS_KEY_PATH=/opt/ai-workbench-config-sync/secrets/apns-auth-key.p8
```

重启服务后，`GET /health` 中的 `push.ready` 应为 `true`。
