import type { ToolcraftExternalStore } from "./toolcraft-external-store";

/** A save waits for user completion; it never turns a half gesture into an authored edit. */
export function waitForToolcraftAuthoredEdit(store: ToolcraftExternalStore, signal: AbortSignal, timeoutMs = 5000): Promise<void> {
  signal.throwIfAborted();
  if (!store.authoredEdits.isActive()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error?: unknown) => {
      clearTimeout(timer); unsubscribe(); signal.removeEventListener("abort", abort);
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(signal.reason);
    const unsubscribe = store.subscribe(() => { if (!store.authoredEdits.isActive()) finish(); });
    const timer = setTimeout(() => finish(new Error("An edit is still active. Finish or cancel the gesture before saving.")), timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
  });
}
