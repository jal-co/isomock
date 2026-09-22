function imported(specifier, ...symbols) {
  return Object.freeze({
    specifier,
    symbols: Object.freeze(symbols),
  });
}

function rendered(defaultTag, count = 1) {
  return Object.freeze({ count, defaultTag, operation: "useRender" });
}

function consumer(repoPath, imports, useRender = []) {
  return Object.freeze({
    imports: Object.freeze(imports),
    repoPath,
    useRender: Object.freeze(useRender),
  });
}

export const toolcraftBaseUiConsumerMatrix = Object.freeze([
  consumer(
    "packages/ui/src/components/composites/accordion.tsx",
    [imported("@base-ui/react/accordion", "Accordion")],
  ),
  consumer(
    "packages/ui/src/components/composites/alert-dialog.tsx",
    [imported("@base-ui/react/alert-dialog", "AlertDialog")],
  ),
  consumer(
    "packages/ui/src/components/composites/avatar.tsx",
    [imported("@base-ui/react/avatar", "Avatar")],
  ),
  consumer(
    "packages/ui/src/components/composites/badge.tsx",
    [
      imported("@base-ui/react/merge-props", "mergeProps"),
      imported("@base-ui/react/use-render", "useRender"),
    ],
    [rendered("span")],
  ),
  consumer(
    "packages/ui/src/components/composites/breadcrumb.tsx",
    [
      imported("@base-ui/react/merge-props", "mergeProps"),
      imported("@base-ui/react/use-render", "useRender"),
    ],
    [rendered("a")],
  ),
  consumer(
    "packages/ui/src/components/composites/combobox-list.tsx",
    [imported("@base-ui/react", "Combobox")],
  ),
  consumer(
    "packages/ui/src/components/composites/combobox.tsx",
    [imported("@base-ui/react", "Combobox")],
  ),
  consumer(
    "packages/ui/src/components/composites/context-menu.tsx",
    [imported("@base-ui/react/context-menu", "ContextMenu")],
  ),
  consumer(
    "packages/ui/src/components/composites/dialog.tsx",
    [imported("@base-ui/react/dialog", "Dialog")],
  ),
  consumer(
    "packages/ui/src/components/composites/dropdown-menu.tsx",
    [imported("@base-ui/react/menu", "Menu")],
  ),
  consumer(
    "packages/ui/src/components/composites/hover-card.tsx",
    [imported("@base-ui/react/preview-card", "PreviewCard")],
  ),
  consumer(
    "packages/ui/src/components/composites/menubar.tsx",
    [imported("@base-ui/react/menubar", "Menubar")],
  ),
  consumer(
    "packages/ui/src/components/composites/navigation-menu.tsx",
    [imported("@base-ui/react/navigation-menu", "NavigationMenu")],
  ),
  consumer(
    "packages/ui/src/components/composites/progress.tsx",
    [imported("@base-ui/react/progress", "Progress")],
  ),
  consumer(
    "packages/ui/src/components/composites/radio-group.tsx",
    [
      imported("@base-ui/react/radio", "Radio"),
      imported("@base-ui/react/radio-group", "RadioGroup"),
    ],
  ),
  consumer(
    "packages/ui/src/components/composites/sheet.tsx",
    [imported("@base-ui/react/dialog", "Dialog")],
  ),
  consumer(
    "packages/ui/src/components/composites/sidebar-structural.tsx",
    [
      imported("@base-ui/react/merge-props", "mergeProps"),
      imported("@base-ui/react/use-render", "useRender"),
    ],
    [rendered("a"), rendered("button"), rendered("div")],
  ),
  consumer(
    "packages/ui/src/components/composites/sidebar.tsx",
    [
      imported("@base-ui/react/merge-props", "mergeProps"),
      imported("@base-ui/react/use-render", "useRender"),
    ],
    [rendered("button", 2)],
  ),
  consumer(
    "packages/ui/src/components/composites/tabs.tsx",
    [imported("@base-ui/react/tabs", "Tabs")],
  ),
  consumer(
    "packages/ui/src/components/primitives/button-group.tsx",
    [
      imported("@base-ui/react/merge-props", "mergeProps"),
      imported("@base-ui/react/use-render", "useRender"),
    ],
    [rendered("div")],
  ),
  consumer(
    "packages/ui/src/components/primitives/button.tsx",
    [imported("@base-ui/react/button", "Button")],
  ),
  consumer(
    "packages/ui/src/components/primitives/checkbox.tsx",
    [imported("@base-ui/react/checkbox", "Checkbox")],
  ),
  consumer(
    "packages/ui/src/components/primitives/input.tsx",
    [imported("@base-ui/react/input", "Input")],
  ),
  consumer(
    "packages/ui/src/components/primitives/popover.tsx",
    [imported("@base-ui/react/popover", "Popover")],
  ),
  consumer(
    "packages/ui/src/components/primitives/select.tsx",
    [imported("@base-ui/react/select", "Select")],
  ),
  consumer(
    "packages/ui/src/components/primitives/separator.tsx",
    [imported("@base-ui/react/separator", "Separator")],
  ),
  consumer(
    "packages/ui/src/components/primitives/slider/slider-parts.tsx",
    [imported("@base-ui/react/slider", "Slider")],
  ),
  consumer(
    "packages/ui/src/components/primitives/slider/slider.tsx",
    [imported("@base-ui/react/slider", "Slider")],
  ),
  consumer(
    "packages/ui/src/components/primitives/switch.tsx",
    [imported("@base-ui/react/switch", "Switch")],
  ),
  consumer(
    "packages/ui/src/components/primitives/toggle-group.tsx",
    [
      imported("@base-ui/react/toggle", "Toggle"),
      imported("@base-ui/react/toggle-group", "ToggleGroup"),
    ],
  ),
  consumer(
    "packages/ui/src/components/primitives/toggle.tsx",
    [imported("@base-ui/react/toggle", "Toggle")],
  ),
  consumer(
    "packages/ui/src/components/primitives/tooltip.tsx",
    [imported("@base-ui/react/tooltip", "Tooltip")],
  ),
]);
