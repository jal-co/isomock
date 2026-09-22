const NO_FAILURE = Symbol("no-source-asset-preparation-failure");

export async function prepareToolcraftSourceAssetBatch<Input, Output>(
  inputs: readonly Input[],
  parentSignal: AbortSignal,
  prepare: (input: Input, signal: AbortSignal) => Promise<Output>,
): Promise<Output[]> {
  const controller = new AbortController();
  let firstFailure: unknown | typeof NO_FAILURE = NO_FAILURE;
  const abortFromParent = (): void => controller.abort();

  if (parentSignal.aborted) {
    abortFromParent();
  } else {
    parentSignal.addEventListener("abort", abortFromParent, { once: true });
  }

  const preparations = inputs.map((input) =>
    Promise.resolve()
      .then(() => prepare(input, controller.signal))
      .catch((error: unknown) => {
        if (firstFailure === NO_FAILURE) {
          firstFailure = error;
        }
        controller.abort();
        throw error;
      }),
  );
  const settled = await Promise.allSettled(preparations);
  parentSignal.removeEventListener("abort", abortFromParent);

  if (firstFailure !== NO_FAILURE) {
    throw firstFailure;
  }

  return settled.map((result) => {
    if (result.status === "rejected") {
      throw result.reason;
    }
    return result.value;
  });
}
