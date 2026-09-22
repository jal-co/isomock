import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
  ToolcraftProductReadiness,
  ToolcraftTransferMode,
} from "./acceptance/types";
import { appSchema } from "./app-schema";

const starterPersistenceSlices =
  appSchema.persistence.storage === "localStorage"
    ? appSchema.persistence.include
    : [];

export const appTransferMode: ToolcraftTransferMode = {
  animationIntent: { mode: "none" },
  mode: "new-toolcraft-app",
  referenceInputs: [],
};

export const appProductReadiness: ToolcraftProductReadiness = {
  mode: "starter",
  reason:
    "Neutral Toolcraft template before a product schema, renderer, and acceptance matrix are authored.",
};

export const appAcceptance: readonly ToolcraftComponentAcceptance[] = [
  {
    automated: true,
    automatedTestName:
      "declares production reload coverage for the starter schema",
    browser: {
      budget: "extended-io",
      file: "e2e/app-persistence.spec.ts",
      testName: "browser: app restores exact canvas, values, and panel workspace slices after reload",
    },
    componentType: "persistence",
    evidence: "persistence-state",
    expectedObservable:
      "Canvas size and zoom, their runtime values, and the moved and collapsed Controls workspace remain visibly restored after a real browser reload.",
    fixture: "starter runtime persisted workspace",
    id: "persistence.reload",
    kind: "runtime",
    persistenceCoverage: "reload",
    persistenceSlices: starterPersistenceSlices,
    target: "canvas.size.width",
    userAction: "Edit Canvas width and zoom, move and collapse Controls, wait for persistence, and reload the page.",
  },
];

// Product entries use the same explicit stable section IDs as appSchema.
export const appControlSectionInventory: readonly ToolcraftControlSectionInventoryEntry[] = [];
