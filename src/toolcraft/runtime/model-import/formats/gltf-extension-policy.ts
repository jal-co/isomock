const PRESERVED_SEMANTIC_EXTENSIONS: ReadonlySet<string> = new Set([
  "EXT_meshopt_compression",
  "KHR_accessor_float16",
  "KHR_accessor_float64",
  "KHR_draco_mesh_compression",
  "KHR_mesh_quantization",
]);

const APPEARANCE_EXTENSIONS: ReadonlySet<string> = new Set([
  "EXT_texture_avif",
  "EXT_texture_webp",
  "KHR_lights_punctual",
  "KHR_materials_anisotropy",
  "KHR_materials_clearcoat",
  "KHR_materials_diffuse_transmission",
  "KHR_materials_dispersion",
  "KHR_materials_emissive_strength",
  "KHR_materials_ior",
  "KHR_materials_iridescence",
  "KHR_materials_pbrSpecularGlossiness",
  "KHR_materials_sheen",
  "KHR_materials_specular",
  "KHR_materials_transmission",
  "KHR_materials_unlit",
  "KHR_materials_variants",
  "KHR_materials_volume",
  "KHR_texture_basisu",
  "KHR_texture_transform",
]);

const REQUIRED_WHEN_USED: ReadonlySet<string> = new Set([
  "KHR_accessor_float16",
  "KHR_accessor_float64",
  "KHR_mesh_quantization",
]);

export function isGltfAppearanceExtension(name: string): boolean {
  return APPEARANCE_EXTENSIONS.has(name);
}

export function isGltfIgnoredBehaviorExtension(name: string): boolean {
  return name === "KHR_node_visibility";
}

export function isGltfPreservedSemanticExtension(name: string): boolean {
  return PRESERVED_SEMANTIC_EXTENSIONS.has(name);
}

export function isGltfRequiredExtensionAllowed(name: string): boolean {
  return (
    isGltfPreservedSemanticExtension(name) ||
    isGltfAppearanceExtension(name) ||
    isGltfIgnoredBehaviorExtension(name)
  );
}

export function mustGltfExtensionBeRequired(name: string): boolean {
  return REQUIRED_WHEN_USED.has(name);
}
