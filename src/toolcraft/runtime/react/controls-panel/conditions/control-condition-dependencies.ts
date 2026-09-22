import {
  getToolcraftCanvasSizeTargetDimension,
  isToolcraftCanvasInfinityTarget,
  isToolcraftTimelinePanelRuntimeTarget,
} from "../../../schema/runtime-targets";
import type { ToolcraftStoreDependency } from "../../../state/toolcraft-external-store-dependencies";

export function getControlsPanelTargetDependency(
  target: string,
): ToolcraftStoreDependency {
  if (isToolcraftCanvasInfinityTarget(target)) {
    return { kind: "canvas.mode" };
  }

  if (getToolcraftCanvasSizeTargetDimension(target)) {
    return { kind: "canvas.size" };
  }

  if (isToolcraftTimelinePanelRuntimeTarget(target)) {
    return { kind: "panels.timeline" };
  }

  return { kind: "value", target };
}

export function getControlsPanelTargetDependencies(
  targets: readonly string[],
): ToolcraftStoreDependency[] {
  const dependencies = targets.map(getControlsPanelTargetDependency);

  return dependencies.filter((dependency, index) =>
    dependencies.findIndex((candidate) =>
      candidate.kind === dependency.kind &&
      (!("target" in candidate) ||
        !("target" in dependency) ||
        candidate.target === dependency.target),
    ) === index,
  );
}
