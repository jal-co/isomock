import {
  defineToolcraft,
  type ResolvedToolcraftAppSchema,
  type ToolcraftProductDefinition,
} from "@/toolcraft/runtime";

import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
  ToolcraftFiniteSelectorInventoryEntry,
  ToolcraftProductReadiness,
  ToolcraftTransferMode,
} from "./acceptance/types";
import { isToolcraftProductSectionControl } from "./acceptance/controls";
import {
  validateToolcraftAcceptanceDiagnostics,
  validateToolcraftAcceptanceCoverage,
  type ToolcraftAcceptanceValidationInput,
} from "./acceptance/validate-coverage";

export function defineContractSchemaFixture(
  definition: ToolcraftProductDefinition,
) {
  return defineToolcraft(definition);
}

export const contractSchemaFixture = defineContractSchemaFixture({
  base: {
    canvas: {
      enabled: true,
    },
    identity: {
      id: "contract-fixture",
      title: "Contract fixture",
    },
    panels: {
      controls: {
        sections: [],
        title: "Controls",
      },
    },
    persistence: { storage: "none" },
    toolbar: {
      history: true,
      radar: true,
      zoom: true,
    },
  },
  modules: [],
});

export const contractAcceptanceFixture: readonly ToolcraftComponentAcceptance[] =
  [];

export const contractSectionInventoryFixture: readonly ToolcraftControlSectionInventoryEntry[] =
  [];

type ContractSectionInventoryIntent = Readonly<{
  entity: string;
  entityId: string;
  finiteSelectors: readonly ToolcraftFiniteSelectorInventoryEntry[];
  groupingReason: string;
  id: string;
  splitReason?: string;
  targets?: readonly string[];
  title?: string;
  workflowStage?: string;
}>;

export function createContractSectionInventoryFixture(
  schema: ResolvedToolcraftAppSchema,
  intents: readonly ContractSectionInventoryIntent[],
): readonly ToolcraftControlSectionInventoryEntry[] {
  return intents.map((intent) => {
    const section = schema.panels.controls?.sections.find(
      ({ id }) => id === intent.id,
    );
    const targets = intent.targets ?? Object.values(section?.controls ?? {})
      .filter(isToolcraftProductSectionControl)
      .map(({ target }) => target);

    return {
      entity: intent.entity,
      entityId: intent.entityId,
      finiteSelectors: intent.finiteSelectors,
      groupingReason: intent.groupingReason,
      id: intent.id,
      splitReason: intent.splitReason,
      targets,
      title: intent.title ?? section?.title ?? intent.entity,
      workflowStage: intent.workflowStage,
    };
  });
}

export const contractTransferModeFixture: ToolcraftTransferMode = {
  animationIntent: { mode: "none" },
  mode: "new-toolcraft-app",
  referenceInputs: [],
};

export const contractProductReadinessFixture: ToolcraftProductReadiness = {
  mode: "starter",
  reason: "Neutral contract fixture without a product-owned spatial scene.",
};

type ContractAcceptanceOverrides = Omit<
  Partial<ToolcraftAcceptanceValidationInput>,
  "schema"
> & {
  schema?: ContractValidationSchemaFixture;
};

type ContractValidationSchemaFixture = ResolvedToolcraftAppSchema;

function resolveContractAcceptanceInput(
  overrides: ContractAcceptanceOverrides,
): ToolcraftAcceptanceValidationInput {
  const { schema = contractSchemaFixture, ...remainingOverrides } = overrides;

  return {
    acceptance: contractAcceptanceFixture,
    productReadiness: contractProductReadinessFixture,
    schema,
    sectionInventory: contractSectionInventoryFixture,
    transferMode: contractTransferModeFixture,
    ...remainingOverrides,
  };
}

export function validateContractAcceptance(
  overrides: ContractAcceptanceOverrides = {},
): string[] {
  return validateToolcraftAcceptanceCoverage(
    resolveContractAcceptanceInput(overrides),
  );
}

export function validateContractAcceptanceDiagnostics(
  overrides: ContractAcceptanceOverrides = {},
) {
  return validateToolcraftAcceptanceDiagnostics(
    resolveContractAcceptanceInput(overrides),
  );
}
