import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";

import type {
  ToolcraftModelDecodeContext,
  ToolcraftModelDecodeResult,
  ToolcraftModelFormatAdapter,
} from "../model-import-types";
import {
  threeStaticGeometryFailure,
  throwIfThreeStaticGeometryAborted,
  ToolcraftThreeStaticGeometryError,
} from "./three-static-geometry-primitives";
import { readThreeStaticGeometryRoot } from "./three-static-source-bundle";
import { canonicalizeThreeStaticGeometry } from "./three-static-geometry-canonicalizer";
import { TOOLCRAFT_PLY_ADAPTER_VERSION } from "./production-model-format-manifest";

export { TOOLCRAFT_PLY_ADAPTER_VERSION } from "./production-model-format-manifest";
const MAX_PLY_HEADER_BYTES = 64 * 1024;

type PlyHeader = Readonly<{
  allowsNonIndexedFaces: boolean;
  faceCount: number;
  vertexCount: number;
}>;

function plyHeaderByteLength(source: ArrayBuffer): number | undefined {
  const bytes = new Uint8Array(
    source,
    0,
    Math.min(source.byteLength, MAX_PLY_HEADER_BYTES),
  );
  const marker = [101, 110, 100, 95, 104, 101, 97, 100, 101, 114];
  for (let offset = 0; offset <= bytes.length - marker.length - 1; offset += 1) {
    if (offset > 0 && bytes[offset - 1] !== 10 && bytes[offset - 1] !== 13) {
      continue;
    }
    if (!marker.every((value, index) => bytes[offset + index] === value)) continue;
    const newline = offset + marker.length;
    if (bytes[newline] === 10) return newline + 1;
    if (bytes[newline] === 13 && bytes[newline + 1] === 10) return newline + 2;
    if (bytes[newline] === 13) return newline + 1;
  }
  return undefined;
}

function parseCount(value: string | undefined, label: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    return threeStaticGeometryFailure(
      "format",
      "malformed-ply-header",
      `PLY ${label} count must be a non-negative safe integer.`,
    );
  }
  return count;
}

function preflightPly(
  source: ArrayBuffer,
  limits: ToolcraftModelDecodeContext["limits"],
): PlyHeader {
  const headerByteLength = plyHeaderByteLength(source);
  if (headerByteLength === undefined) {
    return threeStaticGeometryFailure(
      "format",
      "malformed-ply-header",
      "PLY requires a complete bounded header.",
    );
  }
  let prefix: string;
  try {
    prefix = new TextDecoder("utf-8", { fatal: true }).decode(
      new Uint8Array(source, 0, headerByteLength),
    );
  } catch {
    return threeStaticGeometryFailure(
      "format",
      "malformed-ply-header",
      "PLY requires an ASCII-compatible header.",
    );
  }
  const match = /^(ply(?:\r\n|\r|\n)[\s\S]*?end_header(?:\r\n|\r|\n))/u.exec(prefix);
  if (!match) {
    return threeStaticGeometryFailure(
      "format",
      "malformed-ply-header",
      "PLY requires a complete bounded header.",
    );
  }
  const lines = match[1]!.split(/\r\n|\r|\n/u).map((line) => line.trim());
  const format = lines.find((line) => line.startsWith("format "))?.split(/\s+/u);
  if (
    !format ||
    !["ascii", "binary_little_endian", "binary_big_endian"].includes(format[1] ?? "") ||
    format[2] !== "1.0"
  ) {
    return threeStaticGeometryFailure(
      "format",
      "unsupported-ply-format",
      "PLY format must be ASCII or binary endian version 1.0.",
    );
  }
  let currentElement = "";
  let vertexCount: number | undefined;
  let faceCount: number | undefined;
  let allowsNonIndexedFaces = false;
  for (const line of lines) {
    const tokens = line.split(/\s+/u);
    if (tokens[0] === "element") {
      currentElement = tokens[1] ?? "";
      if (currentElement === "vertex") vertexCount = parseCount(tokens[2], "vertex");
      if (currentElement === "face") faceCount = parseCount(tokens[2], "face");
    } else if (
      currentElement === "face" &&
      tokens[0] === "property" &&
      ["texcoord", "red", "green", "blue", "diffuse_red", "diffuse_green", "diffuse_blue"].includes(tokens.at(-1) ?? "")
    ) {
      allowsNonIndexedFaces = true;
    }
  }
  if (vertexCount === undefined || vertexCount === 0 || faceCount === undefined || faceCount === 0) {
    return threeStaticGeometryFailure(
      "geometry",
      "no-renderable-static-geometry",
      "PLY requires nonempty vertex and face elements.",
    );
  }
  if (vertexCount > limits.maxVertices) {
    return threeStaticGeometryFailure(
      "resource-limit",
      "max-vertices-exceeded",
      `PLY exceeds maxVertices ${limits.maxVertices}.`,
    );
  }
  if (faceCount > limits.maxTriangles) {
    return threeStaticGeometryFailure(
      "resource-limit",
      "max-triangles-exceeded",
      `PLY exceeds maxTriangles ${limits.maxTriangles}.`,
    );
  }
  return { allowsNonIndexedFaces, faceCount, vertexCount };
}

async function decodePly(
  context: ToolcraftModelDecodeContext,
): Promise<ToolcraftModelDecodeResult> {
  const source = readThreeStaticGeometryRoot(context, "ply");
  const header = preflightPly(source, context.limits);
  throwIfThreeStaticGeometryAborted(context.signal);
  try {
    const geometry = new PLYLoader().parse(source);
    throwIfThreeStaticGeometryAborted(context.signal);
    const position = geometry.getAttribute("position");
    const triangleCount = (geometry.getIndex()?.count ?? position?.count ?? 0) / 3;
    if (geometry.getIndex() === null && !header.allowsNonIndexedFaces) {
      return threeStaticGeometryFailure(
        "geometry",
        "missing-ply-face-indices",
        "PLY faces did not decode to deterministic triangle indices.",
      );
    }
    return canonicalizeThreeStaticGeometry(geometry, {
      adapterVersion: TOOLCRAFT_PLY_ADAPTER_VERSION,
      appearance: {
        diagnostics: [],
        resolveMaterial: () => undefined,
      },
      limits: context.limits,
      operations: triangleCount > header.faceCount
        ? ["deterministic-triangulation"]
        : [],
      signal: context.signal,
      sourceByteLength: source.byteLength,
      sourceFormat: "ply",
    });
  } catch (error) {
    throwIfThreeStaticGeometryAborted(context.signal);
    if (error instanceof ToolcraftThreeStaticGeometryError) throw error;
    return threeStaticGeometryFailure(
      "format",
      "ply-decode-failed",
      "The PLY geometry could not be decoded safely.",
    );
  }
}

export const toolcraftPlyModelFormatAdapter: ToolcraftModelFormatAdapter =
  Object.freeze({
    adapterVersion: TOOLCRAFT_PLY_ADAPTER_VERSION,
    decode: decodePly,
    format: "ply",
    rootExtensions: Object.freeze([".ply"]),
    workerCapable: true,
  });
