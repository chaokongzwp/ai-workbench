import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/platforms/iphone/iphone.css", import.meta.url), "utf8");

assert.match(css, /\.iphone-shell:not\(\[data-theme="dark"\]\)[\s\S]*?\.iphone-icon-button:not\(:disabled\)[\s\S]*?color: #4b5563 !important;/);
assert.match(css, /\.iphone-icon-button\.active:not\(\.danger\):not\(:disabled\)[\s\S]*?color: #0b5cb8 !important;/);
assert.match(css, /--iphone-readable-blue: #165a94;/);
assert.match(css, /\.message-header \.task-timer\.running/);
assert.match(css, /\.iphone-shell:not\(\[data-theme="dark"\]\) \.agent-failure-real-error \.copy-agent-error/);
assert.match(css, /\.iphone-shell:not\(\[data-theme="dark"\]\) \.agent-failure-actions button\.primary/);
assert.match(css, /\.iphone-shell \.raw-output \.connection-mode-badge\.ssh \{[\s\S]*?color: #ffffff;[\s\S]*?background: #165a94;/);
assert.match(css, /\.agent-task-item\.active em/);
assert.match(css, /\.task-status-actions button:first-child/);
assert.match(css, /\.settings-inline-button:not\(\.primary\):not\(\.danger\):not\(:disabled\)/);
assert.match(css, /\.session-cli-panel[\s\S]*?color: var\(--settings-secondary\);/);
assert.match(css, /\.session-agent-panel[\s\S]*?color: var\(--settings-secondary\);/);
assert.match(css, /\.iphone-shell \.settings-panel \.settings-inline-button:disabled \{[\s\S]*?color: var\(--settings-tertiary\);[\s\S]*?opacity: 1;/);
assert.match(css, /\.directory-method-action:not\(:disabled\)/);
assert.match(css, /\.manual-directory[\s\S]*?button:not\(:disabled\)/);
assert.match(css, /\.rich-message a \{[\s\S]*?color: var\(--iphone-text\);[\s\S]*?text-decoration: underline;/);
assert.match(css, /\.rich-message code:not\(pre code\) \{[\s\S]*?color: var\(--iphone-text\);/);
assert.match(css, /\.rich-message pre \{[\s\S]*?color: var\(--iphone-text\);/);
assert.match(css, /\.rich-message pre code \{[\s\S]*?color: inherit;[\s\S]*?background: transparent;/);
assert.match(css, /\.model-choice-actions button \+ button \{[\s\S]*?color: var\(--iphone-text\);/);

function relativeLuminance(hex) {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

assert.ok(contrastRatio("#ffffff", "#165a94") >= 7, "compact blue labels must meet AAA contrast");
assert.ok(contrastRatio("#4b5563", "#ffffff") >= 7, "light composer controls must meet AAA contrast");
assert.ok(contrastRatio("#0b5cb8", "#dbedff") >= 4.5, "light active labels must meet AA contrast");

console.log("iPhone contrast tests passed.");
