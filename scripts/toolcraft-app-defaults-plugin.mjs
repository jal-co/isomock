import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRunnableDevEnvironment, isRunnableDevEnvironment } from "vite";
import { saveDefaultResourceFile, verifyDefaultResourceFiles } from "./toolcraft-default-resource-files.mjs";
import { createDefaultResourceCleanup } from "./toolcraft-default-resource-cleanup.mjs";

export const appDefaultsEndpoint = "/.toolcraft/app-defaults";
const maxBodyBytes = 16 * 1024 * 1024;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const loopback = (address) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address);
function fail(message, status = 400) { return Object.assign(new Error(message), { status }); }
function send(response, status, value) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(value));
}
async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw fail("App defaults are too large to save.", 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw fail("Invalid defaults request."); }
}

export function createAppDefaultsMiddleware({ appRoot, validate, onWrite = () => {}, token = randomUUID(), localHostnames = [] }) {
  if (!Array.isArray(localHostnames) || localHostnames.some((host) => typeof host !== "string" || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+localhost$/.test(host))) {
    throw new Error("Defaults authoring aliases must be explicit .localhost hostnames.");
  }
  const allowedHosts = new Set(["localhost", "127.0.0.1", "[::1]", ...localHostnames]);
  const file = path.join(appRoot, "src/app/app-defaults.json");
  const cleanup = createDefaultResourceCleanup(appRoot);
  const uploadsByPath = new Map();
  let saving = false;
  let uploading = 0;
  const read = async () => {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || await fs.realpath(file) !== file) {
      throw fail("App defaults must be a regular file inside this project.");
    }
    return fs.readFile(file);
  };
  return async (request, response, next) => {
    const url = request.url?.split("?", 1)[0];
    const resourcePrefix = `${appDefaultsEndpoint}/resources/`;
    const isResource = url?.startsWith(resourcePrefix);
    if (url !== appDefaultsEndpoint && !isResource) { next(); return; }
    let committedRevision;
    try {
      if (!loopback(request.socket.remoteAddress)) throw fail("Defaults authoring is local only.", 403);
      const origin = new URL(`http://${request.headers.host}`);
      if (!allowedHosts.has(origin.hostname) ||
          (request.headers.origin && request.headers.origin !== origin.origin)) {
        throw fail("Defaults must be saved from this application's local panel.", 403);
      }
      if (request.method === "GET" && !isResource) {
        send(response, 200, { revision: hash(await read()), token });
        return;
      }
      if (request.method !== "POST") throw fail("Unsupported defaults operation.", 405);
      if (request.headers["x-toolcraft-defaults-token"] !== token ||
          request.headers["content-type"]?.split(";", 1)[0] !== (isResource ? "application/octet-stream" : "application/json") ||
          request.headers.origin !== origin.origin) {
        throw fail("Invalid defaults authoring session. Reload the app and retry.", 403);
      }
      if (isResource) {
        if (saving) throw fail("Defaults are being saved. Retry the file upload.", 409);
        uploading += 1;
        // Identical uploads share a destination and must publish in ownership
        // order. Different resources still stream independently.
        const upload = (uploadsByPath.get(url) ?? Promise.resolve()).catch(() => {}).then(() =>
          saveDefaultResourceFile(appRoot, url.slice(resourcePrefix.length), request, cleanup.recordUpload));
        uploadsByPath.set(url, upload);
        try { send(response, 200, await upload); }
        finally {
          uploading -= 1;
          if (uploadsByPath.get(url) === upload) uploadsByPath.delete(url);
        }
        return;
      }
      const input = await readBody(request);
      if (!input || Object.keys(input).sort().join() !== "defaults,revision" || typeof input.revision !== "string") {
        throw fail("Invalid defaults request.");
      }
      if (saving || uploading) throw fail("Another defaults save or file upload is in progress. Please retry.", 409);
      saving = true;
      try {
        const normalized = await validate(input.defaults);
        await verifyDefaultResourceFiles(appRoot, normalized.version === 2 ? normalized.resources : []);
        const previous = await read();
        if (hash(previous) !== input.revision) throw fail("Defaults changed outside this panel. Reload the app before saving.", 409);
        const bytes = Buffer.from(`${JSON.stringify(normalized, null, 2)}\n`);
        await cleanup.prepare(JSON.parse(previous.toString("utf8")), normalized);
        const temporary = `${file}.${randomUUID()}.tmp`;
        try {
          await fs.writeFile(temporary, bytes, { flag: "wx" });
          if (hash(await read()) !== input.revision) throw fail("Defaults changed while saving. Reload the app before retrying.", 409);
          await fs.rename(temporary, file);
          committedRevision = hash(bytes);
        } finally { await fs.rm(temporary, { force: true }); }
        await onWrite(file);
        await cleanup.finish(async () => JSON.parse((await read()).toString("utf8")));
        send(response, 200, { revision: committedRevision });
      } finally { saving = false; }
    } catch (error) {
      send(response, error.status ?? (committedRevision ? 500 : 400), {
        error: error.message ?? "Could not save app defaults.",
        ...(committedRevision ? { revision: committedRevision, saved: true } : {}),
      });
    }
  };
}

export function toolcraftAppDefaultsPlugin({ appRoot, localHostnames = [] }) {
  return {
    name: "toolcraft-app-defaults",
    apply: "serve",
    // Hosts such as TanStack Start/Nitro own a non-runnable SSR environment.
    // Source validation needs its own runner, independent of the host's SSR.
    config() {
      return { environments: {
        toolcraftDefaults: {
          consumer: "server",
          dev: { createEnvironment: createRunnableDevEnvironment },
        },
      } };
    },
    async configureServer(server) {
      const root = await fs.realpath(appRoot);
      server.middlewares.use(createAppDefaultsMiddleware({
        appRoot: root,
        localHostnames,
        onWrite: (file) => {
          // Reload can beat the filesystem watcher. Invalidate both browser and
          // validation imports before acknowledging the committed source file.
          for (const environment of Object.values(server.environments)) {
            environment.moduleGraph.onFileChange(file);
          }
        },
        validate: async (value) => {
          const environment = server.environments.toolcraftDefaults;
          if (!isRunnableDevEnvironment(environment)) {
            throw new Error("The source-defaults validation environment is unavailable. Restart the development server.");
          }
          const module = await environment.runner.import("/src/toolcraft/app-defaults-validation.ts");
          return module.validateAppDefaults(value);
        },
      }));
    },
    handleHotUpdate(context) {
      // The successful save reloads the page after persistence flushes at pagehide.
      if (context.file === path.join(appRoot, "src/app/app-defaults.json")) return [];
      if (context.file.startsWith(path.join(appRoot, "public/toolcraft-defaults") + path.sep)) return [];
    },
  };
}
