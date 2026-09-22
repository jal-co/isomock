import { useLayoutEffect, useState } from "react";

import { useToolcraftStore } from "../../app-shell/toolcraft-store-context";
import { registerToolcraftPersistenceFlushPreparation } from "../../app-shell/persistence-flush-preparation";
import { createControlsPanelScrollController } from "./controls-panel-scroll";

export function useControlsPanelScroll() {
  const store = useToolcraftStore();
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!viewport) return;
    const controller = createControlsPanelScrollController({
      viewport,
      initialScrollTop: store.getCommittedState().panels.controls.scrollTop ?? 0,
      onScrollTopChange: (scrollTop) =>
        store.dispatch({
          type: "panels.update",
          panelId: "controls",
          patch: { scrollTop },
        }),
    });
    const unregister = registerToolcraftPersistenceFlushPreparation(store, controller.flush);
    return () => {
      unregister();
      controller.dispose();
    };
  }, [store, viewport]);

  return setViewport;
}
