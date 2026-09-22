import { parseToolcraftAppDefaults } from "@/toolcraft/runtime";
import { appSchema } from "../app/app-schema";

export function validateAppDefaults(value: unknown) {
  return parseToolcraftAppDefaults(appSchema, value);
}
