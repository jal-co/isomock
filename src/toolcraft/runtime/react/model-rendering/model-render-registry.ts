import type {
  ToolcraftModelRenderBinding,
  ToolcraftModelRenderBindingMap,
} from "./model-render-binding";

export type ToolcraftModelRenderRegistry = Readonly<{
  bindings: ToolcraftModelRenderBindingMap;
  resolve(target: string): ToolcraftModelRenderBinding<unknown>;
  standardBinding: ToolcraftModelRenderBinding<unknown>;
}>;

const bindingMethods = [
  "create",
  "dispose",
  "hitTest",
  "renderExport",
  "renderPreview",
  "update",
] as const;

function assertBinding(
  binding: ToolcraftModelRenderBinding<unknown>,
  label: string,
): void {
  for (const method of bindingMethods) {
    if (typeof binding[method] !== "function") {
      throw new Error(`Model render binding ${label} must implement ${method}.`);
    }
  }
}

function assertTarget(target: string): void {
  if (target.length === 0 || target.trim() !== target) {
    throw new Error("Model render binding target must be a non-empty trimmed string.");
  }
}

export function createToolcraftModelRenderRegistry({
  bindings = {},
  standardBinding,
}: {
  bindings?: ToolcraftModelRenderBindingMap;
  standardBinding: ToolcraftModelRenderBinding<unknown>;
}): ToolcraftModelRenderRegistry {
  assertBinding(standardBinding, "standard");
  const snapshot: Record<string, ToolcraftModelRenderBinding<unknown>> = {};

  for (const [target, binding] of Object.entries(bindings)) {
    assertTarget(target);
    assertBinding(binding, `for target \"${target}\"`);
    snapshot[target] = binding;
  }

  const frozenBindings = Object.freeze(snapshot);

  return Object.freeze({
    bindings: frozenBindings,
    resolve: (target: string) => {
      assertTarget(target);
      return frozenBindings[target] ?? standardBinding;
    },
    standardBinding,
  });
}
