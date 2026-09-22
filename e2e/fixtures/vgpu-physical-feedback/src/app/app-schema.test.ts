const fixtureSource = import.meta.url.includes(
  "/e2e/fixtures/vgpu-physical-feedback/",
);

if (fixtureSource && process.env.VITEST) {
  const { it } = await import("vitest");
  it.skip("VGPU fixture source is inert before product installation", () => {});
}

if (!fixtureSource) {
  const [vitest, acceptance, performance, schema] = await Promise.all([
    import("vitest"),
    import("./app-acceptance"),
    import("./app-performance"),
    import("./app-schema"),
  ]);
  const { describe, expect, it } = vitest;
  const control = (target: string) =>
    schema.appSchema.panels.controls?.sections
      .flatMap((section) => Object.values(section.controls))
      .find((candidate) => candidate.target === target);

  describe("VGPU physical feedback schema", () => {
    it("uses image and playback modules without conditional export actions", () => {
      expect(
        schema.appSchema.modulePlan.modules.map(({ id }) => id).sort(),
      ).toEqual(["image-export", "timeline"]);
      expect(schema.appSchema.panels.timeline).toMatchObject({
        defaultDurationSeconds: 2,
        enabled: true,
        mode: "playback",
      });
      expect(control("simulation.impulse")).toMatchObject({
        applicability: {
          all: [{ equals: true, target: "simulation.enabled" }],
          mode: "conditional",
        },
      });
      expect(control("actions.output")).toMatchObject({
        applicability: { mode: "always" },
        actions: [{ role: "export-image", value: "export.png" }],
      });
    });

    it("declares production reload coverage for the generated product schema", () => {
      expect(schema.appSchema.persistence.storage).toBe("localStorage");
      if (schema.appSchema.persistence.storage !== "localStorage") {
        throw new Error("The VGPU fixture must persist its product workspace.");
      }
      expect(
        acceptance.appAcceptance.find(({ id }) => id === "persistence.reload"),
      ).toMatchObject({
        persistenceCoverage: "reload",
        persistenceSlices: schema.appSchema.persistence.include,
      });
      expect(acceptance.validateProductAcceptanceCoverage()).toEqual([]);
    });

    it("keeps the fixture inventory and GPU technique closed", () => {
      expect(acceptance.appControlSectionInventory).toHaveLength(3);
      expect(acceptance.appControlSectionInventory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "simulation",
            targets: ["simulation.enabled", "simulation.impulse"],
          }),
          expect.objectContaining({
            id: "background",
            targets: ["export.includeBackground", "appearance.background"],
          }),
          expect.objectContaining({
            id: "runtime.image-export",
            targets: ["export.image.format", "export.image.resolution"],
          }),
        ]),
      );
      expect(
        performance.appRendererPipelineRegistration.passes.map(({ id }) => id),
      ).toEqual([
        "resources",
        "preview-simulate",
        "preview-present",
        "export-simulate",
        "export-present",
      ]);
      expect(performance.appPerformance.rendererTechnique?.gpu).toEqual({
        export: {
          backend: "webgpu",
          capability: "shader-webgpu-vgpu",
          provider: "vgpu",
          versionPolicy: "app-pinned",
        },
        preview: {
          backend: "webgpu",
          capability: "shader-webgpu-vgpu",
          provider: "vgpu",
          versionPolicy: "app-pinned",
        },
      });
      expect(performance.appPerformance.rendererTechnique).toMatchObject({
        exportRenderer: "canvas-2d",
        previewRenderer: "canvas-2d",
        rendererStrategy: "canvas-2d",
      });
    });

    it("background inclusion controls preview and PNG transparency", () => {
      expect(control("export.includeBackground")).toMatchObject({
        defaultValue: true,
        type: "switch",
      });
      expect(
        acceptance.appAcceptance.find(
          ({ id }) => id === "renderer.background-inclusion",
        ),
      ).toMatchObject({
        backgroundOutputCoverage: [
          "preview-hidden-when-excluded",
          "image-transparent-when-excluded",
          "infinity-viewport-color-and-dependency",
        ],
      });
    });

    it("background color changes physical field output", () => {
      expect(control("appearance.background")).toMatchObject({
        defaultValue: "#141F38",
        type: "color",
      });
    });

    it("image format options remain selectable", () => {
      expect(control("export.image.format")).toMatchObject({
        options: [
          { label: "PNG", value: "png" },
          { label: "JPG", value: "jpg" },
        ],
        type: "select",
      });
    });

    it("image resolution options remain selectable", () => {
      expect(control("export.image.resolution")).toMatchObject({
        options: [
          { label: "2K", value: "2k" },
          { label: "4K", value: "4k" },
          { label: "8K", value: "8k" },
        ],
        type: "select",
      });
    });

    it("physical feedback export keeps the saved artboard across modes", () => {
      expect(
        acceptance.appAcceptance.find(
          ({ id }) => id === "renderer.infinity-export",
        ),
      ).toMatchObject({
        infinityCanvasCoverage: "scene-bounds-image-export",
        target: "canvas.infinity",
      });
    });
  });
}
