import { test } from "@playwright/test";

import {
  TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_ATTACHMENT_NAME,
  TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_CONTENT_TYPE,
  decodeToolcraftPerformanceMeasurementBody,
} from "../src/app/test-evidence/browser-performance-measurement-contract";

export async function attachToolcraftPerformanceMeasurementEvidence(
  body: string,
): Promise<void> {
  const decoded = decodeToolcraftPerformanceMeasurementBody(body);
  if (!decoded.ok) {
    throw new Error(
      `Cannot attach malformed Toolcraft performance measurement: ${decoded.error}`,
    );
  }
  await test.info().attach(
    TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_ATTACHMENT_NAME,
    {
      body,
      contentType: TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_CONTENT_TYPE,
    },
  );
}
