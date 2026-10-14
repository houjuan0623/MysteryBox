import test from "node:test";
import assert from "node:assert/strict";
import { MongoNetworkError, type MongoClient, type Db } from "mongodb";
import { MongoStore } from "../src/store";
/** 提交响应丢失时只能重试同一事务提交，绝不能再次执行有外部副作用的回调。 */
test("network-labelled unknown Mongo commit retries commit only once without replaying callback", async () => {
  let commits = 0,
    callbacks = 0,
    ended = 0;
  const session = {
    startTransaction() {},
    async commitTransaction() {
      if (++commits === 1) {
        const e = new MongoNetworkError("synthetic response loss");
        e.addErrorLabel("UnknownTransactionCommitResult");
        throw e;
      }
    },
    async abortTransaction() {},
    inTransaction() {
      return true;
    },
    async endSession() {
      ended++;
    },
  };
  const client = { startSession: () => session } as unknown as MongoClient;
  const db = { collection: () => ({ updateOne: async () => ({}) }) } as unknown as Db;
  const store = new MongoStore(client, db);
  assert.equal(
    await store.atomic("key", async () => {
      callbacks++;
      return 42;
    }),
    42,
  );
  assert.equal(commits, 2);
  assert.equal(callbacks, 1);
  assert.equal(ended, 1);
});
