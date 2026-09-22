"use client";

import { sanitizeComposedHostProps, sanitizeInteractionHostProps, type SafeComposedHostElementProps } from "../primitives/sanitize-composed-host-props";
import * as React from "react";
import { Autocomplete as CommandPrimitive } from "@base-ui/react/autocomplete";

import { cn } from "../../lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { MagnifyingGlassIcon, CheckIcon } from "@phosphor-icons/react";
import {
  ScrollFade,
} from "../primitives";

const CommandReadOnlyContext = React.createContext(false);

const commandWindowFrameClassName =
  "floating-popup-surface overflow-hidden rounded-3xl border popup-text-xs-plus text-[color:var(--popover-foreground)]";

const CommandWindowFrame = React.forwardRef<
  HTMLDivElement,
  SafeComposedHostElementProps<"div">
>(
  ({ className, ...props }, ref) => {
    return (
      <div
        data-slot="command-window-frame"
        ref={ref}
        className={cn(commandWindowFrameClassName, className)}
        {...sanitizeComposedHostProps(props)}
      />
    );
  },
);
CommandWindowFrame.displayName = "CommandWindowFrame";

type CommandItemGroup<ItemValue> = { items: readonly ItemValue[] };

// Match Autocomplete's item shape so each overload retains the leaf callback type.
function hasGroupedCommandItems<ItemValue>(
  items: readonly ItemValue[] | readonly CommandItemGroup<ItemValue>[],
): items is readonly CommandItemGroup<ItemValue>[] {
  const first = items[0];
  return (
    typeof first === "object" &&
    first !== null &&
    "items" in first &&
    Array.isArray(first.items)
  );
}

/** Inline action search. Items and search state follow Base UI Autocomplete. */
function Command<ItemValue>({
  className,
  style,
  ref,
  children,
  items,
  ...props
}: Omit<CommandPrimitive.Root.Props<ItemValue>, "open" | "defaultOpen" | "inline" | "items"> & {
  items: NonNullable<CommandPrimitive.Root.Props<ItemValue>["items"]>;
  className?: string;
  style?: React.CSSProperties;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const content = (
    <div
      data-slot="command"
      className={cn(
        "floating-popup-fill flex w-full min-h-0 flex-col overflow-hidden rounded-3xl text-[color:var(--popover-foreground)]",
        className,
      )}
      ref={ref}
      style={style}
    >
      {children}
    </div>
  );
  return (
    <CommandReadOnlyContext.Provider value={props.readOnly ?? false}>
      {hasGroupedCommandItems(items) ? (
        <CommandPrimitive.Root
          autoHighlight="always"
          keepHighlight
          loopFocus={false}
          {...props}
          items={items}
          open
          inline
        >
          {content}
        </CommandPrimitive.Root>
      ) : (
        <CommandPrimitive.Root<ItemValue>
          autoHighlight="always"
          keepHighlight
          loopFocus={false}
          {...props}
          items={items}
          open
          inline
        >
          {content}
        </CommandPrimitive.Root>
      )}
    </CommandReadOnlyContext.Provider>
  );
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = false,
  trigger,
  initialFocus,
  finalFocus,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, "children"> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
  trigger?: React.ReactElement;
  initialFocus?: React.ComponentProps<typeof DialogContent>["initialFocus"];
  finalFocus?: React.ComponentProps<typeof DialogContent>["finalFocus"];
  children: React.ReactNode;
}) {
  return (
    <Dialog {...props}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent
        initialFocus={initialFocus}
        finalFocus={finalFocus}
        className={cn(
          commandWindowFrameClassName,
          "top-1/3 translate-y-0 gap-0 rounded-3xl! p-0 ring-0",
          className,
        )}
        showCloseButton={showCloseButton}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  Omit<CommandPrimitive.Input.Props, "className"> & {
    className?: string;
    leadingVisual?: React.ReactNode;
  }
>(({ className, leadingVisual, ...props }, ref) => {
  return (
    <label
      data-slot="command-primitive-input-wrapper"
      className="flex w-full items-center gap-3 px-4 py-3 text-[color:var(--foreground)]"
    >
      <span
        data-slot="command-input-leading-visual"
        className="flex size-(--command-icon-size) shrink-0 items-center justify-center text-[color:var(--foreground)]"
      >
        {leadingVisual ?? <MagnifyingGlassIcon className="size-(--command-icon-size)" />}
      </span>
      <CommandPrimitive.Input
        aria-label="Search commands"
        className={cn(
          "w-full min-w-0 border-0 bg-transparent p-0 text-xs-plus leading-relaxed font-medium shadow-none outline-hidden placeholder:text-[color:var(--muted-foreground)] disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        data-slot="command-input"
        ref={ref}
        {...props}
      />
    </label>
  );
});
CommandInput.displayName = "CommandInput";

const CommandTextInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentPropsWithoutRef<"input"> & {
    leadingVisual?: React.ReactNode;
    typography?: "default" | "popup";
  }
>(({ className, leadingVisual, typography = "popup", ...props }, ref) => {
  return (
    <label
      data-slot="command-text-input-wrapper"
      className="flex w-full items-center gap-3 px-4 py-3 text-[color:var(--foreground)]"
    >
      <span
        data-slot="command-input-leading-visual"
        className="flex size-(--command-icon-size) shrink-0 items-center justify-center text-[color:var(--foreground)]"
      >
        {leadingVisual ?? <MagnifyingGlassIcon className="size-(--command-icon-size)" />}
      </span>
      <input
        aria-controls={props["aria-controls"] ?? "command-listbox"}
        aria-autocomplete="list"
        aria-expanded={props["aria-expanded"] ?? false}
        autoComplete="off"
        autoCorrect="off"
        className={cn(
          "w-full min-w-0 border-0 bg-transparent p-0 font-medium shadow-none outline-hidden placeholder:text-[color:var(--muted-foreground)] disabled:cursor-not-allowed disabled:opacity-50",
          typography === "default" ? "text-base/relaxed" : "popup-text-xs-plus leading-relaxed",
          className,
        )}
        ref={ref}
        spellCheck={false}
        {...sanitizeInteractionHostProps(props)}
        role="combobox"
        type="text"
        data-slot="command-input"
      />
    </label>
  );
});
CommandTextInput.displayName = "CommandTextInput";

function CommandList({
  className,
  scrollFade = false,
  scrollFadeClassName,
  scrollFadeContainerClassName,
  scrollFadeWatch = [],
  ...props
}: Omit<CommandPrimitive.List.Props, "className"> & React.RefAttributes<HTMLDivElement> & {
  className?: string;
  scrollFade?: boolean;
  scrollFadeClassName?: string;
  scrollFadeContainerClassName?: string;
  scrollFadeWatch?: readonly unknown[];
}) {
  const commandList = (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "no-scrollbar max-h-72 min-h-0 scroll-pt-1 overflow-x-hidden overflow-y-auto outline-none",
        scrollFade ? "max-h-none! overflow-visible!" : null,
        className,
      )}
      {...props}
    />
  );

  if (!scrollFade) {
    return commandList;
  }

  return (
    <ScrollFade
      className={cn("max-h-72 scroll-pt-1", scrollFadeClassName)}
      containerClassName={scrollFadeContainerClassName}
      intensity="medium"
      preset="large"
      showOppositeSide
      side="bottom"
      watch={scrollFadeWatch}
    >
      {commandList}
    </ScrollFade>
  );
}

function CommandEmpty({
  className,
  ...props
}: Omit<CommandPrimitive.Empty.Props, "className"> & React.RefAttributes<HTMLDivElement> & { className?: string }) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn(
        "py-6 empty:py-0 text-center popup-text-xs-plus leading-normal tracking-tight text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)]",
        className,
      )}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  heading,
  children,
  ...props
}: Omit<CommandPrimitive.Group.Props, "className"> & React.RefAttributes<HTMLDivElement> & {
  className?: string;
  heading?: React.ReactNode;
}) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn("overflow-hidden p-1.5 text-[color:var(--foreground)]", className)}
      {...props}
    >
      {heading != null ? (
        <CommandPrimitive.GroupLabel
          data-slot="command-group-heading"
          className="px-2.5 py-1.5 font-medium text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)]"
        >
          {heading}
        </CommandPrimitive.GroupLabel>
      ) : null}
      {children}
    </CommandPrimitive.Group>
  );
}

const CommandCollection = CommandPrimitive.Collection;

function CommandSeparator({
  className,
  ...props
}: Omit<CommandPrimitive.Separator.Props, "className"> & React.RefAttributes<HTMLDivElement> & { className?: string }) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("floating-popup-separator -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

function CommandItem<ItemValue>({
  active = false,
  className,
  children,
  tintIconsOnSelect = true,
  value,
  onSelect,
  onClick,
  ...props
}: Omit<CommandPrimitive.Item.Props, "className" | "value" | "onSelect"> & React.RefAttributes<HTMLDivElement> & {
  className?: string;
  value: ItemValue;
  onSelect?: (value: ItemValue) => void;
  active?: boolean;
    tintIconsOnSelect?: boolean;
  }) {
  const readOnly = React.useContext(CommandReadOnlyContext);

  return (
    <CommandPrimitive.Item
      value={value}
      onClick={(event) => {
        // Base UI's internal read-only guard runs after external click handlers.
        if (readOnly) return;
        onClick?.(event);
        if (!event.defaultPrevented) onSelect?.(value);
      }}
      data-active={active ? "true" : "false"}
      data-slot="command-item"
      className={cn(
        "group/command-item relative flex h-(--command-item-block-size) cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 popup-text-xs-plus leading-normal tracking-tight font-medium outline-hidden select-none in-data-[slot=dialog-content]:rounded-md data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-[color:color-mix(in_oklab,var(--foreground)_4%,transparent)] data-highlighted:text-[color:var(--foreground)] data-[active=true]:bg-[color:color-mix(in_oklab,var(--foreground)_5%,transparent)] data-[active=true]:text-[color:var(--foreground)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-(--command-icon-size)",
        tintIconsOnSelect
          ? "data-highlighted:*:[svg]:text-[color:var(--foreground)] data-[active=true]:*:[svg]:text-[color:var(--foreground)]"
          : null,
        className,
      )}
      {...props}
    >
      {children}
      <CheckIcon className="ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-has-data-[slot=command-trailing-action]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" />
    </CommandPrimitive.Item>
  );
}

function CommandShortcut({ className, ...props }: SafeComposedHostElementProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto text-[0.625rem] tracking-widest text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)] group-data-highlighted/command-item:text-[color:color-mix(in_oklab,var(--foreground)_95%,transparent)] group-data-[active=true]/command-item:text-[color:var(--foreground)]",
        className,
      )}
      {...sanitizeComposedHostProps(props)}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandCollection,
  CommandInput,
  CommandTextInput,
  CommandList,
  CommandWindowFrame,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
