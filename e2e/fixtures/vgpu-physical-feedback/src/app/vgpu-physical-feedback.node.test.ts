const fixtureSource = import.meta.url.includes(
  "/e2e/fixtures/vgpu-physical-feedback/",
);

if (fixtureSource && process.env.VITEST) {
  const { it } = await import("vitest");
  it.skip("VGPU fixture source is inert before product installation", () => {});
}

if (!fixtureSource) {
  const [vitest, vgpuNode, vgpuCore, storage, feedbackModule, renderModule, composite] = await Promise.all([
    import("vitest"),
    import("vgpu/node"),
    import("vgpu/core"),
    import("./feedback-storage"),
    import("./feedback.wgsl"),
    import("./render.wgsl"),
    import("../../toolcraft/integrations/vgpu/rgba-composite"),
  ]);
  const { describe, expect, it } = vitest;
  const { effect, frame, init, sampler, target } = vgpuNode;

  async function renderPhysicalField(): Promise<Readonly<{
    center: readonly number[];
    corner: readonly number[];
    pixels: readonly number[];
  }>> {
    const gpu = await init();
    try {
      const size = 16;
      const feedback = vgpuCore.pingPong(gpu.device, {
        format: "rgba8unorm",
        size: [size, size],
        usage: ["copy_src", "storage_binding", "texture_binding"],
      });
      const simulation = storage.createStorageFeedbackCompute(
        gpu,
        feedbackModule.default,
      );
      simulation.dispatch({
        decay: 0.955,
        height: size,
        impulse: 0.75,
        nextField: feedback.write,
        previousField: feedback.read,
        reset: true,
        time: 0,
        width: size,
      });
      feedback.swap();
      await gpu.gpu.queue.onSubmittedWorkDone();

      const output = target(gpu, { format: "rgba8unorm", size: [size, size] });
      const draw = effect(gpu, renderModule.default, {
        set: { field: feedback.read, fieldSampler: sampler(gpu) },
      });
      const submitted = frame(gpu, (currentFrame) =>
        currentFrame.pass(output, draw),
      );
      await submitted.done;
      await gpu.settled();
      const pixels = await output.read();
      simulation.dispose();
      const sample = (x: number, y: number) =>
        Array.from(pixels.slice((y * size + x) * 4, (y * size + x) * 4 + 4));
      return Object.freeze({ center: sample(8, 8), corner: sample(0, 0), pixels: Array.from(pixels) });
    } finally {
      gpu.dispose();
    }
  }

  describe("VGPU Node physical feedback", () => {
    it("renders deterministic 16x16 center and corner pixels", async () => {
      const first = await renderPhysicalField();
      const second = await renderPhysicalField();
      expect(second).toEqual(first);
      expect(first.corner).toEqual([0, 0, 0, 0]);
      expect(first.center[0]).toBeGreaterThan(first.corner[0]);
      expect(first.center[1]).toBeGreaterThan(first.corner[1]);
      expect(first.center[2]).toBeGreaterThan(first.corner[2]);
      expect(first.center[3]).toBeGreaterThan(0);
      let translucentSamples = 0;
      for (let offset = 0; offset < first.pixels.length; offset += 4) {
        const pixel = first.pixels.slice(offset, offset + 4);
        const alpha = pixel[3]! / 255;
        if (alpha < 0.1 || alpha > 0.9) continue;
        translucentSamples += 1;
        const expected = [0.078, 0.12, 0.22].map((ink, channel) =>
          (ink + ([0.20, 0.90, 1.00][channel]! - ink) * alpha) * 255,
        );
        const background = composite.compositeStraightAlphaSourceOver(
          new Uint8ClampedArray([0, 0, 0, 255]), new Uint8Array(pixel),
        );
        for (let channel = 0; channel < 3; channel += 1) {
          expect(Math.abs(pixel[channel]! - expected[channel]!)).toBeLessThanOrEqual(2);
          expect(Math.abs(background[channel]! - expected[channel]! * alpha)).toBeLessThanOrEqual(2);
        }
      }
      expect(translucentSamples).toBeGreaterThan(0);
    });
  });
}
