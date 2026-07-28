# Design QA: Wake Word Control

- Source visual truth: `/Users/zwp/.codex/generated_images/019eaf7f-b106-7cb0-ad59-10fcbdfaad7e/call_Fkd0dO9lihKsHrSSXx1rtfwI.png`
- Implementation screenshot: `/Users/zwp/ai_desktop/ecs-ai-workbench/design/qa/wake-word-control-implementation-default.png`
- Combined comparison: `/Users/zwp/ai_desktop/ecs-ai-workbench/design/qa/wake-word-control-comparison.png`
- Browser URL: `http://127.0.0.1:4191/design/wake-word-button-preview.html`
- Viewport: `1280 x 720` CSS px
- Device pixel ratio: `2`
- Source pixels: `1835 x 857`
- Implementation pixels: `1280 x 720`
- Normalization: both captures centered on a `1280 x 720` dark canvas for the comparison image
- State: dark theme, wake word off and listening states

## Full-view comparison

The implementation preserves the selected concept's two-state hierarchy:

- Wake control is the first toolbar action.
- The lightning glyph is replaced with an ear icon and a visible text label.
- Off state reads `唤醒` with a quiet outline.
- Active state reads `监听中`, adds a green state dot, and uses a neutral soft-gray fill.
- The normal microphone remains a separate action.
- No blue selected state is used.

The production component keeps the existing AI Workbench 32px toolbar rhythm instead of adopting the generated concept's oversized controls. This is an intentional product-system constraint; the selected interaction and visual language remain intact.

## Focused-region comparison

The wake control was checked at the toolbar level because icon, state dot, label, border, and active fill are the fidelity-critical details. Ear icon weight, 5-6px green status dot, 12px label, 10px radius, and neutral active surface match the selected direction. Mac, iPad, iPhone, and shared composer selectors were checked separately so one platform cannot force the pill back into a square icon button.

## Interaction verification

- Clicking the off-state `唤醒` control changes its accessible state to `监听中`.
- Both off and active variants render with unique accessible labels.
- The preview console has no errors or warnings.
- Production web build passes.
- Message lifecycle regression passes.

## Comparison history

### Pass 1

- Earlier finding: inherited final-control CSS forced every composer tool to a 32px square and colored active wake state blue.
- Fix: added a dedicated wake pill contract after inherited controls, plus platform-scoped Mac, iPad, and iPhone overrides.
- Post-fix evidence: combined comparison shows the ear-and-label pill in both states, with a green listening indicator and no blue state.

## Findings

No actionable P0, P1, or P2 visual differences remain.

## Follow-up polish

- P3: Test the Chinese label optical weight on one physical iPhone with Display Zoom enabled.

## Final result

final result: passed
