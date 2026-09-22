import type {
  ResolvedToolcraftAppSchema,
  ToolcraftActionSchema,
} from "@/toolcraft/runtime";

import { appAcceptance } from "./app-acceptance";
import { compositionHasProductCanvasSurface } from "./app-acceptance.composition-test-utils";
import { appComposition } from "./app-composition";
import { appSchema } from "./app-schema";

type ResolvedControlsSection =
  NonNullable<ResolvedToolcraftAppSchema["panels"]["controls"]>["sections"][number];

type ResolvedControl = ResolvedControlsSection["controls"][string];

export function schemaHasProductSurface(): boolean {
  return (
    (appSchema.panels.controls?.sections ?? []).some(
      (section) => section.id !== "runtime.setup" && section.id !== "runtime.defaults" && Object.keys(section.controls).length > 0,
    ) ||
    appSchema.panels.layers === true ||
    appSchema.panels.timeline?.enabled === true ||
    compositionHasProductCanvasSurface(appComposition) ||
    appAcceptance.some((entry) => entry.kind !== "runtime")
  );
}

function getPanelActionSearchText(action: ToolcraftActionSchema | string): string {
  return typeof action === "string"
    ? action
    : [action.label ?? "", action.value, action.icon ?? ""].join(" ");
}

export function getSchemaPanelActionSearchTexts(): string[] {
  return (appSchema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.values(section.controls).flatMap((control) => {
      if (control.type !== "panelActions") {
        return [];
      }

      return (control.actions ?? []).map(getPanelActionSearchText);
    }),
  );
}

function normalizeSectionTitle(title: string | undefined): string {
  return (title ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function getSchemaVideoExportSection(
  schema: ResolvedToolcraftAppSchema = appSchema,
): ResolvedControlsSection | undefined {
  return (schema.panels.controls?.sections ?? []).find(
    (section) => normalizeSectionTitle(section.title) === "video export",
  );
}

export function getSchemaImageExportSection(
  schema: ResolvedToolcraftAppSchema = appSchema,
): ResolvedControlsSection | undefined {
  return (schema.panels.controls?.sections ?? []).find(
    (section) => normalizeSectionTitle(section.title) === "image export",
  );
}

export function getSectionControlByTarget(
  section: ResolvedControlsSection | undefined,
  target: string,
): ResolvedControl | undefined {
  if (!section) {
    return undefined;
  }

  return Object.values(section.controls).find((control) => control.target === target);
}

export function getSectionControlIdByTarget(
  section: ResolvedControlsSection | undefined,
  target: string,
): string | undefined {
  if (!section) {
    return undefined;
  }

  return Object.entries(section.controls).find(([, control]) => control.target === target)?.[0];
}

export function getControlOptionValues(control: ResolvedControl | undefined): string[] {
  return control?.options?.map((option) => option.value.toLowerCase()) ?? [];
}

export function getSchemaBackgroundControlTargets(
  controlTypes: ReadonlySet<string>,
): string[] {
  return (appSchema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.entries(section.controls).flatMap(([controlId, control]) => {
      if (!controlTypes.has(control.type)) {
        return [];
      }

      const searchText = [
        section.title ?? "",
        controlId,
        control.target,
        typeof control.label === "string" ? control.label : "",
      ]
        .join(" ")
        .replace(/([a-z])([A-Z])/g, "$1 $2");

      if (!/\b(background|backdrop|scene|canvas|transparent|transparency|alpha)\b/i.test(searchText)) {
        return [];
      }

      return [control.target];
    }),
  );
}
