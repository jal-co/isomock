const fixtureSource = import.meta.url.includes(
  "/e2e/fixtures/vgpu-physical-feedback/",
);

if (fixtureSource && process.env.VITEST) {
  const { it } = await import("vitest");
  it.skip("VGPU performance fixture source is inert before installation", () => {});
}

if (!fixtureSource) {
  const [vitest, performance, runtime, fixtures, browserAdapters] =
    await Promise.all([
      import("vitest"),
      import("./app-performance"),
      import("@/toolcraft/runtime"),
      import("./feedback-performance-fixture"),
      import("../../e2e/app-performance-path-adapters"),
    ]);
  const { describe, expect, it } = vitest;

  describe("VGPU physical feedback executable workload", () => {
    it("binds every canonical path to its exact workload dimensions", () => {
      const available = Object.fromEntries(
        performance.appPerformance.workloadEnvelope.dimensions.map(({ id }) => [
          id,
          Object.freeze({ id }),
        ]),
      );
      for (const path of performance.appPerformancePaths) {
        const selected = fixtures.selectPhysicalFeedbackFixtureApplications(
          available,
          path.workloadDimensions,
        );
        expect(Object.keys(selected)).toEqual([...path.workloadDimensions]);
        const browserAdapter = browserAdapters.appPerformancePathAdapters.find(
          ({ pathId }) => pathId === path.id,
        );
        expect(browserAdapter).toBeDefined();
        if (path.workloadDimensions.length === 0) {
          expect(browserAdapter?.fixtureApplications).toBeUndefined();
        } else {
          expect(
            Object.keys(browserAdapter!.fixtureApplications!({} as never)),
          ).toEqual([...path.workloadDimensions]);
        }
      }
      expect(() =>
        fixtures.selectPhysicalFeedbackFixtureApplications(
          available,
          ["missing-dimension"],
        ),
      ).toThrow(/missing-dimension/u);
    });

    it("registers phase preparation for every stateful sequential path", () => {
      const statefulPaths = performance.appPerformancePaths.filter(
        ({ interaction, targets }) =>
          interaction === "control-drag" ||
          interaction === "timeline-playback" ||
          targets.some((target) => target.startsWith("simulation.enabled:")),
      );
      expect(statefulPaths).toHaveLength(4);
      for (const path of statefulPaths) {
        const adapter = browserAdapters.appPerformancePathAdapters.find(
          ({ pathId }) => pathId === path.id,
        );
        expect(adapter?.preparePhase).toBeTypeOf("function");
        expect(adapter?.settlePhase).toBeTypeOf("function");
        expect(adapter?.action).toBeTypeOf("function");
        expect(adapter?.observeOutcome).toBeTypeOf("function");
      }
    });

    it("round-trips every exact replay dispatch count through observable state", () => {
      for (let steps = 1; steps <= 25; steps += 1) {
        const seconds = fixtures.getPhysicalFeedbackReplayFixtureSeconds(steps);
        expect(fixtures.getPhysicalFeedbackReplaySteps(seconds)).toBe(steps);
        expect(
          performance.appPerformance.fixtureAdapters?.dimensions[
            "replay-steps"
          ]?.apply(steps),
        ).toBe(steps);
        expect(
          performance.appPerformance.fixtureAdapters?.dimensions[
            "replay-steps"
          ]?.observe(steps),
        ).toBe(steps);
      }
    });

    it("compiles development and maximum fixtures for every preview path", () => {
      const previewPaths = performance.appPerformancePaths.filter(
        (path) =>
          path.profile !== "batch-responsive" &&
          path.invalidates.includes("preview-present"),
      );
      const targets = new Set(previewPaths.flatMap((path) => path.targets));
      for (const target of [
        "canvas.infinity",
        "canvas.size.height",
        "canvas.size.width",
        "canvas.renderScale",
        "timeline.time",
        "canvas.viewport.offset",
        "canvas.viewport.zoom",
        "simulation.enabled:disable",
        "simulation.enabled:enable",
      ]) {
        expect(targets.has(target)).toBe(true);
      }
      for (const path of previewPaths) {
        const plan = runtime.compileToolcraftPerformanceFixturePlan(
          performance.appPerformance,
          path,
        );
        expect(
          plan.development,
          `${path.interaction} ${path.targets.join(",")}: ${
            "reason" in plan.development ? plan.development.reason : "available"
          }`,
        ).toMatchObject({ status: "available" });
        if (plan.development.status !== "available") {
          throw new Error(plan.development.reason);
        }
        expect(plan.development.checkpoint.normalizedPressure).toBeCloseTo(0.8, 4);
        for (const fixture of ["development", "maximum"] as const) {
          const executed = runtime.executeToolcraftPerformanceFixtureCheckpoint(
            performance.appPerformance,
            plan,
            fixture,
          );
          for (const [dimensionId, value] of Object.entries(executed.values)) {
            expect(executed.observed[dimensionId]).toBeCloseTo(value, 6);
          }
        }
        if (path.workloadDimensions.includes("preview-pixels")) {
          const development = runtime.executeToolcraftPerformanceFixtureCheckpoint(
            performance.appPerformance,
            plan,
            "development",
          );
          expect(development.values["preview-pixels"]).toBeGreaterThan(256_000);
        }
      }
    });

    it("keeps preview and export pixel ownership surface-specific", () => {
      const previewPaths = performance.appPerformancePaths.filter((path) =>
        path.invalidates.includes("preview-present"),
      );
      expect(previewPaths.every((path) =>
        path.workloadDimensions.includes("preview-pixels") &&
        !path.workloadDimensions.includes("export-pixels"),
      )).toBe(true);
      const exportPath = performance.appPerformancePaths.find(
        ({ interaction }) => interaction === "export",
      );
      expect(exportPath).toMatchObject({
        invalidates: ["export-present", "export-simulate"],
        workloadDimensions: ["export-pixels", "replay-steps"],
      });
      if (!exportPath) throw new Error("Missing export performance path.");
      const plan = runtime.compileToolcraftPerformanceFixturePlan(
        performance.appPerformance,
        exportPath,
      );
      expect(plan.kind).toBe("batch");
      expect(
        performance.appPerformance.workloadEnvelope.dimensions.find(
          ({ id }) => id === "export-pixels",
        ),
      ).toMatchObject({ defaultValue: 11_186_176, batchMax: 44_736_512 });
      const exportAdapter = performance.appPerformance.fixtureAdapters?.dimensions[
        "export-pixels"
      ];
      expect(exportAdapter?.apply(11_186_176)).toBe("4k");
      expect(exportAdapter?.observe("4k")).toBe(11_186_176);
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
