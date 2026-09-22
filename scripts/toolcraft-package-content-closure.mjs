import fs from "node:fs/promises";
import path from "node:path";
import { createRequire, isBuiltin } from "node:module";

const maxFiles = 150_000, maxBytes = 2 * 1024 * 1024 * 1024;

async function findPackageRoot(filePath, boundaryRoot) {
  const realBoundary = await fs.realpath(boundaryRoot), candidate = await fs.realpath(filePath);
  const initial = (await fs.lstat(candidate)).isDirectory() ? candidate : path.dirname(candidate);
  const relative = path.relative(realBoundary, initial);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new Error(`${filePath} is outside the contained package boundary.`);
  for (let directory = initial;; directory = path.dirname(directory)) {
    try { if ((await fs.lstat(path.join(directory, "package.json"))).isFile()) return directory; }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
    if (directory === realBoundary) break;
  }
  throw new Error(`${filePath} has no contained package manifest.`);
}

async function collectTopLevelPackageRoots(projectRoot) {
  const roots = [], mappingDirectories = [], searchDirectories = createRequire(path.join(projectRoot, "package.json")).resolve.paths("__toolcraft_dynamic_probe__") ?? [];
  for (const nodeModules of searchDirectories) {
    let names;
    try { names = await fs.readdir(nodeModules); } catch (error) { if (error?.code === "ENOENT") continue; throw error; }
    for (const name of names.filter((item) => !item.startsWith("."))) {
      const candidate = path.join(nodeModules, name);
      if (name.startsWith("@")) { mappingDirectories.push(candidate); for (const child of await fs.readdir(candidate)) roots.push({ candidate: path.join(candidate, child), specifier: `${name}/${child}` }); }
      else roots.push({ candidate, specifier: name });
    }
  }
  return { mappingDirectories, roots, searchDirectories };
}

async function sealPackageBinLink(candidate, boundaryRoot, importer) {
  const binDirectory = path.dirname(candidate);
  if (path.basename(binDirectory) !== ".bin" || path.basename(path.dirname(binDirectory)) !== "node_modules")
    throw new Error(`${candidate} is a symbolic link inside sealed package content.`);
  const realPath = await fs.realpath(candidate), realBoundary = await fs.realpath(boundaryRoot);
  const relative = path.relative(realBoundary, realPath);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !(await fs.lstat(realPath)).isFile())
    throw new Error(`${candidate} must resolve to a contained regular package executable.`);
  return Object.freeze({ category: "package-mapping", importer, realPath, resolvedPath: candidate, specifier: candidate });
}

export async function collectToolcraftPackageContentClosure({ boundaryRoot, entryPath, includeResolutionUniverse = false, projectRoot }) {
  const pending = [await findPackageRoot(entryPath, boundaryRoot)], visited = new Set(), directories = new Map(), sources = new Map(), resolutions = [];
  if (includeResolutionUniverse) {
    const universe = await collectTopLevelPackageRoots(projectRoot);
    for (const directory of universe.searchDirectories) try {
      const names = (await fs.readdir(directory)).sort(), realPath = await fs.realpath(directory);
      if (realPath === boundaryRoot || realPath.startsWith(`${boundaryRoot}${path.sep}`)) directories.set(path.relative(projectRoot, directory).split(path.sep).join("/"), Object.freeze({ absolutePath: directory, entries: Object.freeze(names), exists: true, realPath }));
      else throw new Error(`${directory} is outside the bounded package resolution universe.`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      directories.set(path.relative(projectRoot, directory).split(path.sep).join("/"), Object.freeze({ absolutePath: directory, entries: Object.freeze([]), exists: false }));
    }
    for (const directory of universe.mappingDirectories) try {
      const names = (await fs.readdir(directory)).sort();
      directories.set(path.relative(projectRoot, directory).split(path.sep).join("/"), Object.freeze({ absolutePath: directory, entries: Object.freeze(names), exists: true, realPath: await fs.realpath(directory) }));
    } catch (error) { if (error?.code !== "ENOENT") throw error; }
    for (const { candidate, specifier } of universe.roots) {
      const real = await fs.realpath(candidate);
      if (real.includes(`${path.sep}node_modules${path.sep}`)) {
        pending.push(await findPackageRoot(real, boundaryRoot));
        resolutions.push(Object.freeze({ category: "package-mapping", importer: path.join(projectRoot, "package.json"), realPath: real, resolvedPath: path.resolve(candidate), specifier }));
      }
    }
  }
  let bytes = 0;
  while (pending.length > 0) {
    const packageRoot = await fs.realpath(pending.shift());
    if (visited.has(packageRoot)) continue;
    visited.add(packageRoot);
    const packagePath = path.join(packageRoot, "package.json"), manifest = JSON.parse(await fs.readFile(packagePath, "utf8"));
    const files = [packageRoot];
    while (files.length > 0) {
      const candidate = files.pop(), stat = await fs.lstat(candidate);
      if (stat.isSymbolicLink()) {
        const mapping = await sealPackageBinLink(candidate, boundaryRoot, packagePath);
        resolutions.push(mapping);
        files.push(mapping.realPath);
        continue;
      }
      if (stat.isDirectory()) {
        const names = (await fs.readdir(candidate)).sort();
        directories.set(path.relative(projectRoot, candidate).split(path.sep).join("/"), Object.freeze({ absolutePath: candidate, entries: Object.freeze(names), exists: true, realPath: await fs.realpath(candidate) }));
        for (const name of names) files.push(path.join(candidate, name));
        continue;
      }
      if (!stat.isFile()) continue;
      const source = await fs.readFile(candidate); bytes += source.byteLength;
      sources.set(path.relative(projectRoot, candidate).split(path.sep).join("/"), source);
      if (sources.size > maxFiles || bytes > maxBytes) throw new Error("Toolchain package content closure exceeded its bounded seal budget.");
    }
    const dependencies = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.optionalDependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})]);
    for (const specifier of dependencies) {
      if (isBuiltin(specifier)) continue;
      try {
        const resolvedPath = createRequire(packagePath).resolve(specifier), realPath = await fs.realpath(resolvedPath);
        resolutions.push(Object.freeze({ category: "require", importer: packagePath, realPath, resolvedPath: path.resolve(resolvedPath), specifier }));
        pending.push(await findPackageRoot(realPath, boundaryRoot));
        continue;
      } catch {}
      let packageDirectory;
      for (const directory of createRequire(packagePath).resolve.paths(specifier) ?? []) try {
        const candidate = path.join(directory, specifier);
        if ((await fs.lstat(path.join(candidate, "package.json"))).isFile()) { packageDirectory = candidate; break; }
      } catch (error) { if (error?.code !== "ENOENT") throw error; }
      if (packageDirectory) {
        const realPath = await fs.realpath(packageDirectory);
        resolutions.push(Object.freeze({ category: "package-directory", importer: packagePath, realPath, resolvedPath: path.resolve(packageDirectory), specifier }));
        pending.push(realPath);
      } else resolutions.push(Object.freeze({ category: "require", importer: packagePath, missing: true, specifier }));
    }
  }
  return { directories, resolutions, sources };
}
