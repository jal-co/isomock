import assert from "node:assert/strict";
import test from "node:test";

import { evaluateToolcraftProductBoundary } from "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from "./toolcraft-product-boundary-test-fixtures.mjs";

test("allows the checked presentation consumer without opening model internals", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/model-canvas.tsx": `
      import { useToolcraftModelPresentationConsumer } from "@/toolcraft/runtime/react";
      export function ModelCanvas() {
        const consumer = useToolcraftModelPresentationConsumer({
          id: "product-model",
          sourceTarget: "source.model",
        });
        void consumer;
        return <canvas data-product-model-canvas="source.model" />;
      }
    `,
    "src/features/model-loader.ts": `
      import { useToolcraftModelRenderHost } from "@/toolcraft/runtime/react";
      import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
      import { createModelSourceBundle } from "@/toolcraft/runtime/model-import/model-source-bundle";
      import { createToolcraftModelPresentationResourceManager } from "@/toolcraft/runtime/react/model-rendering/model-presentation-resource-manager";
      void useToolcraftModelRenderHost;
      void GLTFLoader;
      void createModelSourceBundle;
      void createToolcraftModelPresentationResourceManager;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map((violation) => violation.kind).sort(),
    [
      "runtime-model-import-ownership",
      "runtime-model-import-ownership",
      "runtime-model-presentation-ownership",
      "runtime-model-presentation-ownership",
    ],
  );
  assert.equal(
    result.violations.some((violation) =>
      violation.repoPath.endsWith("model-canvas.tsx"),
    ),
    false,
  );
});
