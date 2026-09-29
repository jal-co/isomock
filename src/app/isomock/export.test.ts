import { expect, test } from "vitest";

import { getIsomockExportFileName } from "./export";

test("names exports by kind and local mmddyy-hhmmss", () => {
  const at = new Date(2026, 8, 5, 7, 3, 9);
  expect(getIsomockExportFileName("video", at)).toBe("isomock-video-090526-070309");
  expect(getIsomockExportFileName("image", at)).toBe("isomock-image-090526-070309");
});
