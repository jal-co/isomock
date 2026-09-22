import type {
  ResolvedToolcraftAppSchema,
  ToolcraftControlOrderRole,
  ToolcraftControlSchema,
} from "@/toolcraft/runtime";

import {
  isSliderLikeControl,
  isToolcraftProductSectionControl,
} from "./controls";
import type { ToolcraftControlOrderItem } from "./types";

const controlOrderRoleRanks = {
  input: 0,
  mode: 1,
  primary: 2,
  spatial: 2,
  color: 2,
  strength: 3,
  detail: 4,
  advanced: 5,
  action: 6,
} satisfies Record<ToolcraftControlOrderRole, number>;

function getToolcraftControlOrderItem(
  sectionTitle: string | undefined,
  controlId: string,
  control: ToolcraftControlSchema,
): ToolcraftControlOrderItem {
  const role = inferToolcraftControlOrderRole(control);

  return {
    controlId,
    rank: controlOrderRoleRanks[role],
    role,
    sectionTitle,
    target: control.target,
    type: control.type,
  };
}

export function inferToolcraftControlOrderRole(
  control: ToolcraftControlSchema,
): ToolcraftControlOrderRole {
  if (control.orderRole) {
    return control.orderRole;
  }

  if (control.type === "panelActions") {
    return "action";
  }

  if (
    control.type === "fileDrop" ||
    control.target.startsWith("media.") ||
    control.target === "canvas.size.width" ||
    control.target === "canvas.size.height"
  ) {
    return "input";
  }

  if (control.type === "vector") {
    return "spatial";
  }

  if (control.type === "color" || control.type === "gradient") {
    return "color";
  }

  if (isSliderLikeControl(control)) {
    return "strength";
  }

  return "primary";
}

export function getToolcraftControlOrder(
  schema: ResolvedToolcraftAppSchema,
): ToolcraftControlOrderItem[] {
  return (schema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.entries(section.controls)
      .filter(([, control]) => isToolcraftProductSectionControl(control))
      .map(([controlId, control]) =>
        getToolcraftControlOrderItem(section.title, controlId, control),
      ),
  );
}

export function getToolcraftControlOrderTargets(
  schema: ResolvedToolcraftAppSchema,
): string[] {
  return getToolcraftControlOrder(schema).map((item) => item.target);
}

export function getToolcraftControlOrderErrors(
  schema: ResolvedToolcraftAppSchema,
): string[] {
  const errors: string[] = [];

  for (const section of schema.panels.controls?.sections ?? []) {
    let previousItem: ToolcraftControlOrderItem | undefined;

    for (const [controlId, control] of Object.entries(section.controls)) {
      if (!isToolcraftProductSectionControl(control)) {
        continue;
      }

      const item = getToolcraftControlOrderItem(section.title, controlId, control);

      if (previousItem && item.rank < previousItem.rank) {
        const sectionLabel = section.title ? `${section.title} / ` : "";

        errors.push(
          `${sectionLabel}${controlId} (${control.target}) has orderRole "${item.role}" after ${previousItem.controlId} (${previousItem.target}) with orderRole "${previousItem.role}". Move mode/input/primary controls before dependent strength/detail/advanced controls or split them into an earlier section.`,
        );
      }

      previousItem = item;
    }
  }

  return errors;
}
