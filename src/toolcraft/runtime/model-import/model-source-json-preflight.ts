import { failModelSourceBundle } from "./model-source-bundle-error";

export type ToolcraftGltfJsonPreflight = Readonly<{
  arrayItems: number;
  escapedStringCodeUnits: number;
  estimatedWorkerBytes: number;
  maxDepth: number;
  maxTokenCodeUnits: number;
  objectMembers: number;
  stringCodeUnits: number;
  structuralTokens: number;
}>;

type JsonFrame =
  | {
      kind: "array";
      state: "comma-or-end" | "value" | "value-or-end";
    }
  | {
      kind: "object";
      state: "colon" | "comma-or-end" | "key" | "key-or-end" | "value";
    };

const MAX_JSON_NESTING_DEPTH = 128;

function malformedJson(): never {
  return failModelSourceBundle(
    "format",
    "malformed-gltf-json",
    "The glTF root contains malformed JSON.",
  );
}

function workerMemoryExceeded(): never {
  return failModelSourceBundle(
    "resource-limit",
    "estimated-worker-memory-limit-exceeded",
    "The glTF root exceeds the configured worker-memory limit.",
  );
}

function checkedAdd(
  current: number,
  additional: number,
  limit: number,
): number {
  if (
    !Number.isSafeInteger(current) ||
    !Number.isSafeInteger(additional) ||
    current < 0 ||
    additional < 0 ||
    additional > limit ||
    current > limit - additional
  ) {
    return workerMemoryExceeded();
  }
  return current + additional;
}

function checkedScale(value: number, factor: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > Math.floor(Number.MAX_SAFE_INTEGER / factor)
  ) {
    return workerMemoryExceeded();
  }
  return value * factor;
}

function incrementCount(value: number, additional = 1): number {
  if (value > Number.MAX_SAFE_INTEGER - additional)
    return workerMemoryExceeded();
  return value + additional;
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isNonZeroDigit(code: number): boolean {
  return code >= 49 && code <= 57;
}

function isHexDigit(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 70) ||
    (code >= 97 && code <= 102)
  );
}

function isWhitespace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

export function preflightAndParseGltfJson(
  bytes: Uint8Array,
  maxEstimatedWorkerBytes: number,
  parseJson: (text: string) => unknown = JSON.parse,
): Readonly<{ preflight: ToolcraftGltfJsonPreflight; value: unknown }> {
  let estimatedWorkerBytes = checkedAdd(
    checkedAdd(
      checkedAdd(0, bytes.byteLength, maxEstimatedWorkerBytes),
      checkedScale(bytes.byteLength, 2),
      maxEstimatedWorkerBytes,
    ),
    64,
    maxEstimatedWorkerBytes,
  );

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return malformedJson();
  }

  estimatedWorkerBytes = checkedAdd(
    checkedAdd(0, bytes.byteLength, maxEstimatedWorkerBytes),
    checkedScale(text.length, 2),
    maxEstimatedWorkerBytes,
  );
  estimatedWorkerBytes = checkedAdd(
    estimatedWorkerBytes,
    64,
    maxEstimatedWorkerBytes,
  );

  let arrayItems = 0;
  let escapedStringCodeUnits = 0;
  let index = 0;
  let maxDepth = 0;
  let maxTokenCodeUnits = 0;
  let objectMembers = 0;
  let stringCodeUnits = 0;
  let structuralTokens = 0;
  const stack: JsonFrame[] = [];

  const addEstimate = (additional: number): void => {
    estimatedWorkerBytes = checkedAdd(
      estimatedWorkerBytes,
      additional,
      maxEstimatedWorkerBytes,
    );
  };
  const countStructure = (): void => {
    structuralTokens = incrementCount(structuralTokens);
    addEstimate(4);
  };
  const skipWhitespace = (): void => {
    while (index < text.length && isWhitespace(text.charCodeAt(index))) {
      index += 1;
    }
  };
  const countToken = (start: number): number => {
    const length = index - start;
    maxTokenCodeUnits = Math.max(maxTokenCodeUnits, length);
    return length;
  };
  const parseString = (): void => {
    const start = index;
    let decodedCodeUnits = 0;
    let escapedCodeUnits = 0;
    index += 1;
    while (index < text.length) {
      const code = text.charCodeAt(index);
      if (code === 34) {
        index += 1;
        const tokenLength = countToken(start);
        stringCodeUnits = incrementCount(stringCodeUnits, decodedCodeUnits);
        escapedStringCodeUnits = incrementCount(
          escapedStringCodeUnits,
          escapedCodeUnits,
        );
        addEstimate(48);
        addEstimate(checkedScale(decodedCodeUnits, 2));
        addEstimate(checkedScale(escapedCodeUnits, 4));
        addEstimate(checkedScale(tokenLength, 2));
        return;
      }
      if (code < 32) return malformedJson();
      if (code !== 92) {
        decodedCodeUnits = incrementCount(decodedCodeUnits);
        index += 1;
        continue;
      }

      index += 1;
      if (index >= text.length) return malformedJson();
      const escapeCode = text.charCodeAt(index);
      escapedCodeUnits = incrementCount(escapedCodeUnits);
      decodedCodeUnits = incrementCount(decodedCodeUnits);
      if (escapeCode === 117) {
        for (let offset = 1; offset <= 4; offset += 1) {
          if (!isHexDigit(text.charCodeAt(index + offset))) {
            return malformedJson();
          }
        }
        index += 5;
        continue;
      }
      if (
        escapeCode !== 34 &&
        escapeCode !== 47 &&
        escapeCode !== 92 &&
        escapeCode !== 98 &&
        escapeCode !== 102 &&
        escapeCode !== 110 &&
        escapeCode !== 114 &&
        escapeCode !== 116
      ) {
        return malformedJson();
      }
      index += 1;
    }
    return malformedJson();
  };
  const parseNumber = (): void => {
    const start = index;
    if (text.charCodeAt(index) === 45) index += 1;
    if (text.charCodeAt(index) === 48) {
      index += 1;
      if (isDigit(text.charCodeAt(index))) return malformedJson();
    } else {
      if (!isNonZeroDigit(text.charCodeAt(index))) return malformedJson();
      while (isDigit(text.charCodeAt(index))) index += 1;
    }
    if (text.charCodeAt(index) === 46) {
      index += 1;
      if (!isDigit(text.charCodeAt(index))) return malformedJson();
      while (isDigit(text.charCodeAt(index))) index += 1;
    }
    const exponentCode = text.charCodeAt(index);
    if (exponentCode === 69 || exponentCode === 101) {
      index += 1;
      const signCode = text.charCodeAt(index);
      if (signCode === 43 || signCode === 45) index += 1;
      if (!isDigit(text.charCodeAt(index))) return malformedJson();
      while (isDigit(text.charCodeAt(index))) index += 1;
    }
    const tokenLength = countToken(start);
    addEstimate(32);
    addEstimate(checkedScale(tokenLength, 2));
  };
  const parseLiteral = (literal: "false" | "null" | "true"): void => {
    const start = index;
    for (let offset = 0; offset < literal.length; offset += 1) {
      if (text.charCodeAt(index + offset) !== literal.charCodeAt(offset)) {
        return malformedJson();
      }
    }
    index += literal.length;
    const tokenLength = countToken(start);
    addEstimate(16);
    addEstimate(checkedScale(tokenLength, 2));
  };
  const openContainer = (kind: "array" | "object"): void => {
    index += 1;
    countStructure();
    if (kind === "array") {
      stack.push({ kind, state: "value-or-end" });
      addEstimate(64);
    } else {
      stack.push({ kind, state: "key-or-end" });
      addEstimate(96);
    }
    maxDepth = Math.max(maxDepth, stack.length);
    if (stack.length > MAX_JSON_NESTING_DEPTH) {
      failModelSourceBundle(
        "resource-limit",
        "gltf-json-depth-limit-exceeded",
        "The glTF root exceeds the protected JSON nesting limit.",
      );
    }
  };
  const parseValue = (): void => {
    skipWhitespace();
    const code = text.charCodeAt(index);
    if (code === 123) return openContainer("object");
    if (code === 91) return openContainer("array");
    if (code === 34) return parseString();
    if (code === 45 || isDigit(code)) return parseNumber();
    if (code === 116) return parseLiteral("true");
    if (code === 102) return parseLiteral("false");
    if (code === 110) return parseLiteral("null");
    return malformedJson();
  };
  const closeContainer = (): void => {
    index += 1;
    countStructure();
    stack.pop();
  };

  skipWhitespace();
  parseValue();
  while (stack.length > 0) {
    skipWhitespace();
    const frame = stack.at(-1)!;
    const code = text.charCodeAt(index);

    if (frame.kind === "object") {
      if (frame.state === "key-or-end" && code === 125) {
        closeContainer();
        continue;
      }
      if (frame.state === "key-or-end" || frame.state === "key") {
        if (code !== 34) return malformedJson();
        parseString();
        objectMembers = incrementCount(objectMembers);
        addEstimate(64);
        frame.state = "colon";
        continue;
      }
      if (frame.state === "colon") {
        if (code !== 58) return malformedJson();
        index += 1;
        countStructure();
        frame.state = "value";
        continue;
      }
      if (frame.state === "value") {
        frame.state = "comma-or-end";
        parseValue();
        continue;
      }
      if (code === 44) {
        index += 1;
        countStructure();
        frame.state = "key";
        continue;
      }
      if (code === 125) {
        closeContainer();
        continue;
      }
      return malformedJson();
    }

    if (frame.state === "value-or-end" && code === 93) {
      closeContainer();
      continue;
    }
    if (frame.state === "value-or-end" || frame.state === "value") {
      arrayItems = incrementCount(arrayItems);
      addEstimate(24);
      frame.state = "comma-or-end";
      parseValue();
      continue;
    }
    if (code === 44) {
      index += 1;
      countStructure();
      frame.state = "value";
      continue;
    }
    if (code === 93) {
      closeContainer();
      continue;
    }
    return malformedJson();
  }

  skipWhitespace();
  if (index !== text.length) return malformedJson();

  const preflight = Object.freeze({
    arrayItems,
    escapedStringCodeUnits,
    estimatedWorkerBytes,
    maxDepth,
    maxTokenCodeUnits,
    objectMembers,
    stringCodeUnits,
    structuralTokens,
  });
  try {
    return Object.freeze({ preflight, value: parseJson(text) });
  } catch {
    return malformedJson();
  }
}
