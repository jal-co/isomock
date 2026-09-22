import { ToolcraftApp, ToolcraftDefaultsAuthoringProvider } from "@/toolcraft/runtime/react";

import { useAppDefaultsAuthoring } from "../toolcraft/app-defaults-authoring";
import { appComposition } from "../app/app-composition";

export function AppHome(): React.JSX.Element {
  const authoring = useAppDefaultsAuthoring();
  return (
    <ToolcraftDefaultsAuthoringProvider value={authoring}>
      <ToolcraftApp
        canvasContent={appComposition.canvasContent}
        className="h-dvh min-h-dvh"
        controlRenderers={appComposition.controlRenderers}
        exportRenderer={appComposition.exportRenderer}
        infiniteCanvasContent={appComposition.infiniteCanvasContent}
        modelPresentation={appComposition.modelPresentation}
        onPanelAction={appComposition.onPanelAction}
        renderDefaultCanvasMedia={appComposition.renderDefaultCanvasMedia}
        rendererPipelineRegistration={appComposition.rendererPipelineRegistration}
        sceneBoundsProvider={appComposition.sceneBoundsProvider}
        schema={appComposition.schema}
        svgExportRenderer={appComposition.svgExportRenderer}
      />
    </ToolcraftDefaultsAuthoringProvider>
  );
}
