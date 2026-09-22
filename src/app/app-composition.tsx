import { composeToolcraftApp } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";

export const appComposition = composeToolcraftApp(appSchema, {});
