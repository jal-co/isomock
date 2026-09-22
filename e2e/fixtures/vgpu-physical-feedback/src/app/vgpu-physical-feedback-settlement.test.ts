const fixtureSource = import.meta.url.includes(
  "/e2e/fixtures/vgpu-physical-feedback/",
);

if (fixtureSource && process.env.VITEST) {
  const { it } = await import("vitest");
  it.skip("VGPU settlement fixture source is inert before installation", () => {});
}

if (!fixtureSource) {
  const [{ describe, expect, it }, operations] = await Promise.all([
    import("vitest"),
    import("./feedback-operations"),
  ]);

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((resolvePromise) => {
      resolve = resolvePromise;
    });
    return { promise, resolve };
  }

  describe("VGPU physical feedback settlement evidence", () => {
    it("publishes exact FIFO operation and independent retirement generations", async () => {
      const queue = operations.createPhysicalFeedbackOperationQueue();
      const operation = deferred();
      const retirement = deferred();
      const observed: unknown[] = [];
      const unsubscribe = queue.subscribe(() => observed.push(queue.getSnapshot()));

      const operationResult = queue.run(async () => {
        await operation.promise;
        return "painted";
      });
      const retirementResult = queue.runRetirement(() => retirement.promise);
      expect(queue.getSnapshot()).toEqual({
        operationSettledGeneration: 0,
        operationStartedGeneration: 1,
        retirementSettledGeneration: 0,
        retirementStartedGeneration: 1,
      });

      operation.resolve();
      await expect(operationResult).resolves.toBe("painted");
      expect(queue.getSnapshot()).toMatchObject({
        operationSettledGeneration: 1,
        retirementSettledGeneration: 0,
      });
      retirement.resolve();
      await retirementResult;
      expect(queue.getSnapshot()).toEqual({
        operationSettledGeneration: 1,
        operationStartedGeneration: 1,
        retirementSettledGeneration: 1,
        retirementStartedGeneration: 1,
      });
      expect(observed).toHaveLength(4);
      unsubscribe();
    });

    it("settles overlapping retirements in enqueue order without early equality", async () => {
      const queue = operations.createPhysicalFeedbackOperationQueue();
      const first = deferred();
      const second = deferred();
      const started: number[] = [];
      const settled: number[] = [];
      const unsubscribe = queue.subscribe(() => {
        settled.push(queue.getSnapshot().retirementSettledGeneration);
      });

      const firstResult = queue.runRetirement(async () => {
        started.push(1);
        await first.promise;
      });
      const secondResult = queue.runRetirement(async () => {
        started.push(2);
        await second.promise;
      });
      expect(queue.getSnapshot()).toMatchObject({
        retirementSettledGeneration: 0,
        retirementStartedGeneration: 2,
      });

      second.resolve();
      await Promise.resolve();
      expect(started).toEqual([1]);
      expect(queue.getSnapshot().retirementSettledGeneration).toBe(0);

      first.resolve();
      await firstResult;
      expect(queue.getSnapshot().retirementSettledGeneration).toBe(1);
      await secondResult;
      expect(started).toEqual([1, 2]);
      expect(queue.getSnapshot()).toMatchObject({
        retirementSettledGeneration: 2,
        retirementStartedGeneration: 2,
      });
      expect(settled.filter((generation, index) => {
        return index === 0 || generation !== settled[index - 1];
      })).toEqual([0, 1, 2]);
      unsubscribe();
    });

    it("settles failed work and keeps the FIFO usable", async () => {
      const queue = operations.createPhysicalFeedbackOperationQueue();
      await expect(
        queue.run(() => {
          throw new Error("failed operation");
        }),
      ).rejects.toThrow("failed operation");
      await expect(queue.run(() => "next operation")).resolves.toBe(
        "next operation",
      );
      expect(queue.getSnapshot()).toMatchObject({
        operationSettledGeneration: 2,
        operationStartedGeneration: 2,
      });
    });

    it("settles a failed retirement and runs the next retirement", async () => {
      const queue = operations.createPhysicalFeedbackOperationQueue();
      const calls: string[] = [];
      const failed = queue.runRetirement(() => {
        calls.push("failed");
        throw new Error("failed retirement");
      });
      const recovered = queue.runRetirement(() => {
        calls.push("recovered");
      });

      await expect(failed).rejects.toThrow("failed retirement");
      await expect(recovered).resolves.toBeUndefined();
      expect(calls).toEqual(["failed", "recovered"]);
      expect(queue.getSnapshot()).toMatchObject({
        retirementSettledGeneration: 2,
        retirementStartedGeneration: 2,
      });
    });
  });
}
