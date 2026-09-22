export const TOOLCRAFT_SEGMENTED_STATIC_FIT = Object.freeze({
  maxOptionLabelLength: 9,
  maxOptions: 4,
  maxTotalLabelLength: 24,
});

export function renderToolcraftSegmentedStaticFitDocumentationSentence(): string {
  const { maxOptionLabelLength, maxOptions, maxTotalLabelLength } =
    TOOLCRAFT_SEGMENTED_STATIC_FIT;

  return `Text segmented controls allow at most ${maxOptions} options, no option label longer than ${maxOptionLabelLength} characters, and no more than ${maxTotalLabelLength} total option-label characters.`;
}

type ToolcraftSegmentedStaticFitInput = {
  readonly options?: readonly { readonly label: string }[];
  readonly type: string;
};

export function getToolcraftSegmentedStaticFitError(
  control: ToolcraftSegmentedStaticFitInput,
): string | null {
  if (control.type !== "segmented") return null;

  const { maxOptionLabelLength, maxOptions, maxTotalLabelLength } =
    TOOLCRAFT_SEGMENTED_STATIC_FIT;
  const labelLengths = (control.options ?? []).map(
    (option) => option.label.trim().length,
  );
  const exceedsStaticFit =
    labelLengths.length > maxOptions ||
    labelLengths.some((length) => length > maxOptionLabelLength) ||
    labelLengths.reduce((total, length) => total + length, 0) >
      maxTotalLabelLength;

  return exceedsStaticFit
    ? `segmented controls must preserve cell padding: use at most ${maxOptions} short options (max ${maxOptionLabelLength} characters per label and ${maxTotalLabelLength} total) or shorten labels first; if the compact names still exceed the budget, use a select dropdown instead.`
    : null;
}
