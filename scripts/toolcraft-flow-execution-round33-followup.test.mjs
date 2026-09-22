import assert from "node:assert/strict";
import test from "node:test";

import { evaluateToolcraftProductBoundary } from
  "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from
  "./toolcraft-product-boundary-test-fixtures.mjs";

function violations(result, repoPath) {
  return result.violations.filter((violation) =>
    violation.repoPath === repoPath && violation.kind === "public-component-chrome"
  );
}

test("defineProperty reads effectful descriptor fields exactly once", async (context) => {
  const safe = "src/features/round33-descriptor-field-data.tsx";
  const danger = "src/features/round33-descriptor-field-getter.tsx";
  const result = await evaluateToolcraftProductBoundary({
    rootDir: await createFixture(context, {
      [safe]: `import { Button } from "@/toolcraft/ui";
        const props = { className: "flex" }; const owner = {};
        Object.defineProperty(owner, "value", { value: 1 });
        export const Case = <Button {...props} />;`,
      [danger]: `import { Button } from "@/toolcraft/ui";
        const props = { className: "flex" }; const owner = {};
        const descriptor = { get value() {
          props.className = "border"; return 1; } };
        Object.defineProperty(owner, "value", descriptor);
        export const Case = <Button {...props} />;`,
    }),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1,
    JSON.stringify(result.violations));
});

test("joined optional accessors retain their possible getter effect", async (context) => {
  const repoPath = "src/features/round33-joined-accessor.tsx";
  const result = await evaluateToolcraftProductBoundary({
    rootDir: await createFixture(context, {
      [repoPath]: `import { Button } from "@/toolcraft/ui";
        const props = { className: "flex" }; const owner = {};
        declare const a: boolean; declare const b: boolean;
        declare const c: boolean; declare const d: boolean;
        let branch = 0;
        if (a) Object.defineProperty(owner, "run", { get() {
          props.className = "border"; return () => {}; } });
        if (b) branch = 1; if (c) branch = 2; if (d) branch = 3;
        void branch; void owner.run;
        export const Case = <Button {...props} />;`,
    }),
  });
  assert.equal(violations(result, repoPath).length, 1,
    JSON.stringify(result.violations));
});
