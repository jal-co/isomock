export const TOOLCRAFT_SECTION_TITLE_RECOMMENDED_WORD_COUNT = 3;
export const TOOLCRAFT_SECTION_TITLE_MAX_WORD_COUNT = 4;
export const TOOLCRAFT_SECTION_TITLE_MAX_CODE_POINT_COUNT = 32;

export function getToolcraftSectionTitleWordCount(title: string): number {
  return title.trim().match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu)?.length ?? 0;
}

export function getToolcraftSectionTitleCodePointCount(title: string): number {
  return [...title.trim()].length;
}

export function getToolcraftSectionTitleLengthError(
  title: string,
): string | undefined {
  const wordCount = getToolcraftSectionTitleWordCount(title);
  const codePointCount = getToolcraftSectionTitleCodePointCount(title);
  const wordLabel = wordCount === 1 ? "word" : "words";

  if (
    wordCount <= TOOLCRAFT_SECTION_TITLE_MAX_WORD_COUNT &&
    codePointCount <= TOOLCRAFT_SECTION_TITLE_MAX_CODE_POINT_COUNT
  ) {
    return undefined;
  }

  return `Section title "${title.trim()}" is too long (${wordCount} ${wordLabel}, ${codePointCount} characters; maximum ${TOOLCRAFT_SECTION_TITLE_MAX_WORD_COUNT} words and ${TOOLCRAFT_SECTION_TITLE_MAX_CODE_POINT_COUNT} characters). Keep only the product entity in the visible title, normally 1–${TOOLCRAFT_SECTION_TITLE_RECOMMENDED_WORD_COUNT} words, and move non-obvious context into section.description.`;
}

export const genericControlSectionTitlePattern =
  /^(controls?|settings?|parameters?|options?|configuration|config|adjustments?)$/i;

export const controlTypeSectionTitlePattern =
  /^(sliders?|colors?|colours?|inputs?|selects?|switches?|checkboxes?|toggles?|buttons?|actions?)$/i;

export const weakControlLabelContextSectionTitlePattern =
  /^(appearance|look|looks|properties?|style|styles|values?|visuals?)$/i;
