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

async function run(context, sources) {
  return evaluateToolcraftProductBoundary({ rootDir: await createFixture(context, sources) });
}

test("compound and logical writes preserve dangerous possible exits", async (context) => {
  const compound = "src/features/round29-product-compound.tsx";
  const skipped = "src/features/round29-product-logical-skip.tsx";
  const result = await run(context, {
    [compound]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const state = {
        get value() { return props.className; },
        set value(next: string) { props.className = next; } };
      state.value += " border"; export const Case = <Button {...props} />;`,
    [skipped]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; let value = "present";
      value ||= (props.className = "border"); export const Case = <Button {...props} />;`,
  });
  assert.equal(violations(result, compound).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, skipped), [], JSON.stringify(result.violations));
});

test("accessor-mediated style writes use receiver identity", async (context) => {
  const danger = "src/features/round29-product-accessor.tsx";
  const safe = "src/features/round29-product-accessor-inert.tsx";
  const body = (read) => `import { Button } from "@/toolcraft/ui";
    const model = { props: { className: "flex" },
      get preview() { this.props.className = "border"; return this.props; } };
    ${read} export const Case = <Button {...model.props} />;`;
  const result = await run(context, {
    [danger]: body("void model.preview;"), [safe]: body("void model;"),
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("optional-call active and skipped branches keep distinct effects", async (context) => {
  const active = "src/features/round29-product-optional-active.tsx";
  const skipped = "src/features/round29-product-optional-skip.tsx";
  const result = await run(context, {
    [active]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const mutate = () => {
        props.className = "border"; }; mutate?.();
      export const Case = <Button {...props} />;`,
    [skipped]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const mutate: undefined = undefined;
      mutate?.((props.className = "border"));
      export const Case = <Button {...props} />;`,
  });
  assert.equal(violations(result, active).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, skipped), [], JSON.stringify(result.violations));
});

test("labeled switch exits retain only reachable style alternatives", async (context) => {
  const danger = "src/features/round29-product-label-switch.tsx";
  const safe = "src/features/round29-product-label-safe.tsx";
  const result = await run(context, {
    [danger]: `import { Button } from "@/toolcraft/ui"; declare const mode: 0 | 1;
      let className = "flex"; outer: switch (mode) {
        case 0: className = "grid"; break outer;
        case 1: className = "border"; }
      export const Case = <Button className={className} />;`,
    [safe]: `import { Button } from "@/toolcraft/ui"; let className = "border";
      outer: { inner: { className = "flex"; break inner; }
        className = "grid"; break outer; } export const Case = <Button className={className} />;`,
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("parameter and destructuring defaults execute only on missing values", async (context) => {
  const danger = "src/features/round29-product-default-danger.tsx";
  const safe = "src/features/round29-product-default-safe.tsx";
  const source = (calls) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" };
    function run(value = (props.className = "border", 1)) { void value; }
    let value; ${calls} export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [danger]: source("run(); ({ value = (props.className = \"border\", 1) } = {});"),
    [safe]: source("run(null); ({ value = (props.className = \"border\", 1) } = { value: null });"),
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("opaque callback captures are possible without tainting read-only callbacks", async (context) => {
  const danger = "src/features/round29-product-callback-danger.tsx";
  const safe = "src/features/round29-product-callback-safe.tsx";
  const source = (body) => `import { Button } from "@/toolcraft/ui";
    declare function schedule(callback: () => void): void;
    const props = { className: "flex" }; schedule(() => { ${body} });
    export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [danger]: source(`props.className = "border";`),
    [safe]: source("void props.className;"),
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("returned closure activations do not overwrite sibling callers", async (context) => {
  const safe = "src/features/round29-product-closure-safe.tsx";
  const danger = "src/features/round29-product-closure-danger.tsx";
  const source = (render) => `import { Button } from "@/toolcraft/ui";
    const first = { className: "flex" }, second = { className: "flex" };
    function make(target: { className: string }) {
      return () => { target.className = "border"; }; }
    const mutateFirst = make(first); make(second); mutateFirst(); ${render}`;
  const result = await run(context, {
    [safe]: source("export const Case = <Button {...second} />;"),
    [danger]: source("export const Case = <Button {...first} />;"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("host origins share direct call apply bind and returned invocation facts", async (context) => {
  const forms = {
    direct: "choose(Button)", call: "choose.call(undefined, Button)",
    apply: "choose.apply(undefined, [Button])",
    bind: "choose.bind(undefined, Button)()", returned: "factory()(Button)",
  };
  const sources = Object.fromEntries(Object.entries(forms).map(([name, expression]) => [
    `src/features/round29-product-host-${name}.tsx`, `
      import { Button } from "@/toolcraft/ui"; import type { ElementType } from "react";
      function choose(value: ElementType) { return value; }
      function factory() { return choose; }
      const Component = ${expression}; export const Case = <Component className="border" />;`,
  ]));
  const safe = "src/features/round29-product-host-safe.tsx";
  sources[safe] = `const Custom = () => null; function choose() { return Custom; }
    const Component = choose.bind(undefined)(); export const Case = <Component className="border" />;`;
  const result = await run(context, sources);
  for (const name of Object.keys(forms)) {
    const path = `src/features/round29-product-host-${name}.tsx`;
    assert.equal(violations(result, path).length, 1, `${path}: ${JSON.stringify(result.violations)}`);
  }
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("typed export renderer callbacks preserve their exact DOM contract", async (context) => {
  const repoPath = "src/features/round29-product-export-renderer.tsx";
  const result = await run(context, { [repoPath]: `
    declare const passHandleType: unique symbol;
    type PassContract<Result> = Readonly<{
      resource: never; resourceKey: never; result: Result;
    }>;
    type PassHandle<Contract extends PassContract<unknown>> = Readonly<{
      readonly [passHandleType]: Readonly<{
        cacheKey: undefined; contract: Contract; resource: never;
      }>;
      id: "artifact-export";
    }>;
    type PassResult<Handle extends PassHandle<PassContract<unknown>>> =
      Handle extends PassHandle<infer Contract> ? Contract["result"] : never;
    type Pipeline = Readonly<{
      runPass: <Handle extends PassHandle<PassContract<unknown>>>(
        pass: Handle,
        cacheInput: undefined,
        work: (context: Readonly<{ invalidatePass: () => void }>) =>
          PromiseLike<PassResult<Handle>> | PassResult<Handle>,
      ) => Promise<PassResult<Handle>>;
    }>;
    type ToolcraftProductExportRenderer = Readonly<{
      baseFileName: string;
      renderFrame: (request: Readonly<{
        context: CanvasRenderingContext2D;
        frame: Readonly<{ x: number; y: number; width: number; height: number }>;
        rendererPipeline: Pipeline | null;
        state: Readonly<{ values: Readonly<Record<string, unknown>> }>;
        timelineProgress: number;
      }>) => PromiseLike<void> | void;
    }>;
    declare const artifactExportPass: PassHandle<PassContract<void>>;
    declare function waitForProductExportFrame(): Promise<void>;
    declare function getProductOutputSettings(
      state: Readonly<{ values: Readonly<Record<string, unknown>> }>,
    ): Readonly<{ pulseOpacity: number }>;
    declare function renderProductPulse(
      context: CanvasRenderingContext2D,
      frame: { width: number; height: number },
      opacity: number,
      progress: number,
    ): void;
    export const renderer: ToolcraftProductExportRenderer = {
      baseFileName: "round29-export",
      renderFrame: ({ context, frame, rendererPipeline, state, timelineProgress }) => {
        const render = async () => {
          await waitForProductExportFrame();
          const settings = getProductOutputSettings(state);
          renderProductPulse(context, frame, settings.pulseOpacity, timelineProgress);
        };
        return rendererPipeline
          ? rendererPipeline.runPass(artifactExportPass, undefined, render)
          : render();
      },
    };
  ` });
  assert.deepEqual(result.violations.filter(({ repoPath: path }) =>
    path === repoPath), [], JSON.stringify(result.violations));
});

test("deep expression exhaustion fails closed before possible chrome writes", async (context) => {
  const repoPath = "src/features/round29-product-deep-expression.tsx";
  const expression = `${"true && (".repeat(30)}props.className = "border"${
    ")".repeat(30)
  }`;
  const result = await run(context, { [repoPath]: `
    import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" };
    ${expression};
    export const Case = <Button {...props} />;
  ` });
  assert.equal(result.violations.filter(({ repoPath: path }) =>
    path === repoPath).length, 1, JSON.stringify(result.violations));
});

test("optional calls execute their root before deciding to skip arguments", async (context) => {
  const repoPath = "src/features/round29-product-optional-return.tsx";
  const result = await run(context, { [repoPath]: `
    import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" };
    function missing(): undefined { return undefined; }
    missing()?.(props.className = "border");
    export const Case = <Button {...props} />;
  ` });
  assert.deepEqual(violations(result, repoPath), [],
    JSON.stringify(result.violations));
});
