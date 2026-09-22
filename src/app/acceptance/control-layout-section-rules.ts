import {
  getToolcraftColorBankDescriptionError,
  getToolcraftColorBankLabelErrors,
} from "./color-bank-labels";
import { getToolcraftColorRowGroupingErrors } from "./color-row-grouping";
import {
  getToolcraftControlDescriptionError,
  getToolcraftDuplicateSectionTitleLabelError,
  getToolcraftGenericControlLabelError,
} from "./control-labels";
import type { ToolcraftControlLayoutFacts } from "./control-layout-model";
import {
  controlTypeSectionTitlePattern,
  getToolcraftSectionTitleLengthError,
  genericControlSectionTitlePattern,
} from "./section-title-rules";

const TOOLCRAFT_SECTION_DENSITY_REVIEW_THRESHOLD = 10;

export function getToolcraftControlLayoutSectionInvariantErrors(
  facts: ToolcraftControlLayoutFacts,
): string[] {
  const errors: string[] = [];

  for (const section of facts.sections) {
    const {
      controls,
      sectionLabel,
      sectionLoosePrefixes,
      sectionTitle,
    } = section;

    if (section.owner === "product") {
      if (!sectionTitle) {
        errors.push(
          `${sectionLabel} is missing a controls section title. Every visible controls-panel section must name the product entity, workflow stage, or behavior it edits.`,
        );
      }

      if (sectionTitle && genericControlSectionTitlePattern.test(sectionTitle)) {
        errors.push(
          `${sectionLabel} is too generic for a controls section. Name the product entity, workflow stage, or behavior it edits instead of using a bucket title.`,
        );
      }

      if (sectionTitle && controlTypeSectionTitlePattern.test(sectionTitle)) {
        errors.push(
          `${sectionLabel} names a UI control type instead of the product entity. Group controls by product meaning, not by Slider, Color, Input, Button, or similar component type.`,
        );
      }

      const titleLengthError = sectionTitle
        ? getToolcraftSectionTitleLengthError(sectionTitle)
        : undefined;

      if (titleLengthError) {
        errors.push(titleLengthError);
      }
    }

    errors.push(
      ...getToolcraftColorRowGroupingErrors({
        controls,
        sectionLabel,
      }),
      ...getToolcraftColorBankLabelErrors({
        controls,
        sectionLabel,
        sectionTitle,
      }),
    );

    for (const [controlId, control] of controls) {
      const duplicateSectionTitleLabelError =
        getToolcraftDuplicateSectionTitleLabelError({
          control,
          controlId,
          sectionLabel,
          sectionTitle,
        });

      if (duplicateSectionTitleLabelError) {
        errors.push(duplicateSectionTitleLabelError);
      }

      const genericLabelError = getToolcraftGenericControlLabelError({
        control,
        controlId,
        sectionLabel,
        sectionLoosePrefixCount: sectionLoosePrefixes.size,
        sectionTitle,
      });

      if (genericLabelError) {
        errors.push(genericLabelError);
      }

      const colorDescriptionError = getToolcraftColorBankDescriptionError({
        control,
        controlId,
        sectionLabel,
        sectionTitle,
      });

      if (colorDescriptionError) {
        errors.push(colorDescriptionError);
      }

      const descriptionError = getToolcraftControlDescriptionError({
        control,
        controlId,
        sectionLabel,
        sectionTitle,
      });

      if (descriptionError) {
        errors.push(descriptionError);
      }
    }
  }

  for (const { count, label } of facts.sectionTitleCounts.values()) {
    if (count > 1) {
      errors.push(
        `Controls panel repeats the section title "${label}" ${count} times. Section titles must be unique and describe distinct product entities or workflow stages.`,
      );
    }
  }

  return errors;
}

export function getToolcraftControlLayoutSectionHeuristicErrors(
  facts: ToolcraftControlLayoutFacts,
): string[] {
  const errors: string[] = [];

  for (const section of facts.sections) {
    const { controls, sectionLabel } = section;
    if (controls.length >= TOOLCRAFT_SECTION_DENSITY_REVIEW_THRESHOLD) {
      errors.push(
        `${sectionLabel} has ${controls.length} declared controls. Review simultaneously visible controls in reachable modes, compound-editor complexity, panel height, navigation, and section reset scope. This is not a section limit: keep a coherent workflow together, use semanticGroup where helpful, and split only when distinct user tasks justify it; declaration count alone does not prove visual density.`,
      );
    }
  }

  return errors;
}
