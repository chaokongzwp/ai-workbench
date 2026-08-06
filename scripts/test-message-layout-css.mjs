import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const macCss = await readFile(new URL("../src/platforms/mac/mac.css", import.meta.url), "utf8");
const ipadCss = await readFile(new URL("../src/platforms/ipad/ipad.css", import.meta.url), "utf8");

assert.match(
  css,
  /\.rich-message\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
  "rich-message must constrain its implicit Grid track to the message width",
);
assert.match(
  css,
  /\.rich-message code:not\(pre code\)\s*\{[^}]*display:\s*inline/s,
  "inline code must remain wrappable instead of becoming an atomic inline block",
);
assert.match(
  css,
  /\.rich-table-wrap,[\s\S]*?\.rich-diagram\s*\{[^}]*width:\s*100%/s,
  "wide rich content wrappers must stay inside the constrained Grid track",
);

for (const [platform, platformCss] of [["macOS", macCss], ["iPad", ipadCss]]) {
  assert.match(
    platformCss,
    /user-message-card > p(?:,|\s*\{)[\s\S]*?font-family:\s*var\(--message-font-family\);[\s\S]*?font-size:\s*var\(--message-font-size\);[\s\S]*?font-weight:\s*var\(--message-font-weight\);[\s\S]*?line-height:\s*var\(--message-line-height\);/,
    `${platform} sent-message body must use the shared message typography`,
  );
  assert.match(
    platformCss,
    /\.rich-message[\s\S]*?font-family:\s*var\(--message-font-family\);[\s\S]*?font-size:\s*var\(--message-font-size\);[\s\S]*?font-weight:\s*var\(--message-font-weight\);[\s\S]*?line-height:\s*var\(--message-line-height\);/,
    `${platform} received-message body must use the shared message typography`,
  );
}

assert.match(
  macCss,
  /\.mac-shell \.composer\.compact \.composer-attachment\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*42px minmax\(0,\s*1fr\) 24px;/s,
  "macOS file attachments must reserve a flexible column for the filename",
);
assert.match(
  macCss,
  /\.mac-shell \.composer\.compact \.composer-attachment figcaption\s*\{[^}]*color:\s*var\(--mac-text\);[^}]*text-overflow:\s*ellipsis;/s,
  "macOS attachment filenames must remain readable in both appearance modes",
);
assert.match(
  macCss,
  /\.mac-shell \.composer\.compact \.composer-attachment-file\s*\{[^}]*color:\s*var\(--mac-text\);[^}]*background:\s*var\(--mac-surface-selected\);/s,
  "macOS attachment file icons must keep sufficient contrast",
);
assert.match(
  macCss,
  /\.mac-shell \.conversation \.message-header-recovery-actions\s*\{[^}]*display:\s*inline-flex;[^}]*border-right:\s*1px solid var\(--mac-line-soft\);/s,
  "macOS recovery actions must live in the assistant header action group",
);
assert.match(
  macCss,
  /\.message-header-recovery-actions \.message-recovery-action\s*\{[^}]*height:\s*26px;[^}]*background:\s*transparent;/s,
  "macOS recovery actions must use the compact header button treatment",
);

console.log("message layout CSS regression: ok");
