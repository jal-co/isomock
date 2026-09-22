/** Classify canonical identities; original upload paths never choose disk paths. */
export function getToolcraftDefaultResourcePath(ref: string, digest: string): string {
  const folders: readonly [string, string][] = [
    ["media:image:", "images"],
    ["toolcraft:model-appearance:", "models/textures"],
    ["toolcraft:model-document:", "models/documents"],
    ["toolcraft:model-repair-plan:", "models/repairs"],
    ["toolcraft:model-source-bundle:", "models/bundles"],
    ["toolcraft:model-source:", "models/sources"],
  ];
  const folder = folders.find(([prefix]) => ref.startsWith(prefix))?.[1] ?? "files";
  return `toolcraft-defaults/${folder}/${digest}.bin`;
}

export function isToolcraftDefaultResourcePath(path: unknown, ref: string, digest: string): boolean {
  return path === getToolcraftDefaultResourcePath(ref, digest) ||
    path === `toolcraft-defaults/${digest}.bin`;
}
