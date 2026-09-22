import type { ToolcraftProductCapabilityId } from "@/toolcraft/runtime";
import { describe, expect, it, vi } from "vitest";

import { TOOLCRAFT_CAPABILITY_PROOF_CATALOG } from "./catalog";
import { dispatchToolcraftCapabilityProofOwners } from "./owner-dispatch";
import { createResolvedProductModulePlanFixture } from "./test-plan-fixtures";
import { createCapabilityProofValidationContextFixture } from "./test-validation-fixtures";
import type {
  ToolcraftCapabilityProofOwnerInput,
  ToolcraftCapabilityProofOwnerId,
  ToolcraftCapabilityProofOwnerRegistry,
} from "./types";

const allCapabilities = Object.keys(
  TOOLCRAFT_CAPABILITY_PROOF_CATALOG,
) as ToolcraftProductCapabilityId[];

function createOwnerSpies(
  getDiagnostics: (
    ownerId: ToolcraftCapabilityProofOwnerId,
    index: number,
  ) => readonly string[],
) {
  const createOwner = (
    ownerId: ToolcraftCapabilityProofOwnerId,
    index: number,
  ) =>
    vi.fn((_input: ToolcraftCapabilityProofOwnerInput) =>
      getDiagnostics(ownerId, index),
    );

  return {
    "artifact-export": createOwner("artifact-export", 0),
    "canvas-editing": createOwner("canvas-editing", 1),
    layers: createOwner("layers", 2),
    "media-source": createOwner("media-source", 3),
    "model-3d": createOwner("model-3d", 4),
    "spatial-view": createOwner("spatial-view", 5),
    timeline: createOwner("timeline", 6),
    masks: createOwner("masks", 7),
  } satisfies ToolcraftCapabilityProofOwnerRegistry;
}

describe("Toolcraft capability proof owner dispatch", () => {
  it("invokes every exact owner once with one shared frozen full capability set", () => {
    const calls = createOwnerSpies(() => []);
    const ownerIds = Object.keys(calls) as ToolcraftCapabilityProofOwnerId[];
    const context = createCapabilityProofValidationContextFixture();

    const diagnostics = dispatchToolcraftCapabilityProofOwners({
      context,
      owners: calls,
      plan: createResolvedProductModulePlanFixture(allCapabilities),
      recipes: TOOLCRAFT_CAPABILITY_PROOF_CATALOG,
    });

    expect(diagnostics).toEqual([]);
    const sharedCapabilities = calls[ownerIds[0]].mock.calls[0]?.[0]
      .activeCapabilities;
    for (const ownerId of ownerIds) {
      expect(calls[ownerId]).toHaveBeenCalledOnce();
      const [input] = vi.mocked(calls[ownerId]).mock.calls[0] ?? [];
      expect(input?.context).toBe(context);
      expect(input?.activeCapabilities).toBe(sharedCapabilities);
      expect(input?.activeCapabilities).toEqual([...allCapabilities].sort());
      expect(Object.isFrozen(input?.activeCapabilities)).toBe(true);
      expect(Object.isFrozen(input?.recipes)).toBe(true);
    }
  });

  it("sorts and freezes diagnostics without hiding duplicate owner calls", () => {
    const owners = createOwnerSpies((ownerId, index) => [
      `${String(9 - index)}:${ownerId}`,
    ]);

    const diagnostics = dispatchToolcraftCapabilityProofOwners({
      context: createCapabilityProofValidationContextFixture(),
      owners,
      plan: createResolvedProductModulePlanFixture([]),
      recipes: TOOLCRAFT_CAPABILITY_PROOF_CATALOG,
    });

    expect(diagnostics).toEqual([...diagnostics].sort());
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(diagnostics).toHaveLength(Object.keys(owners).length);
  });

  it("fails closed when the recipe and owner inventories are not reciprocal", () => {
    const owners = createOwnerSpies(() => []);
    const { timeline: _timeline, ...missingOwner } = owners;
    const extraOwner = { ...owners, duplicate: vi.fn(() => []) };
    const input = {
      context: createCapabilityProofValidationContextFixture(),
      plan: createResolvedProductModulePlanFixture([]),
      recipes: TOOLCRAFT_CAPABILITY_PROOF_CATALOG,
    };
    const dispatchUnsafe = (
      unsafeOwners: Record<
        string,
        ToolcraftCapabilityProofOwnerRegistry[keyof ToolcraftCapabilityProofOwnerRegistry]
      >,
    ) =>
      dispatchToolcraftCapabilityProofOwners({
        ...input,
        owners: unsafeOwners as ToolcraftCapabilityProofOwnerRegistry,
      });

    expect(() => dispatchUnsafe(missingOwner)).toThrow(
      "Toolcraft capability proof owner registry does not exactly match catalog owners",
    );
    expect(() => dispatchUnsafe(extraOwner)).toThrow(
      "Toolcraft capability proof owner registry does not exactly match catalog owners",
    );
  });
});
