export function compositeStraightAlphaSourceOver(
  destination: Uint8ClampedArray,
  source: Uint8Array,
): Uint8ClampedArray<ArrayBuffer> {
  if (destination.byteLength !== source.byteLength) {
    throw new RangeError(
      "Source and destination RGBA buffers must have the same byte length.",
    );
  }
  if (source.byteLength % 4 !== 0) {
    throw new RangeError("RGBA buffer byte length must be divisible by four.");
  }

  const output = new Uint8ClampedArray(new ArrayBuffer(source.byteLength));
  for (let index = 0; index < source.byteLength; index += 4) {
    const sourceAlpha = source[index + 3];
    const destinationAlpha = destination[index + 3];
    if (sourceAlpha === 0) {
      output.set(destination.subarray(index, index + 4), index);
      continue;
    }
    if (sourceAlpha === 255) {
      output.set(source.subarray(index, index + 4), index);
      continue;
    }
    const inverseSourceAlpha = 255 - sourceAlpha;
    const outputAlphaNumerator =
      sourceAlpha * 255 + destinationAlpha * inverseSourceAlpha;
    for (let channel = 0; channel < 3; channel += 1) {
      output[index + channel] = Math.round(
        (source[index + channel] * sourceAlpha * 255 +
          destination[index + channel] *
            destinationAlpha *
            inverseSourceAlpha) /
          outputAlphaNumerator,
      );
    }
    output[index + 3] = Math.round(outputAlphaNumerator / 255);
  }
  return output;
}
