import type { ToolcraftPerformanceConfig } from "./performance-types";

export function defineToolcraftPerformance<
  const Config extends ToolcraftPerformanceConfig,
>(config: Config): Config {
  return config;
}
