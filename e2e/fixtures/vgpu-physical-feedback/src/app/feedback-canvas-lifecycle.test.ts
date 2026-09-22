const fixtureSource = import.meta.url.includes(
  "/e2e/fixtures/vgpu-physical-feedback/",
);

if (fixtureSource && process.env.VITEST) {
  const { it } = await import("vitest");
  it.skip("VGPU fixture source is inert before product installation", () => {});
}

if (!fixtureSource) {
  const [{ expect, it, vi }, canvasLifecycle, integration] = await Promise.all([
    import("vitest"),
    import("./feedback-canvas-lifecycle"),
    import("@/toolcraft/integrations/vgpu"),
  ]);

  it("keeps exact blank Canvas2D backing without creating GPU work", () => {
    const clearCalls: number[][] = [];
    const canvas = {
      getContext: () => ({
        clearRect: (...values: number[]) => clearCalls.push(values),
      }),
      height: 1,
      style: { height: "", width: "" },
      width: 1,
    } as unknown as HTMLCanvasElement;
    expect(
      canvasLifecycle.clearPhysicalFeedbackCanvas(canvas, {
        backingHeight: 400,
        backingWidth: 640,
        cssHeight: 200,
        cssWidth: 320,
        renderedTime: 0,
      }),
    ).toBe(true);
    expect(canvas).toMatchObject({
      height: 400,
      style: { height: "200px", width: "320px" },
      width: 640,
    });
    expect(clearCalls).toEqual([]);
    expect(
      canvasLifecycle.clearPhysicalFeedbackCanvas(canvas, {
        backingHeight: 400,
        backingWidth: 640,
        cssHeight: 200,
        cssWidth: 320,
        renderedTime: 1,
      }),
    ).toBe(true);
    expect(clearCalls).toEqual([[0, 0, 640, 400]]);
    expect(canvasLifecycle.physicalFeedbackDisabledRuntimeAttributes).toMatchObject(
      { "data-toolcraft-gpu-status": "disabled" },
    );
    expect(
      canvasLifecycle.physicalFeedbackDisabledBackingMatches(
        {
          backingHeight: 400,
          backingWidth: 640,
          cssHeight: 200,
          cssWidth: 320,
          renderedTime: 0,
        },
        {
          backingHeight: 400,
          backingWidth: 640,
          cssHeight: 200,
          cssWidth: 320,
          renderedTime: 2,
        },
      ),
    ).toBe(true);
    expect(
      canvasLifecycle.physicalFeedbackDisabledBackingMatches(
        {
          backingHeight: 400,
          backingWidth: 640,
          cssHeight: 200,
          cssWidth: 320,
          renderedTime: 0,
        },
        {
          backingHeight: 401,
          backingWidth: 640,
          cssHeight: 200,
          cssWidth: 320,
          renderedTime: 0,
        },
      ),
    ).toBe(false);
  });

  it("accumulates presentation-local frame increments", () => {
    const first = canvasLifecycle.mergePhysicalFeedbackPresentationRuntimeSnapshot(
      canvasLifecycle.physicalFeedbackInitialCanvasRuntime,
      {
        frameCount: 1,
        presentationAllocationId: 1,
        renderedTime: 0,
        resourceAllocationId: 1,
      },
    );
    const third = canvasLifecycle.mergePhysicalFeedbackPresentationRuntimeSnapshot(
      first,
      {
        frameCount: 3,
        presentationAllocationId: 1,
        renderedTime: 0.25,
        resourceAllocationId: 1,
      },
    );
    expect(third).toMatchObject({
      frameCount: 3,
      presentationFrameCount: 3,
    });
  });

  it("accepts an initial zero-frame presentation snapshot", () => {
    const initial =
      canvasLifecycle.mergePhysicalFeedbackPresentationRuntimeSnapshot(
        canvasLifecycle.physicalFeedbackInitialCanvasRuntime,
        {
          frameCount: 0,
          presentationAllocationId: 1,
          renderedTime: 0,
          resourceAllocationId: 1,
        },
      );
    expect(initial).toMatchObject({
      frameCount: 0,
      presentationAllocationId: 1,
      presentationFrameCount: 0,
      resourceAllocationId: 1,
    });
  });

  it("does not double-count a repeated presentation snapshot", () => {
    const presented = canvasLifecycle.mergePhysicalFeedbackPresentationRuntimeSnapshot(
      canvasLifecycle.physicalFeedbackInitialCanvasRuntime,
      {
        frameCount: 2,
        presentationAllocationId: 1,
        renderedTime: 0.25,
        resourceAllocationId: 1,
      },
    );
    const repeated =
      canvasLifecycle.mergePhysicalFeedbackPresentationRuntimeSnapshot(
        presented,
        {
          frameCount: 2,
          presentationAllocationId: 1,
          renderedTime: 0.25,
          resourceAllocationId: 1,
        },
      );
    expect(repeated).toBe(presented);
  });

  it("counts a valid replacement allocation once", () => {
    const previous = {
      ...canvasLifecycle.physicalFeedbackInitialCanvasRuntime,
      frameCount: 4,
      presentationAllocationId: 1,
      presentationFrameCount: 4,
      resourceAllocationId: 1,
    };
    const nextSnapshot = {
      frameCount: 1,
      presentationAllocationId: 2,
      renderedTime: 0.25,
      resourceAllocationId: 2,
    };
    const next = canvasLifecycle.mergePhysicalFeedbackPresentationRuntimeSnapshot(
      previous,
      nextSnapshot,
    );
    const repeated = canvasLifecycle.mergePhysicalFeedbackPresentationRuntimeSnapshot(
      next,
      nextSnapshot,
    );
    expect(next).toMatchObject({
      frameCount: 5,
      presentationAllocationId: 2,
      presentationFrameCount: 1,
      resourceAllocationId: 2,
    });
    expect(repeated).toBe(next);
  });

  it("accepts a valid zero-frame replacement allocation", () => {
    const current = Object.freeze({
      ...canvasLifecycle.physicalFeedbackInitialCanvasRuntime,
      frameCount: 4,
      presentationAllocationId: 1,
      presentationFrameCount: 4,
      renderedTime: 0.25,
      resourceAllocationId: 1,
    });
    const replacement =
      canvasLifecycle.mergePhysicalFeedbackPresentationRuntimeSnapshot(current, {
        frameCount: 0,
        presentationAllocationId: 2,
        renderedTime: 0,
        resourceAllocationId: 2,
      });
    expect(replacement).toMatchObject({
      frameCount: 4,
      presentationAllocationId: 2,
      presentationFrameCount: 0,
      renderedTime: 0,
      resourceAllocationId: 2,
    });
    expect(replacement).not.toBe(current);
  });

  it("does not double-count a repeated zero-frame snapshot", () => {
    const current = Object.freeze({
      ...canvasLifecycle.physicalFeedbackInitialCanvasRuntime,
      frameCount: 4,
      presentationAllocationId: 2,
      presentationFrameCount: 0,
      resourceAllocationId: 2,
    });
    expect(
      canvasLifecycle.mergePhysicalFeedbackPresentationRuntimeSnapshot(current, {
        frameCount: 0,
        presentationAllocationId: 2,
        renderedTime: 0,
        resourceAllocationId: 2,
      }),
    ).toBe(current);
  });

  it("ignores a regressed presentation-local count", () => {
    const current = {
      ...canvasLifecycle.physicalFeedbackInitialCanvasRuntime,
      frameCount: 7,
      presentationAllocationId: 2,
      presentationFrameCount: 4,
      resourceAllocationId: 2,
    };
    const regressed =
      canvasLifecycle.mergePhysicalFeedbackPresentationRuntimeSnapshot(current, {
        frameCount: 2,
        presentationAllocationId: 2,
        renderedTime: 0.125,
        resourceAllocationId: 2,
      });
    expect(regressed).toBe(current);
  });

  it("rejects non-canonical presentation snapshot counters", () => {
    const valid = {
      frameCount: 1,
      presentationAllocationId: 1,
      renderedTime: 0.25,
      resourceAllocationId: 1,
    };
    for (const snapshot of [
      { ...valid, frameCount: -1 },
      { ...valid, frameCount: 1.5 },
      { ...valid, presentationAllocationId: 0 },
      { ...valid, presentationAllocationId: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, resourceAllocationId: -1 },
      { ...valid, resourceAllocationId: Number.POSITIVE_INFINITY },
    ]) {
      expect(() =>
        canvasLifecycle.mergePhysicalFeedbackPresentationRuntimeSnapshot(
          canvasLifecycle.physicalFeedbackInitialCanvasRuntime,
          snapshot,
        ),
      ).toThrow(RangeError);
    }
  });

  it("ignores a stale lower allocation snapshot", () => {
    const current = Object.freeze({
      ...canvasLifecycle.physicalFeedbackInitialCanvasRuntime,
      frameCount: 9,
      presentationAllocationId: 3,
      presentationFrameCount: 4,
      renderedTime: 0.5,
      resourceAllocationId: 3,
    });
    const stale = canvasLifecycle.mergePhysicalFeedbackPresentationRuntimeSnapshot(
      current,
      {
        frameCount: 8,
        presentationAllocationId: 2,
        renderedTime: 0.25,
        resourceAllocationId: 2,
      },
    );
    expect(stale).toBe(current);
  });

  it("rejects conflicting presentation and resource allocation identities", () => {
    const current = {
      ...canvasLifecycle.physicalFeedbackInitialCanvasRuntime,
      frameCount: 4,
      presentationAllocationId: 2,
      presentationFrameCount: 4,
      resourceAllocationId: 2,
    };
    for (const allocationIds of [
      { presentationAllocationId: 3, resourceAllocationId: 2 },
      { presentationAllocationId: 2, resourceAllocationId: 3 },
      { presentationAllocationId: 1, resourceAllocationId: 3 },
    ]) {
      expect(() =>
        canvasLifecycle.mergePhysicalFeedbackPresentationRuntimeSnapshot(current, {
          ...allocationIds,
          frameCount: 1,
          renderedTime: 0.25,
        }),
      ).toThrow(/allocation identities conflict/iu);
    }
  });

  it("rejects stale preview paint, ready state, and cleanup across generations", async () => {
    const lifecycle = canvasLifecycle.createPhysicalFeedbackLifecycleEpoch(true);
    const oldEpoch = lifecycle.captureSubmission();
    if (oldEpoch === null) throw new Error("Expected an active renderer epoch.");
    let signalRead!: () => void;
    let releaseRead!: () => void;
    let releaseCleanup!: () => void;
    const readStarted = new Promise<void>((resolve) => {
      signalRead = resolve;
    });
    const readRelease = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const cleanupRelease = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    const putImageData = vi.fn();
    const canvas = {
      getContext: () => ({ putImageData }),
      height: 0,
      style: { height: "", width: "" },
      width: 0,
    } as unknown as HTMLCanvasElement;
    const gpu = {};
    const presentation = integration.createToolcraftVgpuTargetPresentation({
      imageDataConstructor: class {
        constructor(
          readonly data: Uint8ClampedArray,
          readonly width: number,
          readonly height: number,
        ) {}
      } as unknown as typeof ImageData,
      provider: {
        getState: () => ({ gpu, status: "ready" }) as never,
      },
      target: (() => ({
        read: async () => {
          signalRead();
          await readRelease;
          return new Uint8Array(2 * 2 * 4).fill(37);
        },
        resize: () => undefined,
        size: [2, 2],
      })) as never,
    });
    const effects: string[] = [];
    const oldPreview = presentation.commit({
      canvas,
      frame: {
        cssHeight: 2,
        cssWidth: 2,
        devicePixelRatio: 1,
        renderScale: 1,
      },
      render: () => undefined,
      shouldCommit: () => lifecycle.isSubmissionCurrent(oldEpoch),
    }).then((snapshot) => {
      lifecycle.commitSubmission(oldEpoch, () =>
        effects.push(`old-${snapshot.status}`),
      );
      return snapshot;
    });
    await readStarted;

    const disabledEpoch = lifecycle.transition(false);
    const oldCleanup = cleanupRelease.then(() =>
      lifecycle.commitDisabled(disabledEpoch, () => effects.push("old-clear")),
    );
    lifecycle.transition(true);
    const newEpoch = lifecycle.captureSubmission();
    if (newEpoch === null) throw new Error("Expected a new renderer epoch.");
    lifecycle.commitSubmission(newEpoch, () => effects.push("new-ready"));

    releaseRead();
    releaseCleanup();
    const [oldSnapshot] = await Promise.all([oldPreview, oldCleanup]);
    expect(oldSnapshot).toMatchObject({ committedFrames: 0, status: "idle" });
    expect(putImageData).not.toHaveBeenCalled();
    expect(canvas).toMatchObject({ height: 0, width: 0 });
    expect(effects).toEqual(["new-ready"]);
    expect(newEpoch).toBeGreaterThan(oldEpoch);
    await presentation.dispose();
  });
}
