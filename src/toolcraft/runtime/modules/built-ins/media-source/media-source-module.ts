import { validateContribution } from "./declaration";
import { TOOLCRAFT_MEDIA_SOURCE_KINDS } from "../../contract/contribution";
import { createBuiltInToolcraftProductModuleDefinition } from "../../contract/module-definition";

const mediaSourceModuleDefinition =
  createBuiltInToolcraftProductModuleDefinition({
    contributions: [
      {
        id: "media-source.policy",
        kind: "media-policy",
        moduleId: "media-source",
        policy: "source-workflow",
        sourceKinds: TOOLCRAFT_MEDIA_SOURCE_KINDS,
      },
      {
        id: "media-source.persistence",
        kind: "persistence-requirement",
        moduleId: "media-source",
        slice: "media",
      },
    ],
    defaultProviders: [],
    id: "media-source",
    portRequirements: [],
    provides: ["media.source"],
    requires: [],
  }, validateContribution);

export function mediaSourceModule() {
  return mediaSourceModuleDefinition;
}
