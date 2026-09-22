import { afterEach, describe, expect, it, vi } from "vitest";

const playwright = vi.hoisted(() => {
  const registrations: Array<{
    callback: (fixtures: { page: unknown }) => Promise<void>;
    title: string;
  }> = [];
  let automaticFixture: (
    fixtures: object,
    use: () => Promise<void>,
    testInfo: { setTimeout: (value: number) => void; title: string },
  ) => Promise<void>;
  const protectedTest = (
    title: string,
    callback: (fixtures: { page: unknown }) => Promise<void>,
  ) => registrations.push({ callback, title });
  const baseTest = Object.assign(() => undefined, {
    extend: (definition: Record<string, unknown>) => {
      automaticFixture = (definition.toolcraftProtectedTimeout as [typeof automaticFixture])[0];
      return protectedTest;
    },
  });
  return {
    baseTest,
    getAutomaticFixture: () => automaticFixture,
    registrations,
  };
});

vi.mock("@playwright/test", () => ({
  expect: vi.fn(),
  test: playwright.baseTest,
}));

describe("protected product test timeout fixture", () => {
  afterEach(() => {
    delete process.env.TOOLCRAFT_FEATURE_VERIFICATION_PLAN;
    playwright.registrations.length = 0;
    vi.resetModules();
  });

  it("applies each mixed-plan budget before requested fixture setup", async () => {
    process.env.TOOLCRAFT_FEATURE_VERIFICATION_PLAN = JSON.stringify({
      acceptanceIds: ["extended", "standard"],
      scenarios: [
        { acceptanceIds: ["standard"], budget: "standard", file: "e2e/a.spec.ts", testName: "browser: standard" },
        { acceptanceIds: ["extended"], budget: "extended-io", file: "e2e/a.spec.ts", testName: "browser: extended" },
      ],
      version: 2,
    });
    const { test: productTest } = await import("../../../e2e/toolcraft-product-test");
    productTest("browser: standard", async () => undefined);
    productTest("browser: extended", async () => undefined);

    for (const [title, expectedTimeout] of [
      ["browser: standard", 30_000],
      ["browser: extended", 120_000],
    ] as const) {
      const events: string[] = [];
      await playwright.getAutomaticFixture()(
        {},
        async () => { events.push("requested fixture starts"); },
        {
          setTimeout: (value) => events.push(`timeout:${value}`),
          title,
        },
      );
      expect(events).toEqual([`timeout:${expectedTimeout}`, "requested fixture starts"]);
    }
  });
});
