import type { ToolcraftMotionReferenceInput } from "./types";

export function getMotionReferenceSourceSha256(
  input: ToolcraftMotionReferenceInput,
): string | undefined {
  const sourceSha256Values = new Set(
    input.studies.map((study) => study.evidence.sourceSha256),
  );

  return sourceSha256Values.size === 1
    ? sourceSha256Values.values().next().value
    : undefined;
}

export function validateStudyIdentity(
  input: ToolcraftMotionReferenceInput,
): string[] {
  const errors: string[] = [];
  const studyIds = new Set<string>();
  const evidencePaths = new Set<string>();
  const sourceSha256Values = new Set<string>();
  const behaviorIds = new Set<string>();

  if (input.studies.length === 0) {
    errors.push(
      `motion reference "${input.referenceId}" must declare at least one study.`,
    );
  }

  for (const behavior of input.behaviors) {
    if (!behavior.id.trim()) {
      errors.push(
        `motion reference "${input.referenceId}" behaviors must include non-empty ids.`,
      );
    } else if (behaviorIds.has(behavior.id)) {
      errors.push(
        `motion reference "${input.referenceId}" behavior id "${behavior.id}" is duplicated.`,
      );
    }
    behaviorIds.add(behavior.id);
  }

  for (const study of input.studies) {
    const studyLabel = study.studyId.trim() || "<missing-study-id>";

    if (!study.studyId.trim()) {
      errors.push(
        `motion reference "${input.referenceId}" studies must include non-empty studyId values.`,
      );
    } else if (studyIds.has(study.studyId)) {
      errors.push(
        `motion reference "${input.referenceId}" studyId "${study.studyId}" is duplicated.`,
      );
    }
    studyIds.add(study.studyId);

    if (evidencePaths.has(study.evidencePath)) {
      errors.push(
        `motion reference "${input.referenceId}" evidencePath "${study.evidencePath}" is duplicated.`,
      );
    }
    evidencePaths.add(study.evidencePath);

    if (study.evidence.studyId !== study.studyId) {
      errors.push(
        `motion reference study "${studyLabel}" must match evidence.studyId "${study.evidence.studyId}".`,
      );
    }

    sourceSha256Values.add(study.evidence.sourceSha256);

    const frameIds = new Set<string>();
    for (const frame of study.evidence.reviewedFrames) {
      if (frameIds.has(frame.frameId)) {
        errors.push(
          `motion reference study "${studyLabel}" reviewed frameId "${frame.frameId}" is duplicated.`,
        );
      }
      frameIds.add(frame.frameId);

      if (frame.sourceSha256 !== study.evidence.sourceSha256) {
        errors.push(
          `motion reference study "${studyLabel}" frame "${frame.frameId}" sourceSha256 must match its evidence sourceSha256.`,
        );
      }
    }

    const evidenceEventIds = new Set<string>();
    for (const event of study.evidence.detectedEvents) {
      if (evidenceEventIds.has(event.eventId)) {
        errors.push(
          `motion reference study "${studyLabel}" evidence eventId "${event.eventId}" is duplicated.`,
        );
      }
      evidenceEventIds.add(event.eventId);
    }

    const eventIds = new Set<string>();
    for (const event of study.events) {
      if (eventIds.has(event.id)) {
        errors.push(
          `motion reference study "${studyLabel}" event id "${event.id}" is duplicated.`,
        );
      }
      eventIds.add(event.id);
    }

    const phaseIds = new Set<string>();
    for (const phase of study.phases) {
      if (phaseIds.has(phase.id)) {
        errors.push(
          `motion reference study "${studyLabel}" phase id "${phase.id}" is duplicated.`,
        );
      }
      phaseIds.add(phase.id);
    }
  }

  if (sourceSha256Values.size > 1) {
    const sortedSourceSha256Values = [...sourceSha256Values].sort((left, right) =>
      left.localeCompare(right, "en"),
    );
    errors.push(
      `motion reference "${input.referenceId}" studies must share one sourceSha256; found ${sortedSourceSha256Values.join(", ")}.`,
    );
  }

  return errors;
}
