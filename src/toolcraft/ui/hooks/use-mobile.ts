import * as React from "react";
import {
  readBrowserViewportWidth,
  subscribeBrowserMediaQuery,
} from "../components/primitives/browser-transport";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const onChange = () => {
      setIsMobile((readBrowserViewportWidth() ?? MOBILE_BREAKPOINT) < MOBILE_BREAKPOINT);
    };

    const unsubscribe = subscribeBrowserMediaQuery(
      `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
      onChange,
    );
    onChange();

    return unsubscribe;
  }, []);

  return !!isMobile;
}
