import type { ToolcraftMotionReferenceInput } from "./types";

const validEventClassifications = new Set<string>([
  "edit-boundary",
  "encoding-artifact",
  "irrelevant-change",
  "product-behavior",
]);

export function validateStudyCoverage(
  input: ToolcraftMotionReferenceInput,
): string[] {
  const errors: string[] = [];
  const behaviorsById = new Map<string, typeof input.behaviors>();
  for (const behavior of input.behaviors) {
    behaviorsById.set(behavior.id, [
      ...(behaviorsById.get(behavior.id) ?? []),
      behavior,
    ]);
  }

  function validateBehaviorId({
    behaviorId,
    owner,
  }: {
    behaviorId: string;
    owner: string;
  }): void {
    const behaviors = behaviorsById.get(behaviorId) ?? [];
    if (behaviors.length === 0) {
      errors.push(`${owner} cites unknown behaviorId "${behaviorId}".`);
    } else if (behaviors.length > 1) {
      errors.push(
        `${owner} cites ambiguous behaviorId "${behaviorId}" with ${behaviors.length} definitions.`,
      );
    }
  }

  for (const study of input.studies) {
    const reviewedFrameIndex = new Map(
      study.evidence.reviewedFrames.map((frame, index) => [frame.frameId, index]),
    );
    const overviewFrameIndex = new Map<string, number>();
    let previousReviewedFrameIndex = -1;

    for (const [overviewIndex, frameId] of study.evidence.overviewFrameIds.entries()) {
      const reviewedIndex = reviewedFrameIndex.get(frameId);

      if (reviewedIndex === undefined) {
        errors.push(
          `motion reference study "${study.studyId}" overview frameId "${frameId}" must resolve to reviewedFrames.`,
        );
        continue;
      }

      if (reviewedIndex <= previousReviewedFrameIndex) {
        errors.push(
          `motion reference study "${study.studyId}" overviewFrameIds must follow reviewedFrames order; "${frameId}" resolves to index ${reviewedIndex} after ${previousReviewedFrameIndex}.`,
        );
      }

      previousReviewedFrameIndex = reviewedIndex;
      overviewFrameIndex.set(frameId, overviewIndex);
    }

    if (study.evidence.overviewFrameIds.length > 0 && study.phases.length === 0) {
      errors.push(
        `motion reference study "${study.studyId}" phases must cover the complete overview range.`,
      );
    }

    let previousPhaseEndIndex: number | undefined;
    for (const [phaseIndex, phase] of study.phases.entries()) {
      const fromIndex = overviewFrameIndex.get(phase.fromFrameId);
      const toIndex = overviewFrameIndex.get(phase.toFrameId);

      if (fromIndex === undefined || toIndex === undefined) {
        errors.push(
          `motion reference study "${study.studyId}" phase "${phase.id}" frame range must resolve to overviewFrameIds.`,
        );
        continue;
      }

      if (fromIndex > toIndex) {
        errors.push(
          `motion reference study "${study.studyId}" phase "${phase.id}" must not end before it starts.`,
        );
      }

      if (phaseIndex === 0 && fromIndex !== 0) {
        errors.push(
          `motion reference study "${study.studyId}" phases must start at overview index 0; "${phase.id}" starts at ${fromIndex}.`,
        );
      }

      if (
        previousPhaseEndIndex !== undefined &&
        fromIndex !== previousPhaseEndIndex + 1
      ) {
        errors.push(
          `motion reference study "${study.studyId}" phases must be contiguous; "${phase.id}" starts at overview index ${fromIndex} after index ${previousPhaseEndIndex}.`,
        );
      }
      previousPhaseEndIndex = toIndex;

      if (!phase.visualState.trim()) {
        errors.push(
          `motion reference study "${study.studyId}" phase "${phase.id}" must describe its visualState.`,
        );
      }

      for (const behaviorId of phase.behaviorIds) {
        validateBehaviorId({
          behaviorId,
          owner: `motion reference study "${study.studyId}" phase "${phase.id}"`,
        });
      }
    }

    const lastOverviewIndex = study.evidence.overviewFrameIds.length - 1;
    if (
      study.phases.length > 0 &&
      previousPhaseEndIndex !== undefined &&
      previousPhaseEndIndex !== lastOverviewIndex
    ) {
      errors.push(
        `motion reference study "${study.studyId}" phases must end at overview index ${lastOverviewIndex}; received ${previousPhaseEndIndex}.`,
      );
    }

    const evidenceEventsById = new Map(
      study.evidence.detectedEvents.map((event) => [event.eventId, event]),
    );
    const authoredEventsByEvidenceId = new Map<string, typeof study.events>();

    for (const event of study.events) {
      const existing = authoredEventsByEvidenceId.get(event.evidenceEventId) ?? [];
      authoredEventsByEvidenceId.set(event.evidenceEventId, [...existing, event]);

      if (!evidenceEventsById.has(event.evidenceEventId)) {
        errors.push(
          `motion reference study "${study.studyId}" event "${event.id}" must cite a detected evidenceEventId.`,
        );
      }

      if (!validEventClassifications.has(event.classification)) {
        errors.push(
          `motion reference study "${study.studyId}" event "${event.id}" has unsupported classification "${String(event.classification)}".`,
        );
        continue;
      }

      if (event.classification === "product-behavior") {
        if (event.behaviorIds.length === 0) {
          errors.push(
            `motion reference study "${study.studyId}" product event "${event.id}" must cite at least one behaviorId.`,
          );
        }

        for (const behaviorId of event.behaviorIds) {
          validateBehaviorId({
            behaviorId,
            owner: `motion reference study "${study.studyId}" event "${event.id}"`,
          });
        }
      } else {
        if (event.behaviorIds.length !== 0) {
          errors.push(
            `motion reference study "${study.studyId}" event "${event.id}" classification "${event.classification}" must not cite behaviorIds.`,
          );
        }

        if (!event.reason.trim()) {
          errors.push(
            `motion reference study "${study.studyId}" event "${event.id}" classification "${event.classification}" requires a non-empty reason.`,
          );
        }
      }
    }

    for (const evidenceEvent of study.evidence.detectedEvents) {
      const matchingAuthoredEvents =
        authoredEventsByEvidenceId.get(evidenceEvent.eventId) ?? [];
      if (matchingAuthoredEvents.length !== 1) {
        errors.push(
          `motion reference study "${study.studyId}" evidence event "${evidenceEvent.eventId}" must have exactly one authored event; found ${matchingAuthoredEvents.length}.`,
        );
      }

      for (const frameId of [
        evidenceEvent.beforeFrameId,
        evidenceEvent.peakFrameId,
        evidenceEvent.afterFrameId,
        ...evidenceEvent.windowFrameIds,
      ]) {
        if (!reviewedFrameIndex.has(frameId)) {
          errors.push(
            `motion reference study "${study.studyId}" evidence event "${evidenceEvent.eventId}" frameId "${frameId}" must resolve to reviewedFrames.`,
          );
        }
      }
    }
  }

  return errors;
}
