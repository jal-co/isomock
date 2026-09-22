import {
  BufferGeometry,
  Group,
  LinearSRGBColorSpace,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
  type Camera,
  type Intersection,
  type Object3D,
} from "three";

import {
  TOOLCRAFT_MODEL_FALLBACK_APPEARANCE,
  type ToolcraftModelPrimitiveV1,
  type ToolcraftModelPrimitiveV2,
} from "../../model-import/canonical/model-document";
import type {
  ToolcraftModelPresentation,
  ToolcraftModelPresentationLease,
  ToolcraftModelPreviewPreparationContext,
  ToolcraftModelRenderBinding,
  ToolcraftModelRenderResourceContext,
} from "./model-render-binding";
import { createToolcraftModelDisplayFit } from "./model-display-fit";
import {
  buildToolcraftCanonicalThreeModel,
  createToolcraftThreeModelScene,
  createToolcraftThreePrewarmDocument,
  disposeToolcraftCanonicalThreeModel,
  type ToolcraftCanonicalThreeModel,
} from "./three-canonical-model";

export type ToolcraftThreeRenderer = {
  dispose(): void;
  domElement: HTMLCanvasElement;
  render(scene: Object3D, camera: Camera): void;
  renderLists?: { dispose(): void };
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
};

export type ToolcraftThreeModelRenderResource = {
  camera: PerspectiveCamera;
  configuredHeight: number;
  configuredPixelRatio: number;
  configuredWidth: number;
  disposed: boolean;
  fitRoot: Group;
  geometries: readonly BufferGeometry[];
  lease: ToolcraftModelPresentationLease;
  materials: readonly MeshStandardMaterial[];
  modelRoot: Object3D;
  nodeObjects: ReadonlyMap<string, Group>;
  presentation: ToolcraftModelPresentation;
  raycaster: Raycaster;
  renderer: ToolcraftThreeRenderer;
  retainedPrewarmModel?: ToolcraftCanonicalThreeModel;
  scene: Scene;
};

export type ToolcraftThreeModelRenderAdapterOptions = Readonly<{
  createRenderer?: () => ToolcraftThreeRenderer;
}>;

type ToolcraftPreparedThreeRenderer = Readonly<{
  camera: PerspectiveCamera;
  context: ToolcraftModelPreviewPreparationContext;
  renderer: ToolcraftThreeRenderer;
  retainedModel: ToolcraftCanonicalThreeModel;
  scene: Scene;
}>;

type ToolcraftIdleThreeRenderer = Readonly<{
  renderer: ToolcraftThreeRenderer;
  retainedModel?: ToolcraftCanonicalThreeModel;
}>;

type InspectedPresentationRoot = Readonly<{
  geometries: readonly BufferGeometry[];
  materials: readonly MeshStandardMaterial[];
  nodeObjects: ReadonlyMap<string, Group>;
}>;

function throwIfAborted(signal: AbortSignal): void {
  signal.throwIfAborted();
}

function createDefaultRenderer(): ToolcraftThreeRenderer {
  return new WebGLRenderer({ alpha: true, antialias: true });
}

function createPrewarmMaterial(
  primitive: ToolcraftModelPrimitiveV1 | ToolcraftModelPrimitiveV2,
): MeshStandardMaterial {
  const fallback = TOOLCRAFT_MODEL_FALLBACK_APPEARANCE;
  const material = new MeshStandardMaterial({
    metalness: fallback.metallic,
    opacity: fallback.alpha,
    roughness: fallback.roughness,
    vertexColors: "colors" in primitive && primitive.colors !== undefined,
  });
  material.color.setRGB(...fallback.baseColorLinear, LinearSRGBColorSpace);
  material.emissive.setRGB(...fallback.emissiveLinear, LinearSRGBColorSpace);
  return material;
}

function createPrewarmModel(): ToolcraftCanonicalThreeModel {
  return buildToolcraftCanonicalThreeModel(
    createToolcraftThreePrewarmDocument(),
    createPrewarmMaterial,
  );
}

function disposePreparedRenderer(prepared: ToolcraftPreparedThreeRenderer): void {
  prepared.scene.clear();
  disposeToolcraftCanonicalThreeModel(prepared.retainedModel);
  disposeRenderer(prepared.renderer);
}

function disposeRenderer(renderer: ToolcraftThreeRenderer): void {
  renderer.domElement.remove();
  renderer.renderLists?.dispose();
  renderer.dispose();
}

function disposeIdleRenderer(idle: ToolcraftIdleThreeRenderer): void {
  if (idle.retainedModel) {
    disposeToolcraftCanonicalThreeModel(idle.retainedModel);
  }
  disposeRenderer(idle.renderer);
}

function rayHitsFirstModelMesh(raycaster: Raycaster, root: Object3D): boolean {
  const pending = [root];
  const intersections: Intersection[] = [];
  while (pending.length > 0) {
    const object = pending.pop()!;
    if (object instanceof Mesh && object.layers.test(raycaster.layers)) {
      object.raycast(raycaster, intersections);
      if (intersections.length > 0) return true;
    }
    for (let index = object.children.length - 1; index >= 0; index -= 1) {
      pending.push(object.children[index]!);
    }
  }
  return false;
}

function waitForPresentationFrames(): Promise<void> {
  if (typeof requestAnimationFrame !== "function") return Promise.resolve();
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function mountPreparedRenderer(
  prepared: ToolcraftPreparedThreeRenderer,
  context: ToolcraftModelPreviewPreparationContext,
): void {
  prepared.camera.aspect = context.width / context.height;
  prepared.camera.updateProjectionMatrix();
  prepared.renderer.setPixelRatio(Math.max(1, context.pixelRatio));
  prepared.renderer.setSize(context.width, context.height, false);
  prepared.renderer.domElement.style.display = "block";
  prepared.renderer.domElement.style.height = "100%";
  prepared.renderer.domElement.style.width = "100%";
  prepared.renderer.domElement.dataset.toolcraftGeneratedOutput = "";
  if (prepared.renderer.domElement.parentElement !== context.host) {
    context.host.replaceChildren(prepared.renderer.domElement);
  }
  prepared.retainedModel.modelRoot.visible = true;
  prepared.renderer.render(prepared.scene, prepared.camera);
  prepared.retainedModel.modelRoot.visible = false;
  prepared.renderer.render(prepared.scene, prepared.camera);
}

function inspectPresentationRoot(root: Object3D): InspectedPresentationRoot {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<MeshStandardMaterial>();
  const nodeObjects = new Map<string, Group>();
  root.traverse((object) => {
    const nodeId = object.userData.toolcraftModelNodeId;
    if (object instanceof Group && typeof nodeId === "string") {
      nodeObjects.set(nodeId, object);
    }
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of meshMaterials) {
      if (material instanceof MeshStandardMaterial) materials.add(material);
    }
  });
  return Object.freeze({
    geometries: Object.freeze([...geometries]),
    materials: Object.freeze([...materials]),
    nodeObjects,
  });
}

function presentationWithBounds(
  presentation: ToolcraftModelPresentation,
  lease: ToolcraftModelPresentationLease,
): ToolcraftModelPresentation {
  return Object.freeze({
    ...presentation,
    displayFit: createToolcraftModelDisplayFit(lease.bounds, presentation.displayFit.viewport),
  });
}

function applyPresentation(
  resource: ToolcraftThreeModelRenderResource,
  presentation: ToolcraftModelPresentation,
): void {
  if (resource.disposed) return;
  resource.presentation = presentation;
  resource.fitRoot.matrixAutoUpdate = false;
  resource.fitRoot.matrix.fromArray(presentation.displayFit.matrix);
  resource.camera.aspect =
    presentation.displayFit.viewport.width / presentation.displayFit.viewport.height;
  resource.camera.position.set(...presentation.orientation.position);
  resource.camera.up.set(...presentation.orientation.up);
  resource.camera.lookAt(0, 0, 0);
  resource.camera.updateProjectionMatrix();
  resource.renderer.domElement.style.opacity = String(presentation.presentationOpacity);
  resource.scene.updateMatrixWorld(true);
}

async function replacePresentationLease(
  resource: ToolcraftThreeModelRenderResource,
  presentation: ToolcraftModelPresentation,
  context: ToolcraftModelRenderResourceContext,
): Promise<void> {
  const replacementLease = await context.acquirePresentation(presentation.canonicalDocumentRef, {
    purpose: presentation.purpose,
    signal: context.signal,
  });
  if (resource.disposed || context.signal.aborted) {
    replacementLease.release();
    throwIfAborted(context.signal);
    return;
  }
  const inspected = inspectPresentationRoot(replacementLease.root);
  const previous = {
    geometries: resource.geometries,
    lease: resource.lease,
    materials: resource.materials,
    modelRoot: resource.modelRoot,
    nodeObjects: resource.nodeObjects,
    presentation: resource.presentation,
  };
  resource.fitRoot.remove(previous.modelRoot);
  resource.fitRoot.add(replacementLease.root);
  resource.geometries = inspected.geometries;
  resource.lease = replacementLease;
  resource.materials = inspected.materials;
  resource.modelRoot = replacementLease.root;
  resource.nodeObjects = inspected.nodeObjects;
  try {
    applyPresentation(resource, presentationWithBounds(presentation, replacementLease));
  } catch (error) {
    resource.fitRoot.remove(replacementLease.root);
    resource.fitRoot.add(previous.modelRoot);
    resource.geometries = previous.geometries;
    resource.lease = previous.lease;
    resource.materials = previous.materials;
    resource.modelRoot = previous.modelRoot;
    resource.nodeObjects = previous.nodeObjects;
    applyPresentation(resource, previous.presentation);
    replacementLease.release();
    throw error;
  }
  previous.lease.release();
}

function configureRenderer(
  resource: ToolcraftThreeModelRenderResource,
  width: number,
  height: number,
  pixelRatio: number,
): void {
  const normalizedPixelRatio = Math.max(1, pixelRatio);
  if (
    resource.configuredHeight !== height ||
    resource.configuredPixelRatio !== normalizedPixelRatio ||
    resource.configuredWidth !== width
  ) {
    resource.renderer.setPixelRatio(normalizedPixelRatio);
    resource.renderer.setSize(width, height, false);
    resource.configuredHeight = height;
    resource.configuredPixelRatio = normalizedPixelRatio;
    resource.configuredWidth = width;
  }
  resource.renderer.domElement.style.display = "block";
  resource.renderer.domElement.style.height = "100%";
  resource.renderer.domElement.style.width = "100%";
  resource.renderer.domElement.dataset.toolcraftGeneratedOutput = "";
}

export function createToolcraftThreeModelRenderAdapter(
  options: ToolcraftThreeModelRenderAdapterOptions = {},
): ToolcraftModelRenderBinding<ToolcraftThreeModelRenderResource> {
  const createRenderer = options.createRenderer ?? createDefaultRenderer;
  const idleRenderers = new Map<string, ToolcraftIdleThreeRenderer>();
  const preparedRenderers = new Map<string, ToolcraftPreparedThreeRenderer>();

  const takeIdleRenderer = (target: string): ToolcraftIdleThreeRenderer | undefined => {
    const idle = idleRenderers.get(target);
    idleRenderers.delete(target);
    return idle;
  };

  const storeIdleRenderer = (
    target: string,
    renderer: ToolcraftThreeRenderer,
    retainedModel?: ToolcraftCanonicalThreeModel,
  ): void => {
    renderer.domElement.remove();
    const previous = idleRenderers.get(target);
    if (previous?.renderer !== renderer) {
      if (previous) disposeIdleRenderer(previous);
      idleRenderers.set(target, { renderer, retainedModel });
    }
  };

  return {
    create: async (presentation, context) => {
      throwIfAborted(context.signal);
      const prepared = preparedRenderers.get(presentation.target);
      preparedRenderers.delete(presentation.target);
      prepared?.scene.clear();
      const idle = prepared ? undefined : takeIdleRenderer(presentation.target);
      const renderer = prepared?.renderer ?? idle?.renderer ?? createRenderer();
      const retainedPrewarmModel = prepared?.retainedModel ?? idle?.retainedModel;
      let lease: ToolcraftModelPresentationLease | undefined;
      try {
        lease = await context.acquirePresentation(presentation.canonicalDocumentRef, {
          purpose: presentation.purpose,
          signal: context.signal,
        });
        throwIfAborted(context.signal);
        const inspected = inspectPresentationRoot(lease.root);
        const { camera, fitRoot, scene } = createToolcraftThreeModelScene(lease.root);
        const resource: ToolcraftThreeModelRenderResource = {
          camera,
          configuredHeight: prepared?.context.height ?? 0,
          configuredPixelRatio: prepared ? Math.max(1, prepared.context.pixelRatio) : 0,
          configuredWidth: prepared?.context.width ?? 0,
          disposed: false,
          fitRoot,
          geometries: inspected.geometries,
          lease,
          materials: inspected.materials,
          modelRoot: lease.root,
          nodeObjects: inspected.nodeObjects,
          presentation: presentationWithBounds(presentation, lease),
          raycaster: new Raycaster(),
          renderer,
          ...(retainedPrewarmModel ? { retainedPrewarmModel } : {}),
          scene,
        };
        applyPresentation(resource, resource.presentation);
        throwIfAborted(context.signal);
        return resource;
      } catch (error) {
        // Attempt every owned cleanup without replacing the acquisition failure.
        for (const cleanup of [
          () => lease?.release(),
          () => {
            if (retainedPrewarmModel) disposeToolcraftCanonicalThreeModel(retainedPrewarmModel);
          },
          () => disposeRenderer(renderer),
        ]) {
          try { cleanup(); } catch { /* The acquisition error remains primary. */ }
        }
        throw error;
      }
    },
    dispose: (resource) => {
      if (resource.disposed) return;
      resource.disposed = true;
      resource.lease.release();
      resource.scene.clear();
      resource.fitRoot.clear();
      storeIdleRenderer(
        resource.presentation.target,
        resource.renderer,
        resource.retainedPrewarmModel,
      );
      resource.retainedPrewarmModel = undefined;
    },
    disposePreparedPreview: () => {
      for (const prepared of preparedRenderers.values()) {
        disposePreparedRenderer(prepared);
      }
      preparedRenderers.clear();
      for (const idle of idleRenderers.values()) disposeIdleRenderer(idle);
      idleRenderers.clear();
    },
    hitTest: (resource, point) => {
      if (resource.disposed) return false;
      const rect = resource.renderer.domElement.getBoundingClientRect();
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        !Number.isFinite(point.clientX) ||
        !Number.isFinite(point.clientY)
      )
        return false;
      const normalized = new Vector2(
        ((point.clientX - rect.left) / rect.width) * 2 - 1,
        -((point.clientY - rect.top) / rect.height) * 2 + 1,
      );
      resource.scene.updateMatrixWorld(true);
      resource.camera.updateMatrixWorld(true);
      resource.raycaster.setFromCamera(normalized, resource.camera);
      return rayHitsFirstModelMesh(resource.raycaster, resource.modelRoot);
    },
    preparePreview: async (context) => {
      const current = preparedRenderers.get(context.target);
      if (current) {
        if (
          current.context.height === context.height &&
          current.context.host === context.host &&
          current.context.pixelRatio === context.pixelRatio &&
          current.context.width === context.width
        )
          return;
        const resized = { ...current, context: { ...context } };
        mountPreparedRenderer(resized, context);
        preparedRenderers.set(context.target, resized);
        await waitForPresentationFrames();
        return;
      }
      const idle = takeIdleRenderer(context.target);
      const renderer = idle?.renderer ?? createRenderer();
      let built = idle?.retainedModel;
      try {
        built ??= createPrewarmModel();
        const { camera, scene } = createToolcraftThreeModelScene(built.modelRoot);
        camera.position.set(0, 0, 5);
        camera.lookAt(0, 0, 0);
        scene.updateMatrixWorld(true);
        const prepared = {
          camera,
          context: { ...context },
          renderer,
          retainedModel: built,
          scene,
        };
        mountPreparedRenderer(prepared, context);
        preparedRenderers.set(context.target, prepared);
        await waitForPresentationFrames();
      } catch (error) {
        if (built) disposeToolcraftCanonicalThreeModel(built);
        disposeRenderer(renderer);
        throw error;
      }
    },
    renderExport: async (resource, context) => {
      context.signal.throwIfAborted();
      if (resource.disposed) return;
      configureRenderer(resource, context.width, context.height, context.pixelRatio);
      resource.renderer.render(resource.scene, resource.camera);
      context.signal.throwIfAborted();
      await context.onRendered?.(resource.renderer.domElement);
      context.signal.throwIfAborted();
    },
    renderPreview: (resource, context) => {
      if (resource.disposed) return;
      configureRenderer(resource, context.width, context.height, context.pixelRatio);
      if (resource.renderer.domElement.parentElement !== context.host) {
        context.host.replaceChildren(resource.renderer.domElement);
      }
      resource.renderer.render(resource.scene, resource.camera);
    },
    update: async (resource, presentation, context) => {
      throwIfAborted(context.signal);
      if (presentation.canonicalDocumentRef !== resource.presentation.canonicalDocumentRef) {
        await replacePresentationLease(resource, presentation, context);
        return;
      }
      applyPresentation(resource, presentationWithBounds(presentation, resource.lease));
    },
  };
}
