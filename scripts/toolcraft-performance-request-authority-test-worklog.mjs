import { TOOLCRAFT_DELIVERY_VERIFICATION_NARRATIVE } from "./toolcraft-performance-authority-policy.mjs";

export const firstPathId =
  "performance-path:%5B%22interactive-discrete%22%2C%22control-change%22%2C%5B%22composite%22%5D%2C%5B%5D%2C%5B%5D%2C%5B%22main%22%5D%2C%5B%5D%5D";
export const secondPathId =
  "performance-path:%5B%22interactive-continuous%22%2C%22viewport-drag%22%2C%5B%22composite%22%5D%2C%5B%5D%2C%5B%5D%2C%5B%22main%22%5D%2C%5B%5D%5D";


export function createWorklog({
  extraFields = [],
  heading = "Delivery 1 - Product build",
  intent = "performance-iteration",
  paths = JSON.stringify([secondPathId, firstPathId]),
  request = "The canvas lags while dragging.",
  requestEvidence = "The canvas lags while dragging.",
  verification = TOOLCRAFT_DELIVERY_VERIFICATION_NARRATIVE,
} = {}) {
  const fields = [
    `- Request: ${request}`,
    `- Performance intent: ${intent}`,
    ...(requestEvidence === null
      ? []
      : [`- Performance request evidence: "${requestEvidence}"`]),
    ...(paths === null ? [] : [`- Performance paths: ${paths}`]),
    ...extraFields,
    `- Verification: ${verification}`,
  ];

  return `# Worklog

## Decision Trail

### ${heading}
${fields.join("\n")}

## Verification

Protected receipts own executed checks and measurements.
`;
}

