import type { ToolcraftState } from "./types";

/** Query-only view. Reducers continue to own the mutable runtime state model. */
export type ToolcraftReadonly<T> = T extends string | number | boolean | bigint | symbol | null | undefined
  ? T
  : T extends object
    ? { readonly [Key in keyof T]: ToolcraftReadonly<T[Key]> }
    : T;

export type ReadonlyToolcraftState = ToolcraftReadonly<ToolcraftState>;
