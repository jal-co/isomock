// Framework-only fixture: exercise retained settings APIs separately from product Setup.
import * as React from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@/toolcraft/ui";
import { useToolcraftSourceAssetCoordinator } from "@/toolcraft/runtime/react/app-shell/toolcraft-source-asset-context";
import { defineToolcraft, mediaSourceModule } from "@/toolcraft/runtime";
import {
  ControlsPanel,
  downloadToolcraftSettings,
  importToolcraftSettings,
  ToolcraftRoot,
  useToolcraft,
} from "@/toolcraft/runtime/react";
import "../src/styles.css";

const schema = defineToolcraft({
  base: {
    identity: {
      id: "settings-transfer-browser-fixture",
      title: "Settings transfer fixture",
    },
    canvas: { enabled: true },
    panels: {
      controls: {
        title: "Settings transfer fixture",
        sections: [
          {
            id: "source",
            title: "Source",
            controls: {
              files: {
                applicability: { mode: "always" },
                type: "fileDrop",
                assetKind: "file",
                label: "Sources",
                target: "source.files",
                multiple: true,
                accept: ".csv",
                variant: "collection-actions",
                defaultValue: [],
                itemControls: {
                  weight: {
                    type: "slider",
                    label: "Weight",
                    defaultValue: 1,
                    min: 0,
                    max: 10,
                  },
                },
              },
              title: {
                applicability: { mode: "always" },
                type: "text",
                label: "Title",
                target: "output.title",
                defaultValue: "Initial title",
              },
            },
          },
        ],
      },
    },
  },
  modules: [mediaSourceModule()],
});

function Probe() {
  const { state, dispatch } = useToolcraft();
  const currentState = React.useRef(state);
  currentState.current = state;
  const sourceAssetCoordinator = useToolcraftSourceAssetCoordinator();
  return <>
    <div style={{ position: "fixed", left: 12, top: 12 }}>
      <Button onClick={() => downloadToolcraftSettings(currentState.current)}>Export test snapshot</Button>
      <Button onClick={() => { void importToolcraftSettings({
        dispatch, getState: () => currentState.current, sourceAssetCoordinator,
      }); }}>Import test snapshot</Button>
    </div>
    <output hidden data-testid="settings-state">
      {JSON.stringify({
        canvas: state.canvas,
        values: state.values,
        mediaAssets: state.mediaAssets,
      })}
    </output>
  </>;
}

createRoot(document.getElementById("root")!).render(
  <ToolcraftRoot schema={schema}>
    <div style={{ position: "fixed", right: 12, top: 12 }}>
      <ControlsPanel framed={false} />
    </div>
    <Probe />
  </ToolcraftRoot>,
);
