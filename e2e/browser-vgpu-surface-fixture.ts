import { effect, frame } from "vgpu";
import { createToolcraftVgpuProvider, synchronizeToolcraftVgpuSurface, createToolcraftVgpuTargetPresentation, renderToolcraftVgpuExportFrame, ToolcraftVgpuExportError } from "../src/toolcraft/integrations/vgpu";

const canvas = document.querySelector("canvas")!;
const provider = createToolcraftVgpuProvider();
const state = await provider.whenInitialized();
if (state.status !== "ready") throw new Error(`VGPU unavailable: ${state.status}`);
const gpu = state.gpu;
let size = { cssWidth: 64, cssHeight: 48, devicePixelRatio: 1, renderScale: 2 };
let configured = synchronizeToolcraftVgpuSurface({ canvas, current: null, frame: size, provider })!;
const originalSurface = configured.surface;
const red = effect(gpu, "@fragment fn main() -> @location(0) vec4f { return vec4f(0.5, 0.0, 0.0, 0.5); }");
const green = effect(gpu, "@fragment fn main() -> @location(0) vec4f { return vec4f(0.0, 0.5, 0.0, 0.5); }");
let count = 0;

async function draw() {
  const submitted = frame(gpu, (current) => current.pass(configured.surface, count === 0 ? red : green));
  await submitted.done;
  await gpu.settled();
  if (provider.getState().status !== "ready") throw new Error("VGPU failed after submission");
  canvas.dataset.frames = String(++count);
}

document.getElementById("next")!.onclick = () => { void draw(); };
document.getElementById("resize")!.onclick = async () => {
  size = { ...size, cssWidth: 80, cssHeight: 40 };
  configured = synchronizeToolcraftVgpuSurface({ canvas, current: configured, frame: size, provider })!;
  if (configured.surface !== originalSurface) throw new Error("Resize replaced the surface");
  await draw();
};
document.getElementById("dispose")!.onclick = () => {
  provider.dispose();
  canvas.dataset.disposed = String(originalSurface.disposed);
};
await draw();

const targetPresentation = createToolcraftVgpuTargetPresentation({ provider });
const straightRed = effect(gpu, "@fragment fn main() -> @location(0) vec4f { return vec4f(1.0, 0.0, 0.0, 0.5); }");
document.getElementById("offscreen")!.onclick = async () => {
  const readback = document.getElementById("readback") as HTMLCanvasElement;
  await targetPresentation.commit({ canvas: readback,
    frame: { cssWidth: 8, cssHeight: 8, devicePixelRatio: 2, renderScale: 2 },
    render: async (_gpu, target) => {
      await frame(gpu, (current) => current.pass(target, straightRed)).done;
      await gpu.settled();
    },
  });
  const exported = document.getElementById("export") as HTMLCanvasElement;
  exported.width = 8; exported.height = 8;
  const context = exported.getContext("2d")!;
  context.fillStyle = "blue"; context.fillRect(0, 0, 8, 8);
  await renderToolcraftVgpuExportFrame({ provider, context, width: 8, height: 8,
    render: (current, target) => current.pass(target, straightRed) });
  document.getElementById("offscreen-status")!.textContent = "committed";
};
document.getElementById("unsupported")!.onclick = async () => {
  const unavailable = createToolcraftVgpuProvider({ navigator: null });
  await unavailable.whenInitialized();
  try {
    await renderToolcraftVgpuExportFrame({ provider: unavailable,
      context: (document.getElementById("export") as HTMLCanvasElement).getContext("2d")!,
      width: 1, height: 1, render: () => {} });
    throw new Error("Unavailable provider unexpectedly exported");
  } catch (error) {
    if (!(error instanceof ToolcraftVgpuExportError)) throw error;
    document.getElementById("unsupported-status")!.textContent = error.code;
  } finally { unavailable.dispose(); }
};
