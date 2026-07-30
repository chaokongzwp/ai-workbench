import assert from "node:assert/strict";
import test from "node:test";

import { parsePreformattedTable } from "../src/core/structuredText.js";

test("recognizes aligned git reference output as a compact table", () => {
  const result = parsePreformattedTable(
    [
      "8574228151a6c6f1997e5d0bc4c4cfe027c2e78e    HEAD",
      "",
      "8574228151a6c6f1997e5d0bc4c4cfe027c2e78e    refs/heads/main",
    ].join("\n"),
    "bash",
  );

  assert.equal(result?.columnCount, 2);
  assert.deepEqual(result?.rows[1], ["8574228151a6c6f1997e5d0bc4c4cfe027c2e78e", "refs/heads/main"]);
});

test("recognizes tab-delimited command output", () => {
  const result = parsePreformattedTable("PID\tSTATUS\n1024\trunning", "text");
  assert.deepEqual(result?.rows, [
    ["PID", "STATUS"],
    ["1024", "running"],
  ]);
});

test("keeps ordinary prose and source code as code blocks", () => {
  assert.equal(parsePreformattedTable("This is a sentence.\nThis is another sentence."), null);
  assert.equal(parsePreformattedTable("const value = 1;\nreturn value;", "js"), null);
});
