export const MAX_EXECUTION_WORK = 2_048;
export const MAX_EXECUTION_CHECKPOINTS = 256;
export const MAX_EXECUTION_PRODUCT = 2_048;

export function createToolcraftExecutionBudget(limit = MAX_EXECUTION_WORK) {
  let remaining = limit;
  let checkpoints = 0;

  function reserve(cost = 1) {
    if (!Number.isSafeInteger(cost) || cost < 0 || cost > remaining) return false;
    remaining -= cost;
    return true;
  }

  function checkpoint() {
    if (checkpoints >= MAX_EXECUTION_CHECKPOINTS || !reserve()) return false;
    checkpoints += 1;
    return true;
  }

  function product(left, right, cap = MAX_EXECUTION_PRODUCT) {
    if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) ||
      !Number.isSafeInteger(cap) || cap < 0 ||
      left < 0 || right < 0 || left > MAX_EXECUTION_PRODUCT ||
      right > MAX_EXECUTION_PRODUCT) return false;
    const cost = left * right;
    return cost <= Math.min(cap, MAX_EXECUTION_PRODUCT) && reserve(cost);
  }

  return Object.freeze({
    checkpoint,
    exhausted: () => remaining <= 0,
    product,
    remaining: () => remaining,
    reserve,
    reset() { remaining = limit; checkpoints = 0; },
    snapshot: () => Object.freeze({ checkpoints, remaining }),
  });
}
