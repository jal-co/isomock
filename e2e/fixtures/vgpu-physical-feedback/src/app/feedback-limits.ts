import { TOOLCRAFT_MAX_EXPORT_EDGE_PX } from "@/toolcraft/runtime";

export const PHYSICAL_FEEDBACK_MAX_BACKING_PIXELS = 44_736_512;
export const PHYSICAL_FEEDBACK_MAX_INTERACTIVE_PIXELS = 44_736_000;

function assertPositiveBacking(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError("Physical feedback dimensions must be positive integers.");
  }
}

export function assertPhysicalFeedbackBackingSize(
  width: number,
  height: number,
): void {
  assertPositiveBacking(width, height);
  if (
    width > TOOLCRAFT_MAX_EXPORT_EDGE_PX ||
    height > TOOLCRAFT_MAX_EXPORT_EDGE_PX ||
    width * height > PHYSICAL_FEEDBACK_MAX_BACKING_PIXELS
  ) {
    throw new RangeError(
      "Physical feedback backing must fit within 8,192 px per edge and 44,736,512 pixels.",
    );
  }
}

export function assertPhysicalFeedbackInteractiveBackingSize(
  width: number,
  height: number,
): void {
  assertPhysicalFeedbackBackingSize(width, height);
  if (width * height > PHYSICAL_FEEDBACK_MAX_INTERACTIVE_PIXELS) {
    throw new RangeError(
      "Physical feedback preview must fit within the enforced 44,736,000-pixel interactive ceiling.",
    );
  }
}
