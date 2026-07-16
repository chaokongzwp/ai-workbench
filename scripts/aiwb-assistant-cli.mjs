#!/usr/bin/env node

import {
  createAssistantModelContext,
  createAssistantRuntimeCatalog,
  formatAssistantRuntimeMarkdown,
  interpretLocalAssistantIntent,
} from "../src/core/assistantRuntime.js";

const args = process.argv.slice(2);

function takeFlag(name, fallback = "") {
  const long = `--${name}`;
  const index = args.indexOf(long);
  if (index < 0) return fallback;
  const value = args[index + 1];
  args.splice(index, value && !value.startsWith("--") ? 2 : 1);
  return value && !value.startsWith("--") ? value : "true";
}

function hasFlag(name) {
  const long = `--${name}`;
  const index = args.indexOf(long);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp() {
  process.stdout.write(`AI Workbench Assistant CLI

Usage:
  node scripts/aiwb-assistant-cli.mjs describe [--format markdown|json]
  node scripts/aiwb-assistant-cli.mjs capabilities [--format json|markdown]
  node scripts/aiwb-assistant-cli.mjs schema
  node scripts/aiwb-assistant-cli.mjs prompt [--format json|markdown]
  node scripts/aiwb-assistant-cli.mjs intent "用户原话" [--format json]

Commands:
  describe       输出完整系统说明、能力清单、模型指令和 schema
  capabilities   只输出 App 能力清单
  schema         输出主 AI 必须遵守的意图 JSON Schema
  prompt         输出适合喂给主 AI 的模型上下文包
  intent         运行本地规则，识别停止/切换/播放/设置/扫描等常见语音命令
`);
}

const command = args.shift() || "help";
const format = takeFlag("format", hasFlag("json") ? "json" : "");

switch (command) {
  case "describe": {
    const catalog = createAssistantRuntimeCatalog();
    if ((format || "markdown") === "json") printJson(catalog);
    else process.stdout.write(formatAssistantRuntimeMarkdown(catalog));
    break;
  }
  case "capabilities": {
    const catalog = createAssistantRuntimeCatalog();
    if ((format || "json") === "markdown") {
      process.stdout.write(
        catalog.capabilities
          .map((capability) => `- ${capability.id}: ${capability.title}\n  ${capability.summary}`)
          .join("\n"),
      );
    } else {
      printJson(catalog.capabilities);
    }
    break;
  }
  case "schema": {
    printJson(createAssistantRuntimeCatalog().intentSchema);
    break;
  }
  case "prompt": {
    const context = createAssistantModelContext();
    if ((format || "json") === "markdown") {
      process.stdout.write(formatAssistantRuntimeMarkdown(createAssistantRuntimeCatalog()));
    } else {
      printJson(context);
    }
    break;
  }
  case "intent": {
    const text = args.join(" ").trim();
    if (!text) {
      console.error('Missing user text. Example: node scripts/aiwb-assistant-cli.mjs intent "播放任务一"');
      process.exit(2);
    }
    printJson(interpretLocalAssistantIntent(text));
    break;
  }
  case "help":
  case "--help":
  case "-h":
    printHelp();
    break;
  default:
    console.error(`Unknown command: ${command}\n`);
    printHelp();
    process.exit(2);
}
