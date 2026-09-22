const fixtureSource = import.meta.url.includes(
  "/e2e/fixtures/vgpu-physical-feedback/",
);

if (fixtureSource && process.env.VITEST) {
  const { it } = await import("vitest");
  it.skip("VGPU fixture source is inert before product installation", () => {});
}

if (!fixtureSource) {
  const [
    vitest,
    integration,
    performance,
    pipeline,
    acceptance,
    feedbackCompute,
    feedbackExport,
    appComposition,
    physicalFeedbackRenderer,
  ] =
    await Promise.all([
      import("vitest"),
      import("@/toolcraft/integrations/vgpu"),
      import("./app-performance"),
      import("./pipeline"),
      import("./app-acceptance"),
      import("./feedback-compute"),
      import("./feedback-export"),
      import("./app-composition"),
      import("./use-physical-feedback-renderer"),
    ]);
  const { describe, expect, it } = vitest;

  describe("VGPU physical feedback lifecycle behavior", () => {
    it("rejects backing above the declared GPU boundary before allocation", () => {
      expect(() =>
        feedbackCompute.assertPhysicalFeedbackBackingSize(8192, 5461),
      ).not.toThrow();
      expect(() =>
        feedbackCompute.assertPhysicalFeedbackBackingSize(8192, 5462),
      ).toThrow(/44,736,512 pixels/u);
      expect(() =>
        feedbackCompute.assertPhysicalFeedbackBackingSize(8193, 1),
      ).toThrow(/8,192 px per edge/u);
      expect(() =>
        feedbackCompute.assertPhysicalFeedbackInteractiveBackingSize(8000, 5592),
      ).not.toThrow();
      expect(() =>
        feedbackCompute.assertPhysicalFeedbackInteractiveBackingSize(5463, 8189),
      ).toThrow(/44,736,000-pixel interactive ceiling/u);
    });

    it("assigns panel field controls and canvas viewport navigation to one typed owner", () => {
      const productReadiness = acceptance.appProductReadiness;
      if (productReadiness.mode !== "product") {
        throw new Error("The physical feedback fixture must use product readiness.");
      }
      expect(productReadiness.interactionOwnership).toEqual([
        expect.objectContaining({
          capability: "property-edit",
          id: "field-toggle",
          surface: "panel",
          target: "simulation.enabled",
        }),
        expect.objectContaining({
          capability: "precise-value-entry",
          id: "impulse-entry",
          surface: "panel",
          target: "simulation.impulse",
        }),
        expect.objectContaining({
          capability: "direct-spatial-edit",
          id: "viewport-pan",
          surface: "canvas",
          target: "canvas.setOffset",
        }),
        expect.objectContaining({
          capability: "direct-spatial-edit",
          id: "viewport-zoom",
          surface: "canvas",
          target: "canvas.setViewport",
        }),
      ]);
      expect(
        acceptance.appAcceptance
          .filter(({ interactionId }) => interactionId)
          .map(({ interactionId }) => interactionId),
      ).toEqual([
        "impulse-entry",
        "viewport-pan",
        "viewport-zoom",
        "field-toggle",
      ]);
      const automatedTitles = acceptance.appAcceptance.map(
        ({ automatedTestName }) => automatedTestName,
      );
      const browserTitles = acceptance.appAcceptance.map(
        ({ browser }) => (browser === false ? "" : browser.testName),
      );
      expect(new Set(automatedTitles).size).toBe(automatedTitles.length);
      expect(new Set(browserTitles).size).toBe(browserTitles.length);
    });

    it("cleans the first feedback texture when the second allocation fails", () => {
      const destroyed: string[] = [];
      let allocation = 0;
      expect(() =>
        feedbackCompute.createPhysicalFeedbackTexturePair(
          {
            createTexture() {
              allocation += 1;
              if (allocation === 2) throw new Error("second texture failed");
              return {
                destroy() {
                  destroyed.push("first");
                },
              };
            },
          },
          16,
          16,
          "failure-proof",
        ),
      ).toThrow("second texture failed");
      expect(destroyed).toEqual(["first"]);
    });

    it("attempts every disposal step once and aggregates teardown failures", async () => {
      const calls: string[] = [];
      const owner = feedbackCompute.createPhysicalFeedbackAssetOwner([
        () => {
          calls.push("presentation");
          throw new Error("presentation disposal failed");
        },
        () => {
          calls.push("parameters");
        },
        () => {
          calls.push("feedback");
          throw new Error("feedback disposal failed");
        },
        () => {
          calls.push("provider");
        },
      ]);
      const first = owner.dispose();
      expect(owner.getOwnedStepCount()).toBe(0);
      await expect(first).rejects.toMatchObject({ errors: expect.any(Array) });
      await expect(owner.dispose()).rejects.toBeInstanceOf(AggregateError);
      expect(calls).toEqual([
        "presentation",
        "parameters",
        "feedback",
        "provider",
      ]);
    });

    it("physical feedback rejects unavailable webgpu", async () => {
      const resource = await pipeline.createPhysicalFeedbackResource();
      try {
        await expect(
          resource.simulate({
            height: 5462,
            impulse: 0.5,
            time: 0,
            width: 8192,
          }),
        ).rejects.toThrow(/44,736,512 pixels/u);
        const simulation = await resource.simulate({
          height: 16,
          impulse: 0.5,
          time: 0,
          width: 16,
        });
        const rejection = resource.presentExport({
          context: {} as CanvasRenderingContext2D,
          simulation,
        });
        await expect(rejection).rejects.toBeInstanceOf(
          integration.ToolcraftVgpuExportError,
        );
        await expect(rejection).rejects.toMatchObject({
          code: "vgpu-export-unsupported",
        });
      } finally {
        await resource.dispose();
      }
    });

    it("rejects export without the registered renderer pipeline", async () => {
      await expect(
        feedbackExport.physicalFeedbackExportRenderer.renderFrame({
          context: {} as CanvasRenderingContext2D,
          frame: { height: 16, width: 16, x: 0, y: 0 },
          pixelRatio: 1,
          rendererPipeline: null,
          state: {
            timeline: { durationSeconds: 4 },
            values: { "simulation.impulse": 0.5 },
          } as never,
          timeSeconds: 0,
          timelineProgress: 0,
        }),
      ).rejects.toMatchObject({
        code: "physical-feedback-export-pipeline-required",
        name: "PhysicalFeedbackExportPipelineError",
      });

      await expect(
        feedbackExport.physicalFeedbackExportRenderer.renderFrame({
          context: null as never,
          frame: { height: 16, width: 16, x: 0, y: 0 },
          pixelRatio: 1,
          rendererPipeline: {} as never,
          state: {
            timeline: { durationSeconds: 4 },
            values: { "simulation.impulse": 0.5 },
          } as never,
          timeSeconds: 0,
          timelineProgress: 0,
        }),
      ).rejects.toMatchObject({
        code: "physical-feedback-export-context-required",
        name: "PhysicalFeedbackExportPipelineError",
      });
    });

    it("derives one ready preview target without a canvas mode channel", () => {
      const sceneFrame = {
        kind: "ready",
        rect: appComposition.physicalFeedbackSceneBounds,
      } as const;
      const finiteTarget =
        physicalFeedbackRenderer.getPhysicalFeedbackPreviewTarget({
          devicePixelRatio: 2,
          renderScale: 2,
          sceneFrame,
        });
      const infiniteTarget =
        physicalFeedbackRenderer.getPhysicalFeedbackPreviewTarget({
          devicePixelRatio: 2,
          renderScale: 2,
          sceneFrame: { kind: "ready", rect: { ...sceneFrame.rect } },
        });

      expect(finiteTarget).toEqual({
        backingHeight: 512,
        backingWidth: 768,
        cssHeight: 128,
        cssWidth: 192,
        frame: {
          cssHeight: 128,
          cssWidth: 192,
          devicePixelRatio: 2,
          renderScale: 2,
        },
      });
      expect(infiniteTarget).toEqual(finiteTarget);
      expect(Object.keys(finiteTarget ?? {})).not.toContain("mode");
      for (const kind of ["empty", "unavailable"] as const) {
        expect(
          physicalFeedbackRenderer.getPhysicalFeedbackPreviewTarget({
            devicePixelRatio: 2,
            renderScale: 2,
            sceneFrame: { kind, rect: null },
          }),
        ).toBeNull();
      }
    });

    it("stages export pixels before drawing them into product world coordinates", async () => {
      const calls: string[] = [];
      const stagingCanvas = {
        height: 512,
        id: "staging-canvas",
        width: 768,
      } as unknown as HTMLCanvasElement;
      const stagingContext = {
        id: "staging-context",
      } as unknown as CanvasRenderingContext2D;
      const destinationContext = {
        drawImage(
          source: CanvasImageSource,
          x: number,
          y: number,
          width: number,
          height: number,
        ) {
          expect(source).toBe(stagingCanvas);
          calls.push(`draw:${x},${y},${width},${height}`);
        },
        restore() {
          calls.push("restore");
        },
        save() {
          calls.push("save");
        },
      } satisfies import(
        "./feedback-export"
      ).PhysicalFeedbackExportDestinationContext;

      await feedbackExport.presentPhysicalFeedbackExportFrame({
        createStagingSurface: (width, height) => {
          calls.push(`stage:${width}x${height}`);
          return { canvas: stagingCanvas, context: stagingContext };
        },
        destinationContext,
        frame: appComposition.physicalFeedbackSceneBounds,
        pixelHeight: 512,
        pixelWidth: 768,
        present: (context) => {
          expect(context).toBe(stagingContext);
          expect(context).not.toBe(destinationContext);
          calls.push("present:staging");
        },
      });

      expect(calls).toEqual([
        "stage:768x512",
        "save",
        "present:staging",
        "draw:-96,-64,192,128",
        "restore",
      ]);
      expect(stagingCanvas).toMatchObject({ height: 1, width: 1 });
    });

    it("restores the destination when staged VGPU presentation fails", async () => {
      const calls: string[] = [];
      const stagingContext = {
        id: "staging-context",
      } as unknown as CanvasRenderingContext2D;
      const stagingCanvas = {
        height: 512,
        width: 768,
      } as unknown as HTMLCanvasElement;
      const destinationContext = {
        drawImage() {
          calls.push("draw");
        },
        restore() {
          calls.push("restore");
        },
        save() {
          calls.push("save");
        },
      } satisfies import(
        "./feedback-export"
      ).PhysicalFeedbackExportDestinationContext;

      await expect(
        feedbackExport.presentPhysicalFeedbackExportFrame({
          createStagingSurface: (width, height) => {
            calls.push(`stage:${width}x${height}`);
            return {
              canvas: stagingCanvas,
              context: stagingContext,
            };
          },
          destinationContext,
          frame: appComposition.physicalFeedbackSceneBounds,
          pixelHeight: 512,
          pixelWidth: 768,
          present: (context) => {
            expect(context).toBe(stagingContext);
            expect(context).not.toBe(destinationContext);
            calls.push("present:staging");
            throw new Error("presentation failed");
          },
        }),
      ).rejects.toThrow("presentation failed");
      expect(calls).toEqual([
        "stage:768x512",
        "save",
        "present:staging",
        "restore",
      ]);
      expect(stagingCanvas).toMatchObject({ height: 1, width: 1 });
    });

    it("restores the destination before reporting staging cleanup failure", async () => {
      const calls: string[] = [];
      const stagingCanvas = {
        set height(_value: number) {
          calls.push("release-height");
        },
        set width(_value: number) {
          calls.push("release-width");
          throw new Error("staging cleanup failed");
        },
      } as unknown as HTMLCanvasElement;
      const destinationContext = {
        drawImage() {
          calls.push("draw");
        },
        restore() {
          calls.push("restore");
        },
        save() {
          calls.push("save");
        },
      } satisfies import(
        "./feedback-export"
      ).PhysicalFeedbackExportDestinationContext;

      await expect(
        feedbackExport.presentPhysicalFeedbackExportFrame({
          createStagingSurface: () => ({
            canvas: stagingCanvas,
            context: {} as CanvasRenderingContext2D,
          }),
          destinationContext,
          frame: appComposition.physicalFeedbackSceneBounds,
          pixelHeight: 512,
          pixelWidth: 768,
          present: () => undefined,
        }),
      ).rejects.toThrow("staging cleanup failed");
      expect(calls).toEqual([
        "save",
        "draw",
        "restore",
        "release-width",
        "release-height",
      ]);
    });

    it("fails explicitly when no export staging canvas is available", async () => {
      if (typeof document !== "undefined") return;
      await expect(
        feedbackExport.presentPhysicalFeedbackExportFrame({
          destinationContext: {} as CanvasRenderingContext2D,
          frame: appComposition.physicalFeedbackSceneBounds,
          pixelHeight: 512,
          pixelWidth: 768,
          present: () => undefined,
        }),
      ).rejects.toMatchObject({
        code: "physical-feedback-export-staging-context-required",
        name: "PhysicalFeedbackExportPipelineError",
      });
    });

    it("assigns retained resource and presentation allocation identities", async () => {
      const first = await pipeline.createPhysicalFeedbackResource();
      const second = await pipeline.createPhysicalFeedbackResource();
      try {
        const firstSnapshot = first.getSnapshot();
        const secondSnapshot = second.getSnapshot();
        expect(firstSnapshot).toMatchObject({
          presentationAllocationId: expect.any(Number),
          resourceAllocationId: expect.any(Number),
        });
        expect(firstSnapshot.resourceAllocationId).toBeGreaterThan(0);
        expect(firstSnapshot.presentationAllocationId).toBeGreaterThan(0);
        expect(secondSnapshot.resourceAllocationId).toBeGreaterThan(
          firstSnapshot.resourceAllocationId,
        );
        expect(secondSnapshot.presentationAllocationId).toBeGreaterThan(
          firstSnapshot.presentationAllocationId,
        );
        expect(first.getSnapshot()).toMatchObject({
          presentationAllocationId: firstSnapshot.presentationAllocationId,
          resourceAllocationId: firstSnapshot.resourceAllocationId,
        });
      } finally {
        await Promise.all([first.dispose(), second.dispose()]);
      }
    });

    it("physical feedback disposes resources once", () => {
      expect(performance.appRendererPipelineRegistration.passes[0].lifecycle).toEqual({
        cache: "retained-resource",
        resourceScope: "renderer",
      });
    });

    it("retains the quality-evidence scene bounds while Field is disabled", () => {
      expect(
        appComposition.appComposition.sceneBoundsProvider?.({
          state: { values: { "simulation.enabled": false } },
        } as never),
      ).toEqual([appComposition.physicalFeedbackSceneBounds]);
    });

  });
}
