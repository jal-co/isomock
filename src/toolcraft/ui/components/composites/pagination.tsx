import { sanitizeComposedHostProps, type SafeComposedHostElementProps } from "../primitives/sanitize-composed-host-props";
import * as React from "react";

import { CaretLeftIcon, CaretRightIcon, DotsThreeIcon } from "@phosphor-icons/react";
import {
  Anchor,
  Button,
} from "../primitives";
import { cn } from "../../lib/utils";

function Pagination({ className, ...props }: SafeComposedHostElementProps<"nav">) {
  return (
    <nav
      aria-label="pagination"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...sanitizeComposedHostProps(props)}
    />
  );
}

function PaginationContent({ className, ...props }: SafeComposedHostElementProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex items-center gap-0.5", className)}
      {...sanitizeComposedHostProps(props)}
    />
  );
}

function PaginationItem({ ...props }: SafeComposedHostElementProps<"li">) {
  return <li data-slot="pagination-item" {...sanitizeComposedHostProps(props)} />;
}

type PaginationLinkProps = {
  isActive?: boolean;
  size?: "default" | "icon";
} & Omit<React.ComponentProps<"a">, "href"> & {
  href: string;
};

function PaginationLink({
  children,
  className,
  isActive,
  ref,
  size = "icon",
  ...props
}: PaginationLinkProps) {
  return (
    <Button
      aria-current={isActive ? "page" : undefined}
      className={className}
      data-active={isActive}
      nativeButton={false}
      radius="md"
      role="link"
      size={size}
      variant={isActive ? "outline" : "ghost-muted"}
      render={<Anchor {...props} ref={ref} />}
    >
      {children}
    </Button>
  );
}

function PaginationPrevious({
  className,
  text = "Previous",
  ...props
}: React.ComponentProps<typeof PaginationLink> & {
  text?: string;
}) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      className={className}
      size="default"
      {...props}
    >
      <CaretLeftIcon data-icon="inline-start" />
      <span className="hidden sm:block">{text}</span>
    </PaginationLink>
  );
}

function PaginationNext({
  className,
  text = "Next",
  ...props
}: React.ComponentProps<typeof PaginationLink> & {
  text?: string;
}) {
  return (
    <PaginationLink aria-label="Go to next page" className={className} size="default" {...props}>
      <span className="hidden sm:block">{text}</span>
      <CaretRightIcon data-icon="inline-end" />
    </PaginationLink>
  );
}

function PaginationEllipsis({ className, ...props }: SafeComposedHostElementProps<"span">) {
  return (
    <Button
      aria-hidden
      className={cn("pointer-events-none", className)}
      radius="md"
      render={<span data-slot="pagination-ellipsis" {...sanitizeComposedHostProps(props)} />}
      size="icon"
      variant="ghost-muted"
    >
      <DotsThreeIcon />
      <span className="sr-only">More pages</span>
    </Button>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};
