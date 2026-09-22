import { expect, it, vi } from "vitest";
import { init } from "vgpu/mock";
import { target as createTarget } from "vgpu";
import {
  createToolcraftVgpuProvider,
  createToolcraftVgpuTargetPresentation,
  renderToolcraftVgpuExportFrame,
} from "../../../../src/toolcraft/integrations/vgpu/index";

class ImageDataDouble {
  constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
}
const imageDataConstructor = ImageDataDouble as unknown as typeof ImageData;

function targetDisposingAfterRead(dispose: () => void): typeof createTarget {
  return (owner, options) => {
    const target = createTarget(owner, options);
    const read = target.color.read.bind(target.color);
    target.color.read = async (options) => {
      const pixels = await read(options);
      dispose();
      return pixels;
    };
    return target;
  };
}

it("export rejects provider disposal after real mock readback and never paints", async () => {
  const gpu = await init();
  const provider = createToolcraftVgpuProvider({
    navigator: { gpu: {} },
    init: async () => gpu,
    target: targetDisposingAfterRead(() => provider.dispose()),
  });
  expect((await provider.whenInitialized()).status).toBe("ready");
  const paint = vi.fn();
  await expect(renderToolcraftVgpuExportFrame({
    provider, width: 1, height: 1, render: () => {}, imageDataConstructor,
    context: {
      getImageData: () => new ImageDataDouble(new Uint8ClampedArray(4), 1, 1) as ImageData,
      putImageData: paint,
    },
  })).rejects.toMatchObject({ code: "vgpu-export-disposed" });
  expect(provider.getState().status).toBe("disposed");
  expect(paint).not.toHaveBeenCalled();
});

it("preview rejects provider disposal after real mock readback and never paints", async () => {
  const gpu = await init();
  const provider = createToolcraftVgpuProvider({ navigator: { gpu: {} }, init: async () => gpu });
  expect((await provider.whenInitialized()).status).toBe("ready");
  const paint = vi.fn();
  const canvas = {
    width: 1, height: 1, style: {}, getContext: () => ({ putImageData: paint }),
  } as unknown as HTMLCanvasElement;
  const presentation = createToolcraftVgpuTargetPresentation({
    provider, imageDataConstructor,
    target: targetDisposingAfterRead(() => provider.dispose()),
  });
  try {
    await expect(presentation.commit({
      canvas,
      frame: { cssWidth: 1, cssHeight: 1, devicePixelRatio: 1, renderScale: 1 },
      render: () => {},
    })).rejects.toThrow("The VGPU provider changed before target presentation committed.");
    expect(provider.getState().status).toBe("disposed");
    expect(paint).not.toHaveBeenCalled();
  } finally { await presentation.dispose(); }
});
