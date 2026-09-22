import type { ToolcraftVideoExportFormat } from "./artifact-export-settings";
import { ToolcraftArtifactExportError } from "./export-error";

export const TOOLCRAFT_MAX_VIDEO_ARTIFACT_BYTES = 96 * 1024 * 1024;

export type ToolcraftVideoCodec = "avc" | "vp8" | "vp9";

export type ToolcraftVideoEncodingSupport = Readonly<{
  avc: boolean;
  vp8: boolean;
  vp9: boolean;
}>;

export type ToolcraftVideoEncodingPolicy = Readonly<{
  bitrate: number;
  codec: ToolcraftVideoCodec;
  extension: ".mp4" | ".webm";
  mediaType: "video/mp4" | "video/webm";
}>;

type ToolcraftVideoEncodingCandidate = Readonly<{
  codec: ToolcraftVideoCodec;
  extension: ".mp4" | ".webm";
  mediaType: "video/mp4" | "video/webm";
}>;

const mp4Candidate: ToolcraftVideoEncodingCandidate = Object.freeze({
  codec: "avc",
  extension: ".mp4",
  mediaType: "video/mp4",
});
const webmCandidates: readonly ToolcraftVideoEncodingCandidate[] = Object.freeze([
  Object.freeze({ codec: "vp9", extension: ".webm", mediaType: "video/webm" }),
  Object.freeze({ codec: "vp8", extension: ".webm", mediaType: "video/webm" }),
]);

export function getToolcraftVideoExportBitrate(
  width: number,
  height: number,
): number {
  return Math.max(
    2_000_000,
    Math.min(12_000_000, Math.round(width * height * 30 * 0.05)),
  );
}

function assertArtifactBudget(bitrate: number, durationSeconds: number): void {
  const projectedBytes = (bitrate * durationSeconds * 1.1) / 8;
  if (projectedBytes > TOOLCRAFT_MAX_VIDEO_ARTIFACT_BYTES) {
    throw new ToolcraftArtifactExportError({
      code: "video-artifact-too-large",
      message: "The selected video export exceeds Toolcraft's artifact limit.",
    });
  }
}

export function resolveToolcraftVideoEncodingPolicy({
  durationSeconds,
  height,
  requestedFormat,
  support,
  width,
}: Readonly<{
  durationSeconds: number;
  height: number;
  requestedFormat: ToolcraftVideoExportFormat;
  support: ToolcraftVideoEncodingSupport;
  width: number;
}>): ToolcraftVideoEncodingPolicy {
  const bitrate = getToolcraftVideoExportBitrate(width, height);
  assertArtifactBudget(bitrate, durationSeconds);
  const candidates =
    requestedFormat === "mp4"
      ? [mp4Candidate, ...webmCandidates]
      : [...webmCandidates, mp4Candidate];
  const candidate = candidates.find((item) => support[item.codec]);

  if (!candidate) {
    throw new ToolcraftArtifactExportError({
      code: "video-encoder-unavailable",
      message: "This browser has no supported timestamped video encoder.",
    });
  }

  return Object.freeze({ ...candidate, bitrate });
}
