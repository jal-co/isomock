import { getToolcraftPersistenceCoverageResult } from "../runtime-coverage";
import type { ToolcraftComponentAcceptance } from "../types";
import { collectToolcraftVisibleAcceptanceControls } from "../validate-coverage";
import {
  contractProductReadinessFixture,
  contractSchemaFixture,
} from "../../app-acceptance.contract-fixtures";
import type { ToolcraftCapabilityProofValidationContext } from "./types";

export function createCapabilityProofValidationContextFixture(
  acceptance: readonly ToolcraftComponentAcceptance[] = [],
  overrides: Partial<ToolcraftCapabilityProofValidationContext> = {},
): ToolcraftCapabilityProofValidationContext {
  const schema = overrides.schema ?? contractSchemaFixture;
  const resolvedAcceptance = Object.freeze([
    ...(overrides.acceptance ?? acceptance),
  ]);

  return Object.freeze({
    ...overrides,
    acceptance: resolvedAcceptance,
    controls:
      overrides.controls ??
      Object.freeze(collectToolcraftVisibleAcceptanceControls(schema)),
    layersEnabled:
      overrides.layersEnabled ?? Boolean(schema.panels.layers),
    persistence:
      overrides.persistence ??
      getToolcraftPersistenceCoverageResult({
        acceptance: resolvedAcceptance,
        schema,
      }),
    productReadiness:
      overrides.productReadiness ?? contractProductReadinessFixture,
    schema,
    timelineMode:
      overrides.timelineMode ??
      (schema.panels.timeline?.enabled ? schema.panels.timeline.mode : null),
  });
}
