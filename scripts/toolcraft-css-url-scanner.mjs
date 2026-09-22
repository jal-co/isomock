const CSS_WHITESPACE = "\t\n\f\r ";
const EMPTY_TOKENS = Object.freeze([]);

function isCssWhitespace(character) {
  return CSS_WHITESPACE.includes(character);
}

function isCssNewline(character) {
  return "\n\f\r".includes(character);
}

function isHexDigit(character) {
  return /^[\da-f]$/iu.test(character ?? "");
}

function isNameStartCodePoint(character) {
  if (!character) return false;
  const codePoint = character.codePointAt(0);
  return (
    character === "_" ||
    (codePoint >= 0x41 && codePoint <= 0x5a) ||
    (codePoint >= 0x61 && codePoint <= 0x7a) ||
    codePoint >= 0x80
  );
}

function isNameCodePoint(character) {
  const codePoint = character?.codePointAt(0);
  return (
    character === "-" ||
    isNameStartCodePoint(character) ||
    (codePoint >= 0x30 && codePoint <= 0x39)
  );
}

function isInvalidCodePoint(codePoint) {
  return (
    codePoint === 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  );
}

function isNonPrintableCodePoint(codePoint) {
  return (
    (codePoint >= 0 && codePoint <= 0x08) ||
    codePoint === 0x0b ||
    (codePoint >= 0x0e && codePoint <= 0x1f) ||
    codePoint === 0x7f
  );
}

function getCodePointWidth(value, index) {
  return value.codePointAt(index) > 0xffff ? 2 : 1;
}

function consumeCssEscape(value, start, allowNewlineContinuation) {
  const escapedStart = start + 1;
  if (escapedStart >= value.length) return undefined;
  if (isCssNewline(value[escapedStart])) {
    if (!allowNewlineContinuation) return undefined;
    const isCrLf =
      value[escapedStart] === "\r" && value[escapedStart + 1] === "\n";
    return {
      decoded: "",
      nextIndex: escapedStart + (isCrLf ? 2 : 1),
    };
  }
  if (isHexDigit(value[escapedStart])) {
    let cursor = escapedStart;
    while (
      cursor < value.length &&
      cursor - escapedStart < 6 &&
      isHexDigit(value[cursor])
    ) {
      cursor += 1;
    }
    const codePoint = Number.parseInt(value.slice(escapedStart, cursor), 16);
    if (isInvalidCodePoint(codePoint)) return undefined;
    if (isCssWhitespace(value[cursor])) {
      cursor +=
        value[cursor] === "\r" && value[cursor + 1] === "\n" ? 2 : 1;
    }
    return {
      decoded: String.fromCodePoint(codePoint),
      nextIndex: cursor,
    };
  }
  const codePoint = value.codePointAt(escapedStart);
  if (isInvalidCodePoint(codePoint)) return undefined;
  const width = getCodePointWidth(value, escapedStart);
  return {
    decoded: value.slice(escapedStart, escapedStart + width),
    nextIndex: escapedStart + width,
  };
}

function isValidCssEscapeStart(value, start) {
  return (
    value[start] === "\\" &&
    start + 1 < value.length &&
    !isCssNewline(value[start + 1])
  );
}

function wouldStartCssIdentifier(value, start) {
  if (isNameStartCodePoint(value[start])) return true;
  if (value[start] === "\\") return isValidCssEscapeStart(value, start);
  if (value[start] !== "-") return false;
  return (
    value[start + 1] === "-" ||
    isNameStartCodePoint(value[start + 1]) ||
    isValidCssEscapeStart(value, start + 1)
  );
}

function consumeCssName(value, start) {
  let decoded = "";
  let cursor = start;
  while (cursor < value.length) {
    if (isNameCodePoint(value[cursor])) {
      const width = getCodePointWidth(value, cursor);
      decoded += value.slice(cursor, cursor + width);
      cursor += width;
    } else if (value[cursor] === "\\") {
      const escape = consumeCssEscape(value, cursor, false);
      if (!escape) return undefined;
      decoded += escape.decoded;
      cursor = escape.nextIndex;
    } else {
      break;
    }
  }
  return { decoded, nextIndex: cursor };
}

function trimCssWhitespace(value) {
  let start = 0;
  let end = value.length;
  while (start < end && isCssWhitespace(value[start])) start += 1;
  while (end > start && isCssWhitespace(value[end - 1])) end -= 1;
  return value.slice(start, end);
}

function decodeCssUrlValue(value, allowNewlineContinuation) {
  let decoded = "";
  let cursor = 0;
  while (cursor < value.length) {
    if (value[cursor] !== "\\") {
      if (isInvalidCodePoint(value.codePointAt(cursor))) return undefined;
      const width = getCodePointWidth(value, cursor);
      decoded += value.slice(cursor, cursor + width);
      cursor += width;
      continue;
    }
    const escape = consumeCssEscape(
      value,
      cursor,
      allowNewlineContinuation,
    );
    if (!escape) return undefined;
    decoded += escape.decoded;
    cursor = escape.nextIndex;
  }
  return decoded;
}

function skipCssTrivia(value, start) {
  let cursor = start;
  while (cursor < value.length) {
    if (isCssWhitespace(value[cursor])) {
      cursor += 1;
    } else if (value.slice(cursor, cursor + 2) === "/*") {
      const commentEnd = value.indexOf("*/", cursor + 2);
      if (commentEnd < 0) return undefined;
      cursor = commentEnd + 2;
    } else {
      break;
    }
  }
  return cursor;
}

function skipCssString(value, start) {
  const quote = value[start];
  let cursor = start + 1;
  while (cursor < value.length) {
    if (value[cursor] === quote) return cursor + 1;
    if (isCssNewline(value[cursor])) return undefined;
    if (value[cursor] === "\\") {
      const escape = consumeCssEscape(value, cursor, true);
      if (!escape) return undefined;
      cursor = escape.nextIndex;
    } else {
      cursor += getCodePointWidth(value, cursor);
    }
  }
  return undefined;
}

function createCssUrlToken(value, quoted, start, end, nextIndex) {
  const rawValue = value.slice(start, end);
  const innerValue = quoted
    ? trimCssWhitespace(rawValue.slice(1, -1))
    : rawValue;
  const normalizedValue = decodeCssUrlValue(innerValue, quoted);
  if (normalizedValue === undefined) return undefined;
  return {
    nextIndex,
    token: Object.freeze({
      quoted,
      rawValue,
      start,
      value: normalizedValue,
    }),
  };
}

function scanQuotedCssUrlToken(value, start, quote) {
  let cursor = start + 1;
  while (cursor < value.length) {
    if (value[cursor] === quote) {
      const end = cursor + 1;
      const closingIndex = skipCssTrivia(value, end);
      return closingIndex !== undefined && value[closingIndex] === ")"
        ? createCssUrlToken(value, true, start, end, closingIndex + 1)
        : undefined;
    }
    if (isCssNewline(value[cursor])) return undefined;
    if (value[cursor] === "\\") {
      const escape = consumeCssEscape(value, cursor, true);
      if (!escape) return undefined;
      cursor = escape.nextIndex;
    } else {
      cursor += getCodePointWidth(value, cursor);
    }
  }
  return undefined;
}

function scanUnquotedCssUrlToken(value, start) {
  let cursor = start;
  while (cursor < value.length) {
    if (value[cursor] === ")") {
      return createCssUrlToken(value, false, start, cursor, cursor + 1);
    }
    if (isCssWhitespace(value[cursor])) {
      const closingIndex = skipCssTrivia(value, cursor);
      return closingIndex !== undefined && value[closingIndex] === ")"
        ? createCssUrlToken(value, false, start, cursor, closingIndex + 1)
        : undefined;
    }
    if (
      ["\"", "'", "("].includes(value[cursor]) ||
      value.slice(cursor, cursor + 2) === "/*" ||
      isNonPrintableCodePoint(value.codePointAt(cursor))
    ) {
      return undefined;
    }
    if (value[cursor] === "\\") {
      const escape = consumeCssEscape(value, cursor, false);
      if (!escape) return undefined;
      cursor = escape.nextIndex;
    } else {
      cursor += getCodePointWidth(value, cursor);
    }
  }
  return undefined;
}

function scanCssUrlFunction(value, openingParenthesis) {
  const tokenStart = skipCssTrivia(value, openingParenthesis + 1);
  if (tokenStart === undefined) return undefined;
  const quote = ["\"", "'"].includes(value[tokenStart])
    ? value[tokenStart]
    : undefined;
  return quote
    ? scanQuotedCssUrlToken(value, tokenStart, quote)
    : scanUnquotedCssUrlToken(value, tokenStart);
}

export function scanToolcraftCssUrlTokens(value) {
  const tokens = [];
  let cursor = 0;
  while (cursor < value.length) {
    if (value.slice(cursor, cursor + 2) === "/*") {
      const commentEnd = value.indexOf("*/", cursor + 2);
      if (commentEnd < 0) return EMPTY_TOKENS;
      cursor = commentEnd + 2;
    } else if (["\"", "'"].includes(value[cursor])) {
      const stringEnd = skipCssString(value, cursor);
      if (stringEnd === undefined) return EMPTY_TOKENS;
      cursor = stringEnd;
    } else if (
      value[cursor] === "#" &&
      (isNameCodePoint(value[cursor + 1]) ||
        isValidCssEscapeStart(value, cursor + 1))
    ) {
      const name = consumeCssName(value, cursor + 1);
      if (!name) return EMPTY_TOKENS;
      cursor = name.nextIndex;
    } else if (
      value[cursor] === "@" &&
      wouldStartCssIdentifier(value, cursor + 1)
    ) {
      const name = consumeCssName(value, cursor + 1);
      if (!name) return EMPTY_TOKENS;
      cursor = name.nextIndex;
    } else if (
      isNameCodePoint(value[cursor]) ||
      value[cursor] === "\\"
    ) {
      const isIdentifier = wouldStartCssIdentifier(value, cursor);
      const name = consumeCssName(value, cursor);
      if (!name) return EMPTY_TOKENS;
      if (
        isIdentifier &&
        name.decoded.toLowerCase() === "url" &&
        value[name.nextIndex] === "("
      ) {
        const result = scanCssUrlFunction(value, name.nextIndex);
        if (!result) return EMPTY_TOKENS;
        tokens.push(result.token);
        cursor = result.nextIndex;
      } else {
        cursor = name.nextIndex;
      }
    } else {
      cursor += getCodePointWidth(value, cursor);
    }
  }
  return Object.freeze(tokens);
}
