import {
  defineToolcraft,
  imageExportModule,
  timelineModule,
} from "@/toolcraft/runtime";

import { appIdentity } from "./app-identity";

export const appSchema = defineToolcraft({
  base: {
    canvas: {
      enabled: true,
      renderScale: true,
      size: { height: 200, unit: "px", width: 320 },
      sizing: { mode: "editable-output" },
    },
    identity: appIdentity,
    panels: {
      controls: {
        sections: [
          {
            controls: {
              enabled: {
                applicability: { mode: "always" },
                defaultValue: true,
                label: "Field",
                performanceRole: "responsiveness",
                target: "simulation.enabled",
                type: "switch",
              },
              impulse: {
                applicability: {
                  all: [{ equals: true, target: "simulation.enabled" }],
                  mode: "conditional",
                },
                defaultValue: 0.35,
                label: "Impulse",
                max: 1,
                min: 0.1,
                performanceRole: "responsiveness",
                step: 0.05,
                target: "simulation.impulse",
                type: "slider",
                variant: "continuous",
              },
            },
            id: "simulation",
            title: "Simulation",
          },
          {
            controls: {
              includeBackground: {
                applicability: { mode: "always" },
                defaultValue: true,
                description:
                  "Controls the physical field background in preview and PNG output.",
                label: "Include",
                performanceRole: "responsiveness",
                target: "export.includeBackground",
                type: "switch",
              },
              background: {
                applicability: { mode: "always" },
                defaultValue: "#141F38",
                label: false,
                performanceRole: "responsiveness",
                target: "appearance.background",
                type: "color",
              },
            },
            layoutGroups: [
              {
                columns: 2,
                controls: ["includeBackground", "background"],
                layout: "inline",
              },
            ],
            id: "background",
            title: "Background",
          },
        ],
        title: "Physical Field Controls",
      },
    },
    toolbar: {
      history: true,
      radar: true,
      theme: true,
      zoom: true,
    },
  },
  modules: [
    imageExportModule(),
    timelineModule({ defaultDurationSeconds: 2, mode: "playback" }),
  ],
});
