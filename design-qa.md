**2026-07-10 iPhone Redesign QA**
- Visual source: `/Users/zwp/.codex/generated_images/019f467a-d5c1-75d2-a3a9-405bc7a29b0e/ig_0f240a843e36f84a016a4f9c45e7f0819189ad2447589c5e46.png`
- User issue screenshot: `/Users/zwp/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/zacao135792_592b/temp/RWTemp/2026-07/9e20f478899dc29eb19741386f9343c8/2f659a79d32b9669485352d7a25f22ce.jpg`
- Final chat screenshot: `/Users/zwp/ai_desktop/ecs-ai-workbench/qa-screenshots/iphone-release-ready-final.png`
- Final full-screen switcher: `/Users/zwp/ai_desktop/ecs-ai-workbench/qa-screenshots/iphone-session-fullscreen-final-search.png`
- Chat comparison: `/Users/zwp/ai_desktop/ecs-ai-workbench/qa-screenshots/iphone-source-vs-final.png`
- Switcher comparison: `/Users/zwp/ai_desktop/ecs-ai-workbench/qa-screenshots/iphone-switcher-source-vs-final-search.png`
- Device: iPhone 16 Pro simulator, iOS 18.4, portrait only (`402 x 874` CSS points; `1206 x 2622` screenshot pixels).

**iPhone Findings**
- No actionable P0/P1/P2 findings remain.
- Safe areas: the top bar clears Dynamic Island/status controls and the composer clears the Home Indicator. The page shell itself cannot pan horizontally or vertically; only the conversation region scrolls vertically.
- Navigation: text pills were replaced by native icon controls. The session switcher is a full-screen iPhone view with search, compact task rows, connection state, add, and close actions.
- Conversation: dark-mode Markdown now inherits iPhone text tokens, restoring readable contrast. User prompts use a compact blue bubble and assistant responses use a single-column reading measure.
- Files: standalone Markdown file paths are removed when an actionable file row exists. File rows remain compact with visible preview/download actions.
- Composer: the input dock has a stable compact height, remains above the home indicator, and keeps download/image/send behavior. Voice controls still appear only when voice input is enabled.
- Intentional data difference: the source shows six illustrative sessions and an active Claude task; QA uses one real local fixture session with Codex and three file references so no fake production sessions ship in the app.
- Verification: `npm run build:ios` passed; Capacitor sync passed; `xcodebuild` for the iPhone 16 Pro simulator passed; final simulator install and launch passed.

final result: passed

---

**2026-07-10 Mac Workspace Redesign QA**
- Visual source: `/Users/zwp/.codex/generated_images/019f467a-d5c1-75d2-a3a9-405bc7a29b0e/ig_0b2b9406aadcf9c9016a4f9a67926c8191a22f35b2d603007b.png`
- Source crop: `/Users/zwp/ai_desktop/ecs-ai-workbench/qa-screenshots/source-ipad-expanded-crop.png`
- Packaged implementation: `/Users/zwp/ai_desktop/ecs-ai-workbench/qa-screenshots/mac-installed-qa-final-v3.png`
- Full comparison: `/Users/zwp/ai_desktop/ecs-ai-workbench/qa-screenshots/mac-source-vs-qa-final-v3.png`
- Focused sidebar comparison: `/Users/zwp/ai_desktop/ecs-ai-workbench/qa-screenshots/mac-sidebar-comparison-final.png`
- Viewport: implementation `1177 x 768`; source crop normalized to `1085 x 768`.
- State: source uses illustrative running-task data; implementation uses the user's real connected Claude session and completed Markdown output. The comparison validates the same expanded-sidebar workspace state without replacing real data with mock sessions.

**Mac Findings**
- No actionable P0/P1/P2 findings remain.
- Structure: the sidebar, centered session header, conversation canvas, and docked composer follow the selected design direction.
- Sidebar: sessions now use a two-line hierarchy of task name plus connection state/channel. Repeated AI and directory labels were removed, as was the blue selection rail.
- Conversation: content is constrained to a readable measure, user prompts remain compact, Markdown is readable, and remote files use a quiet inline card.
- Composer: the Mac view is a compact single-row surface with icon controls and a stable width; it no longer resembles the old multi-control panel.
- Intentional differences: Mac window controls replace the iPad status bar; the neutral selected row follows the user's explicit request to avoid blue selected borders/backgrounds; only real sessions are shown.
- Build: `npm run build` passed. `npm run mac:pack` passed and installed `/Applications/AI Workbench.app`.

final result: passed

---

**Build 7 Mobile Polish**
- Trigger: real iPhone TestFlight screenshot showed status bar/topbar overlap, desktop-like density, raw output taking too much space, and missing SSH password leaking as a native error.
- Fixed safe-area handling by adding `viewport-fit=cover` and safe-area aware app rows/header/bottom panels.
- Reworked iPhone first screen into setup summary, guided SSH configuration, clear task composer, and collapsed raw output.
- Kept iPad as a persistent-sidebar layout instead of stretching the iPhone view.
- Added front-end profile validation for host, username, and SSH password before running native SSH commands.
- Made Settings a mobile bottom sheet with sticky actions so `保存并测试` is always reachable.

**Build 7 Verification**
- iPhone viewport `393 x 852`: passed, no horizontal overflow, raw output collapsed, setup CTA visible.
- Settings sheet at `393 x 852`: passed, no horizontal overflow, sticky action row visible.
- iPad viewport `834 x 1194`: passed, sidebar visible, no horizontal overflow.
- `npm run build`: passed.
- `npm run ios:sync`: passed.
- `xcodebuild ... generic/platform=iOS Simulator build`: passed.
- Release archive `AIWorkbench-1.0.0-7.xcarchive`: passed.
- App Store Connect upload: passed, delivery UUID `a07c34f9-fade-4a40-b3d0-2dc4b9cf6413`.

**Source Visual Truth**
- Desktop: `/Users/zwp/.codex/generated_images/019eaf7f-b106-7cb0-ad59-10fcbdfaad7e/ig_09d6595a12f38b89016a2956a54f28819a8d75f28dd9cc4899.png`
- iPad: `/Users/zwp/.codex/generated_images/019eaf7f-b106-7cb0-ad59-10fcbdfaad7e/ig_09d6595a12f38b89016a295a36e140819a827d574b2616b44e.png`
- iPhone: `/Users/zwp/.codex/generated_images/019eaf7f-b106-7cb0-ad59-10fcbdfaad7e/ig_09d6595a12f38b89016a295af61eb4819aa18606903cab5a4d.png`

**Implementation Evidence**
- Local URL: `http://127.0.0.1:5173/`
- Desktop screenshot: `/Users/zwp/ai_desktop/ecs-ai-workbench/qa-screenshots/implementation-desktop-1440x1024.png`
- iPad screenshot: `/Users/zwp/ai_desktop/ecs-ai-workbench/qa-screenshots/implementation-ipad-834x1194.png`
- iPhone screenshot: `/Users/zwp/ai_desktop/ecs-ai-workbench/qa-screenshots/implementation-iphone-390x844.png`
- Desktop comparison: `/Users/zwp/ai_desktop/ecs-ai-workbench/qa-screenshots/comparisons/desktop-source-vs-implementation.png`
- iPad comparison: `/Users/zwp/ai_desktop/ecs-ai-workbench/qa-screenshots/comparisons/ipad-source-vs-implementation.png`
- iPhone comparison: `/Users/zwp/ai_desktop/ecs-ai-workbench/qa-screenshots/comparisons/iphone-source-vs-implementation.png`

**Viewport And State**
- Desktop: `1440 x 1024`, connected ECS host, `tmux: ai-dev`, `Codex CLI`, raw output open.
- iPad: `834 x 1194`, connected ECS host, compact sidebar visible, `tmux: ai-dev`, raw output open.
- iPhone: `390 x 844`, single-column chat, menu drawer available, raw output compact, composer sticky.
- Interaction checks: mobile drawer opened and closed; composer accepted a new task and inserted it into the current chat.

**Findings**
- No actionable P0/P1/P2 findings remain.
- Fonts and typography: system UI plus monospace code styling match the target's product-app feel. Sizes remain legible across desktop, iPad, and iPhone; mobile wrapping is controlled and no text container causes horizontal overflow.
- Spacing and layout rhythm: desktop preserves sidebar, chat stream, sticky composer, and raw output structure. iPad now keeps a compact persistent sidebar to better match the generated source. iPhone switches to a single-column flow with drawer navigation and compact terminal output.
- Colors and visual tokens: off-white base, charcoal text, blue focus accents, green SSH/connected state, and dark raw terminal surface are consistent with the selected Chat Workbench direction.
- Image quality and asset fidelity: the source UI has no photographic or illustration assets to recreate. The implementation uses code-rendered product UI only; no visible product image assets are missing.
- Copy and content: Chinese product labels, ECS/tmux/Codex/Claude/Custom terminology, local history controls, command progress, code preview, diff preview, and raw terminal output are present and aligned with the brief.

**Patches Made During QA**
- Fixed mobile width overflow by setting the outer app grid column to `minmax(0, 1fr)`.
- Tightened iPhone topbar/session pill sizing and composer/raw-output spacing.
- Restored a compact persistent sidebar for iPad-sized viewports while keeping iPhone navigation in a drawer.
- Reduced raw terminal height so it does not visually collide with the viewport edge.

**Implementation Checklist**
- Desktop responsive check: passed, `overflowingCount: 0`.
- iPad responsive check: passed, `overflowingCount: 0`.
- iPhone responsive check: passed, `overflowingCount: 0`.
- Production build: passed with `npm run build`.
- Native iOS simulator build: passed with `xcodebuild ... iphonesimulator ... build`.
- Direct Citadel SSH smoke: passed against a test ECS host.
- Remote tmux buffer send/capture smoke: passed against `/opt/limpet-workspace`.

**Follow-up Polish**
- Replace text-based control marks with a real icon library when the production shell dependencies are chosen.
- Pin the ECS SSH host fingerprint before production release.
- Replace root password login with a dedicated low-privilege ECS user and SSH key auth.

final result: passed
