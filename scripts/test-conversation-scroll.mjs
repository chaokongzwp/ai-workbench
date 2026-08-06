import assert from "node:assert/strict";
import test from "node:test";

import {
  conversationRevealReady,
  createConversationRevealRequest,
  findConversationMessageElement,
  revealConversationMessage,
  scrollConversationContainerToBottom,
} from "../src/core/conversationScroll.js";

test("a deliberate send reveal is scoped to its session and message", () => {
  const request = createConversationRevealRequest("session-06", "turn-1-request", 123);
  assert.deepEqual(request, {
    serverId: "session-06",
    messageId: "turn-1-request",
    requestedAt: 123,
  });
  assert.equal(conversationRevealReady(request, "session-06", [{ id: "older" }]), false);
  assert.equal(conversationRevealReady(request, "session-05", [{ id: "turn-1-request" }]), false);
  assert.equal(conversationRevealReady(request, "session-06", [{ id: "turn-1-request" }]), true);
});

test("scrolling a conversation reveal uses the rendered height", () => {
  const calls = [];
  const container = {
    scrollHeight: 840,
    scrollTop: 120,
    scrollTo(options) {
      calls.push(options);
    },
  };

  assert.equal(scrollConversationContainerToBottom(container), true);
  assert.equal(container.scrollTop, 840);
  assert.deepEqual(calls, [{ top: 840, behavior: "auto" }]);
  assert.equal(scrollConversationContainerToBottom(null), false);
});

test("a message-specific reveal waits for and scrolls the actual rendered message", () => {
  const calls = [];
  const container = {
    scrollTop: 20,
    querySelectorAll() {
      return [
        { dataset: { messageId: "older" } },
        target,
      ];
    },
    getBoundingClientRect() {
      return { top: 0, bottom: 300 };
    },
    scrollTo(options) {
      calls.push(options);
      this.scrollTop = options.top;
    },
  };
  const target = {
    dataset: { messageId: "turn-1-request" },
    getBoundingClientRect() {
      const top = 600 - container.scrollTop;
      return { top, bottom: top + 40 };
    },
  };

  assert.equal(findConversationMessageElement(container, "turn-1-request"), target);
  assert.equal(findConversationMessageElement(container, "missing"), null);
  assert.deepEqual(revealConversationMessage(container, "missing"), {
    found: false,
    visible: false,
  });
  assert.deepEqual(revealConversationMessage(container, "turn-1-request"), {
    found: true,
    visible: true,
  });
  assert.equal(container.scrollTop, 340);
  assert.deepEqual(calls, [{ top: 340, behavior: "auto" }]);
});
