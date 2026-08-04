# AI Workbench Agent releases

`latest.json` and `windows-latest.json` are the authoritative release pointers.
Both manifests must reference the same version. The repository retains only the
current release directory used by the Linux and Windows installers.

## Current release

- Current version: `v38`
- Linux entry: `agent/v38/aiwbctl`
- Windows entry: `agent/v38/aiwb-agent.mjs`

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
