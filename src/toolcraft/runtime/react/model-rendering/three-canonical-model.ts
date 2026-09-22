import {
  BufferGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  type Object3D,
} from "three";

import type {
  ToolcraftModelDocument,
} from "../../model-import/canonical/model-document";
import {
  createToolcraftPrimitiveGeometryProjections,
  type ToolcraftRenderablePrimitive,
} from "./three-canonical-geometry";

export type ToolcraftCanonicalThreeModel = Readonly<{
  geometries: readonly BufferGeometry[];
  materials: readonly MeshStandardMaterial[];
  modelRoot: Group;
  nodeObjects: ReadonlyMap<string, Group>;
}>;

export { createToolcraftThreePrewarmDocument } from "./three-model-prewarm";

function collectRenderableNodeIds(document: ToolcraftModelDocument): ReadonlySet<string> {
  const nodeIds = new Set(document.nodes.map(({ id }) => id));
  const parentByChild = new Map<string, string>();

  for (const node of document.nodes) {
    for (const childId of node.children) {
      if (!nodeIds.has(childId)) {
        throw new Error(`Canonical model child node \"${childId}\" is unavailable.`);
      }
      parentByChild.set(childId, node.id);
    }
  }
  for (const rootNodeId of document.rootNodeIds) {
    if (!nodeIds.has(rootNodeId)) {
      throw new Error(`Canonical model root node \"${rootNodeId}\" is unavailable.`);
    }
  }

  const renderable = new Set(
    document.nodes.filter(({ primitiveIds }) => primitiveIds.length > 0).map(({ id }) => id),
  );
  const pending = [...renderable];
  for (let index = 0; index < pending.length; index += 1) {
    const parentId = parentByChild.get(pending[index]!);
    if (parentId && !renderable.has(parentId)) {
      renderable.add(parentId);
      pending.push(parentId);
    }
  }
  return renderable;
}

export function buildToolcraftCanonicalThreeModel(
  document: ToolcraftModelDocument,
  createMaterial: (primitive: ToolcraftRenderablePrimitive) => MeshStandardMaterial,
): ToolcraftCanonicalThreeModel {
  const geometries: BufferGeometry[] = [];
  const materials = new Set<MeshStandardMaterial>();
  const renderableNodeIds = collectRenderableNodeIds(document);
  const primitiveById = new Map(document.primitives.map((primitive) => [primitive.id, primitive]));
  const nodeObjects = new Map<string, Group>();
  for (const node of document.nodes) {
    if (!renderableNodeIds.has(node.id)) continue;
    const object = new Group();
    object.name = node.name;
    object.userData.toolcraftModelNodeId = node.id;
    object.matrixAutoUpdate = false;
    object.matrix.fromArray(node.localMatrix);
    const nodePrimitives = node.primitiveIds.map((primitiveId) => {
      const primitive = primitiveById.get(primitiveId);
      if (!primitive) {
        throw new Error(`Canonical model primitive \"${primitiveId}\" is unavailable.`);
      }
      return primitive;
    });
    for (const projection of createToolcraftPrimitiveGeometryProjections(
      nodePrimitives,
      createMaterial,
    )) {
      geometries.push(projection.geometry);
      materials.add(projection.material);
      const mesh = new Mesh(projection.geometry, projection.material);
      mesh.name =
        projection.primitiveIds.length === 1
          ? projection.primitiveIds[0]!
          : `Toolcraft primitive batch (${projection.primitiveIds.length})`;
      mesh.userData.toolcraftModelPrimitiveIds = [...projection.primitiveIds];
      object.add(mesh);
    }
    nodeObjects.set(node.id, object);
  }

  for (const node of document.nodes) {
    const object = nodeObjects.get(node.id);
    if (!object) continue;
    for (const childId of node.children) {
      const child = nodeObjects.get(childId);
      if (child) object.add(child);
    }
  }

  const modelRoot = new Group();
  modelRoot.name = "Toolcraft canonical model";
  for (const rootNodeId of document.rootNodeIds) {
    const root = nodeObjects.get(rootNodeId);
    if (root) modelRoot.add(root);
  }

  return { geometries, materials: [...materials], modelRoot, nodeObjects };
}

export function createToolcraftThreeModelScene(modelRoot: Object3D): {
  camera: PerspectiveCamera;
  fitRoot: Group;
  scene: Scene;
} {
  const scene = new Scene();
  const fitRoot = new Group();
  fitRoot.name = "Toolcraft source-preserving display fit";
  fitRoot.add(modelRoot);
  scene.add(fitRoot);
  scene.add(new HemisphereLight(0xffffff, 0x5b6470, 1.7));
  const keyLight = new DirectionalLight(0xffffff, 2.1);
  keyLight.position.set(3, 4, 5);
  scene.add(keyLight);
  return {
    camera: new PerspectiveCamera(45, 1, 0.01, 1_000),
    fitRoot,
    scene,
  };
}

export function disposeToolcraftCanonicalThreeModel(
  model: Pick<ToolcraftCanonicalThreeModel, "geometries" | "materials" | "modelRoot">,
): void {
  for (const geometry of model.geometries) geometry.dispose();
  for (const material of model.materials) material.dispose();
  model.modelRoot.clear();
}
