import type { ToolcraftControlSchema } from "../../schema/types";
import type { ToolcraftSourceAssetFeedback } from "../../source-assets/source-asset-types";
import { doesToolcraftControlAcceptBatch } from "../../source-assets/file-source-asset-handler";
import type { ToolcraftState } from "../../state/types";
import {
  isToolcraftControlVisible,
  isToolcraftSectionVisible,
} from "../controls-panel/conditions/control-conditions";
import { isToolcraftImageFile } from "../../source-assets/media-file";

export type ToolcraftCanvasDropTargetSelection =
  | { control?: ToolcraftControlSchema; kind: "selected" }
  | { feedback: ToolcraftSourceAssetFeedback; kind: "ambiguous" }
  | { kind: "none" };

type CanvasDropCandidate = {
  control: ToolcraftControlSchema;
  specificity: number;
};

const AMBIGUOUS_CANVAS_DROP: ToolcraftCanvasDropTargetSelection = Object.freeze({
  feedback: Object.freeze({
    category: "bundle" as const,
    code: "ambiguous-target",
    message:
      "The selected files match more than one equally specific upload target.",
  }),
  kind: "ambiguous" as const,
});

export function getVisibleFileDropControls(state: ToolcraftState): ToolcraftControlSchema[] {
  return (state.schema.panels.controls?.sections ?? []).flatMap((section) => {
    if (!isToolcraftSectionVisible(state, section)) {
      return [];
    }

    return Object.values(section.controls).filter(
      (control) =>
        control.type === "fileDrop" && isToolcraftControlVisible(state, control),
    );
  });
}

export function getCanvasDropTarget(
  state: ToolcraftState,
  files: readonly File[],
): ToolcraftCanvasDropTargetSelection {
  if (files.length === 0) {
    return { kind: "none" };
  }

  const controls = getVisibleFileDropControls(state);
  if (controls.length === 0) {
    return files.every(isToolcraftImageFile)
      ? { kind: "selected" }
      : { kind: "none" };
  }

  const batch = { files, origin: "canvas" as const };
  const candidates = controls.flatMap<CanvasDropCandidate>((control) => {
    if (
      control.assetKind === "model" ||
      !doesToolcraftControlAcceptBatch(control, batch)
    ) {
      return [];
    }

    if (control.assetKind === "file") {
      return [{ control, specificity: 1 }];
    }

    return files.every(isToolcraftImageFile)
      ? [{ control, specificity: 100 }]
      : [];
  });
  const specialized = candidates.filter(({ specificity }) => specificity > 1);
  const eligible = specialized.length > 0 ? specialized : candidates;

  if (eligible.length === 0) {
    return { kind: "none" };
  }

  const highestSpecificity = Math.max(
    ...eligible.map(({ specificity }) => specificity),
  );
  const selected = eligible.filter(
    ({ specificity }) => specificity === highestSpecificity,
  );

  return selected.length === 1 && selected[0]
    ? { control: selected[0].control, kind: "selected" }
    : AMBIGUOUS_CANVAS_DROP;
}
