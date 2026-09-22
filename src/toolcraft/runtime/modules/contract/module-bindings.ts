/** Bind a resolved, static module set to a mechanism-specific executable catalog. */
export function resolveToolcraftModuleBindings<Id extends string, Binding>(
  modules: readonly Readonly<{ id: Id; }>[],
  catalog: Readonly<Record<Id, Binding>>,
): readonly Readonly<{ moduleId: Id; binding: Binding; }>[] {
  const seen = new Set<Id>();
  return Object.freeze(modules.map(({ id }) => {
    if (seen.has(id)) throw new Error(`Duplicate module binding "${id}".`);
    if (!Object.hasOwn(catalog, id)) throw new Error(`Missing runtime binding for module "${id}".`);
    seen.add(id);
    return Object.freeze({ moduleId: id, binding: catalog[id] });
  }));
}
