import assert from "node:assert/strict";
import test from "node:test";

import {
  clearPendingViewRequestIds,
  synchronizeViewRequestUser,
  viewRequestStorageKey,
} from "../src/utils/viewRequestIdentity.ts";

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
  };
}

test("VIEW request UUID storage is scoped by user, evidence, and action", () => {
  const userA = "11111111-1111-4111-8111-111111111111";
  const userB = "22222222-2222-4222-8222-222222222222";
  const evidenceX = "33333333-3333-4333-8333-333333333333";
  const evidenceY = "44444444-4444-4444-8444-444444444444";

  assert.notEqual(
    viewRequestStorageKey(userA, evidenceX),
    viewRequestStorageKey(userA, evidenceY),
  );
  assert.notEqual(
    viewRequestStorageKey(userA, evidenceX),
    viewRequestStorageKey(userB, evidenceX),
  );
  assert.match(viewRequestStorageKey(userA, evidenceX), /_VIEW_/);
});

test("authenticated user change clears the previous user's pending UUID", () => {
  const storage = memoryStorage();
  const userA = "11111111-1111-4111-8111-111111111111";
  const userB = "22222222-2222-4222-8222-222222222222";
  const requestKey = viewRequestStorageKey(
    userA,
    "33333333-3333-4333-8333-333333333333",
  );

  synchronizeViewRequestUser(userA, storage);
  storage.setItem(requestKey, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  synchronizeViewRequestUser(userB, storage);

  assert.equal(storage.getItem(requestKey), null);
  clearPendingViewRequestIds(storage);
  assert.equal(storage.length, 0);
});
