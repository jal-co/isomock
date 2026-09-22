"use client";

import { useRef, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../composites";
import { Button, PrimitiveArrowIcon, SelectTriggerButton } from "../../primitives";
import type { ActionsControlItemState } from "./actions-control";

export type ActionNavigationItem = {
  value: string;
  label: string;
  content: ReactNode;
  icon: ReactNode;
};

export function ActionsControlNavigation({
  actionStates,
  items,
  name,
  onAction,
  selectedValue,
}: {
  actionStates?: Readonly<Record<string, ActionsControlItemState>>;
  items: readonly ActionNavigationItem[];
  name: string;
  onAction: (value: string) => void;
  selectedValue: string | null;
}): React.JSX.Element {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnToTrigger = useRef(false);
  const index = items.findIndex((item) => item.value === selectedValue);
  const selected = items[index];
  const available = (item: ActionNavigationItem) => {
    const state = actionStates?.[item.value];
    return !state?.disabled && !state?.loading;
  };
  const previous = items.slice(0, Math.max(0, index)).reverse().find(available);
  const next = items.slice(index + 1).find(available);

  return (
    <div className="flex min-w-0 items-center gap-1.5" data-slot="actions-control-navigation">
      <Button
        aria-label={`Previous ${name} action`}
        disabled={!previous}
        onClick={() => {
          if (previous) onAction(previous.value);
        }}
        size="icon"
        type="button"
        variant="outline"
      >
        <PrimitiveArrowIcon direction="left" />
      </Button>
      <DropdownMenu
        onOpenChangeComplete={(open) => {
          if (!open && returnToTrigger.current) {
            returnToTrigger.current = false;
            triggerRef.current?.focus();
          }
        }}
      >
        <DropdownMenuTrigger
          ref={triggerRef}
          render={
            <SelectTriggerButton
              aria-label={`Choose ${name} action`}
              className="min-w-0 flex-1"
              disabled={!items.some(available)}
              title={selected?.label ?? "Choose action"}
              type="button"
            />
          }
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {selected?.label ?? "Choose action"}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.map((item) => {
            const state = actionStates?.[item.value];
            return (
              <DropdownMenuItem
                aria-busy={state?.loading || undefined}
                aria-label={state?.loading ? (state.loadingAriaLabel ?? item.label) : item.label}
                disabled={!available(item)}
                key={item.value}
                onClick={() => {
                  returnToTrigger.current = true;
                  onAction(item.value);
                }}
                title={item.label}
              >
                {item.icon}
                <span className="min-w-0 flex-1 truncate">
                  {state?.loading ? (state.loadingAriaLabel ?? item.content) : item.content}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        aria-label={`Next ${name} action`}
        disabled={!next}
        onClick={() => {
          if (next) onAction(next.value);
        }}
        size="icon"
        type="button"
        variant="outline"
      >
        <PrimitiveArrowIcon direction="right" />
      </Button>
    </div>
  );
}
