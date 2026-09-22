export function getTimelineEventTargetElement(target: EventTarget | null): Element | null {
  return target instanceof Element ? target : null;
}

export function isTimelineInteractiveElement(target: EventTarget | null): boolean {
  return Boolean(
    getTimelineEventTargetElement(target)?.closest(
      "button, input, textarea, select, [contenteditable='true'], [role='button']",
    ),
  );
}

export function isEditableTimelineEventTarget(target: EventTarget | null): boolean {
  return Boolean(
    getTimelineEventTargetElement(target)?.closest(
      "input, textarea, select, [contenteditable='true']",
    ),
  );
}
