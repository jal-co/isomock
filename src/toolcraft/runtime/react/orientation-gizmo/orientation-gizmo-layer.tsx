"use client";

import * as React from "react";
import type { ControlChangeMeta } from "@/toolcraft/ui";

import { toolcraftCanvasRotationLockedTarget } from "../../schema/runtime-targets";
import { useToolcraftValue } from "../app-shell/use-toolcraft";
import { useToolcraftStore } from "../app-shell/toolcraft-store-context";
import { ToolcraftOrientationGizmo } from "./orientation-gizmo";
import { readToolcraftOrientationPose } from "./orientation-gizmo-math";
import { useToolcraftOrientationControlSelection } from "./use-toolcraft-orientation-control-selection";

export function ToolcraftOrientationGizmoLayer(): React.JSX.Element | null {
  const store = useToolcraftStore();
  const selection = useToolcraftOrientationControlSelection();
  const locked = useToolcraftValue(toolcraftCanvasRotationLockedTarget) === true;

  if (!selection.control || !selection.id) {
    return null;
  }

  const control = selection.control;
  const commit = (value: unknown, meta?: ControlChangeMeta): void => {
    store.dispatch({
      history: meta?.history,
      historyGroup: meta?.historyGroup,
      label:
        typeof control.label === "string"
          ? control.label
          : (selection.id ?? "Orientation"),
      target: control.target,
      type: "controls.setValue",
      value,
    });
  };

  return (
    <ToolcraftOrientationGizmo
      defaultValue={readToolcraftOrientationPose(control.defaultValue)}
      key={`${selection.id}:${control.target}`}
      locked={locked}
      onValueChange={commit}
      store={store}
      target={control.target}
      value={selection.value}
    />
  );
}
