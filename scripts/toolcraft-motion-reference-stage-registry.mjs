const definitions = {
  binaryDetection: ["binary-detection",
    "Install ffmpeg and ffprobe and ensure both are on PATH."],
  contactSheet: ["contact-sheet",
    "Check that the selected frames can be rendered as a PNG contact sheet."],
  imageInspect: ["image-inspect",
    "Check the image source, grid, and declared timing."],
  imageLoopSeam: ["image-loop-seam",
    "Check that the first and last image frames can be decoded together."],
  imageMaterialize: ["image-materialize",
    "Check that every selected image frame is readable."],
  imageScan: ["image-scan",
    "Check that the complete image sequence can be decoded."],
  mediaInspect: ["media-inspect",
    "Check that the media is readable and contains a visual stream."],
  mediaLoopSeam: ["media-loop-seam",
    "Check that the first and last media frames can be decoded together."],
  mediaMaterialize: ["media-materialize",
    "Check that every selected media frame is readable."],
  mediaScan: ["media-scan",
    "Check that every media frame can be decoded."],
  sourceHash: ["source-hash",
    "Check that the complete source is readable."],
};

export const TOOLCRAFT_MOTION_REFERENCE_STAGES = Object.freeze(
  Object.fromEntries(Object.entries(definitions).map(([key, [name, action]]) => [
    key, Object.freeze({ action, name }),
  ])),
);

const registered = new Set(Object.values(TOOLCRAFT_MOTION_REFERENCE_STAGES));

export function requireToolcraftMotionReferenceStage(descriptor) {
  if (!registered.has(descriptor)) {
    throw new TypeError("A registered Toolcraft motion reference stage is required.");
  }
  return descriptor;
}
