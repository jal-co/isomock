import { isToolcraftBuiltInControlType, type ToolcraftBuiltInControlType } from "../contracts/component-contracts";

declare const customControlNameBrand: unique symbol;
export type ToolcraftCustomControlType<Name extends string = string> = Name & {
  readonly [customControlNameBrand]: true;
};
type TrimWhitespace = " " | "\t" | "\n" | "\r" | "\v" | "\f" | "\u00a0" | "\u1680"
  | "\u2000" | "\u2001" | "\u2002" | "\u2003" | "\u2004" | "\u2005" | "\u2006"
  | "\u2007" | "\u2008" | "\u2009" | "\u200a" | "\u2028" | "\u2029" | "\u202f"
  | "\u205f" | "\u3000" | "\ufeff";
type ValidCustomName<Name extends string> = string extends Name ? never
  : Name extends ToolcraftBuiltInControlType | "" | `${TrimWhitespace}${string}` | `${string}${TrimWhitespace}`
    ? never : Name;

/** Source registration only: the exact renderer key and persisted targets are unchanged. */
export function defineToolcraftCustomControlType<const Name extends string>(
  name: Name & ValidCustomName<Name>,
): ToolcraftCustomControlType<Name> {
  if (typeof name !== "string" || !name.trim() || name.trim() !== name || isToolcraftBuiltInControlType(name)) {
    throw new Error("Custom control name must be nonempty, trimmed and not built-in.");
  }
  const validatedName: Name = name;
  return validatedName as ToolcraftCustomControlType<Name>;
}
