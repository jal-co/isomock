import { expect, type Locator, type Page } from "@playwright/test";

import {
  type ToolcraftBrowserAction,
  type ToolcraftBrowserProofSession,
} from "./browser-proof-session";

export type ToolcraftOrientationAxis =
  | "+x"
  | "-x"
  | "+y"
  | "-y"
  | "+z"
  | "-z";

type OrientationVector = readonly [number, number, number];
type OrientationPose = {
  position: OrientationVector;
  up: OrientationVector;
};
type PointerDelta = Readonly<{ x: number; y: number }>;
type BeforePointerRelease = () => Promise<void>;

const axisVectors: Record<ToolcraftOrientationAxis, OrientationVector> = {
  "+x": [1, 0, 0],
  "-x": [-1, 0, 0],
  "+y": [0, 1, 0],
  "-y": [0, -1, 0],
  "+z": [0, 0, 1],
  "-z": [0, 0, -1],
};

const modelOrbitSurfaceSelector =
  '[data-canvas-model-layer][data-toolcraft-model-orbit-surface="true"]';
const gizmoCenter = 35;
const gizmoReach = 24.5;
const gizmoSize = 70;

function crossOrientationVectors(
  left: OrientationVector,
  right: OrientationVector,
): [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function dotOrientationVectors(
  left: OrientationVector,
  right: OrientationVector,
): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function normalizeOrientationVector(
  vector: OrientationVector,
): [number, number, number] {
  const length = Math.hypot(...vector);

  if (!Number.isFinite(length) || length <= 1e-6) {
    throw new Error("Orientation gizmo action requires a non-degenerate pose.");
  }

  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function expectFiniteNonZeroDragDelta(
  dragDelta: PointerDelta,
  description: string,
): void {
  expect(
    Number.isFinite(dragDelta.x) && Number.isFinite(dragDelta.y),
    `${description} requires a finite pointer delta.`,
  ).toBe(true);
  expect(
    Math.hypot(dragDelta.x, dragDelta.y),
    `${description} requires non-zero pointer movement.`,
  ).toBeGreaterThan(0);
}

async function getOrientationGizmo(
  page: Page,
  target: string,
): Promise<Locator> {
  const gizmo = page.getByRole("application", {
    name: "3D orientation gizmo",
  });
  await expect(
    gizmo,
    "Orientation proof requires exactly one visible runtime orientation gizmo.",
  ).toHaveCount(1);
  await expect(gizmo).toBeVisible();
  await expect(
    gizmo,
    "Orientation proof must act on the gizmo bound to the declared target.",
  ).toHaveAttribute("data-toolcraft-orientation-target", target);
  return gizmo;
}

async function findUnmarkedGizmoPoint(
  page: Page,
  gizmo: Locator,
  bounds: Readonly<{ height: number; width: number; x: number; y: number }>,
): Promise<{ x: number; y: number }> {
  for (let localY = 11; localY <= 59; localY += 4) {
    for (let localX = 11; localX <= 59; localX += 4) {
      if (Math.hypot(localX - gizmoCenter, localY - gizmoCenter) > 30) {
        continue;
      }
      const point = {
        x: bounds.x + (localX / gizmoSize) * bounds.width,
        y: bounds.y + (localY / gizmoSize) * bounds.height,
      };
      await page.mouse.move(point.x, point.y);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => resolve());
          }),
      );
      if ((await gizmo.getAttribute("data-hovered-axis")) === "") {
        return point;
      }
    }
  }

  throw new Error(
    "Orientation gizmo drag proof could not find unmarked circular background.",
  );
}

function projectOrientationAxis(
  pose: OrientationPose,
  axis: ToolcraftOrientationAxis,
  bounds: Readonly<{ height: number; width: number; x: number; y: number }>,
): { x: number; y: number } {
  const back = normalizeOrientationVector(pose.position);
  const cameraRight = normalizeOrientationVector(
    crossOrientationVectors(pose.up, back),
  );
  const cameraUp = normalizeOrientationVector(
    crossOrientationVectors(back, cameraRight),
  );
  const vector = axisVectors[axis];
  const localX =
    gizmoCenter + dotOrientationVectors(vector, cameraRight) * gizmoReach;
  const localY =
    gizmoCenter - dotOrientationVectors(vector, cameraUp) * gizmoReach;

  return {
    x: bounds.x + (localX / gizmoSize) * bounds.width,
    y: bounds.y + (localY / gizmoSize) * bounds.height,
  };
}

export function getToolcraftOrientationAxisPosition(
  axis: ToolcraftOrientationAxis,
  radius: number,
): readonly number[] {
  return axisVectors[axis].map((component) => component * radius);
}

export function createToolcraftOrientationGizmoDragAction(
  session: ToolcraftBrowserProofSession,
  target: string,
  dragDelta: PointerDelta,
  beforePointerRelease?: BeforePointerRelease,
): ToolcraftBrowserAction {
  expectFiniteNonZeroDragDelta(dragDelta, "Orientation gizmo drag proof");
  return session.action(async (page) => {
    const gizmo = await getOrientationGizmo(page, target);
    const bounds = await gizmo.boundingBox();
    if (!bounds) {
      throw new Error(
        "Orientation gizmo drag proof could not measure the runtime gizmo.",
      );
    }
    const start = await findUnmarkedGizmoPoint(page, gizmo, bounds);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    try {
      await page.mouse.move(start.x + dragDelta.x, start.y + dragDelta.y, {
        steps: 8,
      });
      await beforePointerRelease?.();
    } finally {
      await page.mouse.up();
    }
  });
}

export function createToolcraftOrientationAxisSnapAction(
  session: ToolcraftBrowserProofSession,
  target: string,
  axis: ToolcraftOrientationAxis,
): ToolcraftBrowserAction {
  return session.action(async (page) => {
    const gizmo = await getOrientationGizmo(page, target);
    const bounds = await gizmo.boundingBox();
    if (!bounds) {
      throw new Error(
        "Orientation axis snap proof could not measure the runtime gizmo.",
      );
    }
    const poseValue = await gizmo.getAttribute(
      "data-toolcraft-orientation-pose",
    );
    if (!poseValue) {
      throw new Error(
        "Orientation axis snap proof requires the gizmo's canonical runtime pose.",
      );
    }
    const point = projectOrientationAxis(
      JSON.parse(poseValue) as OrientationPose,
      axis,
      bounds,
    );
    await page.mouse.click(point.x, point.y);
  });
}

export function createToolcraftModelOrbitAction(
  session: ToolcraftBrowserProofSession,
  dragDelta: PointerDelta,
): ToolcraftBrowserAction {
  expectFiniteNonZeroDragDelta(dragDelta, "Direct model orbit proof");
  return session.action(async (page) => {
    const surface = page.locator(modelOrbitSurfaceSelector);
    await expect(
      surface,
      "Direct model orbit proof requires exactly one visible runtime model orbit surface.",
    ).toHaveCount(1);
    await expect(surface).toBeVisible();
    const box = await surface.boundingBox();
    if (!box) {
      throw new Error(
        "Direct model orbit proof could not measure the runtime model surface.",
      );
    }
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    try {
      await page.mouse.move(
        startX + dragDelta.x,
        startY + dragDelta.y,
        { steps: 8 },
      );
    } finally {
      await page.mouse.up();
    }
  });
}
