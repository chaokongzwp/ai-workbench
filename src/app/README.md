# App Layer

The app layer wires shared state orchestration into platform-specific shells.

- `WorkbenchApp.jsx`: thin platform selector.
- `useWorkbenchController.jsx`: shared state, effects, and action orchestration.
- `shellComponents.jsx`: shared component registry passed into platform shells.
- `../core`: SSH/Agent command builders, voice bridge, parsers, routing, and file-transfer helpers.
- `../features`: shared UI components.
- `../platforms`: Mac, iPhone, iPad, and Android shell layouts.
