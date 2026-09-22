import { expect, type Locator, type Page } from "@playwright/test";

import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export async function getToolcraftFieldByLabel(page: Page, label: string): Promise<Locator> {
  const field = page
    .locator('[data-slot="field"]')
    .filter({ hasText: new RegExp(`^${escapeRegExp(label)}`) });
  await expect(field, `Toolcraft field "${label}" should be visible`).toBeVisible();
  return field;
}

export async function expectToolcraftDiscreteSliderMarkers(
  page: Page,
  target: string,
  requirementId = target,
): Promise<void> {
  const field = await getToolcraftControlFieldByTarget(page, target);
  const slider = field.locator('[data-slot="slider"][data-variant="discrete"]');

  await expect(
    slider,
    `Toolcraft control "${target}" should render as a discrete slider.`,
  ).toBeVisible();
  expect(
    await slider.locator('[data-slot="slider-marker"]').count(),
    `Toolcraft discrete slider "${target}" should render at least one interior marker.`,
  ).toBeGreaterThan(0);

  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "discrete-slider-layout",
    requirementId,
    target,
  });
}

export async function expectToolcraftSegmentedControlCellsPreservePadding(
  page: Page,
  label: string,
  options: {
    minHorizontalPaddingPx?: number;
    requirementId?: string;
    target?: string;
  } = {},
): Promise<void> {
  const minHorizontalPaddingPx = options.minHorizontalPaddingPx ?? 6;
  const field = options.target
    ? await getToolcraftControlFieldByTarget(page, options.target)
    : await getToolcraftFieldByLabel(page, label);
  const segmentedGroup = field.locator('[data-slot="toggle-group"]').first();

  await expect(
    segmentedGroup,
    `Toolcraft segmented control "${label}" should render a toggle group.`,
  ).toBeVisible();

  const issues = await segmentedGroup.evaluate(
    (group, minPadding) => {
      type LayoutIssue = {
        label: string;
        reason: string;
      };

      function getTextRect(element: Element): DOMRect | null {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            return node.textContent?.trim()
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          },
        });
        const textNodes: Text[] = [];
        let currentNode = walker.nextNode();

        while (currentNode) {
          textNodes.push(currentNode as Text);
          currentNode = walker.nextNode();
        }

        if (textNodes.length === 0) {
          return null;
        }

        const range = document.createRange();
        range.setStartBefore(textNodes[0]!);
        range.setEndAfter(textNodes[textNodes.length - 1]!);

        return range.getBoundingClientRect();
      }

      const items = Array.from(
        group.querySelectorAll<HTMLElement>('[data-slot="toggle-group-item"]'),
      );
      const issues: LayoutIssue[] = [];
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index]!;
        const itemRect = item.getBoundingClientRect();
        const textRect = getTextRect(item);
        const label = item.textContent?.trim() || item.getAttribute("aria-label") || `#${index + 1}`;
        const nextItem = items[index + 1];
        const computedStyle = window.getComputedStyle(item);

        if (context && label.trim()) {
          context.font = computedStyle.font;
          const measuredTextWidth = context.measureText(label).width;
          const requiredWidth = measuredTextWidth + minPadding * 2;

          if (requiredWidth > itemRect.width + 0.5) {
            issues.push({
              label,
              reason: `label requires ${requiredWidth.toFixed(2)}px including padding but cell width is ${itemRect.width.toFixed(2)}px`,
            });
          }
        }

        if (nextItem) {
          const nextRect = nextItem.getBoundingClientRect();

          if (itemRect.right > nextRect.left + 0.5) {
            issues.push({
              label,
              reason: `cell overlaps next cell by ${(itemRect.right - nextRect.left).toFixed(2)}px`,
            });
          }
        }

        if (item.scrollWidth > item.clientWidth + 1) {
          issues.push({
            label,
            reason: `cell scrollWidth ${item.scrollWidth}px exceeds clientWidth ${item.clientWidth}px`,
          });
        }

        if (!textRect) {
          continue;
        }

        const leftPadding = textRect.left - itemRect.left;
        const rightPadding = itemRect.right - textRect.right;

        if (leftPadding < minPadding) {
          issues.push({
            label,
            reason: `left text padding ${leftPadding.toFixed(2)}px is below ${minPadding}px`,
          });
        }

        if (rightPadding < minPadding) {
          issues.push({
            label,
            reason: `right text padding ${rightPadding.toFixed(2)}px is below ${minPadding}px`,
          });
        }
      }

      return issues;
    },
    minHorizontalPaddingPx,
  );

  expect(
    issues,
    `Toolcraft segmented control "${label}" must preserve cell padding and avoid label collisions.`,
  ).toEqual([]);
  if (options.requirementId) {
    if (!options.target) {
      throw new Error(
        "Segmented-control runtime evidence requires a schema target.",
      );
    }
    await attachToolcraftBrowserRuntimeEvidence({
      evidenceType: "segmented-control-layout",
      requirementId: options.requirementId,
      target: options.target,
    });
  }
}
