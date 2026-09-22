import type { ToolcraftControlSchema } from "@/toolcraft/runtime";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftMediaLifecycleCoverage,
  ToolcraftModelImportCoverage,
} from "./acceptance/types";
import { mediaSourceModule, model3dModule } from "@/toolcraft/runtime";
import { defineContractSchemaFixture } from "./app-acceptance.contract-fixtures";

type FileDropSchemaOptions = {
  withDefaultAsset?: boolean;
};

type FileDropAcceptanceOptions = {
  automatedTestName: string;
  browserProofTestName: string;
  expectedObservable: string;
  fixture: string;
  id?: string;
  mediaLifecycleCoverage?: readonly ToolcraftMediaLifecycleCoverage[];
  modelImportCoverage?:
    | "all-required-model-import-behavior"
    | readonly ToolcraftModelImportCoverage[];
  target?: string;
  userAction: string;
};

export function createSingleFileDropSchema({
  withDefaultAsset = false,
}: FileDropSchemaOptions = {}) {
  return defineContractSchemaFixture({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: { enabled: true, upload: withDefaultAsset },
      ...(withDefaultAsset
        ? {
            media: {
              defaultAssets: [
                {
                  dataUrl: "data:image/png;base64,AAAA",
                  fileName: "default-source.png",
                  ingressPolicy: "prepared-source",
                  position: { x: 0, y: 0 },
                  sourceSize: { width: 100, height: 80, unit: "px" },
                  sourceTarget: "media.source",
                },
              ],
            },
          }
        : {}),
      panels: {
        controls: {
          sections: [
            {
              id: "source",
              controls: {
                source: {
                  applicability: { mode: "always" as const },
                  defaultValue: null,
                  label: "Source image",
                  target: "media.source",
                  type: "fileDrop",
                },
              },
              title: "Source",
            },
          ],
          title: "Controls",
        },
      },
    },
    modules: [mediaSourceModule()],
  });
}

export function createMultipleFileDropSchema({
  collectionActions = false,
}: {
  collectionActions?: boolean;
} = {}) {
  const common = {
    applicability: { mode: "always" as const },
    defaultValue: [],
    label: "Source images",
    multiple: true,
    target: "media.sources",
    type: "fileDrop",
  } satisfies ToolcraftControlSchema;
  const sources: ToolcraftControlSchema = collectionActions
    ? { ...common, assetKind: "file", variant: "collection-actions" }
    : common;
  return defineContractSchemaFixture({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              id: "source",
              controls: {
                sources,
              },
              title: "Source",
            },
          ],
          title: "Controls",
        },
      },
    },
    modules: [mediaSourceModule()],
  });
}

export function createModelFileDropSchema() {
  return defineContractSchemaFixture({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              id: "model",
              controls: {
                model: {
                  applicability: { mode: "always" as const },
                  assetKind: "model",
                  defaultValue: null,
                  label: "Model",
                  target: "media.model",
                  type: "fileDrop",
                },
              },
              title: "Model",
            },
          ],
          title: "Controls",
        },
      },
    },
    modules: [mediaSourceModule(), model3dModule()],
  });
}

export function createFileDropAcceptance({
  automatedTestName,
  browserProofTestName,
  expectedObservable,
  fixture,
  id = "media.source",
  mediaLifecycleCoverage,
  modelImportCoverage,
  target = id,
  userAction,
}: FileDropAcceptanceOptions): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName,
    browser: {
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: browserProofTestName,
    },
    componentType: "fileDrop",
    evidence: "media-lifecycle",
    expectedObservable,
    fixture,
    id,
    kind: "control",
    mediaLifecycleCoverage,
    modelImportCoverage,
    target,
    userAction,
  };
}
