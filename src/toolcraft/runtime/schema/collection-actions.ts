import { getToolcraftCollectionItemKeyframeCapability } from "./keyframe-capability";
import { isToolcraftRuntimeOwnedTarget } from "./runtime-targets";
import type {
  ResolvedToolcraftControlSchema,
  ToolcraftCollectionItemControlSchema,
  ToolcraftControlsPanelSchema,
  ToolcraftControlSchema,
} from "./types";

export const toolcraftCollectionItemControlAddressPrefix =
  "toolcraft:collection-item:v1:" as const;

export function assertToolcraftWellFormedUnicode(
  value: string,
  owner: string,
): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error(`${owner} must use well-formed Unicode.`);
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new Error(`${owner} must use well-formed Unicode.`);
    }
  }
}

export function isToolcraftCollectionItemControlAddress(
  value: string,
): boolean {
  return value.startsWith(toolcraftCollectionItemControlAddressPrefix);
}

export function assertToolcraftProductTargetNamespace(
  target: string,
  owner: string,
): void {
  if (isToolcraftCollectionItemControlAddress(target)) {
    throw new Error(
      `Toolcraft target validation [reserved-collection-item-target] for ${owner}: the reserved namespace "${toolcraftCollectionItemControlAddressPrefix}" is runtime-owned.`,
    );
  }
}

export function isToolcraftCollectionActionsControl(
  control: ToolcraftControlSchema,
): control is ToolcraftControlSchema & {
  itemControls: NonNullable<ToolcraftControlSchema["itemControls"]>;
  type: "collectionActions";
} {
  return control.type === "collectionActions" && Boolean(control.itemControls);
}

export function getToolcraftCollectionSelectionTargets(
  controls: ToolcraftControlsPanelSchema | undefined,
): readonly string[] {
  return (
    controls?.sections.flatMap((section) =>
      Object.values(section.controls).flatMap((control) =>
        control.type === "collectionActions" && control.selectionTarget
          ? [control.selectionTarget]
          : [],
      ),
    ) ?? []
  );
}

export function getToolcraftCollectionActionsControls(
  controls: ToolcraftControlsPanelSchema | undefined,
): ReadonlyMap<string, ResolvedToolcraftControlSchema> {
  return new Map(
    controls?.sections.flatMap((section) =>
      Object.values(section.controls).flatMap((control) =>
        control.type === "collectionActions"
          ? [
              [
                control.target,
                control as ResolvedToolcraftControlSchema,
              ] as const,
            ]
          : [],
      ),
    ) ?? [],
  );
}

export function isToolcraftCollectionFieldKeyframeable(
  field: ToolcraftCollectionItemControlSchema,
): boolean {
  return field.keyframeable === true;
}

export function assertToolcraftCollectionControlTargets(
  controls: ToolcraftControlsPanelSchema | undefined,
): void {
  const allControls =
    controls?.sections.flatMap((section) => Object.values(section.controls)) ??
    [];
  const controlTargets = new Set(allControls.map((control) => control.target));
  const selectionOwners = new Map<string, string>();

  for (const control of allControls) {
    // The canonical control normalizer owns the base target type diagnostic.
    // Do not let the reserved-namespace check mask that fail-closed error for
    // malformed author input.
    if (typeof control.target === "string") {
      if (control.type === "collectionActions") {
        assertToolcraftWellFormedUnicode(
          control.target,
          `Toolcraft collection target "${control.target}"`,
        );
        for (const fieldId of Object.keys(control.itemControls ?? {})) {
          assertToolcraftWellFormedUnicode(
            fieldId,
            `Toolcraft collection target "${control.target}" itemControls.${fieldId}`,
          );
        }
      }
      assertToolcraftProductTargetNamespace(
        control.target,
        `control target "${control.target}"`,
      );
    }

    if (control.identityField !== undefined && (control.type !== "collectionActions" || !control.itemControls || control.identityField !== "id" || Object.hasOwn(control.itemControls, "id"))) {
      throw new Error(`Toolcraft collection identity validation for "${control.target}": identityField requires compound items and reserves hidden field "id".`);
    }

    if (control.selectionTarget === undefined) {
      continue;
    }
    const target = control.target;
    if (!isToolcraftCollectionActionsControl(control)) {
      throw new Error(
        `Toolcraft control validation [collection-selection-target] for target "${target}": selectionTarget is owned only by compound collectionActions.itemControls.`,
      );
    }
    if (
      typeof control.selectionTarget !== "string" ||
      !control.selectionTarget.trim() ||
      control.selectionTarget !== control.selectionTarget.trim()
    ) {
      throw new Error(
        `Toolcraft control validation [collection-selection-target] for target "${control.target}": selectionTarget must be an own non-empty trimmed product target.`,
      );
    }
    assertToolcraftProductTargetNamespace(
      control.selectionTarget,
      `collection selectionTarget "${control.selectionTarget}"`,
    );
    assertToolcraftWellFormedUnicode(
      control.selectionTarget,
      `Toolcraft collection selectionTarget "${control.selectionTarget}"`,
    );
    if (isToolcraftRuntimeOwnedTarget(control.selectionTarget)) {
      throw new Error(
        `Toolcraft control validation [collection-selection-target] for target "${control.target}": selectionTarget "${control.selectionTarget}" collides with a runtime-owned target.`,
      );
    }

    const conflict = selectionOwners.get(control.selectionTarget);
    if (conflict || controlTargets.has(control.selectionTarget)) {
      throw new Error(
        `Toolcraft control validation [collection-selection-target] for target "${control.target}": selectionTarget "${control.selectionTarget}" collides with ${conflict ? `collection "${conflict}"` : "a control/runtime target"}.`,
      );
    }
    selectionOwners.set(control.selectionTarget, control.target);
  }
}

export function assertToolcraftCollectionItemKeyframe(
  collection: ToolcraftControlSchema,
  fieldId: string,
  field: ToolcraftCollectionItemControlSchema,
): void {
  if (field.keyframeable !== true) return;
  if (collection.type !== "collectionActions") {
    throw new Error(
      `Toolcraft control validation [collection-item-keyframe] for target "${collection.target}" itemControls.${fieldId}: keyframeable fields require collectionActions ownership.`,
    );
  }
  const capability = getToolcraftCollectionItemKeyframeCapability(field);
  if (!capability.capable) {
    throw new Error(
      `Toolcraft control validation [collection-item-keyframe] for target "${collection.target}" itemControls.${fieldId}: ${capability.reason} is not keyframe-capable.`,
    );
  }
}
