import {
  defineToolcraft,
  type ToolcraftControlSchema,
} from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";

import { getToolcraftControlApplicabilityErrors } from "./acceptance/control-applicability";
import type { ToolcraftProductReadiness } from "./acceptance/types";
import { collectToolcraftVisibleAcceptanceControls } from "./acceptance/validate-coverage";

const productReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: { mode: "toolcraft-default" },
    svg: { mode: "not-requested" },
    video: { mode: "not-requested" },
  },
  interactionOwnership: [],
  mode: "product",
  productName: "Shape fixture",
  productSummary: "Neutral applicability contract fixture.",
  requestedBehavior: "Show only controls that apply to the selected shape.",
  viewInteraction: { mode: "non-spatial", reason: "Schema-only fixture." },
};

const shapeKind: ToolcraftControlSchema = {
  applicability: { mode: "always" },
  defaultValue: "circle",
  options: [
    { label: "Circle", value: "circle" },
    { label: "Square", value: "square" },
    { label: "Polygon", value: "polygon" },
    { label: "Star", value: "star" },
  ],
  target: "shape.kind",
  type: "segmented",
};

const alwaysControls: Record<string, ToolcraftControlSchema> = {
  kind: shapeKind,
  cornerRadius: {
    applicability: {
      all: [
        {
          oneOf: ["square", "polygon", "star"],
          target: "shape.kind",
        },
      ],
      mode: "conditional",
    },
    target: "shape.cornerRadius",
    type: "slider",
  },
  depth: {
    applicability: {
      all: [{ equals: "star", target: "shape.kind" }],
      mode: "conditional",
    },
    target: "shape.depth",
    type: "slider",
  },
  sides: {
    applicability: {
      all: [{ oneOf: ["polygon", "star"], target: "shape.kind" }],
      mode: "conditional",
    },
    target: "shape.sides",
    type: "slider",
  },
};

function validateProduct(
  controls: Record<string, ToolcraftControlSchema>,
): string[] {
  const schema = defineToolcraft({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [{ controls, id: "shape", title: "Shape" }],
          title: "Controls",
        },
      },
    },
    modules: [],
  });

  return getToolcraftControlApplicabilityErrors({
    controls: collectToolcraftVisibleAcceptanceControls(schema),
    productReadiness,
  });
}

describe("starter product control applicability", () => {
  it("rejects missing applicability and legacy visibility at the authored boundary", () => {
    if (false) {
      validateProduct({
        kind: shapeKind,
        // @ts-expect-error Product controls require explicit applicability.
        sides: { target: "shape.sides", type: "slider" },
      });

      validateProduct({
        kind: shapeKind,
        sides: {
          target: "shape.sides",
          type: "slider",
          // @ts-expect-error Product controls cannot author legacy visibleWhen.
          visibleWhen: { equals: "star", target: "shape.kind" },
        },
      });
    }

    expect(validateProduct(alwaysControls)).toEqual([]);
  });

  it("rejects missing, invalid, contradictory, and unsupported selectors", () => {
    expect(
      validateProduct({
        kind: shapeKind,
        sides: {
          applicability: {
            all: [{ equals: true, target: "shape.missing" }],
            mode: "conditional",
          },
          target: "shape.sides",
          type: "slider",
        },
      }),
    ).toContainEqual(
      expect.stringContaining(
        'predicate target "shape.missing" does not exist',
      ),
    );

    expect(
      validateProduct({
        kind: shapeKind,
        sides: {
          applicability: {
            all: [{ equals: "triangle", target: "shape.kind" }],
            mode: "conditional",
          },
          target: "shape.sides",
          type: "slider",
        },
      }),
    ).toContainEqual(
      expect.stringContaining(
        'value "triangle" is not an option of shape.kind',
      ),
    );

    expect(
      validateProduct({
        kind: shapeKind,
        sides: {
          applicability: {
            all: [
              { equals: "polygon", target: "shape.kind" },
              { equals: "star", target: "shape.kind" },
            ],
            mode: "conditional",
          },
          target: "shape.sides",
          type: "slider",
        },
      }),
    ).toContainEqual(
      expect.stringContaining("shape.sides applicability is unsatisfiable"),
    );

    expect(
      validateProduct({
        kind: shapeKind,
        name: {
          applicability: { mode: "always" },
          target: "shape.name",
          type: "text",
        },
        sides: {
          applicability: {
            all: [{ equals: "named", target: "shape.name" }],
            mode: "conditional",
          },
          target: "shape.sides",
          type: "slider",
        },
      }),
    ).toContainEqual(
      expect.stringContaining(
        "shape.name is not a supported applicability selector",
      ),
    );
  });

  it("rejects numeric gates with no satisfying selector value", () => {
    expect(
      validateProduct({
        count: {
          applicability: { mode: "always" },
          defaultValue: 2,
          max: 3,
          min: 1,
          step: 1,
          target: "shape.count",
          type: "slider",
          variant: "discrete",
        },
        sides: {
          applicability: {
            all: [{ greaterThan: 10, target: "shape.count" }],
            mode: "conditional",
          },
          target: "shape.sides",
          type: "slider",
        },
      }),
    ).toContainEqual(
      expect.stringContaining(
        "shape.sides has no satisfying value in shape.count",
      ),
    );
  });

  it("accepts a complete finite applicability declaration", () => {
    expect(validateProduct(alwaysControls)).toEqual([]);
  });
});
