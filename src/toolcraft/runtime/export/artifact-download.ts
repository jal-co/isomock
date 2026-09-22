import {
  normalizeToolcraftExportError,
  type ToolcraftArtifactExportFailure,
} from "./export-error";

export type ToolcraftArtifactFileExtension =
  | ".jpg"
  | ".mp4"
  | ".png"
  | ".svg"
  | ".webm";

type ToolcraftDownloadAnchor = {
  click: () => void;
  download: string;
  href: string;
  remove: () => void;
};

export type ToolcraftArtifactDownloadRequest = Readonly<{
  appendAnchor?: (anchor: ToolcraftDownloadAnchor) => void;
  blob: Blob;
  createAnchor?: () => ToolcraftDownloadAnchor;
  createObjectUrl?: (blob: Blob) => string;
  extension: ToolcraftArtifactFileExtension;
  rawBaseFileName: string;
  revokeObjectUrl?: (url: string) => void;
  schedule?: (callback: () => void, delay: number) => unknown;
}>;

export type ToolcraftArtifactDownloadResult = Readonly<{ fileName: string }>;

export function sanitizeToolcraftArtifactBaseFileName(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");

  return sanitized || "toolcraft-export";
}

const downloadFailure: ToolcraftArtifactExportFailure = Object.freeze({
  code: "artifact-download-failed",
  message: "Toolcraft could not start the artifact download.",
});

export function downloadToolcraftArtifact(
  request: ToolcraftArtifactDownloadRequest,
): ToolcraftArtifactDownloadResult {
  const createAnchor =
    request.createAnchor ?? (() => document.createElement("a"));
  const appendAnchor =
    request.appendAnchor ??
    ((anchor) => document.body.append(anchor as HTMLAnchorElement));
  const createObjectUrl = request.createObjectUrl ?? URL.createObjectURL;
  const revokeObjectUrl = request.revokeObjectUrl ?? URL.revokeObjectURL;
  const schedule = request.schedule ?? globalThis.setTimeout;
  const fileName = `${sanitizeToolcraftArtifactBaseFileName(
    request.rawBaseFileName,
  )}${request.extension}`;
  let anchor: ToolcraftDownloadAnchor | null = null;
  let objectUrl: string | null = null;

  try {
    objectUrl = createObjectUrl(request.blob);
    anchor = createAnchor();
    anchor.download = fileName;
    anchor.href = objectUrl;
    appendAnchor(anchor);
    anchor.click();
    return { fileName };
  } catch (error) {
    throw normalizeToolcraftExportError(error, downloadFailure);
  } finally {
    anchor?.remove();
    if (objectUrl) {
      const urlToRevoke = objectUrl;
      schedule(() => revokeObjectUrl(urlToRevoke), 0);
    }
  }
}
