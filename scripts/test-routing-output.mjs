import assert from "node:assert/strict";
import { extractAgentFinalOutput, unwrapWholeMarkdownFence } from "../src/core/routingOutput.js";

const wrappedReport = `\`\`\`

**任务：下载所有仓库。**

| 仓库 | 状态 |
| --- | --- |
| app | 完成 |

- 验证通过

\`\`\``;

const expectedReport = `**任务：下载所有仓库。**

| 仓库 | 状态 |
| --- | --- |
| app | 完成 |

- 验证通过`;

assert.equal(unwrapWholeMarkdownFence(wrappedReport), expectedReport);
assert.equal(extractAgentFinalOutput(wrappedReport).text, expectedReport);
assert.equal(
  unwrapWholeMarkdownFence("```js\nconsole.log('hello');\n```"),
  "```js\nconsole.log('hello');\n```",
);
assert.equal(
  unwrapWholeMarkdownFence("```\nconst value = 1;\nconsole.log(value);\n```"),
  "```\nconst value = 1;\nconsole.log(value);\n```",
);

console.log("routing output fence normalization tests passed");
