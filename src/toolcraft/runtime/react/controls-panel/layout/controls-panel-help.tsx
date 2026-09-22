"use client";

import * as React from "react";
import { ControlFieldLabelHelpProvider } from "@/toolcraft/ui";

import type { ToolcraftControlSchema } from "../../../schema/types";

function normalizeControlHelpContext(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isColorSectionTitle(sectionTitle: string | undefined): boolean {
  return /\b(colou?rs?|palette|palettes|shades?|accents?)\b/i.test(
    sectionTitle ?? "",
  );
}

function isSequentialColorLabel(label: string): boolean {
  return /^colou?r\s+\d+$/i.test(label.trim());
}

function isSimplePaletteDistributionLabel(label: string): boolean {
  return /^(spread|mix|distribution)$/i.test(label.trim());
}

function isGenericControlHelpDescription(description: string): boolean {
  return /^(adjusts?|changes?|chooses?|controls?|defines?|selects?|sets?|updates?)\b/i.test(
    description.trim(),
  );
}

function shouldSuppressObviousControlHelp({
  control,
  description,
  label,
  sectionTitle,
}: {
  control: ToolcraftControlSchema;
  description: string;
  label: string;
  sectionTitle: string | undefined;
}): boolean {
  const isColorControl = control.type === "color" || control.type === "colorOpacity";

  if (isColorSectionTitle(sectionTitle)) {
    if (isColorControl && isSequentialColorLabel(label)) {
      return true;
    }

    if (
      isSimplePaletteDistributionLabel(label) &&
      isGenericControlHelpDescription(description)
    ) {
      return true;
    }
  }

  const normalizedDescription = normalizeControlHelpContext(description);
  const normalizedLabel = normalizeControlHelpContext(label);

  return (
    Boolean(normalizedLabel) &&
    isGenericControlHelpDescription(description) &&
    normalizedDescription === normalizedLabel
  );
}

function getControlHelpText({
  control,
  label,
  sectionTitle,
}: {
  control: ToolcraftControlSchema;
  label: string;
  sectionTitle: string | undefined;
}): string | null {
  const description = control.description?.trim();

  if (!description) {
    return null;
  }

  if (
    shouldSuppressObviousControlHelp({
      control,
      description,
      label,
      sectionTitle,
    })
  ) {
    return null;
  }

  return description;
}

export function withControlLabelHelp({
  children,
  control,
  label,
  providerKey,
  sectionTitle,
}: {
  children: React.ReactNode;
  control: ToolcraftControlSchema;
  label: string;
  providerKey: string;
  sectionTitle: string | undefined;
}): React.ReactNode {
  if (control.label === false) {
    return children;
  }

  const help = getControlHelpText({ control, label, sectionTitle });

  if (!help) {
    return children;
  }

  return (
    <ControlFieldLabelHelpProvider
      help={help}
      key={`${providerKey}-help`}
      label={label}
    >
      {children}
    </ControlFieldLabelHelpProvider>
  );
}
