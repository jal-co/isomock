"use client";

import * as React from "react";
import { DiamondIcon } from "@phosphor-icons/react";
import {
  Button,
  ControlFieldLabelActionProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/toolcraft/ui";

import { getToolcraftControlKeyframeCapability } from "../../../schema/keyframe-capability";
import type { ToolcraftControlSchema } from "../../../schema/types";
import type {
  ToolcraftCommand,
  ToolcraftTimelineKeyframeGroup,
} from "../../../state/types";
import { getToolcraftSelectedKeyframeTime } from "../../../state/selected-keyframe-time";
import {
  getControlName,
  type ControlEntry,
} from "../layout/controls-panel-layout";

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

function canCreateControlKeyframe(control: ToolcraftControlSchema): boolean {
  return getToolcraftControlKeyframeCapability(control).capable;
}

export function getControlsPanelSectionHeaderKeyframeEntry(
  entries: readonly ControlEntry[],
  title: React.ReactNode,
): ControlEntry | null {
  if (typeof title !== "string") {
    return null;
  }

  return (
    entries.find(([id, control]) => {
      if (control.type === "channelMixer" || control.type === "curves") {
        return false;
      }

      return (
        getControlName(id, control.label) === title &&
        canCreateControlKeyframe(control)
      );
    }) ?? null
  );
}

function ControlKeyframeButton({
  active,
  name,
  onClick,
}: {
  active: boolean;
  name: string;
  onClick: () => void;
}): React.JSX.Element {
  const label = active ? `Disable ${name} keyframes` : `Add ${name} keyframe`;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "size-4 opacity-100 transition-opacity duration-150 ease-out hover:!bg-transparent active:!bg-transparent aria-pressed:!bg-transparent data-popup-open:!bg-transparent [&_svg:not([class*='size-'])]:!size-2.5 [&_svg:not([class*='size-'])]:!opacity-70 data-[icon-active=true]:[&_svg:not([class*='size-'])]:!opacity-100",
              active &&
                "!text-[color:var(--link)] aria-pressed:!text-[color:var(--link)] data-popup-open:!text-[color:var(--link)] [&_svg]:!text-[color:var(--link)] [&_svg]:!fill-[color:var(--link)]",
            )}
            data-icon-active={active}
            onClick={(event) => {
              event.stopPropagation();
              onClick();

              if (typeof event.currentTarget.blur === "function") {
                event.currentTarget.blur();
              }
            }}
            size="icon-sm"
            style={active ? { color: "var(--link)" } : undefined}
            type="button"
            variant="ghost-static"
          />
        }
      >
        <DiamondIcon weight={active ? "fill" : "regular"} />
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export function createControlsPanelKeyframeActions({
  dispatchCommand,
  formatValueLabel,
  getControlName,
  getControlValue,
  keyframeControlsEnabled,
  keyframedControlIds,
  keyframeGroups,
  selectedKeyframeId,
}: {
  dispatchCommand: (command: ToolcraftCommand) => void;
  formatValueLabel: (control: ToolcraftControlSchema, value: unknown) => string;
  getControlName: (
    id: string,
    label: boolean | string | undefined,
  ) => string;
  getControlValue: (control: ToolcraftControlSchema) => unknown;
  keyframeControlsEnabled: boolean;
  keyframedControlIds: ReadonlySet<string>;
  keyframeGroups: readonly ToolcraftTimelineKeyframeGroup[];
  selectedKeyframeId: string | null;
}): {
  getKeyframeLabelAction: (
    control: ToolcraftControlSchema,
    name: string,
    value: unknown,
  ) => React.ReactNode;
  getSectionHeaderKeyframeAction: (entry: ControlEntry) => React.ReactNode;
  getSectionHeaderKeyframeEntry: (
    entries: readonly ControlEntry[],
    title: React.ReactNode,
  ) => ControlEntry | null;
  maybeUpsertControlKeyframe: (
    control: ToolcraftControlSchema,
    name: string,
    value: unknown,
  ) => void;
  withKeyframeLabelAction: (args: {
    children: React.ReactNode;
    control: ToolcraftControlSchema;
    disableAction?: boolean;
    labelActionName?: string;
    name: string;
    providerKey: string;
    value: unknown;
  }) => React.ReactNode;
} {
  function getSelectedControlKeyframeTime(controlId: string): number | undefined {
    return getToolcraftSelectedKeyframeTime(
      controlId,
      keyframeGroups,
      selectedKeyframeId,
    );
  }

  function maybeUpsertControlKeyframe(
    control: ToolcraftControlSchema,
    name: string,
    value: unknown,
  ): void {
    if (
      !keyframeControlsEnabled ||
      !keyframedControlIds.has(control.target) ||
      !canCreateControlKeyframe(control)
    ) {
      return;
    }

    dispatchCommand({
      controlId: control.target,
      controlLabel: name,
      timeSeconds: getSelectedControlKeyframeTime(control.target),
      type: "timeline.upsertControlKeyframe",
      value,
      valueLabel: formatValueLabel(control, value),
    });
  }

  function getKeyframeLabelAction(
    control: ToolcraftControlSchema,
    name: string,
    value: unknown,
  ): React.ReactNode {
    if (!keyframeControlsEnabled || !canCreateControlKeyframe(control)) {
      return null;
    }

    return (
      <ControlKeyframeButton
        active={keyframedControlIds.has(control.target)}
        name={name}
        onClick={() => {
          dispatchCommand({
            controlId: control.target,
            controlLabel: name,
            type: "timeline.toggleControlKeyframes",
            value,
            valueLabel: formatValueLabel(control, value),
          });
        }}
      />
    );
  }

  function withKeyframeLabelAction({
    children,
    control,
    disableAction = false,
    labelActionName,
    name,
    providerKey,
    value,
  }: {
    children: React.ReactNode;
    control: ToolcraftControlSchema;
    disableAction?: boolean;
    labelActionName?: string;
    name: string;
    providerKey: string;
    value: unknown;
  }): React.ReactNode {
    if (disableAction) {
      return children;
    }

    const actionName = labelActionName ?? name;
    const action = getKeyframeLabelAction(control, actionName, value);

    if (!action) {
      return children;
    }

    return (
      <ControlFieldLabelActionProvider
        action={action}
        key={providerKey}
        label={actionName}
      >
        {children}
      </ControlFieldLabelActionProvider>
    );
  }

  function getSectionHeaderKeyframeEntry(
    entries: readonly ControlEntry[],
    title: React.ReactNode,
  ): ControlEntry | null {
    return getControlsPanelSectionHeaderKeyframeEntry(entries, title);
  }

  function getSectionHeaderKeyframeAction(entry: ControlEntry): React.ReactNode {
    const [id, control] = entry;
    const name = getControlName(id, control.label);

    return getKeyframeLabelAction(control, name, getControlValue(control));
  }

  return {
    getKeyframeLabelAction,
    getSectionHeaderKeyframeAction,
    getSectionHeaderKeyframeEntry,
    maybeUpsertControlKeyframe,
    withKeyframeLabelAction,
  };
}

export type ControlsPanelKeyframeActions = ReturnType<
  typeof createControlsPanelKeyframeActions
>;
