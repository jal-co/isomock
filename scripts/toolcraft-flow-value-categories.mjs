const primitiveFlags = (ts) => ts.TypeFlags.StringLike |
  ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike | ts.TypeFlags.BooleanLike |
  ts.TypeFlags.ESSymbolLike | ts.TypeFlags.Null | ts.TypeFlags.Undefined |
  ts.TypeFlags.Void;

export function toolcraftFlowTypeCategory(type, ts) {
  const variants = type?.isUnionOrIntersection?.() ? type.types : type ? [type] : [];
  if (variants.length === 0) return "unknown";
  if (variants.every(({ flags }) => (flags & primitiveFlags(ts)) !== 0)) {
    return "primitive";
  }
  if (variants.every(({ flags }) =>
    (flags & (ts.TypeFlags.Object | ts.TypeFlags.NonPrimitive)) !== 0)) {
    return "reference";
  }
  return "unknown";
}
