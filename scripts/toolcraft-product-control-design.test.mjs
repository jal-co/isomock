import assert from "node:assert/strict";
import test from "node:test";
import { evaluateToolcraftProductBoundary } from "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture } from "./toolcraft-product-boundary-test-fixtures.mjs";

const publicControls = [
  "Button",
  "Anchor",
  "Input",
  "Textarea",
  "InputGroup",
  "InputGroupInput",
  "InputGroupTextarea",
  "InputGroupButton",
  "Toggle",
  "ToggleGroupItem",
  "RadioGroup",
  "RadioGroupItem",
  "SelectTrigger",
  "SelectTriggerButton",
  "SelectItem",
  "ComboboxInput",
  "ComboboxTrigger",
  "ComboboxItem",
  "CommandInput",
  "CommandItem",
  "TabsTrigger",
  "AccordionTrigger",
  "PopoverTrigger",
  "PopoverContent",
  "DropdownMenuTrigger",
  "DropdownMenuItem",
  "ContextMenuItem",
  "MenubarTrigger",
  "MenubarItem",
  "DialogTrigger",
  "DialogClose",
  "DialogContent",
  "TooltipTrigger",
  "NavigationMenuLink",
  "PaginationLink",
  "ButtonGroup",
  "Field",
  "ScrollFade",
  "Card",
  "SheetContent",
  "Badge",
  "Progress",
  "Separator",
  "Label",
];

async function evaluate(context, sources) {
  return evaluateToolcraftProductBoundary({
    rootDir: await createToolcraftProductBoundaryFixture(context, sources),
  });
}

function assertBlocked(result, paths, kind = "public-component-chrome") {
  const missing = paths.filter(
    (repoPath) =>
      !result.violations.some(
        (violation) => violation.repoPath === repoPath && violation.kind === kind,
      ),
  );
  assert.deepEqual(missing, [], `Missing ${kind}: ${missing.join(", ")}`);
}

test("all public UI used as JSX owns chrome across inline, utility and module channels", async (context) => {
  const sources = { "src/chrome.module.css": ".paint { background: red; border-radius: 0; }" };
  for (const name of publicControls) {
    for (const [channel, props] of Object.entries({
      inline: 'style={{ background: "red", borderRadius: 0 }}',
      utility: 'className="bg-red-500 rounded-none"',
      module: "className={styles.paint}",
    })) {
      sources[`src/${name}-${channel}.tsx`] = `import { ${name} as Control } from "@/toolcraft/ui";
        import styles from "./chrome.module.css"; export const Example = <Control ${props} />;`;
    }
  }
  const result = await evaluate(context, sources);
  assertBlocked(
    result,
    Object.keys(sources).filter((name) => name.endsWith(".tsx")),
  );
});

test("input capability follows public wrappers and existing host origin aliases", async (context) => {
  const sources = {};
  for (const name of ["Input", "InputGroupInput", "ComboboxInput", "CommandInput"]) {
    for (const type of ["color", "range", "file", "checkbox", "radio"]) {
      sources[`src/${name}-${type}.tsx`] = `import * as UI from "@/toolcraft/ui";
        const group = { Field: UI.${name} }; const Control = group.Field;
        export const Example = <Control type="${type}" />;`;
    }
  }
  assertBlocked(
    await evaluate(context, sources),
    Object.keys(sources),
    "native-control-recreation",
  );
});

test("CSS descendants and framework token definitions cannot replace public chrome", async (context) => {
  const rules = [
    '.scope [data-slot="button"] { background: red; }',
    '.scope [data-slot="input"] { border-radius: 0; }',
    '.scope [role="slider"] { background: red; }',
    ".scope * { background: red; }",
    ".scope :is(input, textarea) { border: 4px solid blue; }",
    ".scope { --primary: red; }",
    ".scope { --radius-lg: 0px; }",
  ];
  const sources = Object.fromEntries(rules.map((rule, i) => [`src/rule-${i}.module.css`, rule]));
  assertBlocked(await evaluate(context, sources), Object.keys(sources));
});

test("containing elements and secondary slots cannot repaint owned components", async (context) => {
  const cases = {
    opacity: "<div style={{ opacity: 0.2 }}><Button /></div>",
    filter: '<div style={{ filter: "blur(4px)" }}><Input /></div>',
    utility: '<div className="[&_button]:bg-red-500"><Button /></div>',
    module: "<div className={styles.fade}><Button /></div>",
    token: '<div style={{ "--primary": "red" }}><Button /></div>',
    slot: '<ScrollFade containerClassName="bg-red-500" />',
    nested: "<div style={{ opacity: 0.2 }}><Local /></div>",
    render: "<div style={{ opacity: 0.2 }}>{Local()}</div>",
    children: "<div style={{ opacity: 0.2 }}>{props.children}</div>",
    standaloneToken: '<div style={{ "--primary": "red" }} />',
    standaloneTokenUtility: '<div className="[--primary:red]" />',
    vendorFilter: '<Input style={{ WebkitFilter: "blur(4px)" }} />',
    replacement: '<Button render={<span style={{ background: "red" }} />} />',
    replacementFunction: '<Button render={() => <span className="bg-red-500" />} />',
    replacementAlias: "<Button render={replacement} />",
    replacementComponent: "<Button render={<Replacement />} />",
    opaqueReplacement: "<Button render={<ExternalLink />} />",
  };
  const sources = { "src/parent.module.css": ".fade { opacity: 0.2; }" };
  for (const [name, jsx] of Object.entries(cases)) {
    sources[`src/${name}.tsx`] = `import { Button, Input, ScrollFade } from "@/toolcraft/ui";
      import styles from "./parent.module.css"; function Local() { return <Input />; }
      const replacement = <span style={{ borderRadius: 0 }} />;
      function Replacement() { return <span style={{ background: "red" }} />; }
      declare const ExternalLink: React.ComponentType;
      export function Example(props: {children: React.ReactNode}) { return ${jsx}; }`;
  }
  assertBlocked(
    await evaluate(context, sources),
    Object.keys(sources).filter((name) => name.endsWith(".tsx")),
  );
});

test("secondary public slots resolve spreads and CSS composition without affecting local SVG paint", async (context) => {
  const result = await evaluate(context, {
    "src/slots.tsx": `import { ScrollFade, CommandList, Button } from "@/toolcraft/ui";
      import styles from "./slots.module.css";
      const options = { containerClassName: styles.composed };
      export const Example = <><ScrollFade {...options} />
        <CommandList scrollFadeContainerClassName="bg-red-500" />
        <Button loadingIndicatorClassName="opacity-0" /></>;`,
    "src/slots.module.css": `.paint { background: red; }
      .composed { composes: paint; }`,
    "src/geometry.tsx": `import styles from "./geometry.module.css";
      const paint = { opacity: 0.5, filter: "blur(1px)" };
      export const Example = <div className={styles.diagram}><svg style={paint}><path /></svg></div>;`,
    "src/geometry.module.css": `.diagram svg { fill: var(--toolcraft-custom-viz-data); }
      .diagram path { stroke: var(--toolcraft-custom-viz-line); }`,
  });
  assert.equal(
    result.violations.filter(
      ({ repoPath, kind }) => repoPath === "src/slots.tsx" && kind === "public-component-chrome",
    ).length,
    3,
  );
  assert.deepEqual(
    result.violations.filter(({ repoPath }) => repoPath.startsWith("src/geometry")),
    [],
  );
});

test("public variants and independent product geometry keep their legitimate extension points", async (context) => {
  const result = await evaluate(context, {
    "src/allowed.tsx": `import { Button, Input, InputGroupInput } from "@/toolcraft/ui";
      import styles from "./allowed.module.css";
      function Replacement() { return <span className="w-full" />; }
      export const Example = <div className={styles.layout}>
        <Button variant="secondary" size="sm" className="w-full mt-2">Action</Button>
        <Button render={<span className="w-full" />} />
        <Button render={<Replacement />} />
        <Input type="text" className="w-full" />
        <InputGroupInput type="number" style={{ width: 120 }} />
        <svg className={styles.diagram} style={{ opacity: 0.5 }}>
          <path className={styles.shape} d="M0 0L10 10" />
        </svg>
        <div className={styles.swatch} style={{ background: "#c4b5fd", pointerEvents: "none" }} />
      </div>;`,
    "src/allowed.module.css": `.layout { display: grid; gap: 10px; }
      .diagram { --product-line: red; }
      .diagram path { stroke: var(--product-line); opacity: 0.5; }
      .shape { fill: var(--toolcraft-custom-viz-fill); pointer-events: none; }
      .swatch { width: 24px; height: 24px; border-radius: 4px; }`,
  });
  assert.deepEqual(result.violations, []);
});
