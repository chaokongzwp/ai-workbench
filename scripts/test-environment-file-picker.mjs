import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [main, preload, settings] = await Promise.all([
  readFile(new URL("../electron/main.mjs", import.meta.url), "utf8"),
  readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8"),
  readFile(new URL("../src/features/settings.jsx", import.meta.url), "utf8"),
]);

assert.match(
  main,
  /properties:\s*\["openFile",\s*"showHiddenFiles",\s*"dontAddToRecent"\]/,
  "the desktop environment picker must show dotfiles such as .deploy.env",
);
assert.match(main, /extensions:\s*\["env",\s*"sh",\s*"txt"\]/);
assert.match(main, /const maxEnvironmentImportBytes = 256 \* 1024/);
assert.match(main, /const info = await stat\(filePath\)/);
assert.match(main, /text:\s*await readFile\(filePath, "utf8"\)/);
assert.match(main, /ipcMain\.handle\("aiwb:pick-environment-file"/);

assert.match(preload, /pickEnvironmentFile\(\)\s*\{\s*return ipcRenderer\.invoke\("aiwb:pick-environment-file"\)/);
assert.match(settings, /const selected = await bridge\.pickEnvironmentFile\(\)/);
assert.match(settings, /if \(!bridge\?\.pickEnvironmentFile\)\s*\{\s*importInputRef\.current\?\.click\(\)/);
assert.match(settings, /accept="\.env,\.sh,\.txt,text\/plain"/);

console.log("hidden environment file picker regression: ok");
