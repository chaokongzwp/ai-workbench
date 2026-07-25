import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const runtimeModules =
  "/Users/zwp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const require = createRequire(`${runtimeModules}/`);
const { chromium } = require("playwright");

const root = path.resolve(import.meta.dirname);
const source = path.join(root, "source", "index.html");
const output = path.join(root, "output");
const contactSheet = path.join(root, "preview");

const targets = {
  iphone: { width: 1320, height: 2868 },
  ipad: { width: 2752, height: 2064 },
  mac: { width: 2880, height: 1800 },
};

await fs.rm(output, { recursive: true, force: true });
await fs.rm(contactSheet, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
await fs.mkdir(contactSheet, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});

try {
  for (const [platform, viewport] of Object.entries(targets)) {
    const directory = path.join(output, platform);
    await fs.mkdir(directory, { recursive: true });
    const page = await browser.newPage({
      viewport,
      deviceScaleFactor: 1,
      colorScheme: "dark",
    });

    for (let slide = 1; slide <= 4; slide += 1) {
      const url = `${pathToFileURL(source).href}?platform=${platform}&slide=${slide}`;
      await page.goto(url, { waitUntil: "networkidle" });
      await page.screenshot({
        path: path.join(directory, `${String(slide).padStart(2, "0")}-${platform}.png`),
        type: "png",
        fullPage: false,
      });
    }

    await page.close();
  }

  const previewPage = await browser.newPage({
    viewport: { width: 1800, height: 1240 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  const cards = [];
  for (const platform of Object.keys(targets)) {
    for (let slide = 1; slide <= 4; slide += 1) {
      const imagePath = path.join(output, platform, `${String(slide).padStart(2, "0")}-${platform}.png`);
      const imageData = await fs.readFile(imagePath);
      cards.push({ platform, slide, src: `data:image/png;base64,${imageData.toString("base64")}` });
    }
  }
  await previewPage.setContent(
    `<!doctype html>
      <html>
        <head>
          <style>
            *{box-sizing:border-box}
            body{margin:0;padding:40px;background:#0d0f13;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
            h1{margin:0 0 28px;font-size:34px}
            .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:26px}
            figure{margin:0;padding:12px;border:1px solid #343b45;border-radius:18px;background:#171b20}
            .canvas{height:320px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:12px;background:#08090b}
            img{display:block;max-width:100%;max-height:100%;object-fit:contain}
            figcaption{padding:12px 2px 2px;color:#c4cad2;font-size:16px}
          </style>
        </head>
        <body>
          <h1>AI Workbench · App Store 截图预览</h1>
          <div class="grid">
            ${cards
              .map(
                (item) => `<figure>
                  <div class="canvas"><img src="${item.src}" /></div>
                  <figcaption>${item.platform.toUpperCase()} · ${item.slide}</figcaption>
                </figure>`,
              )
              .join("")}
          </div>
        </body>
      </html>`,
    { waitUntil: "load" },
  );
  await previewPage.waitForTimeout(500);
  await previewPage.screenshot({
    path: path.join(contactSheet, "app-store-contact-sheet.png"),
    type: "png",
    fullPage: true,
  });
  await previewPage.close();
} finally {
  await browser.close();
}

console.log(`Rendered App Store assets to ${output}`);
