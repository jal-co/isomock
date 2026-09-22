import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  runToolcraftProofProcess,
  terminateToolcraftProofProcessTree,
} from "./toolcraft-proof-process.mjs";

test("awaits successful Windows whole-tree termination with force only on escalation", async () => {
  const invocations = [];
  const spawnProcess = (command, args, options) => {
    invocations.push({ args, command, options });
    const process = new EventEmitter();
    queueMicrotask(() => process.emit("close", 0));
    return process;
  };
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    await terminateToolcraftProofProcessTree({ child: { pid: 4242 }, platform: "win32", signal, spawnProcess });
  }
  assert.deepEqual(invocations, [
    { args: ["/PID", "4242", "/T"], command: "taskkill", options: { stdio: "ignore" } },
    { args: ["/PID", "4242", "/T", "/F"], command: "taskkill", options: { stdio: "ignore" } },
  ]);
});

test("rejects Windows tree termination spawn and nonzero failures", async () => {
  for (const outcome of [new Error("missing taskkill"), 7]) {
    const spawnProcess = () => {
      const process = new EventEmitter();
      queueMicrotask(() => outcome instanceof Error
        ? process.emit("error", outcome)
        : process.emit("close", outcome));
      return process;
    };
    await assert.rejects(
      terminateToolcraftProofProcessTree({ child: { pid: 42 }, platform: "win32", signal: "SIGKILL", spawnProcess }),
      /failed to start|code 7/iu,
    );
  }
});

test("deadline waits for TERM and forced tree cleanup before settling", async () => {
  const events = [];
  const terminateProcessTree = async ({ child, signal }) => {
    events.push(`${signal}:start`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    events.push(`${signal}:finish`);
    if (signal === "SIGKILL") child.kill("SIGKILL");
  };
  await assert.rejects(
    runToolcraftProofProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      deadlineMs: 20,
      terminateProcessTree,
      terminationGraceMs: 5,
    }),
    /wall deadline/iu,
  );
  assert.deepEqual(events, ["SIGTERM:start", "SIGTERM:finish", "SIGKILL:start", "SIGKILL:finish"]);
});

test("deadline includes cleanup failures after forced completion", async () => {
  const signals = [];
  await assert.rejects(
    runToolcraftProofProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      deadlineMs: 20,
      terminateProcessTree: async ({ child, signal }) => {
        signals.push(signal);
        if (signal === "SIGTERM") throw new Error("TERM cleanup failed");
        child.kill("SIGKILL");
      },
      terminationGraceMs: 5,
    }),
    (error) => {
      assert.match(error.message, /TERM cleanup failed/iu);
      assert.equal(error.cleanupErrors.length, 1);
      return true;
    },
  );
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
});
