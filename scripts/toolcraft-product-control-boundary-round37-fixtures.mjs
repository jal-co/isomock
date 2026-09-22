const descriptorTypedCatch = "src/features/round37-product-descriptor-typed-catch.tsx";
const descriptorTypedNormal = "src/features/round37-product-descriptor-typed-normal.tsx";
const broadDeleteAssign = "src/features/round37-product-broad-delete-assign.tsx";
const broadDeleteSpread = "src/features/round37-product-broad-delete-spread.tsx";
const broadAlias = "src/features/round37-product-broad-alias.tsx";
const coerced = "src/features/round37-product-registry-symbol-coercion.tsx";
const coercedSafe = "src/features/round37-product-registry-symbol-coercion-safe.tsx";

export const round37FinalReviewFixtures = Object.freeze({
  descriptor: Object.freeze({ typedCatch: descriptorTypedCatch,
    typedNormal: descriptorTypedNormal, sources: Object.freeze({
      [descriptorTypedCatch]: `import { Button } from "@/toolcraft/ui";
        declare const descriptor: number | string; const props = { className: "flex" };
        try { Object.defineProperty({}, "value", descriptor as unknown as PropertyDescriptor); }
        catch { props.className = "border"; } export const Case = <Button {...props} />;`,
      [descriptorTypedNormal]: `import { Button } from "@/toolcraft/ui";
        declare const descriptor: number; const props = { className: "flex" };
        try { Object.defineProperty({}, "value", descriptor as unknown as PropertyDescriptor);
          props.className = "border"; } catch {} export const Case = <Button {...props} />;`,
    }) }),
  broadDeletion: Object.freeze({ alias: broadAlias, assign: broadDeleteAssign,
    spread: broadDeleteSpread,
    sources: Object.freeze({ ...Object.fromEntries(
      [broadDeleteAssign, broadDeleteSpread].map((path, position) => [path,
        `import { Button } from "@/toolcraft/ui"; declare const key: string;
          const props = { className: "flex" }; const source: Record<string, unknown> = {};
          Object.defineProperty(source, key, { configurable: true, enumerable: true,
            get() { props.className = "border"; return 1; } }); delete source[key];
          ${position === 0 ? "Object.assign({}, source)" : "({ ...source })"};
          export const Case = <Button {...props} />;`],
      )), [broadAlias]: `import { Button } from "@/toolcraft/ui";
          declare const first: string; declare const second: string;
          const props = { className: "flex" }; const source: Record<string, unknown> = {};
          Object.defineProperty(source, first, { value: () => { props.className = "border"; } });
          (source[second] as (() => void) | undefined)?.();
          export const Case = <Button {...props} />;`,
      }) }),
  registryCoercion: Object.freeze({ coerced, safe: coercedSafe,
    sources: Object.freeze({
      [coerced]: `import { Button } from "@/toolcraft/ui"; const props = { className: "flex" };
        const owner: Record<PropertyKey, unknown> = {};
        owner[Symbol.for(1)] = () => { props.className = "border"; };
        (owner[Symbol.for("1")] as () => void)(); export const Case = <Button {...props} />;`,
      [coercedSafe]: `import { Button } from "@/toolcraft/ui"; const props = { className: "flex" };
        const owner: Record<PropertyKey, unknown> = {};
        owner[Symbol.for(1)] = () => { props.className = "border"; };
        (owner[Symbol.for("2")] as (() => void) | undefined)?.();
        export const Case = <Button {...props} />;`,
    }) }),
});
