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
- Direct Citadel SSH smoke: passed against ECS `47.236.117.100`.
- Remote tmux buffer send/capture smoke: passed against `/opt/limpet-workspace`.

**Follow-up Polish**
- Replace text-based control marks with a real icon library when the production shell dependencies are chosen.
- Pin the ECS SSH host fingerprint before production release.
- Replace root password login with a dedicated low-privilege ECS user and SSH key auth.

final result: passed
