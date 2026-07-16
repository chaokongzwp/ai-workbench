import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const buildStamp = new Date()
  .toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" })
  .replace(/\D/g, "")
  .slice(0, 12);
const appBuild =
  process.env.AIWB_APP_BUILD || process.env.AIWB_MAC_BUILD_NUMBER || process.env.CURRENT_PROJECT_VERSION || buildStamp;

export default defineConfig({
  base: "./",
  define: {
    __AIWB_APP_VERSION__: JSON.stringify(packageJson.version || "0.0.0"),
    __AIWB_APP_BUILD__: JSON.stringify(appBuild),
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
