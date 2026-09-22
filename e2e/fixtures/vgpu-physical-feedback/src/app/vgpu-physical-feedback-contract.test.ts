const fixtureSource = import.meta.url.includes("/e2e/fixtures/vgpu-physical-feedback/");
if (fixtureSource && process.env.VITEST) {
  const { it } = await import("vitest");
  it.skip("VGPU contract fixture source is inert before installation", () => {});
}
if (!fixtureSource) {
  const [vitest, runtime, performance, workload, composition, schema] =
    await Promise.all([
      import("vitest"),
      import("@/toolcraft/runtime"),
      import("./app-performance"),
      import("./feedback-workload"),
      import("./app-composition"),
      import("./app-schema"),
    ]);
  const { describe, expect, it } = vitest;

  describe("VGPU physical feedback pipeline contract", () => {
    it("physical feedback controls change deterministic pixels", () => {
      expect(
        performance.appRendererPipelineRegistration.passes.map(({ id }) => id),
      ).toEqual([
        "resources",
        "preview-simulate",
        "preview-present",
        "export-simulate",
        "export-present",
      ]);
      expect(performance.appRendererPipelineRegistration.passes).toMatchObject([
        {
          cost: { dimensions: [], frequency: "once", relationship: "constant" },
          id: "resources",
          lifecycle: { cache: "retained-resource", resourceScope: "renderer" },
        },
        {
          cost: {
            dimensions: ["preview-pixels", "replay-steps"],
            frequency: "frame",
            relationship: "product",
          },
          gpu: {
            resources: "storage-textures",
            stage: "compute",
            state: "feedback",
            surfaces: ["preview"],
          },
          id: "preview-simulate",
          lifecycle: { cache: "none", resourceScope: "call" },
        },
        {
          cost: {
            dimensions: ["preview-pixels"],
            frequency: "frame",
            relationship: "linear",
          },
          gpu: {
            resources: "sampled-textures",
            stage: "render",
            state: "stateless",
            surfaces: ["preview"],
          },
          id: "preview-present",
          lifecycle: { cache: "none", resourceScope: "call" },
        },
        { id: "export-simulate", cost: { dimensions: ["export-pixels", "replay-steps"], relationship: "product" } },
        { id: "export-present", cost: { dimensions: ["export-pixels"], relationship: "linear" } },
      ]);
      const coverageErrors = runtime.validateToolcraftPerformanceCoverage(
        schema.appSchema,
        performance.appPerformance,
      );
      expect(coverageErrors).toHaveLength(2);
      expect(coverageErrors).toEqual([
        expect.stringContaining("protected kernel benchmark decision"),
        expect.stringContaining("protected kernel benchmark decision"),
      ]);
    });
    it("physical feedback uses selected backing pixels", () => {
      const dimensions = performance.appPerformance.workloadEnvelope.dimensions;
      const previewPixels = dimensions.find(({ id }) => id === "preview-pixels");
      const replaySteps = dimensions.find(({ id }) => id === "replay-steps");
      expect(previewPixels).toMatchObject({
        id: "preview-pixels",
        interactiveMax: 44_736_000,
        mapping: "direct",
      });
      expect(replaySteps).toMatchObject({
        batchMax: 25,
        interactiveMax: 25,
      });
    });
    it("physical feedback uses runtime scene bounds", () => {
      expect(composition.physicalFeedbackSceneBounds).toEqual({
        height: 128,
        width: 192,
        x: -96,
        y: -64,
      });
    });
    it("physical feedback resets on backward timeline", () => {
      const invalidations =
        performance.appRendererPipelineRegistration.interactionInvalidation;
      for (const interaction of [
        "control-drag",
        "timeline-playback",
        "timeline-scrub",
      ]) {
        expect(invalidations).toContainEqual(
          expect.objectContaining({
            interaction,
            invalidates: expect.arrayContaining(["preview-simulate", "preview-present"]),
            mustNotInvalidate: ["resources"],
            retainedAccesses: ["resources"],
          }),
        );
      }
      expect(invalidations).toContainEqual(
        expect.objectContaining({
          interaction: "export",
          invalidates: ["export-simulate", "export-present"],
          mustNotInvalidate: ["resources"],
          retainedAccesses: ["resources"],
        }),
      );
    });
    it("invalidates every reachable backing configuration without retiring resources", () => {
      expect(
        performance.appRendererPipelineRegistration.interactionInvalidation,
      ).toContainEqual({
        interaction: "control-change",
        invalidates: ["preview-simulate", "preview-present"],
        mustNotInvalidate: ["resources"],
        retainedAccesses: ["resources"],
        targets: [
          "canvas.infinity",
          "canvas.aspectRatio",
          "canvas.size.width",
          "canvas.size.height",
          "canvas.renderScale",
        ],
      });
      expect(
        performance.appRendererPipelineRegistration.interactionInvalidation,
      ).toContainEqual({
        interaction: "control-change",
        invalidates: ["resources", "preview-present"],
        preparationInvalidates: ["preview-simulate"],
        targets: ["simulation.enabled:disable"],
      });
      expect(
        performance.appRendererPipelineRegistration.interactionInvalidation,
      ).toEqual(expect.arrayContaining([
        expect.objectContaining({
          invalidates: ["resources", "preview-simulate", "preview-present"],
          targets: ["simulation.enabled:enable"],
        }),
        expect.objectContaining({
          retainedAccesses: ["resources"],
          targets: ["export.includeBackground"],
        }),
      ]));
    });
    it("physical feedback coalesces viewport activity", () => {
      expect(
        performance.appRendererPipelineRegistration.interactionInvalidation,
      ).toContainEqual(
        expect.objectContaining({
          interaction: "viewport-drag",
          invalidates: ["preview-simulate", "preview-present"],
          mustNotInvalidate: ["resources"],
          retainedAccesses: ["resources"],
        }),
      );
    });
    it("physical feedback canvas zoom coalesces and resumes", () => {
      expect(
        performance.appRendererPipelineRegistration.interactionInvalidation,
      ).toContainEqual(
        expect.objectContaining({
          interaction: "viewport-zoom",
          invalidates: ["preview-simulate", "preview-present"],
          mustNotInvalidate: ["resources"],
          retainedAccesses: ["resources"],
        }),
      );
    });
    it("physical feedback export is deterministic", () => {
      expect(performance.appPerformance.workloadEnvelope.dimensions).toEqual([
        expect.objectContaining({
          id: "preview-pixels",
          interactiveMax: 44_736_000,
          mapping: "direct",
        }),
        expect.objectContaining({
          batchMax: 8_192,
          id: "export-long-edge",
          mapping: "custom",
        }),
        expect.objectContaining({
          batchMax: 44_736_512,
          id: "export-pixels",
          mapping: "direct",
        }),
        expect.objectContaining({
          batchMax: 25,
          customMappingReason: expect.stringContaining(
            "floor(seconds times twelve)",
          ),
          id: "replay-steps",
          interactiveMax: 25,
          mapping: "direct",
        }),
      ]);
      const adapters = workload.physicalFeedbackFixtureAdapters.dimensions;
      expect(adapters["replay-steps"]).toMatchObject({
        domain: {
          kind: "runtime-state",
          path: "renderer.replaySteps",
        },
        entries: Array.from({ length: 25 }, (_, index) => ({
          appliedValue: index + 1,
          value: index + 1,
        })),
        kind: "exhaustive-discrete",
      });
      expect(adapters["replay-steps"].apply(25)).toBe(25);
      expect(adapters["replay-steps"].observe(25)).toBe(25);
      expect(() => adapters["replay-steps"].apply(12.5)).toThrow(
        /not in the exhaustive domain/u,
      );
      expect(adapters["export-pixels"].apply(44_736_512)).toBe("8k");
      expect(adapters["export-pixels"].observe("8k")).toBe(44_736_512);
      const exportPath = runtime
        .deriveToolcraftPerformancePaths(
          schema.appSchema,
          performance.appPerformance,
        )
        .find(({ interaction }) => interaction === "export");
      expect(exportPath).toMatchObject({
        invalidates: ["export-present", "export-simulate"],
        workloadDimensions: ["export-pixels", "replay-steps"],
      });
      if (!exportPath) throw new Error("The export path must exist.");
      const plan = runtime.compileToolcraftPerformanceFixturePlan(
        performance.appPerformance,
        exportPath,
      );
      expect(
        runtime.executeToolcraftPerformanceFixtureCheckpoint(
          performance.appPerformance,
          plan,
          "maximum",
        ).observed,
      ).toMatchObject({ "export-pixels": 44_736_512, "replay-steps": 25 });
    });
  });
}
