# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Current product decision: do not put an autonomous "main AI" router in the first usable version. The first version is human-controlled: the user chooses server, AI type, workspace, and whether to send/stop. Voice should first behave as a convenient input method, not as an autonomous decision maker. Treat a future main AI router as an optional later enhancement.

Current chat design decision: messages in the conversation transcript use a flat, background-free layout. Do not reintroduce rounded chat bubbles around user or assistant text.

Current transcript layout decision: message content must never expand the page beyond the viewport. Long inline code wraps inside the message, fenced code scrolls only inside its own block, and iPhone typography must use the configured message size without WebKit text inflation.

Current Claude login decision: remote Claude CLI OAuth is a manual URL-and-code handoff. The App must show the complete unwrapped authorization URL with open and copy actions, then provide an authorization-code field and submit that code back to the waiting remote Claude CLI. Do not treat browser authorization alone as completion, and do not truncate long OAuth query parameters.

Current Agent distribution decision: every Agent install or repair must resolve the latest release through the configuration center and download manifests and binaries hosted by that center. GitHub may remain the source-code and release backup, but target machines must not depend on GitHub access during installation.

Current platform layout decision: iPhone, iPad, and Mac keep independent platform shells and are adapted separately. The iPad shell uses its actual window width: a persistent split-view session sidebar at 820 points and above, and an iPad-specific session drawer below 820 points for Split View, Stage Manager, classic iPads, and iPad mini widths. Do not collapse the three platforms into one shared interface layout.
