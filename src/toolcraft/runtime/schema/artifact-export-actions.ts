import type { ToolcraftActionRole, ToolcraftActionSchema } from "./types";
import type { ResolvedToolcraftAppSchema } from "./resolved-app-schema";

export const TOOLCRAFT_ARTIFACT_EXPORT_ACTION_ROLES = Object.freeze([
  "export-image",
  "export-svg",
  "export-video",
] as const) satisfies readonly ToolcraftActionRole[];

export type ToolcraftArtifactExportActionRole =
  (typeof TOOLCRAFT_ARTIFACT_EXPORT_ACTION_ROLES)[number];

type ToolcraftArtifactExportAction = Readonly<
  ToolcraftActionSchema & {
    role: ToolcraftArtifactExportActionRole;
  }
>;

const artifactExportActionMetadata: Readonly<
  Record<
    ToolcraftArtifactExportActionRole,
    Readonly<Pick<ToolcraftActionSchema, "icon" | "label" | "value">>
  >
> = Object.freeze({
  "export-image": Object.freeze({
    icon: "upload-simple",
    label: "Export PNG",
    value: "export.png",
  }),
  "export-svg": Object.freeze({
    icon: "upload-simple",
    label: "Export SVG",
    value: "export.svg",
  }),
  "export-video": Object.freeze({
    icon: "upload-simple",
    label: "Export Video",
    value: "export.video",
  }),
});

const artifactExportActionRoleSet = new Set<ToolcraftActionRole>(
  TOOLCRAFT_ARTIFACT_EXPORT_ACTION_ROLES,
);

export function isToolcraftArtifactExportActionRole(
  role: ToolcraftActionRole | undefined,
): role is ToolcraftArtifactExportActionRole {
  return role !== undefined && artifactExportActionRoleSet.has(role);
}

export function compareToolcraftArtifactExportActionRoles(
  left: ToolcraftArtifactExportActionRole,
  right: ToolcraftArtifactExportActionRole,
): number {
  return (
    TOOLCRAFT_ARTIFACT_EXPORT_ACTION_ROLES.indexOf(left) -
    TOOLCRAFT_ARTIFACT_EXPORT_ACTION_ROLES.indexOf(right)
  );
}

export function createToolcraftArtifactExportActions(
  roles: readonly ToolcraftArtifactExportActionRole[],
): readonly ToolcraftArtifactExportAction[] {
  const roleCounts = new Map<ToolcraftArtifactExportActionRole, number>();
  for (const role of roles) {
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
  }

  const duplicateRoles = TOOLCRAFT_ARTIFACT_EXPORT_ACTION_ROLES.filter(
    (role) => (roleCounts.get(role) ?? 0) > 1,
  );
  if (duplicateRoles.length > 0) {
    throw new Error(
      `Toolcraft artifact export action roles must be unique; duplicates: ${duplicateRoles.join(", ")}.`,
    );
  }

  const roleSet = new Set(roles);
  const primaryRole = roleSet.has("export-video")
    ? "export-video"
    : roleSet.has("export-image")
      ? "export-image"
      : roleSet.has("export-svg")
        ? "export-svg"
        : undefined;
  const actions = TOOLCRAFT_ARTIFACT_EXPORT_ACTION_ROLES.filter((role) =>
    roleSet.has(role),
  ).map((role): ToolcraftArtifactExportAction => {
    const metadata = artifactExportActionMetadata[role];
    return role === primaryRole
      ? Object.freeze({ ...metadata, role })
      : Object.freeze({ ...metadata, role, variant: "outline" });
  });

  return Object.freeze(actions);
}

export function isToolcraftArtifactExportAction(
  action: ToolcraftActionSchema | string,
): action is ToolcraftActionSchema & {
  role: ToolcraftArtifactExportActionRole;
} {
  return (
    typeof action !== "string" &&
    isToolcraftArtifactExportActionRole(action.role)
  );
}

export function getToolcraftArtifactExportActions(
  schema: ResolvedToolcraftAppSchema,
): readonly (ToolcraftActionSchema & {
  role: ToolcraftArtifactExportActionRole;
})[] {
  return (schema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.values(section.controls).flatMap((control) =>
      control.type === "panelActions"
        ? (control.actions ?? []).filter(isToolcraftArtifactExportAction)
        : [],
    ),
  );
}
