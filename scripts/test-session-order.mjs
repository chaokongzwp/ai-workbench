import assert from "node:assert/strict";
import test from "node:test";
import { reorderSessionsById, sortSessions } from "../src/core/sessionOrder.js";

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

const sortableSessions = [
  {
    id: "server-1000000000001-a",
    createdAtMs: 100,
    name: "会话 10",
    connection: { state: "idle" },
    messages: [{ createdAtMs: 100, updatedAt: 300 }],
  },
  {
    id: "server-1000000000002-b",
    createdAtMs: 200,
    name: "会话 2",
    connection: { state: "idle" },
    messages: [{ createdAtMs: 200, updatedAt: 200, taskState: "running" }],
  },
  {
    id: "server-1000000000003-c",
    createdAtMs: 150,
    name: "Alpha",
    connection: { state: "idle" },
    messages: [{ createdAtMs: 150, updatedAt: 400 }],
  },
];

test("sorts sessions by recent activity without mutating the input", () => {
  assert.deepEqual(sortSessions(sortableSessions, "recent").map(({ name }) => name), ["Alpha", "会话 10", "会话 2"]);
  assert.equal(sortableSessions[0].name, "会话 10");
});

test("sorts sessions by creation time, natural name, and running state", () => {
  assert.deepEqual(sortSessions(sortableSessions, "created").map(({ name }) => name), ["会话 10", "Alpha", "会话 2"]);
  assert.deepEqual(sortSessions(sortableSessions, "name").map(({ name }) => name), ["会话 2", "会话 10", "Alpha"]);
  assert.equal(sortSessions(sortableSessions, "status")[0].name, "会话 2");
});
