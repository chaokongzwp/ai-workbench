import fs from "node:fs";
import path from "node:path";

const configPath = path.resolve("ios/App/App/capacitor.config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const classList = new Set(config.packageClassList ?? []);

classList.add("SSHWorkbenchPlugin");
classList.add("VoiceWorkbenchPlugin");
config.packageClassList = [...classList];

fs.writeFileSync(configPath, `${JSON.stringify(config, null, "\t")}\n`);
