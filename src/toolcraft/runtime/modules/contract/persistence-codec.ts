export type ToolcraftPersistenceSliceCodec<State, Context, Decoded extends object> = Readonly<{
  fields: readonly (keyof Decoded & string)[];
  read: (context: Context, data: Record<string, unknown>) => Partial<Decoded> | undefined;
  write: (state: State, context: Context) => Partial<Decoded>;
}>;

/** Slice selection and field ownership are independent of module and payload names. */
export function createToolcraftPersistenceCodec<State, Context, Decoded extends object, Slice extends string>(
  slices: Readonly<Record<Slice, ToolcraftPersistenceSliceCodec<State, Context, Decoded>>>,
) {
  const entries = (Object.entries(slices) as [Slice, ToolcraftPersistenceSliceCodec<State, Context, Decoded>][])
    .map(([slice, codec]) => [slice, Object.freeze({
      fields: Object.freeze([...codec.fields]), read: codec.read, write: codec.write,
    })] as const);
  const owners = new Map<string, string>();
  for (const [slice, codec] of entries) {
    for (const field of codec.fields) {
      if (owners.has(field)) throw new Error(`Persistence field "${field}" has multiple owners: ${owners.get(field)}, ${slice}.`);
      owners.set(field, slice);
    }
  }
  function combine(included: ReadonlySet<Slice>, select: (codec: ToolcraftPersistenceSliceCodec<State, Context, Decoded>) => Partial<Decoded> | undefined) {
    const result: Partial<Decoded> = {};
    for (const [slice, codec] of entries) {
      if (!included.has(slice)) continue;
      const payload = select(codec);
      for (const field of Object.keys(payload ?? {})) {
        if (owners.get(field) !== slice) throw new Error(`Persistence slice "${slice}" wrote undeclared field "${field}".`);
      }
      Object.assign(result, payload);
    }
    return result;
  }
  return Object.freeze({
    read: (context: Context, data: Record<string, unknown>, included: ReadonlySet<Slice>) => {
      const result = combine(included, codec => codec.read(context, data));
      return Object.keys(result).length ? result : undefined;
    },
    write: (state: State, context: Context, included: ReadonlySet<Slice>) => combine(included, codec => codec.write(state, context)),
  });
}
