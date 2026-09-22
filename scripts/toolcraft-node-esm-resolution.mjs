import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const resolverSource = `process.on("message",({id,requests})=>{const results=requests.map(({specifier,parent})=>{try{return {value:import.meta.resolve(specifier,parent)}}catch(error){return {error:error.message}}});process.send({id,results})})`;

export function createToolcraftNodeEsmResolver({ deadlineMs = 60_000 } = {}) {
  const child = spawn(process.execPath, ["--experimental-import-meta-resolve", "--input-type=module", "--eval", resolverSource], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
  let nextId = 0, settled = false, closePromise;
  const pending = new Map(), cache = new Map();
  const fail = (error) => { if (settled) return; settled = true; for (const { reject } of pending.values()) reject(error); pending.clear(); };
  const timer = setTimeout(() => { child.kill("SIGKILL"); fail(new Error("Node ESM resolution exceeded its aggregate wall deadline.")); }, deadlineMs);
  child.on("error", fail); child.on("exit", (code) => { if (!settled && code !== 0) fail(new Error(`Node ESM resolver exited with code ${code}.`)); });
  child.on("message", ({ id, results }) => { const request = pending.get(id); if (!request) return; pending.delete(id); request.resolve(results); });
  const sendMany = async (requests) => {
    if (settled) throw new Error("Node ESM resolver is unavailable.");
    const id = nextId++;
    const results = await new Promise((resolve, reject) => { pending.set(id, { reject, resolve }); child.send({ id,
      requests: requests.map(({ importer, specifier }) => ({ parent: pathToFileURL(importer).href, specifier })) }); });
    return results.map((result) => result.error || !result.value.startsWith("file:") ? undefined : fileURLToPath(result.value));
  };
  const resolveMany = async (requests) => {
    const unique = new Map(requests.map((request) => [`${request.importer}\0${request.specifier}`, request]));
    const missing = [...unique].filter(([key]) => !cache.has(key));
    if (missing.length > 0) {
      const values = await sendMany(missing.map(([, request]) => request));
      missing.forEach(([key], index) => cache.set(key, values[index]));
    }
    return requests.map((request) => cache.get(`${request.importer}\0${request.specifier}`));
  };
  const close = () => closePromise ??= new Promise((resolve) => {
    clearTimeout(timer); settled = true;
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once("exit", resolve);
    if (child.connected) child.disconnect();
    child.kill();
  });
  return Object.freeze({ close, processId: child.pid, resolveMany,
    resolve: async (importer, specifier) => (await resolveMany([{ importer, specifier }]))[0] });
}
