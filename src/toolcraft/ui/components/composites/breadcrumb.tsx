import { sanitizeComposedHostProps, type SafeComposedHostElementProps } from "../primitives/sanitize-composed-host-props";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";

import {
  PrimitiveArrowIcon,
} from "../primitives";
import { cn } from "../../lib/utils";
import { DotsThreeIcon } from "@phosphor-icons/react";

function Breadcrumb({ className, ...props }: SafeComposedHostElementProps<"nav">) {
  return (
    <nav aria-label="breadcrumb" data-slot="breadcrumb" className={cn(className)} {...sanitizeComposedHostProps(props)} />
  );
}

function BreadcrumbList({ className, ...props }: SafeComposedHostElementProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-xs/relaxed wrap-break-word text-[color:var(--muted-foreground)]",
        className,
      )}
      {...sanitizeComposedHostProps(props)}
    />
  );
}

function BreadcrumbItem({ className, ...props }: SafeComposedHostElementProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-1", className)}
      {...sanitizeComposedHostProps(props)}
    />
  );
}

function BreadcrumbLink({ className, render, ...props }: useRender.ComponentProps<"a">) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "cursor-pointer transition-colors hover:text-[color:var(--foreground)]",
          className,
        ),
      },
      props,
    ),
    render,
    state: {
      slot: "breadcrumb-link",
    },
  });
}

function BreadcrumbPage({ className, ...props }: SafeComposedHostElementProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      aria-disabled="true"
      aria-current="page"
      className={cn("font-normal text-[color:var(--foreground)]", className)}
      {...sanitizeComposedHostProps(props)}
    />
  );
}

function BreadcrumbSeparator({ children, className, ...props }: SafeComposedHostElementProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3.5", className)}
      {...sanitizeComposedHostProps(props)}
    >
      {children ?? <PrimitiveArrowIcon direction="right" />}
    </li>
  );
}

function BreadcrumbEllipsis({ className, ...props }: SafeComposedHostElementProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn("flex size-4 items-center justify-center [&>svg]:size-3.5", className)}
      {...sanitizeComposedHostProps(props)}
    >
      <DotsThreeIcon />
      <span className="sr-only">More</span>
    </span>
  );
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
};
