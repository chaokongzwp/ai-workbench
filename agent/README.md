# AI Workbench Agent releases

`latest.json`, `macos-latest.json`, and `windows-latest.json` describe the three
platform releases. All manifests must reference the same version. Runtime
delivery is owned by the configuration center; GitHub is not an installation or
upgrade dependency.

## Current release

- Read the version from the three current manifests.
- Linux entry: `agent/vN/aiwbctl-linux`
- macOS entry: `agent/vN/aiwbctl-macos`
- Windows entry: `agent/vN/aiwb-agent-windows.mjs`

Version 41 is the clean-break Agent release. AI tasks require Agent HTTPS;
clients no longer fall back to direct SSH or tmux execution. The health endpoint
exposes the real Agent version and protocol version so clients reject mismatched
runtimes before creating a task. Process-tree cancellation from v40 remains in
place.

Do not determine the current version by counting directories or choosing a folder
manually. Read the matching `latest` manifest.

## Publishing

```sh
npm run agent:publish
```

Publishing generates all three platform artifacts, uploads them directly to the
configuration center, and verifies every hosted manifest, platform entry, HTTP
runtime, and updater runtime hash. Source control commits are a separate
operation and do not gate Agent delivery.

## Historical cleanup

Preview cleanup candidates:

```sh
npm run agent:prune
```

Apply the previewed cleanup:

```sh
npm run agent:prune:apply
```

The cleanup tool keeps only the version referenced by the current manifests.
Run it after each successful Agent release to prevent historical directories
from accumulating.
