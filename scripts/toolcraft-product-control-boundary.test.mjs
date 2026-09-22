import assert from "node:assert/strict";
import test from "node:test";

import { evaluateToolcraftProductBoundary } from "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from "./toolcraft-product-boundary-test-fixtures.mjs";

const workspaceUiModule = ["@", "repo/ui"].join("");

test("finds built-in controls through every module form", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/control-bridge.ts": `
      export { SliderControl as ProductSlider } from "${workspaceUiModule}/controls";
      export { Color as ProductColor } from "@/toolcraft/ui";
    `,
    "src/features/dynamic.ts": `
      export async function loadControls() {
        return import("@/toolcraft/ui/components/controls/slider");
      }
    `,
    "src/features/namespace.ts": `
      import * as Controls from "${workspaceUiModule}";
      export const Slider = Controls.Slider;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map((violation) => violation.kind),
    [
      "private-ui-implementation",
      "built-in-control",
      "built-in-control-implementation",
      "built-in-control",
      "private-ui-implementation",
    ],
  );
});

test("rejects every deep import path into built-in control implementations", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/direct.tsx": `
      import { ColorPickerPopover } from "@/toolcraft/ui/components/controls/color/color-picker-popover";
      export const Direct = ColorPickerPopover;
    `,
    "src/features/directory-index.ts": `
      import * as PrivateControls from "${workspaceUiModule}/components/controls";
      export const DirectoryIndex = PrivateControls;
    `,
    "src/features/dynamic.ts": `
      export const loadPrivateControl = () => import("${workspaceUiModule}/components/controls/color/color-value-utils");
    `,
    "src/features/namespace.ts": `
      import * as PrivateColor from "@/toolcraft/ui/components/controls/color";
      export const Namespace = PrivateColor;
    `,
    "src/features/reexport.ts": `
      export { getCommittedHexColor } from "@/toolcraft/ui/components/controls/color/color-value-utils";
    `,
    "src/features/require.ts": `
      export const privateControl = require("@/toolcraft/ui/components/controls/color/color-picker-popover");
    `,
    "src/features/workspace-source.ts": `
      import { ColorPickerPopover } from "${workspaceUiModule}/src/components/controls/color/color-picker-popover";
      export const WorkspaceSource = ColorPickerPopover;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(result.violations.length, 7);
  assert.equal(
    result.violations.every(
      (violation) => violation.kind === "built-in-control-implementation",
    ),
    true,
  );
  assert.equal(
    result.violations.every((violation) =>
      /deep control implementation|public schema control/u.test(
        violation.message,
      ),
    ),
    true,
  );
});

test("rejects the badge color-control copy at both private imports", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/badge-color-control.tsx": `
      import { ColorPickerPopover } from "@/toolcraft/ui/components/controls/color/color-picker-popover";
      import { getCommittedHexColor } from "@/toolcraft/ui/components/controls/color/color-value-utils";
      export const BadgeColorControl = { ColorPickerPopover, getCommittedHexColor };
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map(({ column, kind, line, repoPath }) => ({
      column,
      kind,
      line,
      repoPath,
    })),
    [
      {
        column: 7,
        kind: "built-in-control-implementation",
        line: 2,
        repoPath: "src/features/badge-color-control.tsx",
      },
      {
        column: 7,
        kind: "built-in-control-implementation",
        line: 3,
        repoPath: "src/features/badge-color-control.tsx",
      },
    ],
  );
});

test("rejects native and kit-primitive recreations of built-in controls", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/kit-inputs.tsx": `
      import { Input as FieldInput } from "@/toolcraft/ui";
      import * as Primitives from "@/toolcraft/ui";
      const AliasedInput = FieldInput;
      const { Input: RequiredInput } = require("@/toolcraft/ui");
      export const Color = <FieldInput type="color" />;
      export const File = <AliasedInput type={"file"} />;
      export const Range = <Primitives.Input type="range" />;
      export const Radio = <RequiredInput type="radio" />;
      export function Dynamic({ kind }) {
        return <FieldInput type={kind} />;
      }
    `,
    "src/features/native.tsx": `
      const rangeType = "range";
      export const Range = <input type={rangeType} />;
      export const Checkbox = <input type="checkbox" />;
      export const Radio = <input type="radio" />;
      export const Select = <select><option>One</option></select>;
      export const Notes = <textarea />;
    `,
    "src/features/private-primitive.tsx": `
      import { Input as PrimitiveInput } from "${workspaceUiModule}";
      export const PrivatePrimitiveColor = <PrimitiveInput type="color" />;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(
    result.violations.filter((violation) => violation.kind === "built-in-control")
      .length,
    2,
  );
  assert.equal(
    result.violations.filter(
      (violation) =>
        violation.kind === "native-control-recreation" &&
        violation.repoPath !== "src/features/private-primitive.tsx",
    ).length,
    11,
  );
  assert.equal(
    result.violations.filter(
      (violation) => violation.kind === "private-ui-implementation",
    ).length,
    1,
  );
});

test("rejects raw semantic hosts while allowing public controls and plain layout", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/safe-controls.tsx": `
      import { Button, Input as FieldInput } from "@/toolcraft/ui";
      function ProductInput() { return <div>Product value</div>; }
      function ShadowedInput(FieldInput) { return <FieldInput type="color" />; }
      export const Safe = (
        <>
          <FieldInput type="text" />
          <input type="email" />
          <input type="hidden" />
          <Button>Run</Button>
          <button className="rounded border" type="button">Choose folder</button>
          <a className="rounded border" href="/export">Export</a>
          <canvas />
          <ProductInput />
          <ShadowedInput />
        </>
      );
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map(({ kind }) => kind),
    [
      "native-control-recreation",
      "native-control-recreation",
      "native-control-recreation",
      "native-control-recreation",
    ],
  );
});

test("closes generated product host aliases, React factories, and semantic native hosts", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/aliased-hosts.tsx": `
      const ButtonHost = "button";
      const hosts = { anchor: "a", action: "div" } as const;
      export const Aliased = <>
        <ButtonHost className="rounded border">Run</ButtonHost>
        <hosts.anchor href="/export">Export</hosts.anchor>
        <hosts.action role="button" tabIndex={0} onClick={() => undefined}>Run</hosts.action>
      </>;
    `,
    "src/features/react-factories.tsx": `
      import * as React from "react";
      const create = React.createElement;
      export const Direct = React.createElement("button", { onClick() {} }, "Run");
      export const Aliased = create("a", { href: "/export" }, "Export");
      export const Factory = React.createFactory("button");
      export const Cloned = React.cloneElement(<div />, { role: "button", onClick() {} });
    `,
    "src/features/semantic-hosts.tsx": `
      export const SemanticHosts = <>
        <div role="button" tabIndex={0} onClick={() => undefined}>Run</div>
        <summary onClick={() => undefined}>More</summary>
        <details onToggle={() => undefined}><summary>More</summary></details>
      </>;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(result.violations.length, 12, JSON.stringify(result.violations));
  assert.equal(
    result.violations.every(({ kind }) => kind === "native-control-recreation"),
    true,
  );
});

test("permits only the generated public UI root and rejects every deep UI import", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/deep-ui.ts": `
      import { sanitizeComposedHostProps } from "@/toolcraft/ui/components/primitives/sanitize-composed-host-props";
      import { subscribeBrowserWindowEvent } from "@/toolcraft/ui/components/primitives/browser-transport";
      import { Dialog } from "@/toolcraft/ui/components/composites/dialog";
      import { PanelInteractionSurface } from "@/toolcraft/ui/components/panel/panel-surface";
      export const privateUi = { sanitizeComposedHostProps, subscribeBrowserWindowEvent, Dialog, PanelInteractionSurface };
    `,
    "src/features/public-ui.tsx": `
      import { Anchor, Button } from "@/toolcraft/ui";
      export const PublicUi = <><Button>Run</Button><Anchor href="/export">Export</Anchor></>;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(result.violations.length, 4);
  assert.equal(
    result.violations.every(({ kind }) => kind === "private-ui-implementation"),
    true,
  );
});

test("rejects generated host construction through factories, DOM, Base UI, and dynamic semantics", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/base-ui.tsx": `
      import { Button as RawButton } from "@base-ui/react/button";
      import { useRender } from "@base-ui/react/use-render";
      export const Direct = <RawButton>Run</RawButton>;
      export const Rendered = () => useRender({ defaultTagName: "button" });
    `,
    "src/features/dom.ts": `
      declare const node: Element;
      declare const tag: string;
      document.createElement("button");
      node.ownerDocument.createElement("input");
      document.createElement(tag);
    `,
    "src/features/factories.tsx": `
      import { createElement } from "react";
      import { jsx } from "react/jsx-runtime";
      createElement.apply(null, ["button", null]);
      jsx.call(null, "a", { href: "/export" });
    `,
    "src/features/hidden-host.tsx": `
      const HiddenHost = "button" as unknown as (props: object) => unknown;
      export const Hidden = <HiddenHost />;
    `,
    "src/features/semantic.tsx": `
      export const Dynamic = (props: { role: string }) => <div role={props.role} />;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map(({ kind }) => kind),
    [
      "private-ui-implementation",
      "private-ui-implementation",
      ...Array.from({ length: 11 }, () => "native-control-recreation"),
    ],
  );
});

test("keeps explicitly absent semantic values passive while dynamic values fail closed", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/semantics.tsx": `
      export const Passive = <div role={null} onClick={undefined} />;
      export const Dynamic = (props: { role: string }) => <div role={props.role} />;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map(({ kind }) => kind),
    ["native-control-recreation"],
  );
});

test("allows only imports resolved to the exact generated public UI root", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/private-alias.tsx": `
      import { Button } from "#private";
      export const Private = <Button>Run</Button>;
    `,
    "src/features/public.tsx": `
      import { Button } from "@/toolcraft/ui";
      export const Public = <Button>Run</Button>;
    `,
    "src/toolcraft/ui/components/primitives/button.tsx":
      "export const Button = (props: object) => null;\n",
    "src/toolcraft/ui/index.ts":
      'export { Button } from "./components/primitives/button";\n',
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "#private": ["src/toolcraft/ui/components/primitives/button.tsx"],
        },
      },
    }),
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map(({ kind, repoPath }) => ({ kind, repoPath })),
    [{
      kind: "private-ui-implementation",
      repoPath: "src/features/private-alias.tsx",
    }],
  );
});
