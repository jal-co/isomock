import * as React from "react";
import { createPortal } from "react-dom";
import { useToolcraftSelector } from "@/toolcraft/runtime/react";

import styles from "./export-frame.module.css";

export function IsomockExportFrame({
  viewport,
}: Readonly<{ viewport: HTMLElement | null }>): React.JSX.Element | null {
  const canvas = useToolcraftSelector((state) => state.canvas);
  if (!viewport || canvas.mode !== "finite") return null;
  const scale = canvas.zoom / 100;
  const width = canvas.size.width * scale;
  const height = canvas.size.height * scale;

  return createPortal(
    <div
      className={styles.frame}
      data-isomock-export-frame=""
      style={{
        height,
        left: `calc(50% + ${canvas.offset.x - width / 2}px)`,
        top: `calc(50% + ${canvas.offset.y - height / 2}px)`,
        width,
      }}
    />,
    viewport,
  );
}
