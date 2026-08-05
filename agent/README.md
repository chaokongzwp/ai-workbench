# AI Workbench Agent releases

`latest.json` and `windows-latest.json` are the authoritative release pointers.
Both manifests must reference the same version. The repository retains only the
current release directory used by the Linux and Windows installers.

## Current release

- Current version: `v44`
- Linux entry: `agent/v44/aiwbctl`
- Windows entry: `agent/v44/aiwb-agent.mjs`

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

Publishing generates both platform artifacts, updates both current manifests,
commits only Agent release files, pushes them, and verifies the public files.

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
