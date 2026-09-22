// Framework-only fixture. Generated product composition remains unchanged.
import { createRoot } from "react-dom/client";
import { defineToolcraft } from "@/toolcraft/runtime";
import {
  ControlsPanel,
  ToolcraftRoot,
  useToolcraft,
} from "@/toolcraft/runtime/react";

export type PanelScrollFixtureOptions = {
  appId?: string;
  sections?: number;
  sectionTitles?: readonly string[];
  side?: "left" | "right";
  persist?: boolean;
};

function StateProbe() {
  const { state } = useToolcraft();
  return (
    <output hidden data-testid="panel-scroll-state">
      {JSON.stringify(state.panels.controls)}
    </output>
  );
}

export function mountPanelScrollFixture({
  appId = "primary",
  sections = 8,
  sectionTitles = [],
  side = "left",
  persist = true,
}: PanelScrollFixtureOptions = {}) {
  const schema = defineToolcraft({
    base: {
      identity: {
        id: `panel-scroll-fixture-${appId}`,
        title: "Browser contract fixture",
      },
      canvas: { enabled: false },
      panels: {
        controls: {
          title: "Scroll fixture",
          sections: Array.from({ length: sections }, (_, index) => ({
            id: `field-${index + 1}`,
            title: sectionTitles[index] ?? `Field ${index + 1}`,
            controls: {
              amount: {
                applicability: { mode: "always" as const },
                type: "slider" as const,
                label: "Amount",
                target: `field${index}.amount`,
                defaultValue: 50,
                min: 0,
                max: 100,
              },
              density: {
                applicability: { mode: "always" as const },
                type: "slider" as const,
                label: "Density",
                target: `field${index}.density`,
                defaultValue: 25,
                min: 0,
                max: 100,
              },
              enabled: {
                applicability: { mode: "always" as const },
                type: "switch" as const,
                label: "Enabled",
                target: `field${index}.enabled`,
                defaultValue: true,
              },
            },
          })),
        },
      },
      persistence: persist
        ? { storage: "localStorage" }
        : { storage: "none" },
    },
    modules: [],
  });
  const host = document.createElement("div");
  host.dataset.testid = "panel-scroll-fixture";
  Object.assign(host.style, {
    position: "fixed",
    [side]: "40px",
    top: "10px",
    zIndex: "9999",
  });
  document.body.append(host);
  createRoot(host).render(
    <ToolcraftRoot schema={schema}>
      <ControlsPanel framed={false} />
      <StateProbe />
    </ToolcraftRoot>,
  );
}
