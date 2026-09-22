export function humanizeToolcraftLabelPart(value: string): string {
  const text = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return "";
  }

  return text.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

export function lowerCaseToolcraftLabelStart(value: string): string {
  return value ? `${value.charAt(0).toLowerCase()}${value.slice(1)}` : value;
}

export function normalizeToolcraftSemanticText(value: string | undefined): string {
  return humanizeToolcraftLabelPart(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function getToolcraftTargetParts(target: string): string[] {
  return target.split(".").filter(Boolean);
}

export function getToolcraftTargetProperty(target: string): string {
  return getToolcraftTargetParts(target).at(-1) ?? "";
}

export function getToolcraftStrictTargetPrefix(target: string): string | null {
  const parts = getToolcraftTargetParts(target);

  if (parts.length < 3) {
    return null;
  }

  const prefix = parts.slice(0, -1).join(".");

  if (prefix === "canvas.size") {
    return null;
  }

  return prefix;
}

export function getToolcraftLooseTargetPrefix(target: string): string | null {
  const parts = getToolcraftTargetParts(target);

  if (parts.length < 2) {
    return null;
  }

  const prefix = parts.slice(0, -1).join(".");

  if (prefix === "canvas.size") {
    return null;
  }

  return prefix;
}
