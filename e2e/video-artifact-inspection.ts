import fs from "node:fs/promises";

import type { Download, Page } from "@playwright/test";
import {
  ALL_FORMATS,
  BlobSource,
  EncodedPacketSink,
  Input,
} from "mediabunny";

import {
  observeToolcraftDecodedPixels,
  type ToolcraftDecodedPixelObservation,
} from "./decoded-pixel-observation";
import type {
  ToolcraftVideoArtifactInspection,
  ToolcraftVideoPacketTiming,
} from "./export-artifact-helpers";

export type ToolcraftScheduledVideoFrame = Readonly<{
  durationSeconds: number;
  index: number;
  timeSeconds: number;
}>;

export function assertToolcraftVideoPacketSchedule({
  packetTimings,
  schedule,
  timeResolution,
}: Readonly<{
  packetTimings: readonly ToolcraftVideoPacketTiming[];
  schedule: readonly ToolcraftScheduledVideoFrame[];
  timeResolution: number;
}>): void {
  if (!Number.isFinite(timeResolution) || timeResolution <= 0) {
    throw new Error("Video packet proof requires a positive time resolution.");
  }
  if (packetTimings.length !== schedule.length) {
    throw new Error(
      `Encoded video contains ${packetTimings.length} packets; runtime scheduled ${schedule.length}.`,
    );
  }

  const toleranceSeconds = 1 / timeResolution;
  for (const [index, actual] of packetTimings.entries()) {
    const expected = schedule[index];
    if (!expected) {
      throw new Error(`Runtime schedule is missing frame ${index}.`);
    }
    if (
      !Number.isFinite(actual.timeSeconds) ||
      actual.timeSeconds < 0 ||
      !Number.isFinite(actual.durationSeconds) ||
      actual.durationSeconds <= 0
    ) {
      throw new Error(`Encoded packet ${index} has invalid timing metadata.`);
    }
    if (
      Math.abs(actual.timeSeconds - expected.timeSeconds) > toleranceSeconds
    ) {
      throw new Error(
        `Encoded packet ${index} timestamp does not match the runtime schedule.`,
      );
    }
    if (
      Math.abs(actual.durationSeconds - expected.durationSeconds) >
      toleranceSeconds
    ) {
      throw new Error(
        `Encoded packet ${index} duration does not match the runtime schedule.`,
      );
    }
  }
}

export type ToolcraftInspectedVideoArtifact = Readonly<{
  inspection: ToolcraftVideoArtifactInspection;
  observations: readonly ToolcraftDecodedPixelObservation[];
  sampleTimes: readonly number[];
  timeResolution: number;
}>;

function detectVideoMediaType(bytes: Uint8Array): "video/mp4" | "video/webm" {
  if (
    bytes.length >= 8 &&
    String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp"
  ) {
    return "video/mp4";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }
  throw new Error("Downloaded artifact is not a supported MP4 or WebM video.");
}

function getSampleTimes(
  schedule: readonly ToolcraftScheduledVideoFrame[],
): readonly number[] {
  if (schedule.length === 0) {
    throw new Error("Video inspection requires a non-empty runtime frame schedule.");
  }
  const indices = [...new Set([0, Math.floor(schedule.length / 2), schedule.length - 1])];
  return Object.freeze(indices.map((index) => schedule[index]!.timeSeconds));
}

async function decodeSamplesInPage({
  bytes,
  mediaType,
  page,
  sampleTimes,
}: Readonly<{
  bytes: Uint8Array;
  mediaType: "video/mp4" | "video/webm";
  page: Page;
  sampleTimes: readonly number[];
}>): Promise<readonly Uint8ClampedArray[]> {
  const samples = await page.evaluate(
    async ({ base64, mediaType: decodedMediaType, times }) => {
      const binary = atob(base64);
      const data = Uint8Array.from(binary, (character) =>
        character.charCodeAt(0),
      );
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      const objectUrl = URL.createObjectURL(
        new Blob([data], { type: decodedMediaType }),
      );
      video.src = objectUrl;
      try {
        await new Promise<void>((resolve, reject) => {
          video.addEventListener("loadeddata", () => resolve(), { once: true });
          video.addEventListener(
            "error",
            () => reject(new Error("Browser could not decode exported video.")),
            { once: true },
          );
          video.load();
        });
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Unable to inspect exported video pixels.");
        const decodedSamples: number[][] = [];
        for (const timeSeconds of times) {
          if (Math.abs(video.currentTime - timeSeconds) > 1e-6) {
            await new Promise<void>((resolve, reject) => {
              video.addEventListener("seeked", () => resolve(), { once: true });
              video.addEventListener(
                "error",
                () => reject(new Error("Browser could not seek exported video.")),
                { once: true },
              );
              video.currentTime = timeSeconds;
            });
          }
          context.clearRect(0, 0, 64, 64);
          context.drawImage(video, 0, 0, 64, 64);
          decodedSamples.push(
            Array.from(context.getImageData(0, 0, 64, 64).data),
          );
        }
        return decodedSamples;
      } finally {
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(objectUrl);
      }
    },
    {
      base64: Buffer.from(bytes).toString("base64"),
      mediaType,
      times: sampleTimes,
    },
  );
  return Object.freeze(samples.map((sample) => Uint8ClampedArray.from(sample)));
}

export async function inspectToolcraftVideoDownload({
  backgroundRgba,
  download,
  page,
  schedule,
}: Readonly<{
  backgroundRgba: readonly [number, number, number, number];
  download: Download;
  page: Page;
  schedule: readonly ToolcraftScheduledVideoFrame[];
}>): Promise<ToolcraftInspectedVideoArtifact> {
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("Playwright did not expose the downloaded video path.");
  }
  const bytes = await fs.readFile(downloadPath);
  if (bytes.byteLength === 0) {
    throw new Error("Downloaded video artifact is empty.");
  }
  const mediaType = detectVideoMediaType(bytes);
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(new Blob([bytes], { type: mediaType })),
  });

  let durationSeconds: number;
  let height: number;
  let packetTimings: ToolcraftVideoPacketTiming[];
  let timeResolution: number;
  let width: number;
  try {
    const tracks = await input.getVideoTracks();
    const track = tracks[0];
    if (!track) throw new Error("Exported video does not contain a video track.");
    [durationSeconds, height, timeResolution, width] = await Promise.all([
      input.computeDuration([track]),
      track.getCodedHeight(),
      track.getTimeResolution(),
      track.getCodedWidth(),
    ]);
    packetTimings = [];
    const sink = new EncodedPacketSink(track);
    for await (const packet of sink.packets(undefined, undefined, {
      metadataOnly: true,
    })) {
      packetTimings.push(
        Object.freeze({
          durationSeconds: packet.duration,
          timeSeconds: packet.timestamp,
        }),
      );
    }
  } finally {
    input.dispose();
  }
  packetTimings.sort((left, right) => left.timeSeconds - right.timeSeconds);

  const sampleTimes = getSampleTimes(schedule);
  const decodedSamples = await decodeSamplesInPage({
    bytes,
    mediaType,
    page,
    sampleTimes,
  });
  const observations = await Promise.all(
    decodedSamples.map((pixels) =>
      observeToolcraftDecodedPixels({
        backgroundRgba,
        pixels,
        sourceHeight: 64,
        sourceWidth: 64,
      }),
    ),
  );
  const inspection: ToolcraftVideoArtifactInspection = Object.freeze({
    byteLength: bytes.byteLength,
    durationMs: durationSeconds * 1000,
    frameCount: packetTimings.length,
    height,
    kind: "video",
    mediaType,
    packetTimings: Object.freeze(packetTimings),
    samplePixelHashes: Object.freeze(
      observations.map(({ decodedPixelHash }) => decodedPixelHash),
    ),
    width,
  });

  return Object.freeze({
    inspection,
    observations: Object.freeze(observations),
    sampleTimes,
    timeResolution,
  });
}
