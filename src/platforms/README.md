# Platform Modules

Platform shells own layout and platform-specific interaction only.

- `mac/`: Mac and desktop preview shell.
- `iphone/`: iPhone entrypoint.
- `ipad/`: iPad entrypoint.
- `android/`: Android entrypoint.
- `native/`: shared native shell used by phone/tablet entrypoints until a platform needs its own UI.

Shared business logic stays in `src/app/useWorkbenchController.jsx` and is passed into shells as props.
Reusable visual pieces live in `src/features`, and remote/Agent/file/voice helpers live in `src/core`.
