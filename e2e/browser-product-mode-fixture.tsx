// Framework-only fixture: real panel rendering and persistence for requested modes.
import * as React from "react";
import { createRoot } from "react-dom/client";
import { composeToolcraftApp, ToolcraftApp, useToolcraftValue } from "@/toolcraft/runtime/react";
import { createProductModeFixture } from "../src/app/acceptance/product-mode.test-support";
import "../src/styles.css";

function SceneCaption() {
  const mode = useToolcraftValue("scene.mode");
  const diagram = useToolcraftValue("scene.caption");
  const map = useToolcraftValue("map.caption");
  return <span data-product-mode-output={String(mode)}>{String(mode === "map" ? map : diagram)}</span>;
}

const { schema } = createProductModeFixture();
createRoot(document.getElementById("root")!).render(
  <ToolcraftApp {...composeToolcraftApp(schema, { scene: { canvasContent: <SceneCaption /> } })} />,
);
