import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  progressiveMessageWindow,
  useProgressiveMessages,
} from "../src/platforms/useProgressiveMessages.js";

const messages = Array.from({ length: 12 }, (_, index) => ({
  id: `message-${index + 1}`,
  body: `Message ${index + 1}`,
}));

function ProgressiveMessagesHarness({ revealMessageId = "" }) {
  const { visibleMessages } = useProgressiveMessages({
    messages,
    sessionId: "session-06",
    revealMessageId,
  });
  return React.createElement(
    "output",
    null,
    visibleMessages.map((message) => message.id).join(","),
  );
}

test("progressive messages keep the default tail window", () => {
  const result = progressiveMessageWindow(messages, 6);

  assert.deepEqual(
    result.visibleMessages.map((message) => message.id),
    ["message-7", "message-8", "message-9", "message-10", "message-11", "message-12"],
  );
  assert.equal(result.revealCount, 0);
});

test("progressive messages include a requested message outside the default tail", () => {
  const result = progressiveMessageWindow(messages, 6, "message-3");

  assert.deepEqual(
    result.visibleMessages.map((message) => message.id),
    messages.slice(2).map((message) => message.id),
  );
  assert.equal(result.revealCount, 10);
});

test("the progressive hook forwards revealMessageId into its visible messages", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ProgressiveMessagesHarness, { revealMessageId: "message-3" }),
  );

  assert.equal(
    markup,
    "<output>message-3,message-4,message-5,message-6,message-7,message-8,message-9,message-10,message-11,message-12</output>",
  );
});

test("progressive messages keep the default window for a missing reveal target", () => {
  const result = progressiveMessageWindow(messages, 6, "message-missing");

  assert.deepEqual(
    result.visibleMessages.map((message) => message.id),
    messages.slice(-6).map((message) => message.id),
  );
  assert.equal(result.revealCount, 0);
});
