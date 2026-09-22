import type {
  ResolvedToolcraftAppSchema,
  ToolcraftArtifactExportActionRole,
  ToolcraftProductCapabilityId,
} from "@/toolcraft/runtime";
import { isToolcraftArtifactExportAction } from "@/toolcraft/runtime";

import { getControlActions } from "./actions";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftExportArtifactCoverage,
} from "./types";

export type ToolcraftArtifactCapabilityProof = Readonly<{
  capabilityId: ToolcraftProductCapabilityId;
  proof: Readonly<{
    coverage: ToolcraftExportArtifactCoverage;
    kind: "artifact-export";
    role: ToolcraftArtifactExportActionRole;
  }>;
}>;

export const TOOLCRAFT_ARTIFACT_CAPABILITY_PROOFS_BY_ROLE = Object.freeze({
  "export-image": Object.freeze({
    capabilityId: "artifact.image-export",
    proof: Object.freeze({
      coverage: "all-required-image-export-behavior",
      kind: "artifact-export",
      role: "export-image",
    }),
  }),
  "export-svg": Object.freeze({
    capabilityId: "artifact.svg-export",
    proof: Object.freeze({
      coverage: "all-required-svg-export-behavior",
      kind: "artifact-export",
      role: "export-svg",
    }),
  }),
  "export-video": Object.freeze({
    capabilityId: "artifact.video-export",
    proof: Object.freeze({
      coverage: "all-required-video-export-behavior",
      kind: "artifact-export",
      role: "export-video",
    }),
  }),
} satisfies Record<
  ToolcraftArtifactExportActionRole,
  ToolcraftArtifactCapabilityProof
>);

type ToolcraftExportArtifactProofInput = Readonly<{
  acceptance: readonly ToolcraftComponentAcceptance[];
  capabilityIds: readonly ToolcraftProductCapabilityId[];
  capabilityProofs: readonly ToolcraftArtifactCapabilityProof[];
  schema: ResolvedToolcraftAppSchema;
}>;

function assertExactCapabilityProofInventory(
  proofs: readonly ToolcraftArtifactCapabilityProof[],
): void {
  const canonicalProofs = Object.values(
    TOOLCRAFT_ARTIFACT_CAPABILITY_PROOFS_BY_ROLE,
  );
  const isExact =
    proofs.length === canonicalProofs.length &&
    canonicalProofs.every((expected) =>
      proofs.some(
        (proof) =>
          proof.capabilityId === expected.capabilityId &&
          proof.proof.coverage === expected.proof.coverage &&
          proof.proof.kind === expected.proof.kind &&
          proof.proof.role === expected.proof.role,
      ),
    );
  if (!isExact) {
    throw new Error(
      "Toolcraft capability artifact validation requires exactly one canonical proof for every artifact role.",
    );
  }
}

function getCoverageValues(
  entry: ToolcraftComponentAcceptance,
): readonly ToolcraftExportArtifactCoverage[] {
  if (!entry.exportArtifactCoverage) return [];
  return typeof entry.exportArtifactCoverage === "string"
    ? [entry.exportArtifactCoverage]
    : entry.exportArtifactCoverage;
}

function collectArtifactExportActions(schema: ResolvedToolcraftAppSchema) {
  return (schema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.values(section.controls).flatMap((control) =>
      control.type !== "panelActions" || !control.target
        ? []
        : getControlActions(control)
            .filter(isToolcraftArtifactExportAction)
            .map((action) => ({
              requiredCoverage:
                TOOLCRAFT_ARTIFACT_CAPABILITY_PROOFS_BY_ROLE[action.role].proof
                  .coverage,
              role: action.role,
              target: control.target,
              value: action.value,
            })),
    ),
  );
}

export function getToolcraftExportArtifactActionPlacementErrors(
  schema: ResolvedToolcraftAppSchema,
): string[] {
  return (schema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.values(section.controls).flatMap((control) =>
      control.type === "panelActions"
        ? []
        : getControlActions(control)
            .filter(isToolcraftArtifactExportAction)
            .map(
              (action) =>
                `Typed ${action.role} action "${action.value}" must be declared in sticky panelActions.`,
            ),
    ),
  );
}

export function getToolcraftExportArtifactProofErrors(
  input: ToolcraftExportArtifactProofInput,
): string[] {
  assertExactCapabilityProofInventory(input.capabilityProofs);
  const { acceptance, schema } = input;
  const errors: string[] = [];
  const activeCapabilityIds = new Set(input.capabilityIds);
  const capabilityProofByCoverage = new Map(
    input.capabilityProofs.map(
      (descriptor) => [descriptor.proof.coverage, descriptor] as const,
    ),
  );
  const activeCapabilityProofs = input.capabilityProofs.filter((proof) =>
    input.capabilityIds.includes(proof.capabilityId),
  );
  const allExportActions = collectArtifactExportActions(schema);
  for (const action of allExportActions) {
    const proof = capabilityProofByCoverage.get(action.requiredCoverage);
    if (proof && !activeCapabilityIds.has(proof.capabilityId)) {
      errors.push(
        `Typed ${action.role} action "${action.value}" on "${action.target}" claims ${proof.capabilityId} but that capability is absent.`,
      );
    }
  }
  const exportActions = allExportActions.filter(({ requiredCoverage, role }) =>
    activeCapabilityProofs.some(
      (descriptor) =>
        descriptor.proof.coverage === requiredCoverage &&
        descriptor.proof.role === role,
    ),
  );

  for (const descriptor of activeCapabilityProofs) {
    const { proof } = descriptor;
    const hasAction = exportActions.some(
      (action) =>
        action.requiredCoverage === proof.coverage &&
        action.role === proof.role,
    );
    const hasAcceptanceClaim = acceptance.some((entry) =>
      getCoverageValues(entry).includes(proof.coverage),
    );
    if (!hasAction) {
      errors.push(
        `${descriptor.capabilityId} requires a typed ${proof.role} action.`,
      );
    }
    if (!hasAcceptanceClaim) {
      errors.push(
        `${descriptor.capabilityId} requires exported-bytes acceptance with automated and browser proof.`,
      );
    }
  }

  for (const entry of acceptance) {
    const coverage = getCoverageValues(entry);
    const activeCoverage = coverage.filter((value) => {
      const capabilityId = capabilityProofByCoverage.get(value)?.capabilityId;
      return (
        capabilityId !== undefined && activeCapabilityIds.has(capabilityId)
      );
    });
    for (const value of coverage) {
      const capabilityId = capabilityProofByCoverage.get(value)?.capabilityId;
      if (capabilityId && !activeCapabilityIds.has(capabilityId)) {
        errors.push(
          `Acceptance "${entry.id}" claims ${capabilityId} proof but that capability is absent.`,
        );
      }
    }
    if (activeCoverage.length === 0) continue;
    if (entry.evidence !== "exported-bytes") {
      errors.push(
        `Acceptance "${entry.id}" declares exportArtifactCoverage but evidence is not "exported-bytes".`,
      );
    }
    if (!entry.automated || !entry.browser) {
      errors.push(
        `Acceptance "${entry.id}" exportArtifactCoverage requires automated and browser proof.`,
      );
    }
    for (const value of activeCoverage) {
      const hasMatchingAction = exportActions.some(
        (action) =>
          action.target === entry.target &&
          action.requiredCoverage === value &&
          (entry.actionCoverage ?? []).includes(action.value),
      );
      const descriptor = capabilityProofByCoverage.get(value);
      const capabilityHasNoAction =
        descriptor &&
        !exportActions.some(
          (action) =>
            action.requiredCoverage === descriptor.proof.coverage &&
            action.role === descriptor.proof.role,
        );
      if (!hasMatchingAction && !capabilityHasNoAction) {
        errors.push(
          `Acceptance "${entry.id}" declares ${value} without a matching typed export action in target/actionCoverage.`,
        );
      }
    }
  }

  for (const action of exportActions) {
    const capabilityProof = capabilityProofByCoverage.get(
      action.requiredCoverage,
    );
    if (
      capabilityProof &&
      !acceptance.some((entry) =>
        getCoverageValues(entry).includes(capabilityProof.proof.coverage),
      )
    ) {
      continue;
    }
    const hasCoverage = acceptance.some(
      (entry) =>
        entry.target === action.target &&
        entry.evidence === "exported-bytes" &&
        entry.automated &&
        entry.browser &&
        (entry.actionCoverage ?? []).includes(action.value) &&
        getCoverageValues(entry).includes(action.requiredCoverage),
    );
    if (!hasCoverage) {
      errors.push(
        `Typed ${action.role} action "${action.value}" on "${action.target}" requires ${action.requiredCoverage} acceptance coverage.`,
      );
    }
  }

  return errors;
}
