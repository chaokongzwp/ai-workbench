import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeSessionEnvironmentVariables,
  parseSessionEnvironmentVariables,
} from "../src/core/foundation.js";

test("parses dotenv and shell export assignments", () => {
  const parsed = parseSessionEnvironmentVariables(`
export EXAMPLE_VERIFICATION_TOKEN=test-token-123
export LIMPET_FEISHU_DEV_ASSISTANT_ENCRYPT_KEY=

LIMPET_FEISHU_KNOWLEDGE_ASSISTANT_ENABLED=true
`);

  assert.deepEqual(parsed, {
    entries: [
      {
        name: "EXAMPLE_VERIFICATION_TOKEN",
        value: "test-token-123",
        line: 2,
      },
      {
        name: "LIMPET_FEISHU_DEV_ASSISTANT_ENCRYPT_KEY",
        value: "",
        line: 3,
      },
      {
        name: "LIMPET_FEISHU_KNOWLEDGE_ASSISTANT_ENABLED",
        value: "true",
        line: 5,
      },
    ],
    errors: [],
  });
});

test("ignores blank lines and full-line comments", () => {
  const parsed = parseSessionEnvironmentVariables("\n# comment\n   # indented comment\n\nVALUE=kept\n");

  assert.deepEqual(parsed.entries, [{ name: "VALUE", value: "kept", line: 5 }]);
  assert.deepEqual(parsed.errors, []);
});

test("unwraps single and double quoted values", () => {
  const parsed = parseSessionEnvironmentVariables(String.raw`SINGLE='value with spaces # kept'
DOUBLE="value with spaces"
ESCAPED="first\nsecond \"quoted\" \\tail"`);

  assert.deepEqual(parsed.entries, [
    { name: "SINGLE", value: "value with spaces # kept", line: 1 },
    { name: "DOUBLE", value: "value with spaces", line: 2 },
    { name: "ESCAPED", value: 'first\nsecond "quoted" \\tail', line: 3 },
  ]);
  assert.deepEqual(parsed.errors, []);
});

test("normalizes CRLF input while retaining source line numbers", () => {
  const parsed = parseSessionEnvironmentVariables("FIRST=1\r\n\r\nexport SECOND=2\r\nINVALID\r\n");

  assert.deepEqual(parsed.entries, [
    { name: "FIRST", value: "1", line: 1 },
    { name: "SECOND", value: "2", line: 3 },
  ]);
  assert.deepEqual(parsed.errors, ["第 4 行缺少 KEY=value 格式。"]);
});

test("accepts a UTF-8 BOM before the first export", () => {
  const parsed = parseSessionEnvironmentVariables("\uFEFFexport FIRST=value\r\nSECOND=2\r\n");

  assert.deepEqual(parsed.entries, [
    { name: "FIRST", value: "value", line: 1 },
    { name: "SECOND", value: "2", line: 2 },
  ]);
  assert.deepEqual(parsed.errors, []);
});

test("reports malformed assignments and keeps valid lines", () => {
  const parsed = parseSessionEnvironmentVariables(`
MISSING_EQUALS
9INVALID=value
export =value
AIWB_INTERNAL=value
VALID=value=with=equals
`);

  assert.deepEqual(parsed.entries, [{ name: "VALID", value: "value=with=equals", line: 6 }]);
  assert.deepEqual(parsed.errors, [
    "第 2 行缺少 KEY=value 格式。",
    "第 3 行的变量名无效。",
    "第 4 行缺少 KEY=value 格式。",
    "第 5 行不能覆盖 AIWB_ 内部变量。",
  ]);
});

test("merges atomically and lets imported values replace matching names", () => {
  const merged = mergeSessionEnvironmentVariables(
    "KEEP=original\nREPLACE=old",
    "export REPLACE=new\nEMPTY=\nADDED=true",
  );

  assert.deepEqual(merged, {
    entries: [
      { name: "KEEP", value: "original", line: 1 },
      { name: "REPLACE", value: "new", line: 1 },
      { name: "EMPTY", value: "", line: 2 },
      { name: "ADDED", value: "true", line: 3 },
    ],
    errors: [],
    errorSource: "",
    importedCount: 3,
  });

  const rejected = mergeSessionEnvironmentVariables("KEEP=original", "VALID=1\nINVALID LINE");
  assert.deepEqual(rejected.entries, [{ name: "KEEP", value: "original", line: 1 }]);
  assert.deepEqual(rejected.errors, ["第 2 行缺少 KEY=value 格式。"]);
  assert.equal(rejected.errorSource, "imported");
  assert.equal(rejected.importedCount, 0);
});
