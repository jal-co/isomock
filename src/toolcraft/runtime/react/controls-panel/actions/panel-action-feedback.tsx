"use client";

import type * as React from "react";

import type { ToolcraftPanelActionFeedback } from "./controls-panel-actions";

export function PanelActionFeedback({
  feedback,
}: {
  feedback: ToolcraftPanelActionFeedback | null;
}): React.JSX.Element | null {
  if (!feedback) return null;

  return (
    <p
      className="mx-3 mb-3 mt-0 border border-[color:var(--destructive)] px-3 py-2 text-xs leading-snug text-[color:var(--destructive)]"
      data-panel-action-feedback-code={feedback.code}
      data-slot="toolcraft-panel-action-feedback"
      role="alert"
    >
      {feedback.message}
    </p>
  );
}
