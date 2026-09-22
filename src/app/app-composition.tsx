import { getToolcraftFiniteArtboardRect } from "@/toolcraft/runtime";
import { composeToolcraftApp } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";
import { isomockExportRenderer } from "./isomock/export";
import { IsomockCanvas } from "./isomock/isomock-canvas";
import { isomockPipelineRegistration } from "./isomock/pipeline";

export const appComposition = composeToolcraftApp(appSchema, {
  renderer: { pipelineRegistration: isomockPipelineRegistration },
  scene: {
    canvasContent: <IsomockCanvas />,
    rasterFrameRenderer: isomockExportRenderer,
    renderDefaultCanvasMedia: false,
    sceneBoundsProvider: ({ state }) => [getToolcraftFiniteArtboardRect(state.canvas.size)],
  },
});
