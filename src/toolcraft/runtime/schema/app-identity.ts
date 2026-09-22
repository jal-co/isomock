import type {
  ResolvedToolcraftAppIdentity,
  ToolcraftAppIdentitySchema,
} from "./types";

function slugifyToolcraftAppId(value: string | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveRequiredToolcraftAppIdentity(
  identity: ToolcraftAppIdentitySchema,
): ResolvedToolcraftAppIdentity {
  const id = slugifyToolcraftAppId(identity.id);
  if (id === "") {
    throw new Error(
      "Toolcraft product base.identity.id does not contain a canonical ASCII id.",
    );
  }
  const title = identity.title.trim();
  if (title === "") {
    throw new Error(
      "Toolcraft product base.identity.title must contain non-whitespace text.",
    );
  }
  return Object.freeze({ id, title });
}
