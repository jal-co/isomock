export const MODEL_DOCUMENT_CODEC_MAGIC = Object.freeze([
  0x54, 0x43, 0x4d, 0x44, 0x4f, 0x43, 0x00, 0x00,
] as const);
export const MODEL_DOCUMENT_CODEC_HEADER_BYTES = 16;
export const MODEL_DOCUMENT_CODEC_DESCRIPTOR_BYTES = 16;

export const MODEL_DOCUMENT_V1_SECTION_KINDS = Object.freeze([
  1, 2, 3, 4,
] as const);
export const MODEL_DOCUMENT_V2_SECTION_KINDS = Object.freeze([
  1, 2, 3, 4, 5, 6,
] as const);

export type ModelDocumentCodecVersion = 1 | 2;
export type ModelDocumentV1SectionKind =
  (typeof MODEL_DOCUMENT_V1_SECTION_KINDS)[number];
export type ModelDocumentV2SectionKind =
  (typeof MODEL_DOCUMENT_V2_SECTION_KINDS)[number];
export type ModelDocumentSectionKind = ModelDocumentV2SectionKind;

export type ModelDocumentSectionsV1 = Readonly<
  Record<ModelDocumentV1SectionKind, Uint8Array>
>;
export type ModelDocumentSectionsV2 = Readonly<
  Record<ModelDocumentV2SectionKind, Uint8Array>
>;

export type ModelDocumentEnvelope =
  | Readonly<{ codecVersion: 1; sections: ModelDocumentSectionsV1 }>
  | Readonly<{ codecVersion: 2; sections: ModelDocumentSectionsV2 }>;

export type ModelDocumentCodecFormat<
  SectionKinds extends readonly ModelDocumentSectionKind[] =
    | typeof MODEL_DOCUMENT_V1_SECTION_KINDS
    | typeof MODEL_DOCUMENT_V2_SECTION_KINDS,
> = Readonly<{
  payloadOffset: number;
  sectionKinds: SectionKinds;
  version: ModelDocumentCodecVersion;
}>;

function createFormat<const SectionKinds extends readonly ModelDocumentSectionKind[]>(
  version: ModelDocumentCodecVersion,
  sectionKinds: SectionKinds,
): ModelDocumentCodecFormat<SectionKinds> {
  return Object.freeze({
    payloadOffset:
      MODEL_DOCUMENT_CODEC_HEADER_BYTES +
      MODEL_DOCUMENT_CODEC_DESCRIPTOR_BYTES * sectionKinds.length,
    sectionKinds,
    version,
  });
}

export const MODEL_DOCUMENT_CODEC_V1 = createFormat(
  1,
  MODEL_DOCUMENT_V1_SECTION_KINDS,
);
export const MODEL_DOCUMENT_CODEC_V2 = createFormat(
  2,
  MODEL_DOCUMENT_V2_SECTION_KINDS,
);

export function getModelDocumentCodecFormat(
  version: ModelDocumentCodecVersion,
): ModelDocumentCodecFormat;
export function getModelDocumentCodecFormat(
  version: unknown,
): ModelDocumentCodecFormat | undefined;
export function getModelDocumentCodecFormat(
  version: unknown,
): ModelDocumentCodecFormat | undefined {
  if (version === 1) return MODEL_DOCUMENT_CODEC_V1;
  if (version === 2) return MODEL_DOCUMENT_CODEC_V2;
  return undefined;
}

export function modelDocumentDescriptorOffset(index: number): number {
  return (
    MODEL_DOCUMENT_CODEC_HEADER_BYTES +
    index * MODEL_DOCUMENT_CODEC_DESCRIPTOR_BYTES
  );
}
