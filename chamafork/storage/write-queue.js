"use strict";

const fs = require("node:fs/promises");
const crypto = require("node:crypto");

function createWriteQueue() {
  let tail = Promise.resolve();
  let pendingOperations = 0;

  function enqueue(operation) {
    if (typeof operation !== "function") return Promise.reject(new TypeError("Write queue operation must be a function."));
    pendingOperations += 1;
    const result = tail.then(operation, operation);
    result.then(
      () => { pendingOperations -= 1; },
      () => { pendingOperations -= 1; }
    );
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async function writeFileAtomically(filePath, contents, options = {}) {
    const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    let handle;
    try {
      handle = await fs.open(temporary, "wx", options.mode ?? 0o600);
      await handle.writeFile(contents);
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(temporary, filePath);
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      await fs.rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
  }

  function writeFile(filePath, contents, options = {}) {
    return enqueue(() => writeFileAtomically(filePath, contents, options));
  }

  function getLength() {
    return pendingOperations;
  }

  return { writeFile, getLength };
}

module.exports = { createWriteQueue };
