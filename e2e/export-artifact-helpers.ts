export type ToolcraftNormalizedPixelBounds = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export type ToolcraftBinaryArtifactInspection = Readonly<{
  byteLength: number;
  contentHash?: string;
  durationMs?: number;
  frameCount?: number;
  height?: number;
  kind?: "binary";
  mediaType?: string;
  width?: number;
}>;

export type ToolcraftImageArtifactInspection = Readonly<{
  byteLength: number;
  decodedPixelHash: string;
  height: number;
  kind: "image";
  mediaType: "image/jpeg" | "image/png";
  nonBackgroundBounds: ToolcraftNormalizedPixelBounds | null;
  width: number;
}>;

export type ToolcraftVideoPacketTiming = Readonly<{
  durationSeconds: number;
  timeSeconds: number;
}>;

export type ToolcraftVideoArtifactInspection = Readonly<{
  byteLength: number;
  durationMs: number;
  frameCount: number;
  height: number;
  kind: "video";
  mediaType: "video/mp4" | "video/webm";
  packetTimings: readonly ToolcraftVideoPacketTiming[];
  samplePixelHashes: readonly string[];
  width: number;
}>;

export type ToolcraftSvgArtifactInspection = Readonly<{
  backgroundColor: string | null;
  byteLength: number;
  contentHash: string;
  height: number;
  kind: "svg";
  mediaType: "image/svg+xml";
  vectorElementCount: number;
  viewBox: readonly [number, number, number, number];
  width: number;
}>;

export type ToolcraftExportArtifactInspection =
  | ToolcraftBinaryArtifactInspection
  | ToolcraftImageArtifactInspection
  | ToolcraftSvgArtifactInspection
  | ToolcraftVideoArtifactInspection;

export type ToolcraftExportArtifactInspectionResult =
  | ToolcraftExportArtifactInspection
  | readonly ToolcraftExportArtifactInspection[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertPositiveFiniteNumber(
  value: unknown,
  field: string,
  requirementId: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(
      `Export requirement "${requirementId}" must report a positive ${field}.`,
    );
  }
}

function assertPositiveInteger(
  value: unknown,
  field: string,
  requirementId: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      `Export requirement "${requirementId}" must report a positive ${field} integer.`,
    );
  }
}

function validateNormalizedPixelBounds(
  value: unknown,
  requirementId: string,
): void {
  if (value === null) return;
  if (!isRecord(value)) {
    throw new Error(
      `Export requirement "${requirementId}" must report normalized nonBackgroundBounds or null.`,
    );
  }
  const { height, width, x, y } = value;
  for (const [field, coordinate] of Object.entries({ height, width, x, y })) {
    if (
      typeof coordinate !== "number" ||
      !Number.isFinite(coordinate) ||
      coordinate < 0 ||
      coordinate > 1 ||
      ((field === "height" || field === "width") && coordinate === 0)
    ) {
      throw new Error(
        `Export requirement "${requirementId}" must report normalized nonBackgroundBounds.${field}.`,
      );
    }
  }
  if (
    typeof x === "number" &&
    typeof y === "number" &&
    typeof width === "number" &&
    typeof height === "number" &&
    (x + width > 1 || y + height > 1)
  ) {
    throw new Error(
      `Export requirement "${requirementId}" nonBackgroundBounds must remain inside the normalized artifact.`,
    );
  }
}

export function assertToolcraftProducedArtifact(
  artifact: unknown,
  requirementId: string,
): void {
  const isEmptyKnownArtifact =
    artifact === null ||
    artifact === undefined ||
    (typeof artifact === "string" && artifact.length === 0) ||
    (artifact instanceof ArrayBuffer && artifact.byteLength === 0) ||
    (ArrayBuffer.isView(artifact) && artifact.byteLength === 0) ||
    (artifact instanceof Blob && artifact.size === 0) ||
    (Array.isArray(artifact) && artifact.length === 0);

  if (isEmptyKnownArtifact) {
    throw new Error(
      `Export requirement "${requirementId}" must produce a non-empty export artifact before verification.`,
    );
  }
}

function validateInspection(
  inspection: Record<string, unknown>,
  requirementId: string,
): void {
  assertPositiveInteger(inspection.byteLength, "byteLength", requirementId);
  if (inspection.kind === undefined || inspection.kind === "binary") {
    if (inspection.durationMs !== undefined) {
      assertPositiveFiniteNumber(
        inspection.durationMs,
        "durationMs",
        requirementId,
      );
    }
    for (const field of ["frameCount", "height", "width"] as const) {
      if (inspection[field] !== undefined) {
        assertPositiveInteger(inspection[field], field, requirementId);
      }
    }
    for (const field of ["contentHash", "mediaType"] as const) {
      if (
        inspection[field] !== undefined &&
        (typeof inspection[field] !== "string" || !inspection[field].trim())
      ) {
        throw new Error(
          `Export requirement "${requirementId}" must report a non-empty ${field} when it is present.`,
        );
      }
    }
    return;
  }

  if (inspection.kind === "image") {
    assertPositiveInteger(inspection.width, "width", requirementId);
    assertPositiveInteger(inspection.height, "height", requirementId);
    if (
      inspection.mediaType !== "image/png" &&
      inspection.mediaType !== "image/jpeg"
    ) {
      throw new Error(
        `Export requirement "${requirementId}" must report a supported image mediaType.`,
      );
    }
    if (
      typeof inspection.decodedPixelHash !== "string" ||
      !inspection.decodedPixelHash.trim()
    ) {
      throw new Error(
        `Export requirement "${requirementId}" must hash decoded image pixels.`,
      );
    }
    validateNormalizedPixelBounds(
      inspection.nonBackgroundBounds,
      requirementId,
    );
    return;
  }

  if (inspection.kind === "video") {
    assertPositiveInteger(inspection.width, "width", requirementId);
    assertPositiveInteger(inspection.height, "height", requirementId);
    assertPositiveInteger(inspection.frameCount, "frameCount", requirementId);
    assertPositiveFiniteNumber(inspection.durationMs, "durationMs", requirementId);
    if (
      inspection.mediaType !== "video/mp4" &&
      inspection.mediaType !== "video/webm"
    ) {
      throw new Error(
        `Export requirement "${requirementId}" must report a supported video mediaType.`,
      );
    }
    if (
      !Array.isArray(inspection.packetTimings) ||
      inspection.packetTimings.length !== inspection.frameCount
    ) {
      throw new Error(
        `Export requirement "${requirementId}" must report every real encoded packet timing.`,
      );
    }
    for (const [index, timing] of inspection.packetTimings.entries()) {
      if (
        !isRecord(timing) ||
        typeof timing.timeSeconds !== "number" ||
        !Number.isFinite(timing.timeSeconds) ||
        timing.timeSeconds < 0 ||
        typeof timing.durationSeconds !== "number" ||
        !Number.isFinite(timing.durationSeconds) ||
        timing.durationSeconds <= 0
      ) {
        throw new Error(
          `Export requirement "${requirementId}" must report valid timing for encoded packet ${index}.`,
        );
      }
    }
    if (
      !Array.isArray(inspection.samplePixelHashes) ||
      inspection.samplePixelHashes.length === 0 ||
      inspection.samplePixelHashes.some(
        (hash) => typeof hash !== "string" || !hash.trim(),
      )
    ) {
      throw new Error(
        `Export requirement "${requirementId}" must hash decoded video samples.`,
      );
    }
    return;
  }

  if (inspection.kind === "svg") {
    assertPositiveInteger(inspection.width, "width", requirementId);
    assertPositiveInteger(inspection.height, "height", requirementId);
    assertPositiveInteger(
      inspection.vectorElementCount,
      "vectorElementCount",
      requirementId,
    );
    if (inspection.mediaType !== "image/svg+xml") {
      throw new Error(
        `Export requirement "${requirementId}" must report SVG mediaType.`,
      );
    }
    if (
      inspection.backgroundColor !== null &&
      (typeof inspection.backgroundColor !== "string" ||
        !inspection.backgroundColor.trim())
    ) {
      throw new Error(
        `Export requirement "${requirementId}" must report an SVG background color or null.`,
      );
    }
    if (
      typeof inspection.contentHash !== "string" ||
      !inspection.contentHash.trim()
    ) {
      throw new Error(
        `Export requirement "${requirementId}" must hash exact SVG bytes.`,
      );
    }
    if (
      !Array.isArray(inspection.viewBox) ||
      inspection.viewBox.length !== 4 ||
      inspection.viewBox.some(
        (value) => typeof value !== "number" || !Number.isFinite(value),
      ) ||
      Number(inspection.viewBox[2]) <= 0 ||
      Number(inspection.viewBox[3]) <= 0
    ) {
      throw new Error(
        `Export requirement "${requirementId}" must report a finite positive SVG viewBox.`,
      );
    }
    return;
  }

  throw new Error(
    `Export requirement "${requirementId}" returned an unknown artifact inspection kind.`,
  );
}

export function validateToolcraftExportArtifactInspection(
  observation: unknown,
  requirementId: string,
): ToolcraftExportArtifactInspectionResult {
  const observations = Array.isArray(observation) ? observation : [observation];
  if (observations.length === 0) {
    throw new Error(
      `Export requirement "${requirementId}" must inspect at least one artifact.`,
    );
  }

  for (const inspection of observations) {
    if (!isRecord(inspection) || !("byteLength" in inspection)) {
      throw new Error(
        `Export requirement "${requirementId}" must return a typed artifact inspection with byteLength.`,
      );
    }
    validateInspection(inspection, requirementId);
  }

  return observation as ToolcraftExportArtifactInspectionResult;
}

export function getToolcraftSemanticArtifactSignature(
  inspection: ToolcraftExportArtifactInspection,
  requirementId: string,
): string {
  validateToolcraftExportArtifactInspection(inspection, requirementId);
  if (inspection.kind === "image") {
    return JSON.stringify({
      decodedPixelHash: inspection.decodedPixelHash,
      height: inspection.height,
      mediaType: inspection.mediaType,
      nonBackgroundBounds: inspection.nonBackgroundBounds,
      width: inspection.width,
    });
  }
  if (inspection.kind === "video") {
    return JSON.stringify({
      durationMs: inspection.durationMs,
      frameCount: inspection.frameCount,
      height: inspection.height,
      mediaType: inspection.mediaType,
      packetTimings: inspection.packetTimings,
      samplePixelHashes: inspection.samplePixelHashes,
      width: inspection.width,
    });
  }
  if (inspection.kind === "svg") {
    return JSON.stringify({
      contentHash: inspection.contentHash,
      height: inspection.height,
      mediaType: inspection.mediaType,
      vectorElementCount: inspection.vectorElementCount,
      viewBox: inspection.viewBox,
      width: inspection.width,
    });
  }
  if (!inspection.contentHash?.trim()) {
    throw new Error(
      `Export requirement "${requirementId}" must report contentHash from decoded product output for semantic comparison.`,
    );
  }
  return JSON.stringify({
    contentHash: inspection.contentHash,
    durationMs: inspection.durationMs,
    frameCount: inspection.frameCount,
    height: inspection.height,
    mediaType: inspection.mediaType,
    width: inspection.width,
  });
}
