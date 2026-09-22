import type { ToolcraftModelBounds, ToolcraftModelDocument } from "../../model-import/canonical/model-document";
import type { ToolcraftModelAssetLifecycle } from "../../model-import/model-import-types";
import type { ToolcraftSourceAssetOperationPhase } from "../../source-assets/source-asset-types";
import type { Object3D } from "three";
import {
  DEFAULT_TOOLCRAFT_ORIENTATION_POSE,
  readToolcraftOrientationPose,
  type ToolcraftOrientationPose,
} from "../orientation-gizmo/orientation-gizmo-math";
import {
  createToolcraftModelDisplayFit,
  type ToolcraftModelDisplayFit,
  type ToolcraftModelViewport,
} from "./model-display-fit";

export type ToolcraftModelPresentationAsset = Readonly<{
  activeDocumentRef: string;
  id: string;
  layerId: string;
  lifecycle: ToolcraftModelAssetLifecycle;
  sourceTarget?: string;
}>;

export type ToolcraftModelPresentationPhase =
  | ToolcraftModelAssetLifecycle
  | ToolcraftSourceAssetOperationPhase
  | "committed"
  | "final";

export type ToolcraftModelPresentationPurpose = "export" | "preview";

export type ToolcraftModelPresentationConsumerDeclaration = Readonly<{
  id: string;
  orientationTarget?: string;
  sourceTarget: string;
}>;

export type ToolcraftModelPresentationMode =
  | Readonly<{ mode: "runtime" }>
  | Readonly<{
      consumers: readonly ToolcraftModelPresentationConsumerDeclaration[];
      mode: "custom";
    }>;

export type ToolcraftModelPresentation = Readonly<{
  assetRef: string;
  canonicalDocumentRef: string;
  displayFit: ToolcraftModelDisplayFit;
  layerRef: string;
  orientation: ToolcraftOrientationPose;
  phase: ToolcraftModelPresentationPhase;
  presentationOpacity: 0.4 | 1;
  purpose: ToolcraftModelPresentationPurpose;
  target: string;
}>;

export type ToolcraftModelPresentationOptions = Readonly<{
  bounds?: ToolcraftModelBounds;
  canonicalDocumentRef?: string;
  orientation?: ToolcraftOrientationPose;
  phase: ToolcraftModelPresentationPhase;
  purpose: ToolcraftModelPresentationPurpose;
  target?: string;
  viewport?: ToolcraftModelViewport;
}>;

export type ToolcraftModelPresentationRequest = Readonly<{
  asset: ToolcraftModelPresentationAsset;
  canonicalDocumentRef?: string;
  orientation?: ToolcraftOrientationPose;
  phase: ToolcraftModelPresentationPhase;
  target: string;
  viewport?: ToolcraftModelViewport;
}>;

export type ToolcraftModelHitTestPoint = Readonly<{
  clientX: number;
  clientY: number;
}>;

export type ToolcraftModelPreviewContext = Readonly<{
  height: number;
  host: HTMLElement;
  pixelRatio: number;
  selected: boolean;
  width: number;
}>;

export type ToolcraftModelExportContext = Readonly<{
  height: number;
  onRendered?: (canvas: HTMLCanvasElement) => Promise<void> | void;
  pixelRatio: number;
  signal: AbortSignal;
  width: number;
}>;

export type ToolcraftModelPreviewPreparationContext = Readonly<{
  height: number;
  host: HTMLElement;
  pixelRatio: number;
  target: string;
  width: number;
}>;

export type ToolcraftModelResolvedResource = ArrayBuffer | Uint8Array | null;

export type ToolcraftModelPresentationLease = Readonly<{
  bounds: ToolcraftModelBounds;
  document: ToolcraftModelDocument;
  release(): void;
  root: Object3D;
}>;

export type ToolcraftModelPresentationAcquirer = (
  ref: string,
  options: Readonly<{
    purpose: ToolcraftModelPresentationPurpose;
    signal: AbortSignal;
  }>,
) => Promise<ToolcraftModelPresentationLease>;

export type ToolcraftModelRenderResourceContext = Readonly<{
  acquirePresentation: ToolcraftModelPresentationAcquirer;
  signal: AbortSignal;
}>;

export type ToolcraftModelResourceResolver = (
  ref: string,
  options: Readonly<{ signal: AbortSignal }>,
) => Promise<ToolcraftModelResolvedResource>;

export type ToolcraftModelRenderBinding<Resource = unknown> = {
  create(
    presentation: ToolcraftModelPresentation,
    context: ToolcraftModelRenderResourceContext,
  ): Promise<Resource> | Resource;
  dispose(resource: Resource): void;
  disposePreparedPreview?(): void;
  hitTest(resource: Resource, point: ToolcraftModelHitTestPoint): boolean;
  preparePreview?(
    context: ToolcraftModelPreviewPreparationContext,
  ): Promise<void> | void;
  renderExport(
    resource: Resource,
    context: ToolcraftModelExportContext,
  ): Promise<void> | void;
  renderPreview(
    resource: Resource,
    context: ToolcraftModelPreviewContext,
  ): void;
  update(
    resource: Resource,
    presentation: ToolcraftModelPresentation,
    context: ToolcraftModelRenderResourceContext,
  ): Promise<void> | void;
};

export type ToolcraftModelRenderPreparationStatus =
  | "error"
  | "idle"
  | "preparing"
  | "ready";

export type ToolcraftModelRenderBindingMap = Readonly<
  Record<string, ToolcraftModelRenderBinding<unknown>>
>;

export type ToolcraftModelRenderHost = {
  acquirePresentation: ToolcraftModelPresentationAcquirer;
  dispose(): void;
  getPreparationStatus(): ToolcraftModelRenderPreparationStatus;
  hitTest(key: string, point: ToolcraftModelHitTestPoint): boolean;
  prepare(context: ToolcraftModelPreviewPreparationContext): Promise<void>;
  release(key: string): void;
  /** @internal Keeps final renderer resources alive through export settlement. */
  retain(): () => void;
  renderExport(
    request: ToolcraftModelPresentationRequest,
    context: ToolcraftModelExportContext,
  ): Promise<void>;
  renderPreview(
    key: string,
    request: ToolcraftModelPresentationRequest,
    context: ToolcraftModelPreviewContext,
  ): Promise<void>;
  subscribePreparation(listener: () => void): () => void;
};

const DEFAULT_PRESENTATION_BOUNDS: ToolcraftModelBounds = Object.freeze({
  max: Object.freeze([1, 1, 1] as [number, number, number]),
  min: Object.freeze([-1, -1, -1] as [number, number, number]),
});

const DEFAULT_PRESENTATION_VIEWPORT: ToolcraftModelViewport = Object.freeze({
  height: 1,
  width: 1,
});

function snapshotOrientation(
  orientation: ToolcraftOrientationPose | undefined,
): ToolcraftOrientationPose {
  const pose = readToolcraftOrientationPose(
    orientation,
    DEFAULT_TOOLCRAFT_ORIENTATION_POSE,
  );

  return Object.freeze({
    position: Object.freeze([...pose.position] as [number, number, number]),
    up: Object.freeze([...pose.up] as [number, number, number]),
  });
}

export function createToolcraftModelPresentation(
  asset: ToolcraftModelPresentationAsset,
  options: ToolcraftModelPresentationOptions,
): ToolcraftModelPresentation {
  const busyPreview =
    options.purpose === "preview" &&
    (options.phase === "analyzing" || options.phase === "repairing");

  return Object.freeze({
    assetRef: asset.id,
    canonicalDocumentRef:
      options.canonicalDocumentRef ?? asset.activeDocumentRef,
    displayFit: createToolcraftModelDisplayFit(
      options.bounds ?? DEFAULT_PRESENTATION_BOUNDS,
      options.viewport ?? DEFAULT_PRESENTATION_VIEWPORT,
    ),
    layerRef: asset.layerId,
    orientation: snapshotOrientation(options.orientation),
    phase: options.phase,
    presentationOpacity: busyPreview ? 0.4 : 1,
    purpose: options.purpose,
    target: options.target ?? asset.sourceTarget ?? asset.id,
  });
}
