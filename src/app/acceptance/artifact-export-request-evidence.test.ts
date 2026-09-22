import { describe, expect, it } from "vitest";

import { getToolcraftExportRequestEvidenceErrors } from "./artifact-export-request-evidence";
import type { ToolcraftArtifactExportIntent } from "./types";

const videoRequest = {
  messageRef: "test-conversation/user-message-2",
  messageText: "Make a six-second loop. Add MP4 video export as well.",
  quote: "Add MP4 video export as well.",
  source: "user-message",
} as const;

describe("artifact export primary request evidence", () => {
  it("has no legacy string evidence authoring branch", () => {
    const invalid: ToolcraftArtifactExportIntent = {
      image: {
        mode: "user-removed",
        // @ts-expect-error Image removal also requires the primary message object.
        evidence: "Remove image export.",
      },
      svg: {
        mode: "user-requested",
        // @ts-expect-error Optional SVG cannot use a plain assertion string.
        evidence: "Add SVG export.",
      },
      video: {
        mode: "user-requested",
        // @ts-expect-error Optional video cannot use a plain assertion string.
        evidence: "Add video export.",
      },
    };
    for (const decision of [invalid.image, invalid.svg, invalid.video]) {
      if ("evidence" in decision) {
        expect(getToolcraftExportRequestEvidenceErrors(decision.evidence)).not.toEqual([]);
      }
    }
  });

  it("accepts a verbatim quote with its primary user message reference", () => {
    expect(getToolcraftExportRequestEvidenceErrors(videoRequest)).toEqual([]);
  });

  it("rejects the unsupported video claim copied from a plan", () => {
    expect(getToolcraftExportRequestEvidenceErrors({
      ...videoRequest,
      messageText: "Сделай плавный луп на 6 секунд.",
      quote: "Статика + анимация и видео",
    })).toEqual(["quote must be an exact substring of messageText; an agent paraphrase or plan claim is not primary request evidence."]);
  });

  it.each(["assistant-message", "plan", "worklog", "summary", "reference"])(
    "rejects %s as the source of user permission",
    (source) => {
      expect(getToolcraftExportRequestEvidenceErrors({ ...videoRequest, source }))
        .toEqual(["requires structured user-message evidence with non-empty messageRef, messageText, and quote."]);
    },
  );

  it.each([null, undefined, [], true, 1, "The user requested video.", {}])(
    "rejects malformed evidence without crashing: %j",
    (evidence) => expect(getToolcraftExportRequestEvidenceErrors(evidence)).not.toEqual([]),
  );

  it.each(["messageRef", "messageText", "quote", "source"])(
    "requires a nonblank %s",
    (key) => {
      expect(getToolcraftExportRequestEvidenceErrors({ ...videoRequest, [key]: " \n\t" })).not.toEqual([]);
      expect(getToolcraftExportRequestEvidenceErrors({ ...videoRequest, [key]: undefined })).not.toEqual([]);
      expect(getToolcraftExportRequestEvidenceErrors({ ...videoRequest, [key]: 123 })).not.toEqual([]);
    },
  );

  it("rejects extra self-attested approval fields", () => {
    expect(getToolcraftExportRequestEvidenceErrors({ ...videoRequest, approved: true })).not.toEqual([]);
  });

  it("supports multiline primary text without translating it", () => {
    const messageText = "Сохрани PNG.\nДобавь экспорт видео в MP4.";
    expect(getToolcraftExportRequestEvidenceErrors({
      ...videoRequest, messageText, quote: "Добавь экспорт видео в MP4.",
    })).toEqual([]);
  });

  it.each([
    ["Export  video.", "Export video."],
    ["Export café as SVG.", "Export cafe\u0301 as SVG."],
    ["Export video.", "export video."],
  ])("does not normalize primary evidence: %s", (messageText, quote) => {
    expect(getToolcraftExportRequestEvidenceErrors({ ...videoRequest, messageText, quote })).not.toEqual([]);
  });
});
