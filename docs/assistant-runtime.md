# AI Workbench Assistant Runtime

This module describes AI Workbench to a future "main AI" and exposes a small CLI contract that an ASR/TTS driven assistant can use.

## Goal

The main AI should not guess what the app can do. It should receive:

- a stable system description
- a capability catalog
- an intent JSON schema
- examples for voice commands
- a local-first intent parser for simple commands

The app remains the executor. The main AI only chooses an action and fills parameters.

## Natural Interaction Model

The target interaction is not "user gives commands to a terminal". It should feel like:

- the user is the company owner
- the main AI is the owner's assistant or chief of staff
- each work session is a project collaborator or workstream
- a single project can have multiple work personas

Example:

```text
User: 让全栈那边把支付回调失败查清楚
Assistant intent: send an end-to-end task to the full-stack work persona in the payment project

User: 问一下质量那边有没有上线风险
Assistant intent: send a risk analysis task to the quality work persona

User: 第二个
Assistant intent: switch to the second project/session
```

The assistant should speak in human project language. It should not expose SSH, tmux, shell buffers, or raw CLI screens unless the user explicitly asks for technical details.

## Project And Role Model

A work directory is a project, not necessarily a single conversation.

The same work directory can have multiple work personas. A persona is not a fixed company job title. In the AI era, one persona can complete an entire feature end to end, or temporarily take a specific perspective.

Recommended persona names:

- full-stack feature owner
- launch / release
- quality / risk
- data
- security
- architecture
- growth
- project steward
- documentation

Traditional words such as frontend, backend, testing, and operations can still be used as aliases, but the system should not assume those are hard capability boundaries.

So a session is identified by:

```text
server + workdir + work persona + AI worker + conversationId
```

This allows the same project path to have different collaborator conversations. For example:

```text
/opt/beex-ai-workspace/x · full-stack feature owner · Codex
/opt/beex-ai-workspace/x · quality / risk · Claude
/opt/beex-ai-workspace/x · launch / release · Codex
```

## Files

- `src/core/assistantRuntime.js`: pure runtime catalog, schema, examples, and local intent parsing.
- `scripts/aiwb-assistant-cli.mjs`: command-line entrypoint for debugging and model context export.
- `src/core/workbenchCore.js`: re-exports the runtime for app usage.

## CLI

```bash
npm run assistant:describe
npm run assistant:capabilities
npm run assistant:schema
npm run assistant:prompt
npm run assistant:intent -- "播放任务一"
```

Direct usage:

```bash
node scripts/aiwb-assistant-cli.mjs describe --format json
node scripts/aiwb-assistant-cli.mjs prompt --format json
node scripts/aiwb-assistant-cli.mjs intent "第二个"
```

## Voice Flow

1. Wake word wakes the app.
2. ASR converts speech to text and shows it live in the composer.
3. Local intent parser handles fast commands:
   - stop speech
   - stop task
   - switch session
   - play result
   - connect current session
   - scan workspaces
   - open settings
   - show status
   - switch common project personas
   - delegate simple persona-prefixed tasks
4. If local confidence is low or the user asks for real work, send:
   - `createAssistantModelContext()`
   - current session summary
   - session list
   - recent messages
   - user text
5. The main AI returns JSON matching `assistantIntentSchema`.
6. The app executes the action.
7. TTS plays either a completion summary or the full result based on settings.

## Main AI Contract

The main AI must output only JSON. It must never execute SSH commands itself and must not pretend a task has completed.

High-risk actions must set `requiresConfirmation: true`, including:

- delete
- publish/deploy
- install dependencies
- change production config
- overwrite files
- restart services

## Session Mapping

A work session is not just a work directory. It is identified by:

- local `session.id`
- remote `conversationId`
- server profile
- workdir
- work persona id / work persona name
- AI worker type

The `conversationId` is the bridge for cross-device continuity when Agent mode is available.
