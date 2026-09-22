import { defineToolcraft, mediaSourceModule } from "@/toolcraft/runtime";

import appDefaults from "./app-defaults.json" with { type: "json" };
import { appIdentity } from "./app-identity";

export const appSchema = defineToolcraft({
  defaults: appDefaults,
  base: {
    canvas: {
      enabled: true,
      upload: true,
    },
    identity: appIdentity,
    panels: {
      controls: {
        sections: [],
        title: "Controls",
      },
    },
    toolbar: {
      history: true,
      radar: true,
      zoom: true,
    },
  },
  modules: [mediaSourceModule()],
});
