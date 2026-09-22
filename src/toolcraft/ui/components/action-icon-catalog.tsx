import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  CheckIcon,
  CopySimpleIcon,
  DownloadSimpleIcon,
  EraserIcon,
  ExportIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  MagicWandIcon,
  ShuffleIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import type { IconProps } from "@phosphor-icons/react";
import type { ReactElement } from "react";

export type ActionIconName =
  | "check"
  | "copy"
  | "download"
  | "download-simple"
  | "eraser"
  | "export"
  | "rotate-ccw"
  | "shuffle"
  | "upload-simple"
  | "wand-sparkles";

export type ActionControlIconName =
  | ActionIconName
  | "flip-horizontal"
  | "flip-vertical"
  | "rotate-cw";

export function renderActionIcon(
  name: ActionControlIconName,
  props: IconProps & { "data-icon"?: string; "data-icon-name"?: string },
): ReactElement {
  switch (name) {
    case "check":
      return <CheckIcon {...props} />;
    case "copy":
      return <CopySimpleIcon {...props} />;
    case "download":
    case "download-simple":
      return <DownloadSimpleIcon {...props} />;
    case "eraser":
      return <EraserIcon {...props} />;
    case "export":
      return <ExportIcon {...props} />;
    case "flip-horizontal":
      return <FlipHorizontalIcon {...props} />;
    case "flip-vertical":
      return <FlipVerticalIcon {...props} />;
    case "rotate-ccw":
      return <ArrowCounterClockwiseIcon {...props} />;
    case "rotate-cw":
      return <ArrowClockwiseIcon {...props} />;
    case "shuffle":
      return <ShuffleIcon {...props} />;
    case "upload-simple":
      return <UploadSimpleIcon {...props} />;
    case "wand-sparkles":
      return <MagicWandIcon {...props} />;
  }
}
