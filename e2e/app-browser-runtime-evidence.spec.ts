import { test } from "@playwright/test";

import {
  TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_TEST_NAME,
  TOOLCRAFT_BROWSER_PERFORMANCE_MARKER_TEST_NAME,
} from "../src/app/test-evidence/browser-runtime-contract";

test(TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_TEST_NAME, () => undefined);
test(TOOLCRAFT_BROWSER_PERFORMANCE_MARKER_TEST_NAME, () => undefined);
