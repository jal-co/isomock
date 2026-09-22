import type { Page, TestInfo } from "@playwright/test";

import { parseToolcraftBrowserRuntimeEvidence } from "../src/app/test-evidence/browser-runtime-contract";

const rootSelector = '[data-slot="toolcraft-runtime-app"]';

export type SyntheticSelectionSceneState = Readonly<{
  controlValue: string;
  fills: Readonly<Record<string, string>>;
  selectedEntityId: string;
}>;

export function attachedEvidenceTypes(
  testInfo: TestInfo,
  startIndex: number,
): Array<string | undefined> {
  return testInfo.attachments
    .slice(startIndex)
    .map(
      (attachment) =>
        parseToolcraftBrowserRuntimeEvidence(attachment)?.evidenceType,
    );
}

export async function setProofState(
  page: Page,
  key: string,
  value: unknown,
): Promise<void> {
  await page.locator(rootSelector).evaluate(
    (root, entry) => {
      root.setAttribute(`data-proof-${entry.key}`, JSON.stringify(entry.value));
    },
    { key, value },
  );
}

export async function setSyntheticControlOwner(
  page: Page,
  target: string,
  visible: boolean,
): Promise<void> {
  await page.locator(rootSelector).evaluate(
    (root, entry) => {
      const selector = `[data-synthetic-target="${CSS.escape(entry.target)}"]`;
      root.querySelector(selector)?.remove();
      if (!entry.visible) return;

      const owner = document.createElement("div");
      owner.dataset.syntheticTarget = entry.target;
      owner.dataset.toolcraftControlTarget = entry.target;
      const field = document.createElement("div");
      field.dataset.slot = "field";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = entry.target;
      field.append(button);
      owner.append(field);
      root.append(owner);
    },
    { target, visible },
  );
}

export async function setSyntheticSwitchControlOwner(
  page: Page,
  target: string,
  checked: boolean,
): Promise<void> {
  await setSyntheticControlOwner(page, target, true);
  await page.locator("[data-synthetic-target]").evaluateAll(
    (owners, entry) => {
      const owner = owners.find(
        (candidate) =>
          candidate.getAttribute("data-synthetic-target") === entry.target,
      );
      const button = owner?.querySelector("button");

      if (!button) {
        throw new Error(`Missing synthetic switch owner ${entry.target}.`);
      }

      button.setAttribute("aria-checked", String(entry.checked));
      button.setAttribute("role", "switch");
    },
    { checked, target },
  );
}

export async function mountSyntheticSelectionScene(
  page: Page,
  initialState: SyntheticSelectionSceneState,
): Promise<void> {
  await setSyntheticControlOwner(page, "selectedShape.fill", true);
  await page.locator(rootSelector).evaluate((root, state) => {
    const canvas = root.querySelector<HTMLElement>(
      '[data-slot="toolcraft-runtime-canvas"]',
    );
    if (!canvas) {
      throw new Error("Missing runtime canvas content for selection fixture.");
    }

    root.setAttribute("data-proof-selection-scope", JSON.stringify(state));
    root.querySelector('[data-proof-selection-scene]')?.remove();
    const scene = document.createElement("div");
    scene.dataset.proofSelectionScene = "true";
    scene.dataset.toolcraftProductOutput = "true";
    Object.assign(scene.style, {
      display: "flex",
      gap: "32px",
      padding: "16px",
      pointerEvents: "auto",
      position: "absolute",
      inset: "16px auto auto 16px",
      zIndex: "50",
    });

    for (const [entityId, fill] of Object.entries(state.fills)) {
      const entity = document.createElement("button");
      entity.dataset.proofEntity = entityId;
      entity.type = "button";
      entity.setAttribute("aria-label", `Select ${entityId}`);
      Object.assign(entity.style, {
        background: fill,
        border: "0",
        display: "block",
        height: "48px",
        padding: "0",
        width: "48px",
      });
      entity.addEventListener("click", () => {
        const current = JSON.parse(
          root.getAttribute("data-proof-selection-scope") ?? "null",
        ) as SyntheticSelectionSceneState;
        root.setAttribute(
          "data-proof-selection-scope",
          JSON.stringify({
            ...current,
            controlValue: current.fills[entityId],
            selectedEntityId: entityId,
          }),
        );
      });
      entity.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      scene.append(entity);
    }

    canvas.append(scene);
  }, initialState);
}

export async function editSyntheticSelectedEntity(
  page: Page,
  fill: string,
): Promise<void> {
  await page.locator(rootSelector).evaluate((root, nextFill) => {
    const current = JSON.parse(
      root.getAttribute("data-proof-selection-scope") ?? "null",
    ) as SyntheticSelectionSceneState;
    const entity = root.querySelector<HTMLElement>(
      `[data-proof-entity="${CSS.escape(current.selectedEntityId)}"]`,
    );
    if (!entity) {
      throw new Error(`Missing selected entity ${current.selectedEntityId}.`);
    }
    const nextState = {
      ...current,
      controlValue: nextFill,
      fills: { ...current.fills, [current.selectedEntityId]: nextFill },
    };
    entity.style.background = nextFill;
    root.setAttribute(
      "data-proof-selection-scope",
      JSON.stringify(nextState),
    );
  }, fill);
}
