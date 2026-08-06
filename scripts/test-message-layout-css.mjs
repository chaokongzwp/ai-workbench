import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

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

console.log("message layout CSS regression: ok");
