// Every component rendered from the public UI root owns its visual chrome.
// This table describes host capabilities, not a whitelist of protected names.
export const toolcraftPublicUiSpecifiers = Object.freeze([
  "#/toolcraft/ui",
  "@/toolcraft/ui",
  "@/toolcraft/ui",
]);

const inputExports = new Set(["Input", "InputGroupInput", "ComboboxInput", "CommandInput"]);
const hostTags = new Map([
  ["Anchor", "a"],
  ["Button", "button"],
  ["Input", "input"],
  ["InputGroupInput", "input"],
  ["CommandInput", "input"],
  ["Textarea", "textarea"],
  ["InputGroupTextarea", "textarea"],
]);

export function getToolcraftPublicUiOwner(origin) {
  if (origin?.kind !== "import" || !toolcraftPublicUiSpecifiers.includes(origin.specifier)) {
    return undefined;
  }
  const exportName = origin.members.at(-1) ?? origin.importedName;
  if (exportName === "*") return undefined;
  return {
    exportName,
    forwardsInputType: inputExports.has(exportName),
    // Compound and polymorphic components may forward styles to different hosts.
    tag: hostTags.get(exportName) ?? "*",
  };
}

export const toolcraftPublicUiHostTags = Object.freeze([
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "div",
  "span",
  "label",
  "fieldset",
  "legend",
  "section",
  "nav",
  "ul",
  "li",
  "p",
  "h2",
  "h3",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "img",
  "svg",
]);

const themeTokens = new Set([
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "radius",
  "link",
  "sidebar",
  "attention",
  "attention-foreground",
  "inspect",
  "bg-foreground",
  "spacing",
]);
const frameworkPrefixes = [
  "toolcraft-",
  "tw-",
  "color-",
  "radius-",
  "sidebar-",
  "chart-",
  "font-",
  "text-",
  "spacing-",
  "control-",
  "input-",
  "button-",
  "command-",
  "floating-popup-",
  "scroll-fade-",
];

export function isToolcraftFrameworkCssToken(property) {
  if (!property.startsWith("--")) return false;
  const name = property.slice(2);
  return themeTokens.has(name) || frameworkPrefixes.some((prefix) => name.startsWith(prefix));
}
