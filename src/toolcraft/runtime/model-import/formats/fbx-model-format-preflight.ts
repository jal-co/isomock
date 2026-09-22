import type { ToolcraftModelDecodeContext } from "../model-import-types";
import {
  checkedThreeStaticGeometryTotal,
  threeStaticGeometryFailure,
  throwIfThreeStaticGeometryAborted,
} from "./three-static-geometry-primitives";
import { isBinaryFbx, preflightBinaryFbx } from "./fbx-binary-preflight";

const UNSUPPORTED_NODE_PATTERN =
  /^[\t ]*(AnimationCurve|AnimationCurveNode|AnimationLayer|AnimationStack|Deformer|Pose):/mu;
const ARRAY_DECLARATION_PATTERN_SOURCE =
  String.raw`\b([A-Za-z][A-Za-z0-9_]*):\s*\*(\d+)\s*\{`;

function parseDeclaredCount(value: string, label: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    return threeStaticGeometryFailure(
      "resource-limit",
      "unsafe-fbx-array-count",
      `${label} count is outside the protected integer range.`,
    );
  }
  return count;
}

function decodeAsciiFbx(source: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(source);
  } catch {
    return threeStaticGeometryFailure(
      "format",
      "invalid-fbx-encoding",
      "ASCII FBX must use valid UTF-8 encoding.",
    );
  }
}

function preflightAsciiFbx(
  source: ArrayBuffer,
  context: ToolcraftModelDecodeContext,
): void {
  const text = decodeAsciiFbx(source);
  const versionMatch = /\bFBXVersion:\s*(\d+)/u.exec(text);
  const version = versionMatch ? Number(versionMatch[1]) : Number.NaN;
  if (!Number.isSafeInteger(version) || version < 7000 || version > 7700) {
    return threeStaticGeometryFailure(
      "format",
      "unsupported-fbx-version",
      "ASCII FBX requires a supported FBXVersion between 7000 and 7700.",
    );
  }
  const unsupported = UNSUPPORTED_NODE_PATTERN.exec(text);
  if (unsupported) {
    return threeStaticGeometryFailure(
      "format",
      "unsupported-fbx-feature",
      `Geometry-only FBX import does not accept ${unsupported[1]} nodes.`,
    );
  }

  let arrayBytes = 0;
  let vertexCoordinates = 0;
  let declaration: RegExpExecArray | null;
  const arrayDeclarations = new RegExp(ARRAY_DECLARATION_PATTERN_SOURCE, "gu");
  while ((declaration = arrayDeclarations.exec(text)) !== null) {
    throwIfThreeStaticGeometryAborted(context.signal);
    const count = parseDeclaredCount(
      declaration[2]!,
      `FBX ${declaration[1]}`,
    );
    arrayBytes = checkedThreeStaticGeometryTotal(
      arrayBytes,
      count * 8,
      context.limits.maxDecodedBytes,
      "decoded-byte-limit-exceeded",
      "FBX declared array bytes",
    );
    if (declaration[1] === "Vertices") {
      vertexCoordinates = checkedThreeStaticGeometryTotal(
        vertexCoordinates,
        count,
        context.limits.maxVertices * 3,
        "max-vertices-exceeded",
        "FBX source vertex coordinates",
      );
    }
  }
  if (vertexCoordinates === 0 || vertexCoordinates % 3 !== 0) {
    return threeStaticGeometryFailure(
      "geometry",
      "invalid-fbx-vertices",
      "FBX requires complete nonempty XYZ vertex coordinates.",
    );
  }
  const structuralNodes = text.match(/^[\t ]*[A-Za-z][A-Za-z0-9_]*:[^{\n]*\{/gmu)?.length ?? 0;
  checkedThreeStaticGeometryTotal(
    0,
    structuralNodes,
    context.limits.maxNodes,
    "max-nodes-exceeded",
    "FBX structural nodes",
  );
  checkedThreeStaticGeometryTotal(
    0,
    source.byteLength * 4 + arrayBytes * 8,
    context.limits.maxEstimatedWorkerBytes,
    "estimated-worker-memory-limit-exceeded",
    "FBX preflight worker memory",
  );
}

export function preflightFbx(
  source: ArrayBuffer,
  context: ToolcraftModelDecodeContext,
): ReturnType<typeof preflightBinaryFbx> {
  throwIfThreeStaticGeometryAborted(context.signal);
  if (isBinaryFbx(source)) {
    return preflightBinaryFbx(source, context);
  }
  preflightAsciiFbx(source, context);
  return Object.freeze([]);
}
