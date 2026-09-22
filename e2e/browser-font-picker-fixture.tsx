// Framework-only fixture: the real compound control and runtime persistence.
import * as React from "react";
import { createRoot } from "react-dom/client";
import { defineToolcraft } from "@/toolcraft/runtime";
import {
  ControlsPanel,
  ToolcraftRoot,
  useToolcraft,
} from "@/toolcraft/runtime/react";
import "../src/styles.css";

const schema = defineToolcraft({
  base: {
    identity: {
      id: "font-picker-browser-fixture",
      title: "Font picker fixture",
    },
    canvas: { enabled: true },
    panels: {
      controls: {
        title: "Typography",
        sections: [
          {
            id: "text",
            title: "Text",
            controls: {
              font: {
                applicability: { mode: "always" },
                type: "fontPicker",
                label: "Font",
                target: "text.font",
                defaultValue: "inter",
              },
            },
          },
        ],
      },
    },
  },
  modules: [],
});

function Probe() {
  const { state } = useToolcraft();
  return (
    <output hidden data-testid="font-value">
      {JSON.stringify(state.values["text.font"])}
    </output>
  );
}

createRoot(document.getElementById("root")!).render(
  <ToolcraftRoot schema={schema}>
    <div style={{ position: "fixed", right: 12, top: 12 }}>
      <ControlsPanel framed={false} />
    </div>
    <Probe />
  </ToolcraftRoot>,
);
