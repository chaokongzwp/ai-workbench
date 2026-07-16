# AI Workbench

Universal iPhone/iPad app for connecting directly to an Alibaba Cloud ECS over SSH and driving remote AI CLI tools through tmux.

## App Configuration

- App name: `AI Workbench`
- Bundle ID: `com.beexofficial.beex.test`
- App version: `1.0.0`
- Build: `8`
- Minimum iOS deployment target: `16.0`
- Device family: universal iPhone + iPad
- Connection direction: direct SSH from the iOS app

Default ECS profile:

```text
Host: example.com
Port: 22
User: root
Workdir: /opt/limpet-workspace
Codex command: /usr/local/bin/codex
Claude command: /usr/local/bin/claude
```

The SSH password is not hardcoded in the source. Enter it in the app settings; the native iOS plugin stores the profile in Keychain.

## What Is Implemented

- Responsive React workbench UI for iPhone, iPad, and desktop preview.
- Mobile-first iPhone shell with safe-area aware header, compact setup summary, bottom composer, and collapsed raw output.
- First-run SSH password guard so missing credentials open setup instead of sending invalid native SSH commands.
- Capacitor iOS universal app under `ios/`.
- Native iOS `SSHWorkbenchPlugin` using Citadel/SwiftNIO SSH.
- Password-based direct SSH command execution.
- Keychain-backed connection profile save/load/clear.
- ECS health check for `hostname`, `whoami`, workdir, `tmux`, Codex, and Claude.
- tmux-backed agent sessions:
  - `ai-dev-codex`
  - `ai-dev-claude`
- Prompt sending through base64 + tmux buffer paste, so multiline text survives shell quoting.
- Raw output panel with refresh, interrupt, and kill-session actions.

## Architecture

```text
React UI
  -> Capacitor JS bridge
  -> SSHWorkbenchPlugin.swift
  -> Citadel / SwiftNIO SSH
  -> ECS
  -> tmux session
  -> codex / claude
```

## Scripts

```bash
npm install
npm run dev
npm run build
npm run ios:sync
npm run ios:open
```

Local dev server: `http://127.0.0.1:5173/`

Open the native iOS project:

```bash
open ios/App/App.xcodeproj
```

## Verification

Web build:

```bash
npm run build
```

iOS simulator build:

```bash
xcodebuild -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Remote smoke checks completed:

```text
SSH port reachable: yes
ECS hostname: sg-2
Workdir exists: /opt/limpet-workspace
tmux: /usr/bin/tmux, version 3.4
codex: /usr/local/bin/codex, codex-cli 0.130.0
claude: /usr/local/bin/claude, 2.1.143 (Claude Code)
Citadel direct SSH smoke: citadel:sg-2:/usr/bin/tmux
tmux buffer send/capture smoke: passed
```

Build 7 release checks completed:

```text
npm run build: passed
npm run ios:sync: passed
iOS Simulator Debug build: passed
Release archive: passed
App Store Connect upload: passed
Delivery UUID: a07c34f9-fade-4a40-b3d0-2dc4b9cf6413
```

## Notes

- Browser preview cannot make direct SSH connections. Use the iOS app for real SSH.
- Host key validation is currently `acceptAnything()` for first-run speed. Before production, store and pin the ECS host fingerprint.
- For production use, replace root login with a dedicated low-privilege ECS user and SSH key auth.
