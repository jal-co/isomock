const TOKENS = Object.freeze({
  dangerous: Object.freeze({ kind: "dangerous-summary" }),
  exhaustedSource: Object.freeze({ kind: "exhausted-source" }),
  exhaustedTarget: Object.freeze({ kind: "exhausted-target" }),
  overflow: Object.freeze({ kind: "overflow" }),
  safe: Object.freeze({ kind: "safe-summary" }),
  source: Object.freeze({ kind: "unknown-source" }),
  target: Object.freeze({ kind: "unknown-target" }),
});

export function toolcraftDomEvidenceToken(kind) {
  return TOKENS[kind] ?? TOKENS.overflow;
}

export function isToolcraftDomTypeEvidence(value) {
  return Object.values(TOKENS).includes(value);
}

export function toolcraftDomEvidenceRisk(value) {
  if (!isToolcraftDomTypeEvidence(value)) return undefined;
  if (value.kind === "safe-summary") return "safe";
  if (value.kind === "dangerous-summary") return "dangerous";
  return "unknown";
}
