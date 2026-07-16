import { execFile } from "node:child_process";
import { access, readdir, rm, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const buildRoot = join(projectRoot, "build", "mac");
const productName = "AI Workbench.app";
const destination = process.env.AIWB_MAC_APP_DESTINATION || join("/Applications", productName);

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findApps(root) {
  const apps = [];

  async function walk(dir, depth = 0) {
    if (depth > 5) return;
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (!entry.isDirectory()) continue;
      if (entry.name.endsWith(".app")) {
        const info = await stat(fullPath);
        apps.push({ path: fullPath, mtimeMs: info.mtimeMs });
        continue;
      }
      await walk(fullPath, depth + 1);
    }
  }

  await walk(root);
  return apps.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function registerWithLaunchServices(appPath) {
  const lsregister =
    "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
  if (!(await pathExists(lsregister))) return;
  try {
    await execFileAsync(lsregister, ["-f", appPath]);
  } catch {
    // LaunchServices refresh is best-effort; copying the app is the important part.
  }
}

async function main() {
  if (process.platform !== "darwin") {
    console.log("AI Workbench: 当前不是 macOS，跳过复制到应用程序。");
    return;
  }

  const preferredSources = [
    process.env.AIWB_MAC_APP_SOURCE,
    join(buildRoot, "mac-arm64", productName),
    join(buildRoot, "mac", productName),
    join(buildRoot, "mas-arm64", productName),
  ].filter(Boolean);
  let preferredSource = "";
  for (const item of preferredSources) {
    if (await pathExists(item)) {
      preferredSource = item;
      break;
    }
  }
  const apps = await findApps(buildRoot);
  const source = preferredSource || apps.find((item) => basename(item.path) === productName)?.path || apps[0]?.path;

  if (!source) {
    throw new Error(`没有找到 Mac App。请先运行 npm run mac:pack，预期目录：${buildRoot}`);
  }

  console.log(`AI Workbench: 复制 ${source} -> ${destination}`);

  try {
    await rm(destination, { recursive: true, force: true });
    await execFileAsync("ditto", ["--rsrc", "--extattr", source, destination]);
    await registerWithLaunchServices(destination);
  } catch (error) {
    throw new Error(
      [
        `复制到应用程序失败：${error.message}`,
        "如果 /Applications 没有写入权限，可以手动运行：",
        `sudo ditto --rsrc --extattr "${source}" "${destination}"`,
      ].join("\n")
    );
  }

  console.log("AI Workbench: 已复制到应用程序，可以直接从应用列表打开。");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
