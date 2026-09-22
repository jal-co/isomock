"use client";

import * as React from "react";
import {
  PortalLayerContainerProvider,
  TooltipProvider,
} from "@/toolcraft/ui/components/primitives";

export const TOOLCRAFT_THEME_PREFERENCE_STORAGE_KEY = "appearance.theme.v1" as const;
export const TOOLCRAFT_DEFAULT_THEME_PREFERENCE = "dark" as const;

export type ToolcraftThemePreference = "dark" | "light" | "system";
export type ToolcraftResolvedTheme = "dark" | "light";

export type ToolcraftThemeContextValue = {
  initialized: boolean;
  resolvedTheme: ToolcraftResolvedTheme;
  setThemePreference: (themePreference: ToolcraftThemePreference) => void;
  themePreference: ToolcraftThemePreference;
  toggleResolvedTheme: () => void;
};

const colorSchemeMediaQuery = "(prefers-color-scheme: dark)";

export const ToolcraftThemeContext = React.createContext<ToolcraftThemeContextValue | null>(null);

function isToolcraftThemePreference(
  value: unknown,
): value is ToolcraftThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

function getSystemResolvedTheme(): ToolcraftResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return TOOLCRAFT_DEFAULT_THEME_PREFERENCE;
  }

  return window.matchMedia(colorSchemeMediaQuery).matches ? "dark" : "light";
}

function resolveThemePreference(
  themePreference: ToolcraftThemePreference,
): ToolcraftResolvedTheme {
  return themePreference === "system" ? getSystemResolvedTheme() : themePreference;
}

function readStoredThemePreference(): ToolcraftThemePreference | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(TOOLCRAFT_THEME_PREFERENCE_STORAGE_KEY);

    return isToolcraftThemePreference(rawValue) ? rawValue : null;
  } catch {
    return null;
  }
}

function writeStoredThemePreference(themePreference: ToolcraftThemePreference): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(TOOLCRAFT_THEME_PREFERENCE_STORAGE_KEY, themePreference);
  } catch {
    // Keep the active theme in memory if storage is unavailable.
  }
}

export function ToolcraftThemeProvider({
  children,
  defaultPreference = TOOLCRAFT_DEFAULT_THEME_PREFERENCE,
}: {
  children: React.ReactNode;
  defaultPreference?: ToolcraftThemePreference;
}): React.JSX.Element {
  const [initialized, setInitialized] = React.useState(false);
  const [themePreference, setThemePreferenceState] =
    React.useState<ToolcraftThemePreference>(() => readStoredThemePreference() ?? defaultPreference);
  const [resolvedTheme, setResolvedTheme] = React.useState<ToolcraftResolvedTheme>(() =>
    resolveThemePreference(readStoredThemePreference() ?? defaultPreference),
  );

  const setThemePreference = React.useCallback(
    (nextThemePreference: ToolcraftThemePreference): void => {
      const nextResolvedTheme = resolveThemePreference(nextThemePreference);

      writeStoredThemePreference(nextThemePreference);
      setThemePreferenceState(nextThemePreference);
      setResolvedTheme(nextResolvedTheme);
      setInitialized(true);
    },
    [],
  );

  const toggleResolvedTheme = React.useCallback((): void => {
    setThemePreference(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setThemePreference]);

  React.useEffect(() => {
    setThemePreference(themePreference);
  }, [setThemePreference, themePreference]);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQueryList = window.matchMedia(colorSchemeMediaQuery);
    const handleChange = (): void => {
      if (themePreference !== "system") {
        return;
      }

      const nextResolvedTheme = getSystemResolvedTheme();

      setResolvedTheme(nextResolvedTheme);
    };

    mediaQueryList.addEventListener("change", handleChange);

    return () => {
      mediaQueryList.removeEventListener("change", handleChange);
    };
  }, [themePreference]);

  const value = React.useMemo(
    () => ({
      initialized,
      resolvedTheme,
      setThemePreference,
      themePreference,
      toggleResolvedTheme,
    }),
    [initialized, resolvedTheme, setThemePreference, themePreference, toggleResolvedTheme],
  );

  return <ToolcraftThemeScope value={value}>{children}</ToolcraftThemeScope>;
}

/** Share theme state while retaining a local portal container and input boundary. */
export function ToolcraftThemeScope({
  children,
  value,
}: {
  children: React.ReactNode;
  value: ToolcraftThemeContextValue;
}): React.JSX.Element {
  const portalRootRef = React.useRef<HTMLDivElement | null>(null);

  return (
    <ToolcraftThemeContext.Provider value={value}>
      <div
        data-toolcraft-theme={value.resolvedTheme}
        data-toolcraft-theme-scope=""
        style={{
          colorScheme: value.resolvedTheme,
          display: "contents",
        }}
      >
        <PortalLayerContainerProvider container={portalRootRef}>
          <TooltipProvider>{children}</TooltipProvider>
        </PortalLayerContainerProvider>
        <div
          data-toolcraft-portal-root=""
          ref={portalRootRef}
          style={{ display: "contents" }}
        />
      </div>
    </ToolcraftThemeContext.Provider>
  );
}

export function useToolcraftTheme(): ToolcraftThemeContextValue {
  const context = React.useContext(ToolcraftThemeContext);

  if (!context) {
    throw new Error("useToolcraftTheme must be used within ToolcraftThemeProvider");
  }

  return context;
}
