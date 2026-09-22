export function normalizeToolcraftPerformanceRequestText(value) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function isNontrivialRequestEvidence(evidence) {
  const tokens = evidence.match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...evidence].length >= 8 && tokens.length >= 2;
}

export function validateToolcraftPerformanceRequestEvidenceMatch(
  request,
  evidence,
) {
  const normalizedRequest = normalizeToolcraftPerformanceRequestText(request);
  const normalizedEvidence =
    normalizeToolcraftPerformanceRequestText(evidence);

  if (!isNontrivialRequestEvidence(evidence)) {
    return Object.freeze({
      normalizedEvidence,
      normalizedRequest,
      reason: "evidence-too-short",
      valid: false,
    });
  }
  if (!request.includes(evidence)) {
    return Object.freeze({
      normalizedEvidence,
      normalizedRequest,
      reason: "evidence-not-in-request",
      valid: false,
    });
  }
  return Object.freeze({
    normalizedEvidence,
    normalizedRequest,
    valid: true,
  });
}
