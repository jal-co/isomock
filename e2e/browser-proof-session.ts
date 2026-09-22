import {
  expect,
  type ElementHandle,
  type Locator,
  type Page,
} from "@playwright/test";

import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import {
  createToolcraftSurfaceActionRunner,
  normalizeToolcraftSurfaceActionOptions,
  type ToolcraftBrowserActionSurface,
  type ToolcraftBrowserSurfaceActionOptions,
} from "./browser-proof-surface-action";
import type {
  ToolcraftBrowserAction,
  ToolcraftBrowserObservation,
} from "./browser-proof-types";
const TOOLCRAFT_APP_ROOT_SELECTOR = '[data-slot="toolcraft-runtime-app"]';
const TOOLCRAFT_APP_TITLE_SELECTOR = 'meta[name="toolcraft-app-title"]';
const TOOLCRAFT_SERVER_IDENTITY_PATH = "/.toolcraft/server-identity.json";

declare const toolcraftBrowserSessionBrand: unique symbol;

export type {
  ToolcraftBrowserAction,
  ToolcraftBrowserObservation,
} from "./browser-proof-types";
export type { ToolcraftBrowserActionSurface } from "./browser-proof-surface-action";

export type ToolcraftBrowserProofSession = {
  action<Result = void>(
    run: (page: Page) => Promise<Result>,
  ): ToolcraftBrowserAction<"interaction", Result>;
  controlAction<Result = void>(
    target: string,
    run: (control: Locator, page: Page) => Promise<Result>,
  ): ToolcraftBrowserAction<"interaction", Result>;
  surfaceAction(
    target: string,
    options: ToolcraftBrowserSurfaceActionOptions,
  ): ToolcraftBrowserAction<"interaction">;
  targetAction<Result = void>(
    target: string,
    run: (page: Page) => Promise<Result>,
  ): ToolcraftBrowserAction<"interaction", Result>;
  observe<T>(
    read: (root: HTMLElement) => T | Promise<T>,
  ): ToolcraftBrowserObservation<T>;
  reload(): ToolcraftBrowserAction<"reload">;
  readonly [toolcraftBrowserSessionBrand]: true;
};

type SessionRecord = {
  appTitle: string;
  origin: string;
  page: Page;
  rootElement: ElementHandle<HTMLElement>;
  serverRoot: string;
  token: object;
};

type ActionRecord = {
  kind: "interaction" | "reload";
  run: (page: Page) => Promise<unknown>;
  session: SessionRecord;
  surface?: ToolcraftBrowserActionSurface;
  target?: string;
};

type ObservationRecord<T> = {
  read: (root: HTMLElement) => T | Promise<T>;
  session: SessionRecord;
};

const actionRecords = new WeakMap<object, ActionRecord>();
const observationRecords = new WeakMap<object, ObservationRecord<unknown>>();
const sessionRecords = new WeakMap<object, SessionRecord>();

type ToolcraftServerIdentity = {
  appTitle: string;
  root: string;
};

function getHttpOrigin(page: Page): string {
  let url: URL;

  try {
    url = new URL(page.url());
  } catch {
    throw new Error(
      "A Toolcraft browser proof session requires a server-backed http(s) page.",
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      "A Toolcraft browser proof session requires a server-backed http(s) page; synthetic, data, file, and about documents are not proof.",
    );
  }

  return url.origin;
}

async function readToolcraftServerIdentity(
  page: Page,
  origin: string,
): Promise<ToolcraftServerIdentity> {
  const response = await page.request.get(
    new URL(TOOLCRAFT_SERVER_IDENTITY_PATH, origin).href,
    { headers: { "cache-control": "no-cache" } },
  );

  expect(
    response.ok(),
    "The Toolcraft browser proof origin must expose the current server identity endpoint.",
  ).toBe(true);
  const identity = (await response.json()) as Partial<ToolcraftServerIdentity>;
  expect(
    identity.appTitle?.trim(),
    "The Toolcraft server identity must include a non-empty appTitle.",
  ).toBeTruthy();
  expect(
    identity.root?.trim(),
    "The Toolcraft server identity must include the current app root.",
  ).toBeTruthy();

  return {
    appTitle: identity.appTitle!.trim(),
    root: identity.root!.trim(),
  };
}

async function assertLiveToolcraftSession(record: SessionRecord): Promise<void> {
  expect(record.page.isClosed(), "The Toolcraft browser proof page must remain open.").toBe(
    false,
  );
  expect(
    getHttpOrigin(record.page),
    "The Toolcraft browser proof page must remain on its verified server origin.",
  ).toBe(record.origin);
  const serverIdentity = await readToolcraftServerIdentity(
    record.page,
    record.origin,
  );
  expect(
    serverIdentity,
    "The Toolcraft browser proof page must remain attached to the same app server root.",
  ).toEqual({ appTitle: record.appTitle, root: record.serverRoot });
  const appTitle = await record.page
    .locator(TOOLCRAFT_APP_TITLE_SELECTOR)
    .getAttribute("content");
  expect(
    appTitle?.trim(),
    "The Toolcraft browser proof page must preserve its toolcraft-app-title identity.",
  ).toBe(record.appTitle);
  expect(
    await record.rootElement.evaluate(
      (root, selector) => root.isConnected && root === document.querySelector(selector),
      TOOLCRAFT_APP_ROOT_SELECTOR,
    ),
    "The Toolcraft browser proof session must remain attached to the original live runtime root.",
  ).toBe(true);
  await expect(
    record.page.locator(TOOLCRAFT_APP_ROOT_SELECTOR),
    "The Toolcraft browser proof session requires one visible current Toolcraft runtime app root.",
  ).toHaveCount(1);
  await expect(record.page.locator(TOOLCRAFT_APP_ROOT_SELECTOR)).toBeVisible();
}

async function getVisibleToolcraftRoot(
  page: Page,
): Promise<ElementHandle<HTMLElement>> {
  const root = page.locator(TOOLCRAFT_APP_ROOT_SELECTOR);
  await expect(
    root,
    "The Toolcraft browser proof session requires one visible current Toolcraft runtime app root.",
  ).toHaveCount(1);
  await expect(root).toBeVisible();
  const element = await root.elementHandle();
  expect(element).not.toBeNull();
  return element as ElementHandle<HTMLElement>;
}

function requireAction(value: unknown): ActionRecord {
  const record =
    typeof value === "object" && value !== null
      ? actionRecords.get(value)
      : undefined;
  if (!record) {
    throw new Error(
      "Semantic evidence actions must come from a Toolcraft browser proof session; raw callbacks are not browser proof.",
    );
  }
  return record;
}

function requireObservation<T>(value: unknown): ObservationRecord<T> {
  const record =
    typeof value === "object" && value !== null
      ? observationRecords.get(value)
      : undefined;
  if (!record) {
    throw new Error(
      "Semantic evidence observations must come from a Toolcraft browser proof session; raw callbacks are not browser proof.",
    );
  }
  return record as ObservationRecord<T>;
}

function requireSession(value: unknown): SessionRecord {
  const record =
    typeof value === "object" && value !== null
      ? sessionRecords.get(value)
      : undefined;
  if (!record) {
    throw new Error(
      "Browser evidence requires a verified Toolcraft browser proof session.",
    );
  }
  return record;
}

function normalizeActionTarget(target: string): string {
  const normalizedTarget = target.trim();
  if (!normalizedTarget) {
    throw new Error(
      "A target-scoped Toolcraft browser action requires a non-empty semantic target.",
    );
  }
  return normalizedTarget;
}

export async function createToolcraftBrowserProofSession(
  page: Page,
): Promise<ToolcraftBrowserProofSession> {
  const origin = getHttpOrigin(page);
  const response = await page.reload({ waitUntil: "domcontentloaded" });
  expect(
    response?.ok(),
    "A Toolcraft browser proof session must begin from a fresh successful server navigation.",
  ).toBe(true);
  const serverIdentity = await readToolcraftServerIdentity(page, origin);
  const appTitle = await page.evaluate(
    (selector) => document.querySelector(selector)?.getAttribute("content") ?? null,
    TOOLCRAFT_APP_TITLE_SELECTOR,
  );
  expect(
    appTitle?.trim(),
    "A Toolcraft browser proof session requires a non-empty toolcraft-app-title meta marker.",
  ).toBeTruthy();
  expect(
    appTitle!.trim(),
    "The document identity must match the Toolcraft app served by the current origin.",
  ).toBe(serverIdentity.appTitle);
  const rootElement = await getVisibleToolcraftRoot(page);
  const record: SessionRecord = {
    appTitle: appTitle!.trim(),
    origin,
    page,
    rootElement,
    serverRoot: serverIdentity.root,
    token: Object.freeze({}),
  };
  await assertLiveToolcraftSession(record);

  const session = Object.freeze({
    action<Result = void>(
      run: (currentPage: Page) => Promise<Result>,
    ): ToolcraftBrowserAction<"interaction", Result> {
      const action = Object.freeze({}) as ToolcraftBrowserAction<
        "interaction",
        Result
      >;
      actionRecords.set(action, { kind: "interaction", run, session: record });
      return action;
    },
    controlAction<Result = void>(
      target: string,
      run: (control: Locator, currentPage: Page) => Promise<Result>,
    ): ToolcraftBrowserAction<"interaction", Result> {
      const normalizedTarget = normalizeActionTarget(target);
      const action = Object.freeze({}) as ToolcraftBrowserAction<
        "interaction",
        Result
      >;
      actionRecords.set(action, {
        kind: "interaction",
        run: async (currentPage) => {
          const control = await getToolcraftControlFieldByTarget(
            currentPage,
            normalizedTarget,
          );
          return run(control, currentPage);
        },
        session: record,
        surface: "panel",
        target: normalizedTarget,
      });
      return action;
    },
    surfaceAction(
      target: string,
      rawOptions: ToolcraftBrowserSurfaceActionOptions,
    ): ToolcraftBrowserAction<"interaction"> {
      const normalizedTarget = normalizeActionTarget(target);
      const options = normalizeToolcraftSurfaceActionOptions(rawOptions);
      const action = Object.freeze({}) as ToolcraftBrowserAction<"interaction">;
      actionRecords.set(action, {
        kind: "interaction",
        run: createToolcraftSurfaceActionRunner(options),
        session: record,
        surface: options.surface,
        target: normalizedTarget,
      });
      return action;
    },
    targetAction<Result = void>(
      target: string,
      run: (currentPage: Page) => Promise<Result>,
    ): ToolcraftBrowserAction<"interaction", Result> {
      const action = Object.freeze({}) as ToolcraftBrowserAction<
        "interaction",
        Result
      >;
      actionRecords.set(action, {
        kind: "interaction",
        run,
        session: record,
        target: normalizeActionTarget(target),
      });
      return action;
    },
    observe<T>(
      read: (root: HTMLElement) => T | Promise<T>,
    ): ToolcraftBrowserObservation<T> {
      const observation = Object.freeze({}) as ToolcraftBrowserObservation<T>;
      observationRecords.set(observation, { read, session: record });
      return observation;
    },
    reload(): ToolcraftBrowserAction<"reload"> {
      const action = Object.freeze({}) as ToolcraftBrowserAction<"reload">;
      actionRecords.set(action, {
        kind: "reload",
        run: (currentPage) => currentPage.reload().then(() => undefined),
        session: record,
      });
      return action;
    },
  }) as ToolcraftBrowserProofSession;
  sessionRecords.set(session, record);
  return session;
}

export function assertToolcraftBrowserProofSession(
  observation: unknown,
  ...actions: readonly unknown[]
): void {
  const observationRecord = requireObservation(observation);
  for (const action of actions) {
    const actionRecord = requireAction(action);
    if (actionRecord.session.token !== observationRecord.session.token) {
      throw new Error(
        "Semantic evidence observations and actions must belong to the same browser proof session.",
      );
    }
  }
}

export function assertToolcraftBrowserActionForSession(
  session: ToolcraftBrowserProofSession,
  action: ToolcraftBrowserAction,
): void {
  const sessionRecord = requireSession(session);
  const actionRecord = requireAction(action);
  if (sessionRecord.token !== actionRecord.session.token) {
    throw new Error(
      "Browser evidence actions must belong to the same browser proof session.",
    );
  }
}

export function getToolcraftBrowserActionTarget(
  action: ToolcraftBrowserAction,
): string | undefined {
  return requireAction(action).target;
}

export function getToolcraftBrowserActionSurface(
  action: ToolcraftBrowserAction,
): ToolcraftBrowserActionSurface | undefined {
  return requireAction(action).surface;
}

export async function readToolcraftBrowserObservation<T>(
  observation: ToolcraftBrowserObservation<T>,
): Promise<T> {
  const record = requireObservation<T>(observation);
  await assertLiveToolcraftSession(record.session);
  return record.session.rootElement.evaluate(record.read);
}

export async function runToolcraftBrowserAction(
  action: ToolcraftBrowserAction,
  expectedKind: "interaction" | "reload" = "interaction",
): Promise<void> {
  const record = requireAction(action);
  if (record.kind !== expectedKind) {
    throw new Error(
      `Semantic evidence requires a ${expectedKind} browser proof action, received ${record.kind}.`,
    );
  }
  await assertLiveToolcraftSession(record.session);
  await record.run(record.session.page);
  if (record.kind === "reload") {
    record.session.rootElement = await getVisibleToolcraftRoot(record.session.page);
  }
  await assertLiveToolcraftSession(record.session);
}

export async function runToolcraftBrowserValueAction<Result>(
  action: ToolcraftBrowserAction<"interaction", Result>,
): Promise<Result> {
  const record = requireAction(action);
  if (record.kind !== "interaction") {
    throw new Error(
      `Semantic evidence requires a interaction browser proof action, received ${record.kind}.`,
    );
  }
  await assertLiveToolcraftSession(record.session);
  const result = await record.run(record.session.page);
  await assertLiveToolcraftSession(record.session);
  return result as Result;
}

export function isToolcraftBrowserProofSession(value: unknown): boolean {
  return typeof value === "object" && value !== null && sessionRecords.has(value);
}

export function isToolcraftBrowserAction(value: unknown): value is ToolcraftBrowserAction {
  return typeof value === "object" && value !== null && actionRecords.has(value);
}

export async function getToolcraftBrowserProofPage(
  session: ToolcraftBrowserProofSession,
): Promise<Page> {
  const record = requireSession(session);
  await assertLiveToolcraftSession(record);
  return record.page;
}
