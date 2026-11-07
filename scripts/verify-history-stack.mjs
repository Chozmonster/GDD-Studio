/**
 * Smoke-test the snapshot undo/redo helpers (no build step).
 * Run: node scripts/verify-history-stack.mjs
 */
import assert from "node:assert/strict";

function createHistoryStack() {
  return { past: [], future: [] };
}

function historyPush(stack, snapshot, options = {}) {
  const limit = options.limit ?? 100;
  const past = [...stack.past, snapshot];
  while (past.length > limit) past.shift();
  return { past, future: [] };
}

function historyUndo(stack, current) {
  if (stack.past.length === 0) return null;
  const past = stack.past.slice();
  const snapshot = past.pop();
  return { stack: { past, future: [...stack.future, current] }, snapshot };
}

function historyRedo(stack, current) {
  if (stack.future.length === 0) return null;
  const future = stack.future.slice();
  const snapshot = future.pop();
  return { stack: { past: [...stack.past, current], future }, snapshot };
}

let stack = createHistoryStack();
stack = historyPush(stack, "a");
stack = historyPush(stack, "b");
let step = historyUndo(stack, "c");
assert.equal(step.snapshot, "b");
stack = step.stack;
step = historyUndo(stack, "b");
assert.equal(step.snapshot, "a");
stack = step.stack;
step = historyRedo(stack, "a");
assert.equal(step.snapshot, "b");
stack = step.stack;
// New action clears redo
stack = historyPush(stack, "b");
assert.equal(stack.future.length, 0);
assert.equal(historyRedo(stack, "d"), null);

console.log("history-stack ok");
