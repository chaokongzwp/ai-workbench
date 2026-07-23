# Windows Release

AI Workbench 的 Windows 桌面版使用 Electron 打包，和 macOS 版共用前端、主进程和 SSH/Agent 逻辑。

## Build

```bash
npm run win:pack
```

产物默认输出到：

```text
build/win/
```

主要文件：

- `AI-Workbench-<version>-win-x64.exe`：Windows 安装包。
- `AI-Workbench-<version>-win-x64.zip`：免安装压缩包，适合内部快速测试。
- `win-unpacked/AI Workbench.exe`：解包后的应用目录。

## Notes

- 当前 Windows 包适合内部测试，未配置正式代码签名证书，首次打开时 Windows 可能提示未知发布者。
- Windows 客户端仍支持连接 Linux、Windows PowerShell、Windows + WSL 会话。
- Windows 远端机器如果要使用 Agent，需要在对应服务器或工作电脑上安装 Agent；客户端本身不等于远端 Agent。
