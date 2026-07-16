# AI Workbench Mac App Store Release

AI Workbench 的 Electron Mac 版使用独立 MAS 构建，不影响当前本地 `mac:pack` 调试包。

## Bundle ID

- 当前 Mac Bundle ID: `com.beexofficial.beex.test`
- 当前 iOS/iPad Bundle ID: `com.beexofficial.beex.test`

Mac 和 iOS/iPad 使用同一个 Apple Developer Team，并按“同一个 App Store Connect app 记录增加 macOS 平台”的路线发布。先在 App Store Connect 里打开已有 iOS app，点 `Add Platform`，增加 `macOS`，再上传 Mac 构建。

如果以后想把 Mac 做成完全独立的 Mac App Store app，再把 `electron-builder.yml` 的 `appId` 改回类似 `com.beexofficial.beex.test.mac`，并在 App Store Connect 创建独立 app 记录。

## 需要的证书

MAS 分发需要本机钥匙串里同时有：

- `Apple Distribution: Limpet International Co., Limited (47T37CCFZ2)`
- `3rd Party Mac Developer Installer`

如果缺 installer 证书，在 Xcode 中创建：

1. 打开 Xcode > Settings > Accounts。
2. 选择 `Limpet International Co., Limited` 团队。
3. 点 `Manage Certificates...`。
4. 点 `+`，创建 `Mac Installer Distribution`。
5. 重新执行 `npm run mac:mas`。

## 构建

```bash
npm run mac:mas
```

默认构建 Apple Silicon `arm64`。如果要同时覆盖 Intel Mac：

```bash
npm run mac:mas:universal
```

本地 MAS 开发验证包：

```bash
npm run mac:mas:dev
```

开发验证通常还需要 macOS development provisioning profile，可以通过：

```bash
AIWB_MAS_PROFILE=/path/to/profile.provisionprofile npm run mac:mas:dev
```

## 上传

推荐使用和 iOS 一样的 Xcode 已登录账号上传路线：

```bash
npm run mac:mas:upload:xcode
```

一条命令构建并上传：

```bash
npm run mac:mas:publish
```

这条路线会把 Electron Builder 生成的 MAS app 临时整理成 `.xcarchive`，然后调用 `xcodebuild -exportArchive`，使用 Xcode 账号里的 `Limpet International Co., Limited (47T37CCFZ2)` 团队上传。

也可以使用 App Store Connect API Key 上传。构建成功会生成 MAS `.pkg`，上传前设置 App Store Connect 凭证：

```bash
APPLE_ID="your-apple-id@example.com" \
APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx" \
npm run mac:mas:upload
```

也可以使用 App Store Connect API Key：

```bash
ASC_API_KEY="KEY_ID" \
ASC_API_ISSUER="ISSUER_ID" \
npm run mac:mas:upload
```

注意：iOS archive 里的 `providerId` 不是 App Store Connect API 的 `Issuer ID`。如果一台电脑上有多个 App Store Connect 账号，使用 API Key 上传时建议用命名 profile 固定账号，避免串账号：

```json
{
  "limpet": {
    "apiKey": "APP_STORE_CONNECT_KEY_ID",
    "apiIssuer": "APP_STORE_CONNECT_ISSUER_ID",
    "apiKeyPath": "/path/to/AuthKey_APP_STORE_CONNECT_KEY_ID.p8",
    "provider": ""
  }
}
```

默认读取位置：

```bash
~/.appstoreconnect/ai-workbench-profiles.json
```

上传时指定：

```bash
ASC_PROFILE=limpet npm run mac:mas:upload
```
