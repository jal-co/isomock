import assert from "node:assert/strict";
import test from "node:test";

import { evaluateToolcraftProductBoundary } from
  "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from
  "./toolcraft-product-boundary-test-fixtures.mjs";
import { getToolcraftOwnedComponentChromeDomain } from
  "./toolcraft-public-component-style-policy.mjs";

function violationsFor(result, repoPath) {
  return result.violations.filter((violation) => violation.repoPath === repoPath);
}

function erasures(result, repoPath) {
  return violationsFor(result, repoPath).filter(({ message }) =>
    message.startsWith("lib.dom capability cannot be erased")
  );
}

test("product covers callable, Pick, and every contextual target", async (context) => {
  const repoPath = "src/features/round20-contexts.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      type Shape = { createElement(name: string): unknown };
      type StructuralCallable = (host: Shape) => void;
      declare const domCallable: (host: Document) => void;
      const erasedCallable: StructuralCallable = domCallable;
      function picked(
        { createElement }: Pick<Document, "createElement">
      ) {}
      function generic<T extends Pick<Document, "createElement">>(
        { createElement }: T
      ) {}
      const concise = (): Shape => document;
      class Defaults {
        property: Shape = document;
        method(value: Shape = document) { void value; }
      }
      class Box { constructor(value: Shape) { void value; } }
      new Box(document);
      declare function View(props: { host: Shape }): unknown;
      const jsx = <View host={document} />;
      void erasedCallable; void picked; void generic; void concise;
      void Defaults; void jsx;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  const relevant = violationsFor(result, repoPath).filter(({ message }) =>
    message.startsWith("lib.dom capability cannot be erased") ||
    message.includes("acquiring DOM host-factory authority")
  );
  assert.equal(relevant.length, 10, JSON.stringify(result.violations));
});

test("product callable overload order cannot hide DOM erasure", async (context) => {
  const repoPath = "src/features/round20-overloads.ts";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      type Shape = { createElement(name: string): unknown };
      interface SourceCallable {
        (label: string): number;
        (host: Document): void;
      }
      interface TargetCallable {
        (host: Shape): void;
        (label: string): number;
      }
      declare const source: SourceCallable;
      const erased: TargetCallable = source;
      void erased;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(erasures(result, repoPath).length, 1, JSON.stringify(result.violations));
});

test("product Program preserves cross-module contextual DOM targets", async (context) => {
  const ownerPath = "src/features/round20-targets.tsx";
  const consumerPath = "src/features/round20-consumer.tsx";
  const rootDir = await createFixture(context, {
    [ownerPath]: `
      export type Shape = { createElement(name: string): unknown };
      export function accept(value: Shape) { void value; }
      export class Box { constructor(value: Shape) { void value; } }
      export function View(props: { host: Shape }) { void props; return null; }
    `,
    [consumerPath]: `
      import { accept, Box, View } from "@/features/round20-targets";
      accept(document);
      new Box(document);
      export const Render = <View host={document} />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(
    erasures(result, consumerPath).length,
    3,
    JSON.stringify(result.violations),
  );
});

test("product nested wrappers and unions fail while plain data stays clean", async (context) => {
  const repoPath = "src/features/round20-nested.ts";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      type Wrap<T> = { value: T };
      type CloneShape = { cloneNode(deep?: boolean): unknown };
      declare const element: HTMLDivElement;
      const nested:
        Array<Wrap<Record<string, CloneShape>> | { label: string }> = [
          { value: { host: element } },
        ];
      type MethodWrap = { acquire(): CloneShape };
      declare const methodSource: { acquire(): HTMLDivElement };
      const erasedMethod: MethodWrap = methodSource;
      type PlainCallable = (value: { label: string }) => { count: number };
      const callable: PlainCallable = (value) => ({ count: value.label.length });
      class PlainGetter { get value() { return { label: "clean" }; } }
      const plain: Array<Record<string, { label: string }>> = [
        { item: { label: "clean" } },
      ];
      void nested; void erasedMethod; void callable; void PlainGetter; void plain;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(erasures(result, repoPath).length, 2, JSON.stringify(result.violations));
});

test("product rejects raw native control markup injection", async (context) => {
  const repoPath = "src/features/round20-markup.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      declare const unknownMarkup: string;
      export const ButtonMarkup = <div dangerouslySetInnerHTML={{
        __html: "<button type='button'>Run</button>",
      }} />;
      export const InputMarkup = <div dangerouslySetInnerHTML={{
        __html: "<input type='range'>",
      }} />;
      export const UnknownMarkup = <div dangerouslySetInnerHTML={{
        __html: unknownMarkup,
      }} />;
      export const PlainMarkup = <div dangerouslySetInnerHTML={{
        __html: "<strong>Read-only information</strong>",
      }} />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(
    violationsFor(result, repoPath).filter(({ kind }) =>
      kind === "raw-control-markup"
    ).length,
    3,
    JSON.stringify(result.violations),
  );
});

test("raw control markup remains ordered across inline and unknown spreads", async (context) => {
  const repoPath = "src/features/round20-markup-spreads.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      declare const props: {
        dangerouslySetInnerHTML?: { __html: string };
      };
      export const Inline = <div {...{
        dangerouslySetInnerHTML: { __html: "<button>Run</button>" },
      }} />;
      export const Unknown = <div {...props} />;
      export const FinalPlain = <div {...props} dangerouslySetInnerHTML={{
        __html: "<strong>Information</strong>",
      }} />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(
    violationsFor(result, repoPath).filter(({ kind }) =>
      kind === "raw-control-markup"
    ).length,
    2,
    JSON.stringify(result.violations),
  );
});

test("public Button and Anchor keep their owned chrome", async (context) => {
  const repoPath = "src/features/round20-chrome.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import {
        Anchor as DesignAnchor,
        Button as DesignButton,
      } from "@/toolcraft/ui";
      import * as DesignSystem from "@/toolcraft/ui";
      const Action = DesignButton;
      export const Invalid = <>
        <Action className="border rounded-lg hover:bg-red-500">Run</Action>
        <DesignAnchor className="border-2 focus-visible:ring-2 active:opacity-80">
          Docs
        </DesignAnchor>
        <DesignSystem.Button className="rounded-none">Save</DesignSystem.Button>
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(
    violationsFor(result, repoPath).filter(({ kind }) =>
      kind === "public-component-chrome"
    ).length,
    3,
    JSON.stringify(result.violations),
  );
});

test("public component ownership survives a local barrel re-export", async (context) => {
  const barrelPath = "src/components/design-system.ts";
  const consumerPath = "src/features/round20-barrel-chrome.tsx";
  const rootDir = await createFixture(context, {
    [barrelPath]: `
      export { Button as Action } from "@/toolcraft/ui";
    `,
    [consumerPath]: `
      import { Action } from "@/components/design-system";
      export const Invalid = <Action className="border rounded-none">Run</Action>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(
    violationsFor(result, consumerPath).filter(({ kind }) =>
      kind === "public-component-chrome"
    ).length,
    1,
    JSON.stringify(result.violations),
  );
});

test("public component layout spacing sizing and text extensions stay clean", async (context) => {
  const repoPath = "src/features/round20-extension.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Anchor, Button } from "@/toolcraft/ui";
      export const Valid = <>
        <Button className="absolute top-2 flex w-full gap-2 px-2 text-sm font-medium truncate">
          Run
        </Button>
        <Anchor className="inline-flex max-w-40 items-center gap-1 text-xs truncate">
          Docs
        </Anchor>
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(violationsFor(result, repoPath), [], JSON.stringify(result.violations));
});

test("public component chrome evidence preserves JSX property order", async (context) => {
  const repoPath = "src/features/round20-extension-order.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      declare const props: object;
      declare const classProps: { className?: string };
      export const Invalid = <Button className="border" {...{ id: "run" }} />;
      export const Valid = <Button {...props} className="flex gap-2 text-sm" />;
      export const ValidInline = <Button {...{
        ...classProps,
        className: "flex gap-2 text-sm",
      }} />;
      export const InvalidInline = <Button {...{
        className: "border",
        ...{ id: "run" },
      }} />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(
    violationsFor(result, repoPath).filter(({ kind }) =>
      kind === "public-component-chrome"
    ).length,
    2,
    JSON.stringify(result.violations),
  );
});

test("owned utility domains use finite namespaces and state families", () => {
  assert.equal(
    getToolcraftOwnedComponentChromeDomain("group-hover/menu:text-red-500"),
    "interaction-state",
  );
  assert.equal(
    getToolcraftOwnedComponentChromeDomain("group-hovered:text-red-500"),
    "color",
  );
  assert.equal(
    getToolcraftOwnedComponentChromeDomain("borderline"),
    undefined,
  );
  assert.equal(
    getToolcraftOwnedComponentChromeDomain("[border-radius:0]"),
    "radius",
  );
  assert.equal(
    getToolcraftOwnedComponentChromeDomain("[border-color:red]"),
    "border",
  );
  assert.equal(
    getToolcraftOwnedComponentChromeDomain("![border-color:red]"),
    "border",
  );
  assert.equal(
    getToolcraftOwnedComponentChromeDomain("rounded-none!"),
    "radius",
  );
  assert.equal(
    getToolcraftOwnedComponentChromeDomain("[&:hover]:text-red-500"),
    "interaction-state",
  );
  assert.equal(
    getToolcraftOwnedComponentChromeDomain("aria-expanded:bg-red-500"),
    "interaction-state",
  );
  assert.equal(
    getToolcraftOwnedComponentChromeDomain(
      "[&[aria-pressed=true]]:opacity-50",
    ),
    "interaction-state",
  );
  assert.equal(
    getToolcraftOwnedComponentChromeDomain("visited:text-purple-500"),
    "interaction-state",
  );
  assert.equal(
    getToolcraftOwnedComponentChromeDomain("w-[calc(100%-1rem)]"),
    undefined,
  );
  assert.equal(
    getToolcraftOwnedComponentChromeDomain("[&:nth-child(2)]:pl-2"),
    undefined,
  );
});
