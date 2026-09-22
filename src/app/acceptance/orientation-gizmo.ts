import type {
  ResolvedToolcraftAppSchema,
  ResolvedToolcraftControlSchema,
} from "@/toolcraft/runtime";
import {
  areToolcraftPredicateSetsProvablyExclusive,
  getToolcraftApplicabilityPredicates,
} from "@/toolcraft/runtime";

import { isToolcraftProductSectionControl } from "./controls";

const vectorOrbitIntentPattern =
  /\b(camera\s+orbit|object\s+orbit|model\s+orbit|3d\s+(?:orientation|rotation)|view\s+orientation|model\s+rotation|object\s+rotation)\b/i;

function isFiniteVector3(
  value: unknown,
): value is readonly [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function getVectorLength(value: readonly [number, number, number]): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function getCrossLength(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  return Math.hypot(
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  );
}

function hasValidOrientationDefault(control: ResolvedToolcraftControlSchema): boolean {
  if (!control.defaultValue || typeof control.defaultValue !== "object") {
    return false;
  }

  const value = control.defaultValue as { position?: unknown; up?: unknown };

  return (
    isFiniteVector3(value.position) &&
    isFiniteVector3(value.up) &&
    getVectorLength(value.position) > 1e-6 &&
    getVectorLength(value.up) > 1e-6 &&
    getCrossLength(value.position, value.up) > 1e-6
  );
}

function getOrientationControlErrors({
  control,
  controlId,
  sectionTitle,
}: {
  control: ResolvedToolcraftControlSchema;
  controlId: string;
  sectionTitle: string;
}): string[] {
  const label = `${sectionTitle} / ${controlId} (${control.target})`;
  const errors: string[] = [];

  if (control.label !== false) {
    errors.push(
      `${label} orientationGizmo must set label: false because runtime renders it only as canvas chrome.`,
    );
  }

  if (control.keyframeable !== false) {
    errors.push(
      `${label} orientationGizmo must set keyframeable: false; view orbit is direct editor state, not a timeline property.`,
    );
  }

  if (!hasValidOrientationDefault(control)) {
    errors.push(
      `${label} orientationGizmo defaultValue must be a non-degenerate { position: [x, y, z], up: [x, y, z] } pose with finite, non-collinear vectors.`,
    );
  }

  return errors;
}

export function getToolcraftOrientationGizmoErrors(
  schema: ResolvedToolcraftAppSchema,
): string[] {
  const sections = schema.panels.controls?.sections ?? [];
  const orientationEntries = sections.flatMap((section, sectionIndex) => {
    const sectionTitle = section.title?.trim() || `Section ${sectionIndex + 1}`;

    return Object.entries(section.controls).flatMap(([controlId, control]) =>
      control.type === "orientationGizmo"
        ? [{ control, controlId, section, sectionTitle }]
        : [],
    );
  });
  const errors: string[] = [];

  for (let leftIndex = 0; leftIndex < orientationEntries.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < orientationEntries.length;
      rightIndex += 1
    ) {
      const left = orientationEntries[leftIndex];
      const right = orientationEntries[rightIndex];

      if (!left || !right) {
        continue;
      }

      const leftConditions = [
        ...(left.section.visibleWhen ? [left.section.visibleWhen] : []),
        ...getToolcraftApplicabilityPredicates(
          left.control.applicability,
        ),
      ];
      const rightConditions = [
        ...(right.section.visibleWhen ? [right.section.visibleWhen] : []),
        ...getToolcraftApplicabilityPredicates(
          right.control.applicability,
        ),
      ];

      if (
        !areToolcraftPredicateSetsProvablyExclusive(
          leftConditions,
          rightConditions,
        )
      ) {
        errors.push(
          `${left.sectionTitle} / ${left.controlId} and ${right.sectionTitle} / ${right.controlId} must have provably mutually exclusive visibility conditions so runtime can never render two orientation gizmos at once.`,
        );
      }
    }
  }

  for (const entry of orientationEntries) {
    errors.push(...getOrientationControlErrors(entry));

    const siblingProductControls = Object.values(entry.section.controls).filter(
      (control) =>
        control !== entry.control && isToolcraftProductSectionControl(control),
    );

    if (siblingProductControls.length === 0) {
      errors.push(
        `${entry.sectionTitle} contains only orientationGizmo. Keep the hidden runtime handle in the semantic model/view section with at least one visible product control instead of creating an empty panel section.`,
      );
    }
  }

  for (const [sectionIndex, section] of sections.entries()) {
    const sectionTitle = section.title?.trim() || `Section ${sectionIndex + 1}`;

    for (const [controlId, control] of Object.entries(section.controls)) {
      if (control.type !== "vector") {
        continue;
      }

      const semanticText = [
        sectionTitle,
        controlId,
        typeof control.label === "string" ? control.label : "",
        control.description ?? "",
        control.target,
      ].join(" ");

      if (vectorOrbitIntentPattern.test(semanticText)) {
        errors.push(
          `${sectionTitle} / ${controlId} (${control.target}) uses Vector for a three-dimensional orbit/orientation intent. Use orientationGizmo plus direct model drag; Vector owns stable X/Y parameters only.`,
        );
      }
    }
  }

  return errors;
}
