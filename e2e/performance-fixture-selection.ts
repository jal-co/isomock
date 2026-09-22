import type { ToolcraftPerformanceCompiledFixturePlan } from "@/toolcraft/runtime";

export const TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR_ENV =
  "TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR";
export const TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV =
  "TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE";
export const TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH_ENV =
  "TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH";

export type ToolcraftPerformanceFixtureSelector = "development" | "maximum";
export type ToolcraftPerformanceFixtureResolutionMode =
  | "full-certification"
  | "strict-development";

export type ToolcraftPerformanceFixtureResolutionOptions = Readonly<{
  mode?: ToolcraftPerformanceFixtureResolutionMode;
}>;

export function readToolcraftPerformanceFixtureResolutionMode(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ToolcraftPerformanceFixtureResolutionMode {
  const value =
    environment[TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV];
  if (value === "strict-development") {
    if (
      !/^[a-f0-9]{64}$/u.test(
        environment[
          TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH_ENV
        ] ?? "",
      )
    ) {
      throw new Error(
        `${TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV}=strict-development requires canonical request authority.`,
      );
    }
    return "strict-development";
  }
  if (value === "full-certification") return "full-certification";
  throw new Error(
    `${TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV} must be strict-development or full-certification.`,
  );
}

export function readToolcraftPerformanceFixtureSelector(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ToolcraftPerformanceFixtureSelector {
  const value = environment[TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR_ENV];
  if (value === undefined || value === "development") return "development";
  if (value === "maximum") return "maximum";
  throw new Error(
    `${TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR_ENV} must be development or maximum.`,
  );
}

export function resolveToolcraftPerformanceFixtureSelector(
  plan: ToolcraftPerformanceCompiledFixturePlan,
  requested: ToolcraftPerformanceFixtureSelector,
  options: ToolcraftPerformanceFixtureResolutionOptions = {},
): ToolcraftPerformanceFixtureSelector {
  const mode =
    options.mode ?? readToolcraftPerformanceFixtureResolutionMode();
  if (mode === "strict-development") {
    if (requested === "maximum") {
      throw new Error(
        `Toolcraft performance path "${plan.pathId}" strict development fixture mode cannot select maximum. Targeted verification requires a reachable bounded development fixture.`,
      );
    }
    if (plan.development.status !== "available") {
      throw new Error(
        `Toolcraft performance path "${plan.pathId}" requires a reachable bounded development fixture for targeted verification. ${plan.development.reason}`,
      );
    }
    return "development";
  }

  if (requested !== "maximum") {
    throw new Error(
      `Toolcraft performance path "${plan.pathId}" full certification requires maximum fixture selection.`,
    );
  }
  return "maximum";
}
