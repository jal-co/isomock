// Framework-only fixture: validates the production module composition boundary.
import * as React from "react";
import { createRoot } from "react-dom/client";
import { defineToolcraft, layersModule, timelineModule } from "@/toolcraft/runtime";
import { composeToolcraftApp, ToolcraftApp } from "@/toolcraft/runtime/react";
import "../src/styles.css";

const absent = new URLSearchParams(location.search).has("absent");
const schema = defineToolcraft({
  base: {
    identity: { id: absent ? "module-composition-absent" : "module-composition-fixture", title: "Module composition" },
    canvas: { enabled: true }, panels: {},
  },
  modules: absent ? [] : [layersModule(), timelineModule({ mode: "keyframes" })],
});
createRoot(document.getElementById("root")!).render(<ToolcraftApp {...composeToolcraftApp(schema, {})} />);
