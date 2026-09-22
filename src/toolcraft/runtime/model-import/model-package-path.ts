import { ToolcraftModelPackageError } from "./model-package-types";

const encoder = new TextEncoder();
const WINDOWS_ABSOLUTE_PATH = /^[a-z]:/iu;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const APPEARANCE_SIDECAR_EXTENSIONS: ReadonlySet<string> = new Set([
  ".avif", ".basis", ".bmp", ".dds", ".gif", ".jpeg", ".jpg",
  ".ktx", ".ktx2", ".mtl", ".png", ".tga", ".webp",
]);

export function isToolcraftModelAppearanceSidecarPath(path: string): boolean {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  return APPEARANCE_SIDECAR_EXTENSIONS.has(extension);
}

function invalidPath(message: string): never {
  throw new ToolcraftModelPackageError(
    "bundle",
    "archive-path-invalid",
    message,
  );
}

export function normalizeToolcraftModelPackagePath(
  path: string,
  maxByteLength: number,
): string {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    WINDOWS_ABSOLUTE_PATH.test(path) ||
    CONTROL_CHARACTER.test(path)
  ) {
    return invalidPath("The model archive contains an unsafe entry path.");
  }

  const segments = path.split("/");
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    return invalidPath("The model archive contains an unsafe path segment.");
  }

  const normalized = path.normalize("NFC");
  if (encoder.encode(normalized).byteLength > maxByteLength) {
    throw new ToolcraftModelPackageError(
      "resource-limit",
      "archive-path-limit-exceeded",
      "A model archive entry path exceeds its byte limit.",
    );
  }

  return normalized;
}

export function getToolcraftModelPackageMimeType(path: string): string {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  switch (extension) {
    case ".gltf":
      return "model/gltf+json";
    case ".glb":
      return "model/gltf-binary";
    case ".obj":
      return "model/obj";
    case ".stl":
      return "model/stl";
    case ".fbx":
      return "model/fbx";
    case ".ply":
      return "model/ply";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".bmp":
      return "image/bmp";
    case ".ktx2":
      return "image/ktx2";
    case ".avif":
      return "image/avif";
    case ".dds":
      return "image/vnd-ms.dds";
    case ".ktx":
      return "image/ktx";
    case ".tga":
      return "image/x-tga";
    case ".svg":
      return "image/svg+xml";
    case ".json":
      return "application/json";
    case ".mtl":
    case ".txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}
