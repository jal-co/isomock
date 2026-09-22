"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { PanelCollapsibleBodySurface } from "./panel-surface";
import {
  ControlItem,
  ControlList,
  ControlSection,
  ControlSectionHeader,
  PanelTitle,
} from "../control-layout";
import {
  cancelBrowserAnimationFrame,
  requestBrowserAnimationFrame,
  scheduleBrowserAnimationFrames,
} from "../primitives/browser-transport";
import type { SafeComposedHostElementProps } from "../primitives/sanitize-composed-host-props";

export type PanelSectionProps = Omit<
  SafeComposedHostElementProps<"section">,
  "children" | "title"
> & {
  action?: React.ReactNode;
  actionGroup?: "primary" | "secondary";
  allowCompoundDividers?: boolean;
  children: React.ReactNode;
  className?: string;
  collapsed?: boolean;
  collapsible?: boolean;
  description?: string;
  flush?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  spacing?: "default" | "technical" | "uniform";
  title?: React.ReactNode;
};

export function PanelSection({
  action,
  actionGroup,
  allowCompoundDividers,
  children,
  className,
  collapsed = false,
  collapsible = false,
  description,
  flush = false,
  onCollapsedChange,
  spacing = "default",
  title,
  ...props
}: PanelSectionProps): React.JSX.Element {
  const isActionSection = actionGroup !== undefined;
  const childArray = React.Children.toArray(children);
  const hasTitle = title !== undefined && title !== null && title !== false;
  const isSectionCollapsed = Boolean(collapsible && collapsed);
  const shouldRenderInnerDividers = allowCompoundDividers ?? childArray.length > 1;
  const body = (
    <ControlList
      className={cn(
        !isActionSection &&
          (spacing === "default" ? "pt-2 pb-6" : "py-3"),
        spacing === "uniform" && "[--control-list-gap:12px]",
      )}
    >
      {childArray.map((child, index) => (
        <ControlItem
          allowCompoundDividers={shouldRenderInnerDividers}
          compoundDividerPlacement={getCompoundDividerPlacement({
            childCount: childArray.length,
            index,
            shouldRenderInnerDividers,
          })}
          flush={flush || isActionSection}
          key={getPanelSectionChildKey(child, index)}
        >
          {child}
        </ControlItem>
      ))}
    </ControlList>
  );

  return (
    <ControlSection
      {...props}
      className={cn(
        !isActionSection && "py-0",
        hasTitle && "gap-0",
        isActionSection && "p-3",
        className,
      )}
      data-collapsed={collapsible ? String(isSectionCollapsed) : undefined}
      data-toolcraft-section-action-group={actionGroup}
      data-toolcraft-section-actions={isActionSection ? "" : undefined}
    >
      {hasTitle ? (
        <ControlSectionHeader
          action={action}
          collapsed={isSectionCollapsed}
          collapsible={collapsible}
          description={description}
          onCollapsedChange={onCollapsedChange}
        >
          <PanelTitle>{title}</PanelTitle>
        </ControlSectionHeader>
      ) : null}
      {collapsible ? (
        <PanelSectionCollapsibleBody collapsed={isSectionCollapsed}>
          {body}
        </PanelSectionCollapsibleBody>
      ) : (
        body
      )}
    </ControlSection>
  );
}

function getCompoundDividerPlacement({
  childCount,
  index,
  shouldRenderInnerDividers,
}: {
  childCount: number;
  index: number;
  shouldRenderInnerDividers: boolean;
}): "both" | "bottom" | "top" {
  if (!shouldRenderInnerDividers || childCount <= 1) {
    return "both";
  }

  if (index === 0) {
    return "bottom";
  }

  if (index === childCount - 1) {
    return "top";
  }

  return "both";
}

function PanelSectionCollapsibleBody({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const [shouldRender, setShouldRender] = React.useState(!collapsed);
  const [isVisuallyCollapsed, setIsVisuallyCollapsed] = React.useState(collapsed);
  const suppressControlTransitions =
    useInitialPanelSectionControlTransitionSuppression(
      `${collapsed ? "collapsed" : "expanded"}:${shouldRender ? "mounted" : "unmounted"}`,
    );

  React.useEffect(() => {
    if (collapsed) {
      setIsVisuallyCollapsed(true);
      return;
    }

    if (shouldRender) {
      setIsVisuallyCollapsed(false);
      return;
    }

    setShouldRender(true);
    setIsVisuallyCollapsed(true);
    const frame = requestBrowserAnimationFrame(() => {
      setIsVisuallyCollapsed(false);
    });

    return () => cancelBrowserAnimationFrame(frame);
  }, [collapsed, shouldRender]);

  function handleTransitionEnd(event: React.TransitionEvent<HTMLDivElement>): void {
    if (event.target !== event.currentTarget || !collapsed) {
      return;
    }

    setShouldRender(false);
  }

  if (!shouldRender) {
    return null;
  }

  return (
    <PanelCollapsibleBodySurface
      aria-hidden={collapsed ? "true" : undefined}
      className={cn(
        "grid overflow-hidden transition-[grid-template-rows,opacity] duration-180 ease-out motion-reduce:transition-none",
        isVisuallyCollapsed
          ? "pointer-events-none grid-rows-[0fr] opacity-0"
          : "grid-rows-[1fr] opacity-100",
      )}
      data-collapsed={String(collapsed)}
      onTransitionEnd={handleTransitionEnd}
    >
      <div
        className="min-h-0 overflow-hidden"
        data-toolcraft-controls-mounting={
          suppressControlTransitions ? "true" : undefined
        }
      >
        {children}
      </div>
    </PanelCollapsibleBodySurface>
  );
}

function useInitialPanelSectionControlTransitionSuppression(
  dependency: unknown,
): boolean {
  const [suppressionState, setSuppressionState] = React.useState(() => ({
    dependency,
    isSuppressing: true,
  }));

  React.useEffect(() => {
    setSuppressionState({ dependency, isSuppressing: true });
    return scheduleBrowserAnimationFrames(
      () => setSuppressionState({ dependency, isSuppressing: false }),
      2,
    );
  }, [dependency]);

  return (
    suppressionState.dependency !== dependency || suppressionState.isSuppressing
  );
}

function getPanelSectionChildKey(
  child: React.ReactNode,
  index: number,
): React.Key {
  return React.isValidElement(child) && child.key !== null ? child.key : index;
}
