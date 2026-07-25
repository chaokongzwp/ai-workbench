# AI Workbench App Store Screenshots

The `output` directory contains upload-ready PNG screenshots:

- `iphone`: 1320 x 2868, accepted for the 6.9-inch iPhone screenshot slot.
- `ipad`: 2752 x 2064 landscape, accepted for the 13-inch iPad screenshot slot.
- `mac`: 2880 x 1800, accepted for the Mac screenshot slot.

Each platform contains four screenshots in the intended App Store order:

1. Remote AI conversation and completed result.
2. Agent-backed background task execution.
3. Multi-project session management.
4. Markdown, diagram, table, and remote-file handling.

All visible project names, paths, task content, and statuses are fictional and safe for public App Store metadata.

Regenerate the images with:

```bash
NODE_PATH=/Users/zwp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
  /Users/zwp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
  app-store-assets/render.mjs
```
