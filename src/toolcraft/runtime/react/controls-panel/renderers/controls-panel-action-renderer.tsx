"use client";

import * as React from "react";
import {
  Actions,
  PanelActions,
  type PanelActionObjectOption,
} from "@/toolcraft/ui";

import type {
  ToolcraftActionSchema,
  ToolcraftControlSchema,
} from "../../../schema/types";
import { isToolcraftArtifactExportAction } from "../../../schema/artifact-export-actions";
import {
  readToolcraftStillExportFormat,
  readToolcraftVideoExportFormat,
  toolcraftImageExportFormatTarget,
  toolcraftVideoExportFormatTarget,
} from "../../../export/artifact-export-settings";
import {
  getToolcraftVisibleExportActions,
  resolveToolcraftStillExportAction,
} from "../../../export/still-export-actions";
import { useToolcraftStore } from "../../app-shell/toolcraft-store-context";
import type { ReadonlyToolcraftState } from "../../../state/readonly-state";
import type { ToolcraftStoreDependency } from "../../../state/toolcraft-external-store-dependencies";
import { useToolcraftDependencySelector } from "../../app-shell/toolcraft-selectors";

export type ActionControlRunAction = (
  action: ToolcraftActionSchema,
  options?: { trackFooterPending?: boolean },
) => void;

export type ActionControlRenderArgs = {
  control: ToolcraftControlSchema;
  id: string;
  name: string;
  runAction: ActionControlRunAction;
};

function getPanelActionButtonVariant(
  variant: ToolcraftActionSchema["variant"],
): PanelActionObjectOption["variant"] {
  switch (variant) {
    case "destructive":
    case "ghost":
    case "link":
    case "outline":
    case "secondary":
      return variant;
    default:
      return "default";
  }
}

function asActionSchemas(
  actions: readonly (ToolcraftActionSchema | string)[] | undefined,
): readonly ToolcraftActionSchema[] {
  return (actions ?? []).map((action) =>
    typeof action === "string"
      ? {
          label: action,
          value: action,
        }
      : action,
  );
}

function getActionLabel(action: ToolcraftActionSchema): string {
  return action.label ?? action.value;
}

function getDisplayActionLabel(
  action: ToolcraftActionSchema,
  state: ReadonlyToolcraftState,
): string {
  switch (action.role) {
    case "export-image": {
      const format = readToolcraftStillExportFormat(state);
      return format ? `Export ${format.toUpperCase()}` : "Export Image";
    }
    case "export-video": {
      const format = readToolcraftVideoExportFormat(state);
      return format
        ? `Export ${format === "webm" ? "WebM" : "MP4"}`
        : "Export Video";
    }
    default:
      return getActionLabel(action);
  }
}

function actionLabelsEqual(
  previous: readonly string[],
  next: readonly string[],
): boolean {
  return previous.length === next.length &&
    previous.every((label, index) => label === next[index]);
}

function RuntimePanelActions({
  actions,
  runAction,
}: {
  actions: readonly ToolcraftActionSchema[];
  runAction: ActionControlRunAction;
}): React.JSX.Element {
  const store = useToolcraftStore();
  const visibleActions = React.useMemo(
    () => getToolcraftVisibleExportActions(actions),
    [actions],
  );
  const dependencies = React.useMemo<ToolcraftStoreDependency[]>(() => {
    const targets = new Set<string>();
    for (const action of actions) {
      if (action.role === "export-image") {
        targets.add(toolcraftImageExportFormatTarget);
      }
      if (action.role === "export-video") {
        targets.add(toolcraftVideoExportFormatTarget);
      }
    }
    return [...targets].map((target) => ({ kind: "value", target }));
  }, [actions]);
  const labels = useToolcraftDependencySelector(
    React.useCallback(
      (state: ReadonlyToolcraftState) =>
        visibleActions.map((action) => getDisplayActionLabel(action, state)),
      [visibleActions],
    ),
    actionLabelsEqual,
    dependencies,
  );

  return (
    <PanelActions
      actions={visibleActions.map((action, index) => ({
        icon: getPanelActionIcon(action),
        name: labels[index]!,
        value: action.value,
        variant: getPanelActionButtonVariant(action.variant),
      }))}
      onAction={(actionValue) => {
        const action = actions.find((item) => item.value === actionValue);
        if (action) {
          const selectedAction = resolveToolcraftStillExportAction(
            action,
            actions,
            readToolcraftStillExportFormat(store.getState()),
          );
          runAction(selectedAction, { trackFooterPending: true });
        }
      }}
    />
  );
}

function isExportPanelAction(action: ToolcraftActionSchema): boolean {
  if (isToolcraftArtifactExportAction(action)) {
    return true;
  }

  const label = getActionLabel(action);
  const value = action.value;

  return (
    /\bexport\b/i.test(label) ||
    /(?:^|[._:-])export(?:[._:-]|$)/i.test(value) ||
    /^export(?:[._:-]|$)/i.test(value)
  );
}

function getPanelActionIcon(
  action: ToolcraftActionSchema,
): PanelActionObjectOption["icon"] {
  return isExportPanelAction(action) ? "upload-simple" : action.icon;
}

export function renderActionControl({
  control,
  id,
  name,
  runAction,
}: ActionControlRenderArgs): React.ReactNode | null {
  switch (control.type) {
    case "actions": {
      const actions = asActionSchemas(control.actions);

      return (
        <Actions
          actions={actions.map((action) => ({
            icon: action.icon,
            label: action.label,
            value: action.value,
          }))}
          key={id}
          name={name}
          onAction={(actionValue) => {
            const action = actions.find((item) => item.value === actionValue);

            if (action) {
              runAction(action);
            }
          }}
          showLabel={control.label !== false}
        />
      );
    }

    case "panelActions": {
      const actions = asActionSchemas(control.actions);

      return (
        <RuntimePanelActions
          actions={actions}
          key={id}
          runAction={runAction}
        />
      );
    }

    default:
      return null;
  }
}
