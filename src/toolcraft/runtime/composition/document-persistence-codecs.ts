import { readToolcraftControlRanges } from "../state/control-ranges";
import type { ToolcraftWorkspaceSliceCodec } from "../state/persistence-codec-types";
import type { ToolcraftState } from "../state/types";
import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import { getToolcraftPersistedValueTargets } from "../state/persistence-value-targets";
import { readCanvas } from "../state/persistence-reader-canvas";
import { readPanels } from "../state/persistence-reader-panels";
import { readValues } from "../state/persistence-reader-values";

function pickPersistedValues(
  state: ToolcraftState,
  persistence: Extract<ResolvedToolcraftAppSchema["persistence"], { storage: "localStorage" }>,
): Record<string, unknown> | undefined {
  const values: Record<string, unknown> = {};
  const targets = getToolcraftPersistedValueTargets(
    state.defaults,
    persistence.additionalValueTargets,
  );

  for (const target of targets) {
    if (Object.hasOwn(state.values, target)) {
      values[target] = state.values[target];
    }
  }

  return Object.keys(values).length > 0 ? values : undefined;
}

export const documentPersistenceCodecs = {
  values: {
    fields: ["values", "controlRanges"],
    read: (schema, data) => {
      const values = readValues(schema, data.values);
      return {
        ...(values ? { values } : {}),
        ...(data.controlRanges === undefined
          ? {}
          : { controlRanges: readToolcraftControlRanges(schema, data.controlRanges) }),
      };
    },
    write: (state, schema) => ({
      ...(Object.keys(state.controlRanges).length ? { controlRanges: state.controlRanges } : {}),
      values:
        schema.persistence.storage === "localStorage"
          ? pickPersistedValues(state, schema.persistence)
          : undefined,
    }),
  },
  canvas: {
    fields: ["canvas"],
    read: (_schema, data) => {
      const canvas = readCanvas(data.canvas);
      return canvas ? { canvas } : undefined;
    },
    // Persist the visible frame as a restoration hint, never pending measurements.
    write: ({ canvas }) => ({ canvas }),
  },
  panels: {
    fields: ["panels"],
    read: (schema, data) => {
      const panels = readPanels(schema, data.panels);
      return panels ? { panels } : undefined;
    },
    write: (state) => ({ panels: state.panels }),
  },
} satisfies Record<string, ToolcraftWorkspaceSliceCodec>;
