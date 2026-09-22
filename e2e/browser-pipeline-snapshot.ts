import type { Page } from "@playwright/test";
import type { ToolcraftRendererPipelineSnapshot } from "@/toolcraft/runtime";

/** Read-only functional observation; this does not execute a performance audit. */
export async function readToolcraftRendererPipelineSnapshot(page: Page): Promise<ToolcraftRendererPipelineSnapshot> {
  const bridges = page.locator("output[hidden][data-toolcraft-pipeline-evidence]");
  if (await bridges.count() !== 1) throw new Error("Toolcraft pipeline evidence requires exactly one hidden runtime bridge.");
  return bridges.evaluate(bridge => {
    const getter = Reflect.get(bridge, Symbol.for("toolcraft.renderer-pipeline-evidence.snapshot"));
    if (typeof getter !== "function") throw new Error("Missing protected pipeline snapshot getter.");
    return getter() as ToolcraftRendererPipelineSnapshot;
  });
}
