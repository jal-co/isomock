import type {
  ResolvedToolcraftAppSchema,
  ResolvedToolcraftControlSectionSchema,
  ToolcraftControlSectionSchema,
} from "@/toolcraft/runtime";
import {
  defineToolcraft,
  imageExportModule,
  svgExportModule,
  videoExportModule,
} from "@/toolcraft/runtime";
import type {
  ToolcraftArtifactExportIntent,
  ToolcraftProductReadiness,
} from "./acceptance/types";

export function defineExportModuleSchemaFixture({
  image = false,
  productSections = [makeBackgroundSection()],
  svg = false,
  video = false,
}: {
  image?: boolean;
  productSections?: readonly ToolcraftControlSectionSchema[];
  svg?: boolean;
  video?: boolean;
} = {}): ResolvedToolcraftAppSchema {
  return defineToolcraft({
    base: {
      canvas: { enabled: true, sizing: { mode: "editable-output" } },
      identity: { id: "export-fixture", title: "Export fixture" },
      panels: {
        controls: { sections: productSections, title: "Controls" },
      },
      ...(video ? {} : { persistence: { storage: "none" as const } }),
    },
    modules: [
      ...(image ? [imageExportModule()] : []),
      ...(svg ? [svgExportModule()] : []),
      ...(video ? [videoExportModule()] : []),
    ],
  });
}

export function forgeResolvedExportSections(
  schema: ResolvedToolcraftAppSchema,
  transform: (
    sections: readonly ResolvedToolcraftControlSectionSchema[],
  ) => readonly ResolvedToolcraftControlSectionSchema[],
): ResolvedToolcraftAppSchema {
  const controls = schema.panels.controls;
  if (!controls) {
    throw new Error("Export schema fixture requires controls.");
  }
  return Object.freeze({
    ...schema,
    panels: Object.freeze({
      ...schema.panels,
      controls: Object.freeze({
        ...controls,
        sections: Object.freeze([...transform(controls.sections ?? [])]),
      }),
    }),
  });
}

export function makeExportSettingsProductReadiness(
  exportIntent: ToolcraftArtifactExportIntent,
): Extract<ToolcraftProductReadiness, { mode: "product" }> {
  return {
    exportIntent,
    interactionOwnership: [],
    mode: "product",
    productName: "Export settings fixture",
    productSummary:
      "A synthetic product for image, SVG, and video export settings.",
    requestedBehavior: "Export the explicitly requested artifact types.",
    viewInteraction: {
      mode: "non-spatial",
      reason: "The synthetic output is two-dimensional.",
    },
  };
}

export function makeBackgroundSection() {
  return {
    id: "background",
    controls: {
      includeBackground: {
        applicability: { mode: "always" as const },
        defaultValue: true,
        description:
          "Controls preview and PNG background visibility while video keeps the background.",
        label: "Include",
        target: "export.includeBackground",
        type: "switch",
      },
      background: {
        applicability: { mode: "always" as const },
        defaultValue: "#0F0F0F",
        label: false,
        target: "appearance.background",
        type: "color",
      },
    },
    layoutGroups: [
      {
        columns: 2,
        controls: ["includeBackground", "background"],
        layout: "inline",
      },
    ],
    title: "Background",
  } as const;
}

export function makeImageExportSection() {
  return {
    id: "image-export",
    controls: {
      imageFormat: {
        applicability: { mode: "always" as const },
        defaultValue: "png",
        label: "Format",
        options: [
          { label: "PNG", value: "png" },
          { label: "JPG", value: "jpg" },
        ],
        target: "export.image.format",
        type: "select",
      },
      imageResolution: {
        applicability: { mode: "always" as const },
        defaultValue: "4k",
        label: "Resolution",
        options: [
          { label: "2K", value: "2k" },
          { label: "4K", value: "4k" },
          { label: "8K", value: "8k" },
        ],
        target: "export.image.resolution",
        type: "select",
      },
    },
    layoutGroups: [
      {
        columns: 2,
        controls: ["imageFormat", "imageResolution"],
        layout: "inline",
      },
    ],
    title: "Image Export",
  } as const;
}

export function makeVideoExportSection() {
  return {
    id: "video-export",
    controls: {
      videoFormat: {
        applicability: { mode: "always" as const },
        defaultValue: "mp4",
        label: "Format",
        options: [
          { label: "MP4", value: "mp4" },
          { label: "WebM", value: "webm" },
        ],
        target: "export.video.format",
        type: "select",
      },
      videoResolution: {
        applicability: { mode: "always" as const },
        defaultValue: "current",
        label: "Resolution",
        options: [
          { label: "Current", value: "current" },
          { label: "4K", value: "4k" },
        ],
        target: "export.video.resolution",
        type: "select",
      },
    },
    layoutGroups: [
      {
        columns: 2,
        controls: ["videoFormat", "videoResolution"],
        layout: "inline",
      },
    ],
    title: "Video Export",
  } as const;
}

export function textLooksLikePngExport(text: string): boolean {
  return /\b(export|download)\b/i.test(text) && /\bpng\b|\bimage\b/i.test(text);
}

export function textLooksLikeVideoExport(text: string): boolean {
  return (
    /\b(export|download)\b/i.test(text) &&
    /\b(video|mp4|webm|mov)\b/i.test(text)
  );
}

export function textLooksLikeSvgExport(text: string): boolean {
  return (
    /\b(export|download)\b/i.test(text) && /\bsvg\b|\bvector\b/i.test(text)
  );
}
