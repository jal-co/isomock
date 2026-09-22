"use client";

import * as React from "react";
import { ToolcraftHistoryContext, createRuntimeHistoryPort, requestToolcraftHistory } from './history-scope';

import type { AnyToolcraftRendererPipelineRegistration } from "../../rendering";
import type { ResolvedToolcraftAppSchema } from "../../schema/resolved-app-schema";
import { createToolcraftState } from "../../state/create-template-state";
import { mergeToolcraftInitialState } from "../../composition/public-persistence";
import { createToolcraftExternalStore } from "../../composition/public-state";
import type { ToolcraftCommand, ToolcraftInitialState, ToolcraftState } from "../../state/types";
import {
  ToolcraftThemeContext,
  ToolcraftThemeProvider,
  ToolcraftThemeScope,
} from "./theme-runtime";
import { ToolcraftBrowserZoomBoundary } from "./toolcraft-browser-zoom-boundary";
import { ToolcraftPipelineProvider } from "./toolcraft-pipeline-context";
import { ToolcraftSourceAssetProvider } from "./toolcraft-source-asset-context";
import { ToolcraftExportProvider } from "./toolcraft-export-context";
import { ToolcraftStoreContext } from "./toolcraft-store-context";
import type { ToolcraftModelPresentationMode } from "../model-rendering/model-render-binding";
import {
  resolveToolcraftModelPresentationMode,
  ToolcraftModelPresentationModeContext,
} from "../model-rendering/model-presentation-mode";
import {
  ToolcraftPersistenceStatusProvider,
  useToolcraftPersistence,
} from "./use-toolcraft-persistence";
import { readToolcraftPersistenceBootstrap } from "./toolcraft-persistence-bootstrap";

export type ToolcraftContextValue = {
  dispatch: React.Dispatch<ToolcraftCommand>;
  state: ToolcraftState;
};

export const ToolcraftContext = React.createContext<ToolcraftContextValue | null>(null);

export type ToolcraftRootProps = {
  children: React.ReactNode;
  initialState?: ToolcraftInitialState;
  modelPresentation?: ToolcraftModelPresentationMode;
  persistenceAuthority?: "runtime" | "external";
  rendererPipelineRegistration?: AnyToolcraftRendererPipelineRegistration;
  schema: ResolvedToolcraftAppSchema;
};

const nativeTextEditingInputTypes = new Set([
  "date",
  "datetime-local",
  "email",
  "month",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "time",
  "url",
  "week",
]);
function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }

  const candidate = target as {
    closest?: (selector: string) => Element | null;
    isContentEditable?: boolean;
    tagName?: string;
    type?: string;
  };

  if (candidate.isContentEditable) {
    return true;
  }

  if (typeof candidate.closest === "function" && candidate.closest("[contenteditable='true']")) {
    return true;
  }

  const tagName = candidate.tagName?.toLowerCase();

  if (tagName === "textarea" || tagName === "select") {
    return true;
  }

  return (
    tagName === "input" && nativeTextEditingInputTypes.has(candidate.type?.toLowerCase() ?? "text")
  );
}

function isUndoShortcut(event: KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === "z"
  );
}

function isRedoShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();

  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    ((event.shiftKey && key === "z") || (!event.metaKey && event.ctrlKey && key === "y"))
  );
}

export function ToolcraftRoot({
  children,
  initialState,
  modelPresentation,
  persistenceAuthority = "runtime",
  rendererPipelineRegistration,
  schema,
}: ToolcraftRootProps) {
  const inheritedTheme = React.useContext(ToolcraftThemeContext);
  const persistenceSchema = schema;
  const storageKind = "localStorage";
  const [persistenceBootstrap] = React.useState(() =>
    persistenceAuthority === "external"
      ? {}
      : readToolcraftPersistenceBootstrap(persistenceSchema, storageKind),
  );
  const [owner] = React.useState(() => {
    const state = createToolcraftState(
      schema,
      mergeToolcraftInitialState(persistenceBootstrap.initialState, initialState),
    );
    return createToolcraftExternalStore(state);
  });
  const store = owner;
  const history = React.useMemo(() => createRuntimeHistoryPort(store), [store]);
  const state = React.useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const dispatch: React.Dispatch<ToolcraftCommand> = store.dispatch;
  const persistenceStatus = useToolcraftPersistence(persistenceSchema, store, {
    authority: persistenceAuthority,
    storageKind,
    blockedReason: persistenceBootstrap.blockedReason,
    checkpoint: persistenceBootstrap.checkpoint,
  });
  const value = React.useMemo(() => ({ dispatch, state }), [dispatch, state]);
  const resolvedModelPresentation = React.useMemo(
    () => resolveToolcraftModelPresentationMode(schema, modelPresentation),
    [modelPresentation, schema],
  );

  React.useEffect(() => {
    if (!schema.toolbar.history || typeof document === "undefined") {
      return undefined;
    }

    const handleDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || isEditableKeyboardTarget(event.target)) {
        return;
      }

      if (isUndoShortcut(event)) {
        event.preventDefault();
        requestToolcraftHistory(history, 'undo');
        return;
      }

      if (isRedoShortcut(event)) {
        event.preventDefault();
        requestToolcraftHistory(history, 'redo');
      }
    };

    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [history, schema.toolbar.history]);

  const workspace = (
    <ToolcraftStoreContext.Provider value={store}>
        <ToolcraftSourceAssetProvider store={store}>
          <ToolcraftExportProvider store={store}>
            <ToolcraftHistoryContext.Provider value={history}>
              <ToolcraftContext.Provider value={value}>{children}</ToolcraftContext.Provider>
            </ToolcraftHistoryContext.Provider>
          </ToolcraftExportProvider>
        </ToolcraftSourceAssetProvider>
    </ToolcraftStoreContext.Provider>
  );
  const content = (
    <ToolcraftPersistenceStatusProvider status={persistenceStatus}>
      <ToolcraftModelPresentationModeContext.Provider value={resolvedModelPresentation}>
        <ToolcraftBrowserZoomBoundary>
          {inheritedTheme ? (
            <ToolcraftThemeScope value={inheritedTheme}>{workspace}</ToolcraftThemeScope>
          ) : (
            <ToolcraftThemeProvider defaultPreference={schema.sourceDefaults?.theme}>
              {workspace}
            </ToolcraftThemeProvider>
          )}
        </ToolcraftBrowserZoomBoundary>
      </ToolcraftModelPresentationModeContext.Provider>
    </ToolcraftPersistenceStatusProvider>
  );

  return rendererPipelineRegistration ? (
    <ToolcraftPipelineProvider registration={rendererPipelineRegistration}>
      {content}
    </ToolcraftPipelineProvider>
  ) : (
    content
  );
}
