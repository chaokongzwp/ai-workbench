import assert from "node:assert/strict";
import test from "node:test";
import { reorderSessionsById } from "../src/core/sessionOrder.js";

const sessions = [{ id: "one" }, { id: "two" }, { id: "three" }];

test("moves a session before another session", () => {
  const reordered = reorderSessionsById(sessions, "three", "one", "before");
  assert.deepEqual(reordered.map(({ id }) => id), ["three", "one", "two"]);
  assert.deepEqual(sessions.map(({ id }) => id), ["one", "two", "three"]);
});

test("moves a session after another session", () => {
  const reordered = reorderSessionsById(sessions, "one", "three", "after");
  assert.deepEqual(reordered.map(({ id }) => id), ["two", "three", "one"]);
});

test("returns the original list when either session is missing", () => {
  assert.equal(reorderSessionsById(sessions, "missing", "one"), sessions);
  assert.equal(reorderSessionsById(sessions, "one", "missing"), sessions);
});
