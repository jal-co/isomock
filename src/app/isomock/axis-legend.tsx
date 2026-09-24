import * as React from "react";
import { createPortal } from "react-dom";

import styles from "./axis-legend.module.css";

const axes = [
  { axis: "X", color: "#ff215e", meaning: "Width" },
  { axis: "Y", color: "#53ff55", meaning: "Height" },
  { axis: "Z", color: "#3b69ff", meaning: "Face-on" },
] as const;

export function IsomockAxisLegend(): React.JSX.Element | null {
  const [host, setHost] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => setHost(document.body), []);
  if (!host) return null;

  return createPortal(
    <div className={styles.legend} data-isomock-axis-legend="">
      <ul className={styles.axes}>
        {axes.map(({ axis, color, meaning }) => (
          <li className={styles.axis} key={axis}>
            <span className={styles.dot} style={{ background: color }} />
            <span className={styles.name}>{axis}</span>
            <span>{meaning}</span>
          </li>
        ))}
      </ul>
      <p className={styles.hint}>
        Click a dot to look along it. Double-click to reset.
      </p>
    </div>,
    host,
  );
}
