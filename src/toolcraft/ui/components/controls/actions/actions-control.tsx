"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import { renderActionIcon, type ActionControlIconName } from "../../action-icon-catalog";
import { Button, Field } from "../../primitives";
import { ControlFieldLabel } from "../../control-layout";
import { cn } from "../../../lib/utils";
import { ActionsControlNavigation } from "./actions-control-navigation";

export type { ActionControlIconName } from "../../action-icon-catalog";

export type ActionControlObjectOption = {
  ariaLabel?: string;
  children?: ReactNode;
  label?: string;
  value: string;
  icon?: ActionControlIconName | ReactElement;
};

export type ActionControlOption = string | ActionControlObjectOption;

export type ActionsControlItemState = {
  disabled?: boolean;
  loading?: boolean;
  loadingAriaLabel?: string;
};

function getActionValue(action: ActionControlOption): string {
  return typeof action === "string" ? action : action.value;
}

function getActionLabel(action: ActionControlOption): string {
  return typeof action === "string" ? action : (action.ariaLabel ?? action.label ?? action.value);
}

function getActionContent(action: ActionControlOption): ReactNode {
  if (typeof action === "string") {
    return action;
  }

  return action.children ?? action.label ?? action.value;
}

function getActionIcon(action: ActionControlOption): ReactNode {
  if (typeof action === "string" || action.icon == null) {
    return null;
  }

  if (typeof action.icon !== "string") {
    return action.icon;
  }

  return renderActionIcon(action.icon, { "data-icon": "inline-start" });
}

function getActionAriaLabel(action: ActionControlOption, content: ReactNode): string | undefined {
  if (typeof action !== "string" && action.ariaLabel) {
    return action.ariaLabel;
  }

  if (typeof content === "string") {
    return undefined;
  }

  return typeof action === "string" ? action : (action.label ?? action.value);
}

export type ActionsControlProps = {
  actionStates?: Readonly<Record<string, ActionsControlItemState>>;
  actions: readonly ActionControlOption[];
  buttonColumns?: 1 | 2 | 3 | 4;
  name: string;
  onAction?: (value: string) => void;
  showActionLabels?: boolean;
  showLabel?: boolean;
};

export function ActionsControl({
  actionStates,
  actions,
  buttonColumns,
  name,
  onAction,
  showActionLabels = true,
  showLabel = true,
}: ActionsControlProps): React.JSX.Element {
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const hasSingleAction = actions.length === 1;
  const columns = buttonColumns ?? (hasSingleAction ? 1 : 2);
  const useNavigation = Math.ceil(actions.length / columns) > 4;
  function activateAction(value: string): void {
    if (actionStates?.[value]?.disabled || actionStates?.[value]?.loading) return;
    setSelectedAction(value);
    onAction?.(value);
  }
  const columnClass =
    buttonColumns === 4
      ? "w-full grid-cols-4"
      : buttonColumns === 3
        ? "w-full grid-cols-3"
        : buttonColumns === 2
          ? "w-full grid-cols-2"
          : buttonColumns === 1
            ? "w-full grid-cols-1"
            : hasSingleAction
              ? "w-1/2 grid-cols-1"
              : "w-full grid-cols-2";

  return (
    <Field
      aria-label={showLabel ? undefined : name}
      className="h-fit min-w-0 gap-2"
      data-slot="actions-control"
      orientation="vertical"
    >
      {showLabel ? (
        <ControlFieldLabel className="min-w-0" textClassName="min-w-0 truncate">
          {name}
        </ControlFieldLabel>
      ) : null}
      {useNavigation ? (
        <ActionsControlNavigation
          actionStates={actionStates}
          items={actions.map((action) => ({
            value: getActionValue(action),
            label: getActionLabel(action),
            content: getActionContent(action),
            icon: getActionIcon(action),
          }))}
          name={name}
          onAction={activateAction}
          selectedValue={selectedAction}
        />
      ) : (
        <div
          className={cn("grid max-w-full gap-1.5", columnClass)}
          data-actions-count={actions.length}
          data-actions-columns={columns}
          data-slot="actions-control-buttons"
        >
          {actions.map((action) => {
            const actionContent = getActionContent(action);
            const actionLabel = getActionLabel(action);
            const actionValue = getActionValue(action);
            const actionState = actionStates?.[actionValue];
            const actionAriaLabel = showActionLabels
              ? getActionAriaLabel(action, actionContent)
              : actionLabel;

            return (
              <Button
                aria-label={
                  actionState?.loading && actionState.loadingAriaLabel
                    ? actionState.loadingAriaLabel
                    : actionAriaLabel
                }
                disabled={actionState?.disabled}
                key={actionValue}
                loading={actionState?.loading}
                onClick={() => activateAction(actionValue)}
                className="w-full"
                size="sm"
                type="button"
                variant="outline"
              >
                {getActionIcon(action)}
                {showActionLabels ? actionContent : null}
              </Button>
            );
          })}
        </div>
      )}
    </Field>
  );
}
