import assert from "node:assert/strict";
import test from "node:test";

import { captureToolcraftProofIpcProcess, captureToolcraftProofProcess } from "./toolcraft-proof-process.mjs";

test("bounds captured stdout and stderr before the wall deadline", async () => {
  for (const [stream, resource] of [["stdout", "stdout-bytes"], ["stderr", "stderr-bytes"]]) {
    const startedAt = Date.now();
    await assert.rejects(captureToolcraftProofProcess(process.execPath,
      ["-e", `const output=process.${stream},chunk='x'.repeat(1024*1024); function flood(){while(output.write(chunk)){} output.once('drain',flood)} flood()`],
      { deadlineMs: 20_000 }), (error) => {
      assert.equal(error.code, "TOOLCRAFT_PROOF_PROCESS_RESOURCE_LIMIT"); assert.equal(error.resource, resource); return true;
    });
    assert.ok(Date.now() - startedAt < 5_000);
  }
});

test("bounds IPC message count and serialized bytes before the wall deadline", async () => {
  for (const [source, resource] of [
    ["for(let i=0;i<100;i++) process.send({i})", "ipc-message-count"],
    ["process.send({value:'x'.repeat(5*1024*1024)})", "ipc-serialized-bytes"],
  ]) await assert.rejects(captureToolcraftProofIpcProcess(process.execPath, ["-e", source], { deadlineMs: 20_000 }), (error) => {
    assert.equal(error.code, "TOOLCRAFT_PROOF_PROCESS_RESOURCE_LIMIT"); assert.equal(error.resource, resource); return true;
  });
});
