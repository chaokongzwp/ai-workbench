import assert from "node:assert/strict";

import { workbenchAgentScript } from "../src/core/agent.js";

const source = workbenchAgentScript();
const functionBody = (name, nextName) => {
  const start = source.indexOf(`${name}() {`);
  const end = source.indexOf(`\n${nextName}() {`, start);
  assert.ok(start >= 0 && end > start, `missing ${name}`);
  return source.slice(start, end);
};

for (const [name, nextName] of [
  ["aiwb_running_count", "aiwb_conversation_active_task"],
  ["aiwb_tick_tasks_unlocked", "aiwb_tick_tasks"],
  ["aiwb_task_count", "aiwb_host_metrics"],
]) {
  const body = functionBody(name, nextName);
  assert.doesNotMatch(body, /cat "\$task_dir\/status"/, `${name} must not fork cat once per historical task`);
  assert.match(body, /IFS= read -r status/, `${name} must use the shell builtin for status reads`);
}

const tickBody = functionBody("aiwb_tick_tasks_unlocked", "aiwb_tick_tasks");
assert.doesNotMatch(
  tickBody,
  /done\|error\|cancelled[\s\S]*aiwb_schedule_terminal_notification/,
  "the daemon must not reschedule notifications for every historical terminal task on every tick",
);
assert.match(source, /aiwb_set_status\(\)[\s\S]*aiwb_schedule_terminal_notification/, "task completion must still schedule one notification");

console.log("agent daemon historical-task scaling regression: ok");
