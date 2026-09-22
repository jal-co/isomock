import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import type * as React from "react";

import { cn } from "../../lib/utils";
import { ScrollFade } from "../primitives";
import {
  sanitizeComposedHostProps,
  sanitizeInteractionHostProps,
  type SafeComposedHostProps,
} from "../primitives/sanitize-composed-host-props";

export function ComboboxList({
  className,
  ...props
}: SafeComposedHostProps<ComboboxPrimitive.List.Props>) {
  const safeProps = sanitizeComposedHostProps(props);

  return (
    <ComboboxPrimitive.List
      {...safeProps}
      data-slot="combobox-list"
      render={(listProps) => {
        const {
          children,
          className: renderedClassName,
          ...renderedListProps
        } = listProps as React.ComponentProps<"div">;

        return (
          <div
            {...sanitizeInteractionHostProps(renderedListProps)}
            className="min-h-0 w-full"
            data-slot="combobox-list"
            role="listbox"
          >
            <ScrollFade
              className={cn(
                "no-scrollbar max-h-[min(calc(--spacing(72)---spacing(9)),calc(var(--available-height)---spacing(9)))] w-full scroll-py-1 overscroll-contain",
                renderedClassName,
                className,
              )}
              containerClassName="min-h-0 w-full"
              preset="compact"
              side="bottom"
            >
              {children}
            </ScrollFade>
          </div>
        );
      }}
    />
  );
}
