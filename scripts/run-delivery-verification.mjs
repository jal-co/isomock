#!/usr/bin/env node

import { realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { executeToolcraftDeliveryLifecycle } from "./toolcraft-delivery-lifecycle.mjs";
import { withToolcraftVerificationLock } from "./toolcraft-verification-lock.mjs";

const modulePath = fileURLToPath(import.meta.url);
const defaultProjectDir = path.resolve(path.dirname(modulePath), "..");

export async function runToolcraftDeliveryVerification({
  arguments_ = [],
  projectDir = defaultProjectDir,
} = {}) {
  const resolvedProjectDir = path.resolve(projectDir);
  if (
    !Array.isArray(arguments_) ||
    (arguments_.length !== 0 &&
      (arguments_.length !== 1 || arguments_[0] !== "--"))
  ) {
    throw new Error(
      "Toolcraft delivery verification does not accept arguments; run the bare verify:delivery command.",
    );
  }

  return withToolcraftVerificationLock(
    resolvedProjectDir,
    () => executeToolcraftDeliveryLifecycle({
      projectDir: resolvedProjectDir,
    }),
  );
}

async function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return (await realpath(process.argv[1])) === (await realpath(modulePath));
  } catch {
    return path.resolve(process.argv[1]) === modulePath;
  }
}

if (await isDirectExecution()) {
  await runToolcraftDeliveryVerification({ arguments_: process.argv.slice(2) });
}
