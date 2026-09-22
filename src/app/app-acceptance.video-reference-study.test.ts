import { describe, expect, it } from "vitest";

import {
  contractAcceptanceFixture,
  contractSchemaFixture,
  contractTransferModeFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";

describe("starter acceptance motion reference pipeline", () => {
  it("does not infer reference authority from prose when referenceInputs is explicitly empty", () => {
    expect(
      validateContractAcceptance({
        acceptance: contractAcceptanceFixture,
        schema: contractSchemaFixture,
        transferMode: {
          ...contractTransferModeFixture,
          animationIntent: {
            mode: "autonomous",
            behaviorCoverage: [
              "no-duration-control",
              "no-export-at-time",
              "no-loop-control",
              "no-play-pause",
              "no-scrub",
              "no-user-facing-transport",
            ],
            reason:
              "A decorative loop happens to mention an inspected video but owns no product time transport.",
          },
          referenceInputs: [],
        },
      }),
    ).toEqual([]);
  });

  it("routes explicit normalized reference inputs through the semantic validator", () => {
    expect(
      validateContractAcceptance({
        acceptance: contractAcceptanceFixture,
        schema: contractSchemaFixture,
        transferMode: {
          ...contractTransferModeFixture,
          referenceInputs: [
            {
              behaviors: [],
              kind: "motion-reference",
              referenceId:
                "motion-reference-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              studies: [],
            },
          ],
        },
      }),
    ).toContain(
      'motion reference "motion-reference-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" must declare at least one study.',
    );
  });

});
