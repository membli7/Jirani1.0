"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, test } = require("node:test");
const { createWriteQueue } = require("../storage/write-queue");

const directories = [];
after(async () => {
  await Promise.all(directories.map(directory => fs.rm(directory, { recursive: true, force: true })));
});

test("file writes are serialized, atomic, and drain their pending count", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "jirani-write-queue-"));
  directories.push(directory);
  const target = path.join(directory, "state.json");
  const queue = createWriteQueue();
  const writes = ["first", "second", "third"].map(value => queue.writeFile(target, value));
  assert.equal(queue.getLength(), 3);
  await Promise.all(writes);
  assert.equal(await fs.readFile(target, "utf8"), "third");
  assert.equal(queue.getLength(), 0);
  assert.deepEqual((await fs.readdir(directory)).sort(), ["state.json"]);
});
