import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appDefaultsEndpoint, createAppDefaultsMiddleware, toolcraftAppDefaultsPlugin } from "./toolcraft-app-defaults-plugin.mjs";
import { createDefaultResourceCleanup } from "./toolcraft-default-resource-cleanup.mjs";
import { saveDefaultResourceFile } from "./toolcraft-default-resource-files.mjs";

// Node fetch owns Host itself; raw HTTP exercises the named-host guard.
function hostFetch(url, options = {}) {
  if (!options.headers?.host) return fetch(url, options);
  return new Promise((resolve, reject) => {
    const request = http.request(url, { agent: false, method: options.method, headers: options.headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode })));
    });
    request.on("error", reject);
    request.end(options.body);
  });
}

async function fixture(run, { localHostnames = [] } = {}) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), "app-defaults-test-"));
  const file = path.join(root, "src/app/app-defaults.json");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, "null\n");
  const invalidated = [];
  const middleware = createAppDefaultsMiddleware({ appRoot: root, localHostnames, onWrite: async (file) => {
    invalidated.push({ file, contents: await fs.readFile(file, "utf8") });
  }, validate: async (value) => {
    if (value?.appId !== "fixture") throw new Error("Wrong app.");
    return value;
  } });
  const server = http.createServer((req, res) => { void middleware(req, res, () => { res.statusCode = 404; res.end(); }); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const url = origin + appDefaultsEndpoint;
  const capability = await (await fetch(url)).json();
  const save = (body, headers = {}) => hostFetch(url, { method: "POST", headers: {
    "content-type": "application/json", origin,
    "x-toolcraft-defaults-token": capability.token, ...headers,
  }, body: JSON.stringify(body) });
  const upload = (digest, bytes, headers = {}) => fetch(`${url}/resources/${digest}`, { method: "POST", headers: {
    "content-type": "application/octet-stream", origin, "x-toolcraft-defaults-token": capability.token, ...headers,
  }, body: bytes });
  try { await run({ root, file, url, capability, save, upload, invalidated }); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await fs.rm(root, { recursive: true, force: true }); }
}

for (const namedOrigin of ["http://toolcraft.localhost", "http://toolcraft.localhost:43127"]) {
test(`explicit localhost aliases save with their own Origin and retain session protection: ${namedOrigin}`, () => fixture(async ({ file, url, capability, save }) => {
  const body = { defaults: { version: 1, appId: "fixture", values: { amount: 21 } }, revision: capability.revision };
  const headers = { host: new URL(namedOrigin).host, origin: namedOrigin };
  const response = await save(body, headers);
  assert.equal(response.status, 200, await response.text());
  assert.deepEqual(JSON.parse(await fs.readFile(file, "utf8")), body.defaults);
  for (const invalid of [
    { ...headers, origin: "http://other.localhost" },
    { ...headers, origin: namedOrigin === "http://toolcraft.localhost" ? "http://toolcraft.localhost:43127" : "http://toolcraft.localhost" },
    { ...headers, origin: "http://toolcraft.localhost:43128" },
    { ...headers, host: "other.localhost", origin: "http://other.localhost" },
    { ...headers, host: "toolcraft.localhost.evil.test", origin: "http://toolcraft.localhost.evil.test" },
    { ...headers, "x-toolcraft-defaults-token": "invalid" },
  ]) assert.equal((await save(body, invalid)).status, 403);
  assert.equal((await hostFetch(url, { headers: { host: "unconfigured.localhost" } })).status, 403);
  assert.deepEqual(JSON.parse(await fs.readFile(file, "utf8")), body.defaults);
}, { localHostnames: ["toolcraft.localhost"] }));
}

test("named authoring hosts are opt-in and cannot authorize non-local domains", async () => {
  await fixture(async ({ url }) => {
    assert.equal((await hostFetch(url, { headers: { host: "toolcraft.localhost" } })).status, 403);
  });
  for (const hostname of ["example.com", "localhost.evil", "*.localhost", "toolcraft.localhost:80", ".localhost"]) {
    assert.throws(() => createAppDefaultsMiddleware({ appRoot: "/tmp", validate: async (x) => x, localHostnames: [hostname] }), /explicit .localhost hostnames/);
  }
});

test("the local authoring endpoint atomically saves and invalidates its fixed file before responding", () => fixture(async ({ file, root, capability, save, invalidated }) => {
  const defaults = { version: 1, appId: "fixture", values: { amount: 42 }, canvas: null };
  const response = await save({ defaults, revision: capability.revision });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(await fs.readFile(file, "utf8")), defaults);
  assert.deepEqual(invalidated, [{ file, contents: await fs.readFile(file, "utf8") }]);
  assert.notEqual((await response.json()).revision, capability.revision);
  assert.deepEqual(await fs.readdir(path.join(root, "src/app")), ["app-defaults.json"]);
}));
test("stale revisions preserve parallel source edits", () => fixture(async ({ file, capability, save }) => {
  await fs.writeFile(file, '{"parallel":true}\n');
  const response = await save({ defaults: { appId: "fixture" }, revision: capability.revision });
  assert.equal(response.status, 409);
  assert.equal(await fs.readFile(file, "utf8"), '{"parallel":true}\n');
}));
test("invalid payloads, extra paths and foreign sessions cannot write defaults", () => fixture(async ({ file, capability, save }) => {
  const valid = { defaults: { appId: "fixture" }, revision: capability.revision };
  for (const [body, headers, expected] of [
    [{ ...valid, defaults: { appId: "other" } }, {}, 400],
    [{ ...valid, path: "../../other.json" }, {}, 400],
    [valid, { origin: "http://unrelated.invalid" }, 403],
    [valid, { "x-toolcraft-defaults-token": "wrong" }, 403],
    [valid, { "content-type": "text/plain" }, 403],
  ]) {
    assert.equal((await save(body, headers)).status, expected);
    assert.equal(await fs.readFile(file, "utf8"), "null\n");
  }
}));
test("symbolic links are never a source-defaults write target", () => fixture(async ({ root, file, capability, save }) => {
  const other = path.join(root, "other.json");
  await fs.writeFile(other, "preserve");
  await fs.rm(file);
  await fs.symlink(other, file);
  assert.equal((await save({ defaults: { appId: "fixture" }, revision: capability.revision })).status, 400);
  assert.equal(await fs.readFile(other, "utf8"), "preserve");
}));
test("production preview has no authoring middleware", () => {
  const plugin = toolcraftAppDefaultsPlugin({ appRoot: "/app" });
  assert.equal(plugin.apply, "serve");
  assert.equal(plugin.configurePreviewServer, undefined);
});

test("source defaults validate through their own Vite runner without host SSR", async () => {
  const { createServer } = await import("vite");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "toolcraft-defaults-runner-"));
  let server;
  try {
    await fs.mkdir(path.join(root, "src/app"), { recursive: true });
    await fs.mkdir(path.join(root, "src/toolcraft"), { recursive: true });
    await fs.writeFile(path.join(root, "src/app/app-defaults.json"), "null\n");
    await fs.writeFile(path.join(root, "src/toolcraft/app-defaults-validation.ts"), `
      export function validateAppDefaults(value: unknown) {
        if (!value || typeof value !== 'object' || !('appId' in value) || value.appId !== 'fixture') {
          throw new Error('Invalid fixture identity');
        }
        return value;
      }
    `);
    server = await createServer({
      configFile: false, root, logLevel: "silent",
      plugins: [toolcraftAppDefaultsPlugin({ appRoot: root })],
      server: { host: "127.0.0.1", port: 0 },
    });
    server.ssrLoadModule = () => { throw new Error("Host SSR must not execute authoring validation"); };
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const endpoint = `${origin}/.toolcraft/app-defaults`;
    const capability = await (await fetch(endpoint)).json();
    const defaults = { version: 1, appId: "fixture", values: {}, canvas: null };
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { origin, "content-type": "application/json", "x-toolcraft-defaults-token": capability.token },
      body: JSON.stringify({ revision: capability.revision, defaults }),
    });
    assert.equal(response.status, 200, await response.text());
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, "src/app/app-defaults.json"), "utf8")), defaults);
  } finally {
    await server?.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("full snapshots commit only after immutable resource bytes pass validation", () => fixture(async ({ root, file, capability, save, upload }) => {
  const bytes = Buffer.from("portable image bytes");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const resource = { sha256, byteLength: bytes.length, path: `toolcraft-defaults/${sha256}.bin` };
  const body = { revision: capability.revision, defaults: { version: 2, appId: "fixture", resources: [resource] } };
  assert.equal((await save(body)).status, 400);
  assert.equal(await fs.readFile(file, "utf8"), "null\n");
  assert.equal((await upload(sha256, bytes, { "x-toolcraft-defaults-token": "wrong" })).status, 403);
  assert.equal((await upload(sha256, Buffer.from("wrong bytes"))).status, 400);
  assert.equal((await upload(sha256, bytes)).status, 200);
  assert.equal((await upload(sha256, bytes)).status, 200);
  assert.equal((await save(body)).status, 200);
  assert.deepEqual(await fs.readFile(path.join(root, "public", resource.path)), bytes);
  assert.deepEqual(await fs.readdir(path.join(root, "public/toolcraft-defaults")), [sha256 + ".bin"]);
}));
test("resource uploads reject symbolic-link directories and arbitrary addresses", () => fixture(async ({ root, upload }) => {
  const bytes = Buffer.from("asset");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const outside = path.join(root, "outside");
  await fs.mkdir(outside);
  await fs.symlink(outside, path.join(root, "public"));
  assert.equal((await upload(sha256, bytes)).status, 400);
  assert.equal((await upload("invalid", bytes)).status, 400);
  assert.deepEqual(await fs.readdir(outside), []);
}));

function resource(bytes, folder) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { sha256, byteLength: bytes.length, path: `toolcraft-defaults/${folder}/${sha256}.bin` };
}
function address(resource) { return resource.path.slice("toolcraft-defaults/".length); }
function snapshot(resources) { return { version: 2, appId: "fixture", resources }; }
async function exists(file) {
  return fs.stat(file).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; });
}

test("failed saves retain uploads for retries, then reclaim only expired owned files after restart", () => fixture(async ({ root, file, capability, upload, save }) => {
  const bytes = Buffer.from("abandoned upload");
  const abandoned = resource(bytes, "images");
  const currentBytes = Buffer.from("current defaults");
  const current = resource(currentBytes, "files");
  const unowned = resource(Buffer.from("unowned image"), "images");
  const unownedFile = path.join(root, "public", unowned.path);
  await fs.mkdir(path.dirname(unownedFile), { recursive: true });
  await fs.writeFile(unownedFile, "unowned image");
  await Promise.all([
    upload(address(abandoned), bytes).then(response => assert.equal(response.status, 200)),
    upload(address(current), currentBytes).then(response => assert.equal(response.status, 200)),
    upload(address(unowned), Buffer.from("unowned image")).then(response => assert.equal(response.status, 200)),
  ]);
  assert.equal((await save({ defaults: { appId: "wrong" }, revision: capability.revision })).status, 400);
  assert.equal(await fs.readFile(file, "utf8"), "null\n");
  const readCurrent = async () => JSON.parse(await fs.readFile(file, "utf8"));
  await createDefaultResourceCleanup(root).finish(readCurrent);
  assert.equal(await exists(path.join(root, "public", abandoned.path)), true, "Retry grace preserves staged uploads");
  assert.equal((await save({ defaults: snapshot([current]), revision: capability.revision })).status, 200);
  const restarted = createDefaultResourceCleanup(root, { now: () => Date.now() + 25 * 60 * 60 * 1000 });
  await restarted.finish(readCurrent);
  assert.equal(await exists(path.join(root, "public", abandoned.path)), false, "A failed save must not leak its uploads forever");
  assert.deepEqual(await fs.readFile(path.join(root, "public", current.path)), currentBytes);
  assert.equal(await fs.readFile(unownedFile, "utf8"), "unowned image");
}));

test("parallel identical uploads keep one durable owner and remain collectable", () => fixture(async ({ root, upload }) => {
  const bytes = Buffer.from("same simultaneous upload");
  const item = resource(bytes, "files");
  const responses = await Promise.all(Array.from({ length: 6 }, () => upload(address(item), bytes)));
  assert.ok(responses.every(response => response.status === 200));
  await createDefaultResourceCleanup(root, { now: () => Date.now() + 25 * 60 * 60 * 1000 }).finish(async () => null);
  assert.equal(await exists(path.join(root, "public", item.path)), false);
}));

test("retrying an owned unpublished upload renews its grace without adopting existing assets", () => fixture(async ({ root }) => {
  let now = 0;
  const bytes = Buffer.from("retry after a day");
  const item = resource(bytes, "files");
  const cleanup = createDefaultResourceCleanup(root, { now: () => now });
  await saveDefaultResourceFile(root, address(item), [bytes], cleanup.recordUpload);
  now += 25 * 60 * 60 * 1000;
  await saveDefaultResourceFile(root, address(item), [bytes], cleanup.recordUpload);
  await cleanup.finish(async () => null);
  assert.equal(await exists(path.join(root, "public", item.path)), true);
  now += 25 * 60 * 60 * 1000;
  await cleanup.finish(async () => null);
  assert.equal(await exists(path.join(root, "public", item.path)), false);
}));

test("upload ownership survives a prepared snapshot that never commits", () => fixture(async ({ root, upload }) => {
  const bytes = Buffer.from("failed JSON publication");
  const item = resource(bytes, "files");
  assert.equal((await upload(address(item), bytes)).status, 200);
  await createDefaultResourceCleanup(root).prepare(null, snapshot([item]));
  await createDefaultResourceCleanup(root, { now: () => Date.now() + 25 * 60 * 60 * 1000 }).finish(async () => null);
  assert.equal(await exists(path.join(root, "public", item.path)), false);
}));

test("unpublished uploads replaced with identical authored bytes are never deleted", () => fixture(async ({ root, upload }) => {
  const bytes = Buffer.from("same bytes, different owner");
  const item = resource(bytes, "files");
  assert.equal((await upload(address(item), bytes)).status, 200);
  const target = path.join(root, "public", item.path);
  const authored = path.join(root, "authored.bin");
  await fs.writeFile(authored, bytes);
  await fs.rename(authored, target);
  await assert.rejects(createDefaultResourceCleanup(root, { now: () => Date.now() + 25 * 60 * 60 * 1000 }).finish(async () => null), /replaced outside Toolcraft/);
  assert.deepEqual(await fs.readFile(target), bytes);
}));

test("saves attachments into their folders and deletes only retired managed files after publication", () => fixture(async ({ root, capability, save, upload }) => {
  const imageBytes = Buffer.from("old image");
  const fileBytes = Buffer.from("current data");
  const image = resource(imageBytes, "images");
  const file = resource(fileBytes, "files");
  for (const [item, bytes] of [[image, imageBytes], [file, fileBytes]]) assert.equal((await upload(address(item), bytes)).status, 200);
  const first = await save({ defaults: snapshot([image, file]), revision: capability.revision });
  assert.equal(first.status, 200);
  const firstRevision = (await first.json()).revision;
  const unrelated = path.join(root, "public/toolcraft-defaults/images", "f".repeat(64) + ".bin");
  await fs.writeFile(unrelated, "manually authored asset");
  await fs.writeFile(path.join(root, "public/keep.txt"), "project file");
  const next = await save({ defaults: snapshot([file]), revision: firstRevision });
  assert.equal(next.status, 200);
  assert.equal(await exists(path.join(root, "public", image.path)), false);
  assert.deepEqual(await fs.readFile(path.join(root, "public", file.path)), fileBytes);
  assert.equal(await fs.readFile(unrelated, "utf8"), "manually authored asset");
  assert.equal(await fs.readFile(path.join(root, "public/keep.txt"), "utf8"), "project file");
  assert.equal((await save({ defaults: snapshot([]), revision: (await next.json()).revision })).status, 200);
  assert.equal(await exists(path.join(root, "public", file.path)), false);
  assert.equal(await exists(path.join(root, "public/toolcraft-defaults/files")), false);
}));

test("stale or invalid saves keep old assets, and flat legacy assets migrate on a successful save", () => fixture(async ({ root, file, capability, save, upload }) => {
  const bytes = Buffer.from("image to migrate");
  const image = resource(bytes, "images");
  const legacy = { ...image, path: `toolcraft-defaults/${image.sha256}.bin` };
  assert.equal((await upload(image.sha256, bytes)).status, 200);
  const old = await save({ defaults: snapshot([legacy]), revision: capability.revision });
  assert.equal(old.status, 200);
  const revision = (await old.json()).revision;
  assert.equal((await save({ defaults: snapshot([]), revision: capability.revision })).status, 409);
  assert.equal((await save({ defaults: snapshot([image]), revision })).status, 400);
  assert.equal(await exists(path.join(root, "public", legacy.path)), true);
  assert.equal(JSON.parse(await fs.readFile(file, "utf8")).resources[0].path, legacy.path);
  assert.equal((await upload(address(image), bytes)).status, 200);
  assert.equal((await save({ defaults: snapshot([image]), revision })).status, 200);
  assert.equal(await exists(path.join(root, "public", legacy.path)), false);
  assert.deepEqual(await fs.readFile(path.join(root, "public", image.path)), bytes);
}));

test("shared model resources remain until their last reference leaves the saved graph", () => fixture(async ({ root, capability, save, upload }) => {
  const textureBytes = Buffer.from("shared texture");
  const documentBytes = Buffer.from("removed document");
  const texture = resource(textureBytes, "models/textures");
  const document = resource(documentBytes, "models/documents");
  assert.equal((await upload(address(texture), textureBytes)).status, 200);
  assert.equal((await upload(address(document), documentBytes)).status, 200);
  const first = await save({ defaults: snapshot([document, texture, { ...texture, ref: "another owner" }]), revision: capability.revision });
  assert.equal(first.status, 200);
  const next = await save({ defaults: snapshot([texture]), revision: (await first.json()).revision });
  assert.equal(next.status, 200);
  assert.equal(await exists(path.join(root, "public", document.path)), false);
  assert.equal(await exists(path.join(root, "public/toolcraft-defaults/models/documents")), false);
  assert.equal(await exists(path.join(root, "public", texture.path)), true);
  assert.equal((await save({ defaults: snapshot([]), revision: (await next.json()).revision })).status, 200);
  assert.equal(await exists(path.join(root, "public/toolcraft-defaults/models")), false);
}));

test("edited files are preserved and failed cleanup remains retryable after the snapshot commits", () => fixture(async ({ root, file, capability, save, upload }) => {
  const bytes = Buffer.from("original image");
  const image = resource(bytes, "images");
  assert.equal((await upload(address(image), bytes)).status, 200);
  const first = await save({ defaults: snapshot([image]), revision: capability.revision });
  assert.equal(first.status, 200);
  const target = path.join(root, "public", image.path);
  await fs.writeFile(target, "changed by someone else");
  const failed = await save({ defaults: snapshot([]), revision: (await first.json()).revision });
  assert.equal(failed.status, 500);
  const result = await failed.json();
  assert.equal(result.saved, true);
  assert.match(result.error, /Defaults were saved/);
  assert.deepEqual(JSON.parse(await fs.readFile(file, "utf8")).resources, []);
  assert.equal(await fs.readFile(target, "utf8"), "changed by someone else");
  const pendingFile = path.join(root, ".toolcraft/default-resource-cleanup.json");
  assert.equal(JSON.parse(await fs.readFile(pendingFile, "utf8")).resources[0].path, image.path);
  await fs.writeFile(target, bytes);
  const retry = await save({ defaults: snapshot([]), revision: result.revision });
  assert.equal(retry.status, 200);
  assert.equal(await exists(target), false);
  assert.deepEqual(JSON.parse(await fs.readFile(pendingFile, "utf8")).resources, []);
}));

test("cleanup never follows a replaced resource directory symlink", () => fixture(async ({ root, capability, save, upload }) => {
  const bytes = Buffer.from("saved image");
  const image = resource(bytes, "images");
  assert.equal((await upload(address(image), bytes)).status, 200);
  const first = await save({ defaults: snapshot([image]), revision: capability.revision });
  assert.equal(first.status, 200);
  const dir = path.join(root, "public/toolcraft-defaults/images");
  const elsewhere = path.join(root, "elsewhere");
  await fs.rename(dir, elsewhere);
  await fs.symlink(elsewhere, dir);
  const response = await save({ defaults: snapshot([]), revision: (await first.json()).revision });
  assert.equal(response.status, 500);
  assert.deepEqual(await fs.readFile(path.join(elsewhere, image.sha256 + ".bin")), bytes);
}));
