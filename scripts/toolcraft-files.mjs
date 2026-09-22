#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanDevelopmentFiles, findMisplacedDevelopmentFiles } from "./toolcraft-development-files.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [command, ...flags] = process.argv.slice(2).filter(argument => argument !== "--");
try {
  if (command === "check" && flags.length === 0) {
    const findings = await findMisplacedDevelopmentFiles(root);
    for (const finding of findings) console.error(`${finding.path}: ${finding.reason}`);
    if (findings.length) process.exitCode = 1;
    else console.log("Development file check passed.");
  } else if (command === "clean" && (flags.length === 0 || flags.join() === "--apply")) {
    console.log(JSON.stringify(await cleanDevelopmentFiles(root, { apply: flags.includes("--apply") }), null, 2));
  } else throw new Error("Usage: toolcraft-files.mjs check | clean [--apply]. Clean previews files older than 24 hours by default.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
