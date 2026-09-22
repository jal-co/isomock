const fixtureSource = import.meta.url.includes(
  "/e2e/fixtures/vgpu-physical-feedback/",
);

if (fixtureSource && process.env.VITEST) {
  const { it } = await import("vitest");
  it.skip("VGPU operation fixture source is inert before installation", () => {});
}

if (!fixtureSource) {
  const [vitest, performance, pipeline, runtime, feedbackOperations, feedbackExport] =
    await Promise.all([
      import("vitest"),
      import("./app-performance"),
      import("./pipeline"),
      import("@/toolcraft/runtime"),
      import("./feedback-operations"),
      import("./feedback-export"),
    ]);
  const { describe, expect, it } = vitest;
  type Resource = Awaited<
    ReturnType<typeof pipeline.createPhysicalFeedbackResource>
  >;
  type SimulationInput = Parameters<Resource["simulate"]>[0];
  type Simulation = Awaited<ReturnType<Resource["simulate"]>>;

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((resolvePromise) => {
      resolve = resolvePromise;
    });
    return { promise, resolve };
  }

  const createSimulation = (
    input: SimulationInput,
    simulationVersion: number,
  ): Simulation =>
    Object.freeze({ ...input, simulationVersion, status: "ready" });

  let nextEvidenceAllocationId = 1;

  const createEvidenceResource = (
    snapshot: () => { frameCount: number; renderedTime: number },
    simulate: Resource["simulate"],
  ) => {
    const allocationId = nextEvidenceAllocationId;
    nextEvidenceAllocationId += 1;
    return ({
      getAttributes: () => ({
        "aria-label": "VGPU target-readback presentation is ready.",
        "data-toolcraft-gpu-status": "ready" as const,
      }),
      getSnapshot: () => ({
        ...snapshot(),
        presentationAllocationId: allocationId,
        resourceAllocationId: allocationId,
      }),
      simulate,
    }) as Resource;
  };

  const retain = (
    context: Parameters<
      Parameters<
        typeof pipeline.executePhysicalFeedbackPasses
      >[0]["createResource"]
    >[0],
    resource: Resource,
  ) =>
    context.getOrCreateResource(["feedback"], () => resource, () => undefined);

  describe("VGPU physical feedback operation ownership", () => {
    it("exports no disabled field and leaves the runtime background untouched", async () => {
      const allocate = vitest.vi
        .spyOn(pipeline, "createPhysicalFeedbackResource")
        .mockRejectedValue(new Error("Disabled export must not allocate GPU resources."));
      const execute = vitest.vi
        .spyOn(pipeline, "executePhysicalFeedbackPasses")
        .mockRejectedValue(new Error("Disabled export must not execute GPU passes."));
      const context = {
        clearRect: vitest.vi.fn(),
        drawImage: vitest.vi.fn(),
        fillRect: vitest.vi.fn(),
        restore: vitest.vi.fn(),
        save: vitest.vi.fn(),
      };
      try {
        for (const includeBackground of [true, false]) {
          await expect(
            feedbackExport.physicalFeedbackExportRenderer.renderFrame({
              context: context as unknown as CanvasRenderingContext2D,
              frame: { height: 16, width: 16, x: 0, y: 0 },
              pixelRatio: 1,
              rendererPipeline: null,
              state: {
                timeline: { durationSeconds: 2 },
                values: {
                  "export.includeBackground": includeBackground,
                  "simulation.enabled": false,
                  "simulation.impulse": 0.5,
                },
              } as never,
              timeSeconds: 0,
              timelineProgress: 0,
            }),
          ).resolves.toBeUndefined();
        }
        expect(allocate).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
        for (const method of Object.values(context)) {
          expect(method).not.toHaveBeenCalled();
        }
      } finally {
        allocate.mockRestore();
        execute.mockRestore();
      }
    });

    it("executes each surface simulation and every destination presentation", async () => {
      const rendererPipeline = runtime.createToolcraftRendererPipelineRuntime(
        performance.appRendererPipelineRegistration,
      );
      const simulated: Array<readonly [number, number]> = [];
      const presented: Array<readonly [string, number, number]> = [];
      let version = 0;
      const resource = createEvidenceResource(
        () => ({ frameCount: presented.length, renderedTime: 0.25 }),
        async (input) => {
          simulated.push([input.width, input.height]);
          return createSimulation(input, ++version);
        },
      );
      const execute = (destination: string, width = 16, height = 16) =>
        pipeline.executePhysicalFeedbackPasses({
          createResource: (context) => retain(context, resource),
          destination: (_resource, simulation) => {
            presented.push([destination, simulation.width, simulation.height]);
          },
          rendererPipeline,
          simulationInput: { height, impulse: 0.5, time: 0.25, width },
          surface: destination === "preview" ? "preview" : "export",
        });

      const firstOutcome = await execute("export-a");
      await execute("export-b");
      await execute("preview");
      await execute("export-after-preview");
      await execute("export-resized", 24, 12);

      expect(simulated).toEqual([
        [16, 16],
        [16, 16],
        [16, 16],
        [16, 16],
        [24, 12],
      ]);
      expect(firstOutcome).not.toHaveProperty("resource");
      expect(presented).toEqual([
        ["export-a", 16, 16],
        ["export-b", 16, 16],
        ["preview", 16, 16],
        ["export-after-preview", 16, 16],
        ["export-resized", 24, 12],
      ]);
      expect(rendererPipeline.getSnapshot().passes).toMatchObject({
        "export-present": { executions: 4 },
        "export-simulate": { executions: 4 },
        "preview-present": { executions: 1 },
        "preview-simulate": { executions: 1 },
        resources: { cacheHits: 4, executions: 1, resourceCreations: 1 },
      });
      await rendererPipeline.dispose();
    });

    it("serializes changed simulation through completed presentation", async () => {
      const rendererPipeline = runtime.createToolcraftRendererPipelineRuntime(
        performance.appRendererPipelineRegistration,
      );
      const started = deferred();
      const release = deferred();
      const events: string[] = [];
      let version = 0;
      const resource = createEvidenceResource(
        () => ({ frameCount: events.length, renderedTime: 1 }),
        async (input) => {
          events.push(`simulate:${input.width}`);
          return createSimulation(input, ++version);
        },
      );
      const execute = (key: "preview" | "export", width: number) =>
        pipeline.executePhysicalFeedbackPasses({
          createResource: (context) => retain(context, resource),
          destination: async () => {
            events.push(`present:${key}:start`);
            if (key === "preview") {
              started.resolve();
              await release.promise;
            }
            events.push(`present:${key}:end`);
          },
          rendererPipeline,
          simulationInput: { height: 16, impulse: 0.5, time: width / 64, width },
          surface: key,
        });

      const preview = execute("preview", 16);
      await started.promise;
      const exported = execute("export", 32);
      await Promise.resolve();
      expect(events).not.toContain("simulate:32");
      release.resolve();
      await Promise.all([preview, exported]);
      expect(events).toEqual([
        "simulate:16",
        "present:preview:start",
        "present:preview:end",
        "simulate:32",
        "present:export:start",
        "present:export:end",
      ]);
      expect(rendererPipeline.getSnapshot().passes).toMatchObject({
        "export-present": { executions: 1 },
        "export-simulate": { executions: 1 },
        "preview-present": { executions: 1 },
        "preview-simulate": { executions: 1 },
        resources: { cacheHits: 1, executions: 1 },
      });
      await rendererPipeline.dispose();
    });

    it("releases the operation queue after a failed destination", async () => {
      const rendererPipeline = runtime.createToolcraftRendererPipelineRuntime(
        performance.appRendererPipelineRegistration,
      );
      const events: string[] = [];
      let version = 0;
      const resource = createEvidenceResource(
        () => ({ frameCount: events.length, renderedTime: 0 }),
        async (input) => {
          events.push(`simulate:${input.impulse}`);
          return createSimulation(input, ++version);
        },
      );
      const execute = (key: "failed" | "next", impulse: number) =>
        pipeline.executePhysicalFeedbackPasses({
          createResource: (context) => retain(context, resource),
          destination: () => {
            events.push(`present:${key}`);
            if (key === "failed") throw new Error("presentation failed");
          },
          rendererPipeline,
          simulationInput: { height: 16, impulse, time: 0, width: 16 },
          surface: "preview",
        });

      const failed = execute("failed", 0.25);
      const next = execute("next", 0.75);
      await expect(failed).rejects.toThrow("presentation failed");
      await expect(next).resolves.toMatchObject({ status: "ready" });
      expect(events).toEqual([
        "simulate:0.25",
        "present:failed",
        "simulate:0.75",
        "present:next",
      ]);
      await rendererPipeline.dispose();
    });

    it("coalesces before pipeline work and submits the current release frame", async () => {
      const rendererPipeline = runtime.createToolcraftRendererPipelineRuntime(
        performance.appRendererPipelineRegistration,
      );
      let stage = feedbackOperations.createPhysicalFeedbackPreviewStage();
      stage = feedbackOperations.planPhysicalFeedbackPreview(stage, 1, true).stage;
      stage = feedbackOperations.planPhysicalFeedbackPreview(stage, 2, true).stage;
      expect(rendererPipeline.getSnapshot().passes).toMatchObject({
        "preview-present": { executions: 0 },
        "preview-simulate": { executions: 0 },
        resources: { executions: 0 },
      });

      const plan = feedbackOperations.planPhysicalFeedbackPreview(stage, 3, false);
      const resource = createEvidenceResource(
        () => ({ frameCount: 1, renderedTime: 0.25 }),
        async (input) => createSimulation(input, 1),
      );
      expect(plan.submission).toBe(3);
      await pipeline.executePhysicalFeedbackPasses({
        createResource: (context) => retain(context, resource),
        destination: () => undefined,
        rendererPipeline,
        simulationInput: { height: 16, impulse: 0.5, time: 0.25, width: 16 },
        surface: "preview",
      });
      expect(rendererPipeline.getSnapshot().passes).toMatchObject({
        "preview-present": { executions: 1 },
        "preview-simulate": { executions: 1 },
        resources: { executions: 1 },
      });
      expect(plan.stage).toEqual({ coalescedFrames: 2, pendingRelease: false });
      expect(plan.releasedCoalescedInput).toBe(true);
      await rendererPipeline.dispose();
    });
  });
}
