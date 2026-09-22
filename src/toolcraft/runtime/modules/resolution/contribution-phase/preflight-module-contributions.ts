import { compareToolcraftArtifactExportActionRoles } from "../../../schema/artifact-export-actions";
import {
  TOOLCRAFT_ARTIFACT_ACTION_SECTION_ID,
  TOOLCRAFT_ARTIFACT_ACTION_TARGET,
} from "../../contributions/artifact-action-contributions";
import type {
  ToolcraftCanvasBehaviorModuleContribution,
  ToolcraftControlSectionModuleContribution,
  ToolcraftMediaPolicyModuleContribution,
  ToolcraftModuleOwnershipKey,
  ToolcraftPanelActionModuleContribution,
  ToolcraftPanelSurfaceModuleContribution,
  ToolcraftPersistenceModuleContribution,
  ToolcraftProductModuleContribution,
  ToolcraftProductModuleContributionId,
} from "../../contract/contribution";
import type { ResolvedProductModulePlan } from "../../contract/module-plan";
import { validateToolcraftProductModuleContribution } from "../../contract/validate-module-contribution";

export type PreflightedModuleContributions = Readonly<{
  actionContributions: readonly ToolcraftPanelActionModuleContribution[];
  canvasBehaviorContributions: readonly ToolcraftCanvasBehaviorModuleContribution[];
  mediaPolicyContributions: readonly ToolcraftMediaPolicyModuleContribution[];
  ownership: ResolvedProductModulePlan["ownership"];
  persistenceContributions: readonly ToolcraftPersistenceModuleContribution[];
  settingsContributions: readonly ToolcraftControlSectionModuleContribution[];
  surfaceContributions: readonly ToolcraftPanelSurfaceModuleContribution[];
}>;

type WorkingOwnership = {
  contributionId: ToolcraftProductModuleContributionId;
  kind: ToolcraftProductModuleContribution["kind"];
  moduleId: ToolcraftProductModuleContribution["moduleId"];
  ownershipKeys: ToolcraftModuleOwnershipKey[];
};

function formatContributionOwner(
  contribution: ToolcraftProductModuleContribution,
): string {
  return `${contribution.moduleId}/${contribution.id}`;
}

function rejectDuplicateContributionIds(
  ownersById: ReadonlyMap<
    ToolcraftProductModuleContributionId,
    readonly ToolcraftProductModuleContribution[]
  >,
): void {
  const duplicate = [...ownersById.entries()]
    .filter(([, owners]) => owners.length > 1)
    .sort(([left], [right]) => left.localeCompare(right))[0];
  if (duplicate !== undefined) {
    const [id, owners] = duplicate;
    throw new Error(
      `Toolcraft module contribution id "${id}" has multiple owners: ${owners.map(formatContributionOwner).sort().join(", ")}.`,
    );
  }
}

function rejectDuplicateOwnershipKeys(
  ownership: readonly WorkingOwnership[],
): void {
  const ownersByKey = new Map<ToolcraftModuleOwnershipKey, WorkingOwnership[]>();
  for (const owner of ownership) {
    for (const ownershipKey of owner.ownershipKeys) {
      const owners = ownersByKey.get(ownershipKey) ?? [];
      owners.push(owner);
      ownersByKey.set(ownershipKey, owners);
    }
  }
  const duplicate = [...ownersByKey.entries()]
    .filter(([, owners]) => owners.length > 1)
    .sort(([left], [right]) => left.localeCompare(right))[0];
  if (duplicate !== undefined) {
    const [ownershipKey, owners] = duplicate;
    throw new Error(
      `Toolcraft module ownership key "${ownershipKey}" has multiple owners: ${owners
        .map(({ contributionId, moduleId }) => `${moduleId}/${contributionId}`)
        .sort()
        .join(", ")}.`,
    );
  }
}

function compareActionContributions(
  left: ToolcraftPanelActionModuleContribution,
  right: ToolcraftPanelActionModuleContribution,
): number {
  const roleOrder = compareToolcraftArtifactExportActionRoles(
    left.role,
    right.role,
  );
  return roleOrder !== 0 ? roleOrder : left.id.localeCompare(right.id);
}

function assertExhaustiveContribution(value: never): never {
  throw new Error(
    `Unsupported Toolcraft module contribution: ${String(value)}.`,
  );
}

export function preflightToolcraftModuleContributions(
  contributions: readonly ToolcraftProductModuleContribution[],
  validateContribution: (contribution: ToolcraftProductModuleContribution) => ToolcraftProductModuleContribution,
): PreflightedModuleContributions {
  const actionContributions: ToolcraftPanelActionModuleContribution[] = [];
  const canvasBehaviorContributions: ToolcraftCanvasBehaviorModuleContribution[] = [];
  const mediaPolicyContributions: ToolcraftMediaPolicyModuleContribution[] = [];
  const persistenceContributions: ToolcraftPersistenceModuleContribution[] = [];
  const settingsContributions: ToolcraftControlSectionModuleContribution[] = [];
  const surfaceContributions: ToolcraftPanelSurfaceModuleContribution[] = [];
  const contributionOwnersById = new Map<
    ToolcraftProductModuleContributionId,
    ToolcraftProductModuleContribution[]
  >();
  const workingOwnership: WorkingOwnership[] = [];

  for (const contribution of contributions) {
    validateToolcraftProductModuleContribution(contribution, validateContribution);
    const contributionOwners =
      contributionOwnersById.get(contribution.id) ?? [];
    contributionOwners.push(contribution);
    contributionOwnersById.set(contribution.id, contributionOwners);

    let ownershipKeys: ToolcraftModuleOwnershipKey[];
    switch (contribution.kind) {
      case "canvas-behavior":
        canvasBehaviorContributions.push(contribution);
        ownershipKeys = [`canvas-behavior:${contribution.behavior}`];
        break;
      case "control-section":
        settingsContributions.push(contribution);
        ownershipKeys = [
          `control-section:${contribution.runtimeSectionId}`,
          ...Object.values(contribution.section.controls).map(
            ({ target }) => `control-target:${target}` as const,
          ),
        ];
        break;
      case "media-policy":
        mediaPolicyContributions.push(contribution);
        ownershipKeys = [`media-policy:${contribution.policy}`];
        break;
      case "panel-action":
        actionContributions.push(contribution);
        ownershipKeys = [`panel-action:${contribution.role}`];
        break;
      case "panel-surface":
        surfaceContributions.push(contribution);
        ownershipKeys = [`panel-surface:${contribution.surface}`];
        break;
      case "persistence-requirement":
        persistenceContributions.push(contribution);
        ownershipKeys = [`persistence-slice:${contribution.slice}`];
        break;
      default:
        assertExhaustiveContribution(contribution);
    }
    workingOwnership.push({
      contributionId: contribution.id,
      kind: contribution.kind,
      moduleId: contribution.moduleId,
      ownershipKeys,
    });
  }

  rejectDuplicateContributionIds(contributionOwnersById);
  const aggregateActionRepresentative = [...actionContributions].sort(
    compareActionContributions,
  )[0];
  if (aggregateActionRepresentative !== undefined) {
    const aggregateOwnership = workingOwnership.find(
      ({ contributionId }) =>
        contributionId === aggregateActionRepresentative.id,
    );
    if (aggregateOwnership === undefined) {
      throw new Error(
        `Toolcraft aggregate action ownership is missing for contribution "${aggregateActionRepresentative.id}".`,
      );
    }
    aggregateOwnership.ownershipKeys.push(
      `control-section:${TOOLCRAFT_ARTIFACT_ACTION_SECTION_ID}`,
      `control-target:${TOOLCRAFT_ARTIFACT_ACTION_TARGET}`,
    );
  }

  rejectDuplicateOwnershipKeys(workingOwnership);
  const ownership = Object.freeze(
    workingOwnership
      .sort((left, right) =>
        left.contributionId.localeCompare(right.contributionId),
      )
      .map((entry) =>
        Object.freeze({
          contributionId: entry.contributionId,
          kind: entry.kind,
          moduleId: entry.moduleId,
          ownershipKeys: Object.freeze([...entry.ownershipKeys].sort()),
        }),
      ),
  );

  return Object.freeze({
    actionContributions: Object.freeze(actionContributions),
    canvasBehaviorContributions: Object.freeze(canvasBehaviorContributions),
    mediaPolicyContributions: Object.freeze(mediaPolicyContributions),
    ownership,
    persistenceContributions: Object.freeze(persistenceContributions),
    settingsContributions: Object.freeze(settingsContributions),
    surfaceContributions: Object.freeze(surfaceContributions),
  });
}
