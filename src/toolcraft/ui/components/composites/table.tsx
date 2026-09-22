import { sanitizeComposedHostProps, type SafeComposedHostElementProps } from "../primitives/sanitize-composed-host-props";

import { cn } from "../../lib/utils";
import {
} from "../primitives";

function Table({ className, ...props }: SafeComposedHostElementProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-xs", className)}
        {...sanitizeComposedHostProps(props)}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: SafeComposedHostElementProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "[&_tr]:border-b [&_tr]:border-[color:color-mix(in_oklab,var(--border)_10%,transparent)]",
        className,
      )}
      {...sanitizeComposedHostProps(props)}
    />
  );
}

function TableBody({ className, ...props }: SafeComposedHostElementProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...sanitizeComposedHostProps(props)}
    />
  );
}

function TableFooter({ className, ...props }: SafeComposedHostElementProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-[color:color-mix(in_oklab,var(--border)_10%,transparent)] bg-[color:color-mix(in_oklab,var(--muted)_50%,transparent)] font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...sanitizeComposedHostProps(props)}
    />
  );
}

function TableRow({ className, ...props }: SafeComposedHostElementProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-[color:color-mix(in_oklab,var(--border)_10%,transparent)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--muted)_50%,transparent)] data-[state=selected]:bg-[color:var(--muted)]",
        className,
      )}
      {...sanitizeComposedHostProps(props)}
    />
  );
}

function TableHead({ className, ...props }: SafeComposedHostElementProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-[color:var(--foreground)] [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...sanitizeComposedHostProps(props)}
    />
  );
}

function TableCell({ className, ...props }: SafeComposedHostElementProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0", className)}
      {...sanitizeComposedHostProps(props)}
    />
  );
}

function TableCaption({ className, ...props }: SafeComposedHostElementProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-xs text-[color:var(--muted-foreground)]", className)}
      {...sanitizeComposedHostProps(props)}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
