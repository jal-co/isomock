import assert from "node:assert/strict";
import test from "node:test";

import { evaluateToolcraftProductBoundary } from "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from "./toolcraft-product-boundary-test-fixtures.mjs";

test("keeps artifact encoding and download mechanics runtime-owned", async (context) => {
  const workspaceRuntimeExportSpecifier = [
    "@repo",
    "toolcraft-runtime",
    "export",
    "image-artifact-export",
  ].join("/");
  const rootDir = await createFixture(context, {
    "src/features/export-mechanics.ts": `
      import { createToolcraftVideoEncoderBackend as createAliasBackend } from "@/toolcraft/runtime/export/video-encoding-backend";
      import { exportToolcraftImageArtifact } from "${workspaceRuntimeExportSpecifier}";
      import { downloadToolcraftArtifact } from "../toolcraft/runtime/export/artifact-download";
      import { Output } from "mediabunny";
      export function exportArtifact(canvas: HTMLCanvasElement) {
        const recorder = new MediaRecorder(canvas.captureStream());
        const encoder = new VideoEncoder({ error() {}, output() {} });
        canvas.toBlob(() => undefined);
        canvas.toDataURL();
        URL.createObjectURL(new Blob());
        showSaveFilePicker();
        void createAliasBackend;
        void exportToolcraftImageArtifact;
        void downloadToolcraftArtifact;
        void Output;
        void recorder;
        void encoder;
      }
    `,
    "src/features/safe-renderer.ts": `
      import * as Runtime from "@/toolcraft/runtime";
      import {
        getToolcraftImageExportSize,
        validateToolcraftArtifactSize,
      } from "@/toolcraft/runtime";
      import type {
        ToolcraftExportFrame,
        ToolcraftProductExportRenderer,
        ToolcraftProductSvgExportRenderer,
      } from "@/toolcraft/runtime";
      export const renderFrame = ({ context }) => context.fillRect(0, 0, 1, 1);
      void Runtime;
      void getToolcraftImageExportSize;
      void validateToolcraftArtifactSize;
      void (null as unknown as ToolcraftExportFrame);
      void (null as unknown as ToolcraftProductExportRenderer);
      void (null as unknown as ToolcraftProductSvgExportRenderer);
      void new XMLSerializer();
    `,
    "src/features/shadowed-globals.ts": `
      export function localNames(MediaRecorder, VideoEncoder, URL) {
        void new MediaRecorder();
        void new VideoEncoder();
        URL.createObjectURL();
      }
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(result.violations.length, 11);
  assert.equal(
    result.violations.every(
      (violation) => violation.kind === "runtime-export-ownership",
    ),
    true,
  );
  assert.equal(
    result.violations.some((violation) =>
      violation.repoPath.endsWith("shadowed-globals.ts"),
    ),
    false,
  );
  assert.equal(
    result.violations.some((violation) =>
      violation.repoPath.endsWith("safe-renderer.ts"),
    ),
    false,
  );
});

test("classifies every runtime export mechanics module reference once", async (context) => {
  const workspaceRuntimeExportRoot = [
    "@repo",
    "toolcraft-runtime",
    "export",
  ].join("/");
  const rootDir = await createFixture(context, {
    "src/features/dynamic-import.ts": `
      export async function loadMedia() {
        return import("mediabunny");
      }
    `,
    "src/features/import-equals.ts": `
      import Backend = require("@/toolcraft/runtime/export/video-encoding-backend");
      void Backend;
    `,
    "src/features/import-type.ts": `
      type Backend = import("@/toolcraft/runtime/export/video-encoding-backend").ToolcraftVideoEncoderBackend;
      void (null as unknown as Backend);
    `,
    "src/features/regular-export.ts": `
      export {
        createToolcraftVideoEncoderBackend as createFirstBackend,
        createToolcraftVideoEncoderBackend as createSecondBackend,
      } from "@/toolcraft/runtime/export/video-encoding-backend";
    `,
    "src/features/regular-import.ts": `
      import {
        createToolcraftVideoEncoderBackend as createFirstBackend,
        createToolcraftVideoEncoderBackend as createSecondBackend,
      } from "@/toolcraft/runtime/export/video-encoding-backend";
      void createFirstBackend;
      void createSecondBackend;
    `,
    "src/features/require.ts": `
      export const backend = require("${workspaceRuntimeExportRoot}/video-encoding-backend");
    `,
    "src/features/safe-root-type-import.ts": `
      import type { ToolcraftExportFrame } from "@/toolcraft/runtime";
      void (null as unknown as ToolcraftExportFrame);
    `,
    "src/features/side-effect-import.ts": `import "mediabunny";`,
    "src/features/type-only-export.ts": `
      export type {
        ToolcraftImageArtifactExportRequest,
        ToolcraftImageArtifactExportResult,
      } from "${workspaceRuntimeExportRoot}/image-artifact-export";
    `,
    "src/features/type-only-import-equals.ts": `
      import type Backend = require("@/toolcraft/runtime/export/video-encoding-backend");
      void (null as unknown as Backend);
    `,
    "src/features/type-only-import.ts": `
      import type {
        ToolcraftVideoArtifactExportRequest,
        ToolcraftVideoArtifactExportResult,
      } from "${workspaceRuntimeExportRoot}/video-artifact-export";
      void (null as unknown as ToolcraftVideoArtifactExportRequest);
      void (null as unknown as ToolcraftVideoArtifactExportResult);
    `,
    "src/features/typeof-import-type.ts": `
      type MediaBunny = typeof import("mediabunny");
      void (null as unknown as MediaBunny);
    `,
    "src/features/export-boundary.test.ts": `
      import type { ToolcraftVideoEncoderBackend } from "@/toolcraft/runtime/export/video-encoding-backend";
      void (null as unknown as ToolcraftVideoEncoderBackend);
    `,
    "e2e/test-support/export-fixture.ts": `
      export type { ToolcraftVideoEncoderBackend } from "@/toolcraft/runtime/export/video-encoding-backend";
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map(({ repoPath }) => repoPath).sort(),
    [
      "src/features/dynamic-import.ts",
      "src/features/import-equals.ts",
      "src/features/import-type.ts",
      "src/features/regular-export.ts",
      "src/features/regular-import.ts",
      "src/features/require.ts",
      "src/features/side-effect-import.ts",
      "src/features/type-only-export.ts",
      "src/features/type-only-import-equals.ts",
      "src/features/type-only-import.ts",
      "src/features/typeof-import-type.ts",
    ],
  );
  assert.equal(
    new Set(result.violations.map(({ repoPath }) => repoPath)).size,
    result.violations.length,
  );
  assert.equal(
    result.violations.every(
      (violation) => violation.kind === "runtime-export-ownership",
    ),
    true,
  );
  assert.equal(
    result.violations.some(({ repoPath }) =>
      [
        "src/features/export-boundary.test.ts",
        "src/features/safe-root-type-import.ts",
        "e2e/test-support/export-fixture.ts",
      ].includes(repoPath),
    ),
    false,
  );
});
