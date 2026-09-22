import { ToolcraftSceneExportError } from "./export-frame";

export type ToolcraftArtifactExportFailure = Readonly<{
  code:
    | "artifact-download-failed"
    | "canvas-context-unavailable"
    | "export-owner-disposed"
    | "export-snapshot-invalid"
    | "image-encode-failed"
    | "invalid-export-setting"
    | "product-frame-render-failed"
    | "runtime-scene-render-failed"
    | "svg-content-empty"
    | "svg-content-invalid"
    | "svg-document-invalid"
    | "svg-render-failed"
    | "svg-serialization-failed"
    | "video-artifact-too-large"
    | "video-encode-failed"
    | "video-encoder-unavailable";
  message: string;
  target?: string;
}>;

export class ToolcraftArtifactExportError extends Error {
  readonly feedback: ToolcraftArtifactExportFailure;

  constructor(
    feedback: ToolcraftArtifactExportFailure,
    options?: ErrorOptions,
  ) {
    super(feedback.message, options);
    this.name = "ToolcraftArtifactExportError";
    this.feedback = feedback;
  }
}

export function normalizeToolcraftExportError(
  error: unknown,
  feedback: ToolcraftArtifactExportFailure,
): ToolcraftArtifactExportError | ToolcraftSceneExportError {
  if (
    error instanceof ToolcraftArtifactExportError ||
    error instanceof ToolcraftSceneExportError
  ) {
    return error;
  }

  return new ToolcraftArtifactExportError(feedback, { cause: error });
}
