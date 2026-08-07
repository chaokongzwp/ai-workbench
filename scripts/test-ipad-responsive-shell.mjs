import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ipadCompactLayoutMaxWidth,
  ipadLayoutModeForWidth,
} from "../src/platforms/ipad/ipadLayout.js";

assert.equal(ipadLayoutModeForWidth(320), "compact");
assert.equal(ipadLayoutModeForWidth(744), "compact");
assert.equal(ipadLayoutModeForWidth(768), "compact");
assert.equal(ipadLayoutModeForWidth(ipadCompactLayoutMaxWidth), "compact");
assert.equal(ipadLayoutModeForWidth(ipadCompactLayoutMaxWidth + 1), "regular");
assert.equal(ipadLayoutModeForWidth(834), "regular");
assert.equal(ipadLayoutModeForWidth(1024), "regular");
assert.equal(ipadLayoutModeForWidth(0), "regular");

const ipadShell = readFileSync(
  new URL("../src/platforms/ipad/IpadWorkbenchShell.jsx", import.meta.url),
  "utf8",
);
const nativeShell = readFileSync(
  new URL("../src/platforms/native/NativeWorkbenchShell.jsx", import.meta.url),
  "utf8",
);
const ipadCss = readFileSync(
  new URL("../src/platforms/ipad/ipad.css", import.meta.url),
  "utf8",
);
const infoPlist = readFileSync(
  new URL("../ios/App/App/Info.plist", import.meta.url),
  "utf8",
);

assert.match(ipadShell, /window\.visualViewport\?\.addEventListener\("resize", updateLayoutMode\)/);
assert.match(ipadShell, /compactNavigation=\{layoutMode === "compact"\}/);
assert.match(nativeShell, /const useDrawerNavigation = !isIpad \|\| compactNavigation/);
assert.match(nativeShell, /data-ipad-layout=\{isIpad \? \(compactNavigation \? "compact" : "regular"\) : undefined\}/);
assert.match(nativeShell, /useDrawerNavigation\s*\?\s*"打开会话列表"/);
assert.match(nativeShell, /collapsed=\{closeAfterAction && isIpad \? false : Boolean\(sidebarCollapsed\)\}/);
assert.match(nativeShell, /!isIpad && sidebarCollapsed/);
assert.match(ipadCss, /data-ipad-layout="compact"\]\.native-session-open[\s\S]*?\.native-session-sheet/);
assert.match(ipadCss, /data-ipad-layout="compact"\][\s\S]*?\.native-ipad-sidebar\s*\{\s*display: none !important/);
assert.match(ipadCss, /--ipad-sidebar-width: clamp\(280px, 28vw, 320px\)/);
assert.match(ipadCss, /grid-template-rows: auto auto minmax\(0, 1fr\) auto/);
assert.match(infoPlist, /<key>UIRequiresFullScreen<\/key>\s*<false\/>/);

console.log("iPad responsive shell regression: ok");
