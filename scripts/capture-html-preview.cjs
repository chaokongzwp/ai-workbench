const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const [, , htmlPath, outputPath] = process.argv;

if (!htmlPath || !outputPath) {
  console.error("Usage: electron scripts/capture-html-preview.cjs <html> <output.png>");
  process.exit(2);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1120,
    height: 820,
    show: false,
    backgroundColor: "#0d0f14",
    webPreferences: {
      offscreen: true,
    },
  });

  await win.loadFile(path.resolve(htmlPath));
  await new Promise((resolve) => setTimeout(resolve, 500));
  const image = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outputPath), image.toPNG());
  app.quit();
});
