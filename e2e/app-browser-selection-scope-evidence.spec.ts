import { expect, test } from "@playwright/test";

import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { expectToolcraftSelectionScopedControl } from "./browser-selection-scope-evidence";
import {
  attachedEvidenceTypes,
  editSyntheticSelectedEntity,
  mountSyntheticSelectionScene,
} from "./browser-semantic-evidence-test-helpers";

const propertyTarget = "selectedShape.fill";
const selectionTarget = "selection.activeShape";
const entityA = {
  entityId: "shape-a",
  selector: '[data-proof-entity="shape-a"]',
} as const;
const entityB = {
  entityId: "shape-b",
  selector: '[data-proof-entity="shape-b"]',
} as const;

async function createSelectionProofFixture(
  page: Parameters<typeof createToolcraftBrowserProofSession>[0],
) {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await mountSyntheticSelectionScene(page, {
    controlValue: "#371C4D",
    fills: { "shape-a": "#A65F15", "shape-b": "#371C4D" },
    selectedEntityId: "shape-b",
  });

  return {
    observePropertyValue: session.observe((root) =>
      JSON.parse(root.getAttribute("data-proof-selection-scope") ?? "null")
        .controlValue,
    ),
    observeSelectedEntityId: session.observe((root) =>
      String(
        JSON.parse(root.getAttribute("data-proof-selection-scope") ?? "null")
          .selectedEntityId,
      ),
    ),
    proofSession: session,
  };
}

function createSelectionActions(
  session: Awaited<
    ReturnType<typeof createSelectionProofFixture>
  >["proofSession"],
) {
  return {
    selectEntityA: session.surfaceAction(selectionTarget, {
      selector: entityA.selector,
      surface: "canvas",
    }),
    selectEntityB: session.surfaceAction(selectionTarget, {
      selector: entityB.selector,
      surface: "canvas",
    }),
  };
}

test("selection-scoped control proves two-direction entity isolation", async ({
  page,
}, testInfo) => {
  const fixture = await createSelectionProofFixture(page);
  const attachmentCount = testInfo.attachments.length;

  await expectToolcraftSelectionScopedControl({
    ...fixture,
    ...createSelectionActions(fixture.proofSession),
    editEntityA: fixture.proofSession.controlAction(
      propertyTarget,
      (_control, currentPage) =>
        editSyntheticSelectedEntity(currentPage, "#00AAFF"),
    ),
    editEntityB: fixture.proofSession.controlAction(
      propertyTarget,
      (_control, currentPage) =>
        editSyntheticSelectedEntity(currentPage, "#FF44AA"),
    ),
    entityA,
    entityB,
    propertySurface: "panel",
    propertyTarget,
    requirementId: "shape.selected-fill",
    selectionSurface: "canvas",
    selectionTarget,
    stabilityIntervalMs: 0,
  });

  expect(attachedEvidenceTypes(testInfo, attachmentCount)).toEqual([
    "product-observable-change",
    "selection-scoped-control",
  ]);
});

test("selection-scoped control rejects cross-entity mutation without evidence", async ({
  page,
}, testInfo) => {
  const fixture = await createSelectionProofFixture(page);
  const attachmentCount = testInfo.attachments.length;

  await expect(
    expectToolcraftSelectionScopedControl({
      ...fixture,
      ...createSelectionActions(fixture.proofSession),
      editEntityA: fixture.proofSession.controlAction(
        propertyTarget,
        async (_control, currentPage) => {
          await editSyntheticSelectedEntity(currentPage, "#00AAFF");
          await currentPage
            .locator(entityB.selector)
            .evaluate((entity) => {
              (entity as HTMLElement).style.background = "#FFFFFF";
            });
        },
      ),
      editEntityB: fixture.proofSession.controlAction(
        propertyTarget,
        (_control, currentPage) =>
          editSyntheticSelectedEntity(currentPage, "#FF44AA"),
      ),
      entityA,
      entityB,
      propertySurface: "panel",
      propertyTarget,
      requirementId: "shape.cross-entity-fill",
      selectionSurface: "canvas",
      selectionTarget,
      stabilityIntervalMs: 0,
    }),
  ).rejects.toThrow();
  expect(testInfo.attachments).toHaveLength(attachmentCount);
});
