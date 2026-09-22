import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

import type {
  ToolcraftModelDecodeContext,
  ToolcraftModelDecodeResult,
  ToolcraftModelFormatAdapter,
} from "../model-import-types";
import { TOOLCRAFT_MODEL_FALLBACK_APPEARANCE } from "../canonical/model-document";
import {
  threeStaticGeometryFailure,
  throwIfThreeStaticGeometryAborted,
  ToolcraftThreeStaticGeometryError,
} from "./three-static-geometry-primitives";
import { readThreeStaticGeometryRoot } from "./three-static-source-bundle";
import { canonicalizeThreeStaticGeometry } from "./three-static-geometry-canonicalizer";
import { TOOLCRAFT_STL_ADAPTER_VERSION } from "./production-model-format-manifest";

export { TOOLCRAFT_STL_ADAPTER_VERSION } from "./production-model-format-manifest";

function beginsWithSolid(bytes: Uint8Array): boolean {
  const solid = [115, 111, 108, 105, 100];
  for (let offset = 0; offset < 5; offset += 1) {
    if (solid.every((value, index) => bytes[offset + index] === value)) {
      return true;
    }
  }
  return false;
}

function preflightStl(
  source: ArrayBuffer,
  limits: ToolcraftModelDecodeContext["limits"],
): void {
  const bytes = new Uint8Array(source);
  if (source.byteLength >= 84) {
    const faces = new DataView(source).getUint32(80, true);
    const expected = 84 + faces * 50;
    if (Number.isSafeInteger(expected) && expected === source.byteLength) {
      if (faces > limits.maxTriangles) {
        return threeStaticGeometryFailure(
          "resource-limit",
          "max-triangles-exceeded",
          `Binary STL exceeds maxTriangles ${limits.maxTriangles}.`,
        );
      }
      if (faces > Math.floor(limits.maxVertices / 3)) {
        return threeStaticGeometryFailure(
          "resource-limit",
          "max-vertices-exceeded",
          `Binary STL exceeds maxVertices ${limits.maxVertices}.`,
        );
      }
      return;
    }
  }
  if (!beginsWithSolid(bytes)) {
    return threeStaticGeometryFailure(
      "format",
      "malformed-stl",
      "The STL source is neither a complete binary STL nor an ASCII solid.",
    );
  }
}

async function decodeStl(
  context: ToolcraftModelDecodeContext,
): Promise<ToolcraftModelDecodeResult> {
  const source = readThreeStaticGeometryRoot(context, "stl");
  preflightStl(source, context.limits);
  throwIfThreeStaticGeometryAborted(context.signal);
  try {
    const geometry = new STLLoader().parse(source);
    throwIfThreeStaticGeometryAborted(context.signal);
    const coloredGeometry = geometry as typeof geometry & {
      alpha?: unknown;
      hasColors?: unknown;
    };
    const hasColors = coloredGeometry.hasColors === true;
    const alpha = hasColors && typeof coloredGeometry.alpha === "number"
      ? coloredGeometry.alpha
      : 1;
    if (hasColors && (!Number.isFinite(alpha) || alpha < 0 || alpha > 1)) {
      return threeStaticGeometryFailure(
        "format",
        "invalid-stl-color-alpha",
        "STL color alpha must be finite from 0 through 1.",
      );
    }
    return canonicalizeThreeStaticGeometry(geometry, {
      adapterVersion: TOOLCRAFT_STL_ADAPTER_VERSION,
      appearance: {
        diagnostics: [],
        resolveMaterial: () => hasColors ? {
          baseColor: TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.baseColorLinear,
          emissive: TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.emissiveLinear,
          key: "stl:vertex-color",
          metallic: TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.metallic,
          opacity: alpha,
          roughness: TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.roughness,
        } : undefined,
      },
      limits: context.limits,
      signal: context.signal,
      sourceByteLength: source.byteLength,
      sourceFormat: "stl",
    });
  } catch (error) {
    throwIfThreeStaticGeometryAborted(context.signal);
    if (error instanceof ToolcraftThreeStaticGeometryError) throw error;
    return threeStaticGeometryFailure(
      "format",
      "stl-decode-failed",
      "The STL geometry could not be decoded safely.",
    );
  }
}

export const toolcraftStlModelFormatAdapter: ToolcraftModelFormatAdapter =
  Object.freeze({
    adapterVersion: TOOLCRAFT_STL_ADAPTER_VERSION,
    decode: decodeStl,
    format: "stl",
    rootExtensions: Object.freeze([".stl"]),
    workerCapable: true,
  });
