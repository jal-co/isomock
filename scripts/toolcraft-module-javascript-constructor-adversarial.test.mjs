import assert from "node:assert/strict";
import test from "node:test";

import {
  collectToolcraftClosedConstructorDiagnostics,
} from "./toolcraft-module-cutover-compiler-test-utils.mjs";
import {
  createToolcraftCutoverFixtureInventory,
} from "./toolcraft-module-cutover-test-utils.mjs";

test("traces dynamic, destructured, required, and assigned MJS constructors", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "cli/src/assigned-old.mjs": `
      import * as Runtime from "@/toolcraft/runtime";
      let AssignedRuntime;
      AssignedRuntime = Runtime;
      const oldShape = { canvas: { enabled: true }, panels: {} };
      export const schema = AssignedRuntime.defineToolcraft(oldShape);
    `,
    "cli/src/destructured-old.mjs": `
      import * as Runtime from "@/toolcraft/runtime";
      const { defineToolcraft: build } = Runtime;
      const oldShape = { canvas: { enabled: true }, panels: {} };
      export const schema = build(oldShape);
    `,
    "cli/src/dynamic-old.mjs": `
      const publicRuntime = ["@repo", "toolcraft-runtime"].join("/");
      const Runtime = await import(publicRuntime);
      const oldShape = { canvas: { enabled: true }, panels: {} };
      export const schema = Runtime.defineToolcraft(oldShape);
    `,
    "cli/src/require-old.cjs": `
      const oldShape = { canvas: { enabled: true }, panels: {} };
      exports.schema = require("@/toolcraft/runtime").defineToolcraft(oldShape);
    `,
    "cli/src/current.mjs": `
      const Runtime = await import("@/toolcraft/runtime");
      const { defineToolcraft } = Runtime;
      export const schema = defineToolcraft({
        base: { canvas: { enabled: true }, identity: { id: "current", title: "Current" }, panels: {} },
        defaults: null,
        modules: [],
      });
    `,
  });
  const diagnostics = collectToolcraftClosedConstructorDiagnostics(inventory);

  assert.deepEqual(diagnostics.defineAuthors, [
    "cli/src/assigned-old.mjs",
    "cli/src/current.mjs",
    "cli/src/destructured-old.mjs",
    "cli/src/dynamic-old.mjs",
    "cli/src/require-old.cjs",
  ]);
  assert.deepEqual(diagnostics.diagnostics, [
    { code: "constructor-alias", repoPath: "cli/src/assigned-old.mjs" },
    { code: "old-product-definition", repoPath: "cli/src/assigned-old.mjs" },
    { code: "constructor-alias", repoPath: "cli/src/destructured-old.mjs" },
    { code: "old-product-definition", repoPath: "cli/src/destructured-old.mjs" },
    { code: "constructor-alias", repoPath: "cli/src/dynamic-old.mjs" },
    { code: "old-product-definition", repoPath: "cli/src/dynamic-old.mjs" },
    { code: "constructor-alias", repoPath: "cli/src/require-old.cjs" },
    { code: "old-product-definition", repoPath: "cli/src/require-old.cjs" },
  ]);
});

test("routes flowed base artifact targets through canonical constructor policy", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "src/flowed-target.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      const artifactControl = {
        applicability: { mode: "always" as const },
        target: "export.image.format",
        type: "select",
      };
      const controls = { format: artifactControl };
      const base = {
        canvas: { enabled: true },
        identity: { id: "flowed", title: "Flowed" },
        panels: { controls: { sections: [{ controls, id: "output" }] } },
      };
      defineToolcraft({ base, modules: [] });
    `,
  });

  assert.deepEqual(
    collectToolcraftClosedConstructorDiagnostics(inventory).diagnostics,
    [{ code: "module-owned-base-field", repoPath: "src/flowed-target.ts" }],
  );
});

test("resolves local base helpers and fails closed for opaque base spreads", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "src/helper-base.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      const artifactTarget = "export.image.format";
      function makeBase() {
        return {
          canvas: { enabled: true },
          identity: { id: "helper", title: "Helper" },
          panels: { controls: { sections: [{ controls: {
            format: { applicability: { mode: "always" }, target: artifactTarget, type: "select" },
          }, id: "output" }] } },
        };
      }
      defineToolcraft({ base: makeBase(), modules: [] });
    `,
    "src/legal-helper-base.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      const makeBase = () => ({
        canvas: { enabled: true },
        identity: { id: "legal", title: "Legal" },
        panels: {},
      });
      defineToolcraft({ base: makeBase(), modules: [] });
    `,
    "src/opaque-spread.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      declare function loadUnknownBase(): object;
      const base = {
        ...loadUnknownBase(),
        canvas: { enabled: true },
        identity: { id: "opaque", title: "Opaque" },
        panels: {},
      };
      defineToolcraft({ base, modules: [] });
    `,
  });

  assert.deepEqual(
    collectToolcraftClosedConstructorDiagnostics(inventory).diagnostics,
    [
      { code: "module-owned-base-field", repoPath: "src/helper-base.ts" },
      { code: "old-product-definition", repoPath: "src/opaque-spread.ts" },
    ],
  );
});

test("inspects every conditional, logical, and nullish base alternative", async (context) => {
  const currentPanels = `{}`;
  const currentSection = `{ controls: {}, id: "current" }`;
  const legacySection = `{
    controls: { format: {
      applicability: { mode: "always" }, target: "export.image.format", type: "select",
    } },
    id: "output",
  }`;
  const legacyPanels = `{
    controls: { sections: [${legacySection}] },
  }`;
  const currentBase = `{
    canvas: { enabled: true },
    identity: { id: "current", title: "Current" },
    panels: ${currentPanels},
  }`;
  const legacyBase = `{
    canvas: { enabled: true },
    identity: { id: "legacy", title: "Legacy" },
    panels: ${legacyPanels},
  }`;
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "src/conditional-base.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      declare const chooseLegacy: boolean;
      const currentBase = ${currentBase};
      const legacyBase = ${legacyBase};
      function makeBase() {
        return chooseLegacy ? legacyBase : currentBase;
      }
      defineToolcraft({ base: makeBase(), modules: [] });
    `,
    "src/legal-alternatives.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      declare const chooseAlternate: boolean;
      const currentBase = ${currentBase};
      const alternateBase = { ...currentBase, identity: { id: "alternate", title: "Alternate" } };
      const maybeCurrent = currentBase as typeof currentBase | undefined;
      defineToolcraft({ base: chooseAlternate ? alternateBase : currentBase, modules: [] });
      defineToolcraft({ base: alternateBase || currentBase, modules: [] });
      defineToolcraft({ base: maybeCurrent ?? alternateBase, modules: [] });
    `,
    "src/logical-base.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      const currentBase = ${currentBase};
      const legacyBase = ${legacyBase};
      defineToolcraft({ base: legacyBase || currentBase, modules: [] });
    `,
    "src/nullish-base.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      const currentBase = ${currentBase};
      const legacyBase = ${legacyBase};
      const maybeCurrent = currentBase as typeof currentBase | undefined;
      defineToolcraft({ base: maybeCurrent ?? legacyBase, modules: [] });
    `,
    "src/nested-array-spread.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      declare const chooseLegacy: boolean;
      const currentSections = [${currentSection}];
      const legacySections = [${legacySection}];
      defineToolcraft({ base: {
        canvas: { enabled: true }, identity: { id: "array-spread", title: "Array spread" },
        panels: { controls: { sections: [...(chooseLegacy ? legacySections : currentSections)] } },
      }, modules: [] });
    `,
    "src/nested-array.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      declare const chooseLegacy: boolean;
      const currentSection = ${currentSection};
      const legacySection = ${legacySection};
      defineToolcraft({ base: {
        canvas: { enabled: true }, identity: { id: "array", title: "Array" },
        panels: { controls: { sections: [chooseLegacy ? legacySection : currentSection] } },
      }, modules: [] });
    `,
    "src/nested-conditional-panels.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      declare const chooseLegacy: boolean;
      const currentPanels = ${currentPanels};
      const legacyPanels = ${legacyPanels};
      defineToolcraft({ base: {
        canvas: { enabled: true }, identity: { id: "nested", title: "Nested" },
        panels: chooseLegacy ? legacyPanels : currentPanels,
      }, modules: [] });
    `,
    "src/nested-logical-panels.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      const currentPanels = ${currentPanels};
      const legacyPanels = ${legacyPanels};
      defineToolcraft({ base: {
        canvas: { enabled: true }, identity: { id: "logical", title: "Logical" },
        panels: legacyPanels || currentPanels,
      }, modules: [] });
    `,
    "src/nested-nullish-panels.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      const currentPanels = ${currentPanels};
      const legacyPanels = ${legacyPanels};
      const maybeCurrent = currentPanels as typeof currentPanels | undefined;
      defineToolcraft({ base: {
        canvas: { enabled: true }, identity: { id: "nullish", title: "Nullish" },
        panels: maybeCurrent ?? legacyPanels,
      }, modules: [] });
    `,
    "src/nested-object-spread.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      declare const chooseLegacy: boolean;
      const currentPanels = ${currentPanels};
      const legacyPanels = ${legacyPanels};
      defineToolcraft({ base: {
        canvas: { enabled: true }, identity: { id: "object-spread", title: "Object spread" },
        panels: { ...(chooseLegacy ? legacyPanels : currentPanels) },
      }, modules: [] });
    `,
    "src/nested-legal.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      declare const chooseAlternate: boolean;
      const currentPanels = {};
      const alternatePanels = { controls: { sections: [${currentSection}] } };
      const currentSections = [${currentSection}];
      const alternateSections = [{ controls: {}, id: "alternate" }];
      const maybePanels = currentPanels as typeof currentPanels | undefined;
      const base = { canvas: { enabled: true }, identity: { id: "nested-legal", title: "Nested legal" } };
      defineToolcraft({ base: { ...base, panels: chooseAlternate ? alternatePanels : currentPanels }, modules: [] });
      defineToolcraft({ base: { ...base, panels: alternatePanels || currentPanels }, modules: [] });
      defineToolcraft({ base: { ...base, panels: maybePanels ?? alternatePanels }, modules: [] });
      defineToolcraft({ base: { ...base, panels: { controls: { sections: [chooseAlternate ? alternateSections[0] : currentSections[0]] } } }, modules: [] });
      defineToolcraft({ base: { ...base, panels: { controls: { sections: [...(chooseAlternate ? alternateSections : currentSections)] } } }, modules: [] });
      defineToolcraft({ base: { ...base, panels: { ...(chooseAlternate ? alternatePanels : currentPanels) } }, modules: [] });
    `,
  });

  assert.deepEqual(
    collectToolcraftClosedConstructorDiagnostics(inventory).diagnostics,
    [
      { code: "module-owned-base-field", repoPath: "src/conditional-base.ts" },
      { code: "module-owned-base-field", repoPath: "src/logical-base.ts" },
      { code: "module-owned-base-field", repoPath: "src/nested-array-spread.ts" },
      { code: "module-owned-base-field", repoPath: "src/nested-array.ts" },
      { code: "module-owned-base-field", repoPath: "src/nested-conditional-panels.ts" },
      { code: "module-owned-base-field", repoPath: "src/nested-logical-panels.ts" },
      { code: "module-owned-base-field", repoPath: "src/nested-nullish-panels.ts" },
      { code: "module-owned-base-field", repoPath: "src/nested-object-spread.ts" },
      { code: "module-owned-base-field", repoPath: "src/nullish-base.ts" },
    ],
  );
});

test("bounds Cartesian base expansion and fails closed on cycles", async (context) => {
  const conditionalFields = (count) => Array.from(
    { length: count },
    (_, index) => `field${index}: choice${index} ? "a" : "b"`,
  ).join(",");
  const declarations = (count) => Array.from(
    { length: count },
    (_, index) => `declare const choice${index}: boolean;`,
  ).join("\n");
  const definition = (id, count) => `
    ${declarations(count)}
    defineToolcraft({ base: {
      canvas: { enabled: true },
      identity: { id: "${id}", title: "${id}" },
      metadata: { ${conditionalFields(count)} },
      panels: {},
    }, modules: [] });
  `;
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "src/bounded-current.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      ${definition("bounded-current", 6)}
    `,
    "src/bounded-overflow.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      ${definition("bounded-overflow", 7)}
    `,
    "src/cyclic-base.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      const base = {
        ...base,
        canvas: { enabled: true },
        identity: { id: "cycle", title: "Cycle" },
        panels: {},
      };
      defineToolcraft({ base, modules: [] });
    `,
  });

  assert.deepEqual(
    collectToolcraftClosedConstructorDiagnostics(inventory).diagnostics,
    [
      { code: "old-product-definition", repoPath: "src/bounded-overflow.ts" },
      { code: "old-product-definition", repoPath: "src/cyclic-base.ts" },
    ],
  );
});
