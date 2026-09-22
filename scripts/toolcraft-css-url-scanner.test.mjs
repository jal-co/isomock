import assert from "node:assert/strict";
import test from "node:test";

import { scanToolcraftCssUrlTokens } from "./toolcraft-css-url-scanner.mjs";

function comparableTokens(tokens) {
  return tokens.map(({ quoted, rawValue, start, value }) => ({
    quoted,
    rawValue,
    start,
    value,
  }));
}

test("recognizes only top-level URL function tokens at identifier boundaries", () => {
  const value = String.raw`
    "url('./double.png')"
    'url("./single.png")'
    /* url("./comment.png") */
    myurl("./long.png")
    x-url("./continued.png")
    _url("./underscored.png")
    URL(  "./real.png"  )
  `;
  const rawValue = '"./real.png"';
  const tokens = scanToolcraftCssUrlTokens(value);

  assert.deepEqual(comparableTokens(tokens), [{
    quoted: true,
    rawValue,
    start: value.indexOf(rawValue),
    value: "./real.png",
  }]);
  assert.equal(Object.isFrozen(tokens), true);
  assert.equal(Object.isFrozen(tokens[0]), true);
});

test("tokenizes ident-like names before recognizing decoded URL functions", () => {
  const value = String.raw`
    #url("./hash.png")
    @url("./at.png")
    --url("./custom.png")
    _url("./underscore.png")
    x-url("./hyphen.png")
    image-set(url("./nested.png"))
    u\72l("./escaped-name.png")
  `;
  const nestedRaw = '"./nested.png"';
  const escapedRaw = '"./escaped-name.png"';

  assert.deepEqual(comparableTokens(scanToolcraftCssUrlTokens(value)), [
    {
      quoted: true,
      rawValue: nestedRaw,
      start: value.indexOf(nestedRaw),
      value: "./nested.png",
    },
    {
      quoted: true,
      rawValue: escapedRaw,
      start: value.indexOf(escapedRaw),
      value: "./escaped-name.png",
    },
  ]);
});

test("decodes simple and hexadecimal CSS URL escapes without changing raw tokens", () => {
  const value = String.raw`
    url("../a\" )b.png")
    url('../a\' )b.png')
    url(../a\)b.png)
    url("h\74 tp://example.com/remote.png")
  `;

  assert.deepEqual(comparableTokens(scanToolcraftCssUrlTokens(value)), [
    {
      quoted: true,
      rawValue: String.raw`"../a\" )b.png"`,
      start: value.indexOf(String.raw`"../a\" )b.png"`),
      value: '../a" )b.png',
    },
    {
      quoted: true,
      rawValue: String.raw`'../a\' )b.png'`,
      start: value.indexOf(String.raw`'../a\' )b.png'`),
      value: "../a' )b.png",
    },
    {
      quoted: false,
      rawValue: String.raw`../a\)b.png`,
      start: value.indexOf(String.raw`../a\)b.png`),
      value: "../a)b.png",
    },
    {
      quoted: true,
      rawValue: String.raw`"h\74 tp://example.com/remote.png"`,
      start: value.indexOf(String.raw`"h\74 tp://example.com/remote.png"`),
      value: "http://example.com/remote.png",
    },
  ]);
});

test("preserves generic URL schemes after CSS escape decoding", () => {
  const value = String.raw`
    url("ftp:asset.png")
    url("blob:fixture")
    url("mailto:person@example.com")
    url("file:asset.png")
    url("custom+scheme:asset.png")
    url("h\74 tp://example.com/escaped.png")
  `;

  assert.deepEqual(
    comparableTokens(scanToolcraftCssUrlTokens(value)).map(
      ({ rawValue, value: normalizedValue }) => ({
        normalizedValue,
        rawValue,
      }),
    ),
    [
      { normalizedValue: "ftp:asset.png", rawValue: '"ftp:asset.png"' },
      { normalizedValue: "blob:fixture", rawValue: '"blob:fixture"' },
      {
        normalizedValue: "mailto:person@example.com",
        rawValue: '"mailto:person@example.com"',
      },
      { normalizedValue: "file:asset.png", rawValue: '"file:asset.png"' },
      {
        normalizedValue: "custom+scheme:asset.png",
        rawValue: '"custom+scheme:asset.png"',
      },
      {
        normalizedValue: "http://example.com/escaped.png",
        rawValue: String.raw`"h\74 tp://example.com/escaped.png"`,
      },
    ],
  );
});

test("removes escaped newline continuations from quoted URL values", () => {
  const value = [
    'url("./line',
    "\\",
    "\n",
    'continued.png")',
  ].join("");
  const rawValue = [
    '"./line',
    "\\",
    "\n",
    'continued.png"',
  ].join("");

  assert.deepEqual(comparableTokens(scanToolcraftCssUrlTokens(value)), [{
    quoted: true,
    rawValue,
    start: value.indexOf(rawValue),
    value: "./linecontinued.png",
  }]);
});

test("fails closed for unsafe escapes and malformed recognized URL functions", () => {
  const unquotedContinuation = [
    "url(./line",
    "\\",
    "\n",
    "continued.png)",
  ].join("");
  for (const value of [
    String.raw`url("./zero\0.png")`,
    String.raw`url("./surrogate\D800.png")`,
    String.raw`url("./range\110000.png")`,
    'url("./literal\u0000.png")',
    "url(./control\u0007.png)",
    String.raw`url("./missing.png" junk)`,
    String.raw`url("./unclosed.png)`,
    String.raw`url(./unclosed.png`,
    String.raw`u\0rl("./invalid-ident.png")`,
    unquotedContinuation,
  ]) {
    assert.deepEqual(scanToolcraftCssUrlTokens(value), []);
  }
});

test("discards every token when a later recognized URL function is malformed", () => {
  const value =
    String.raw`url("./first.png"), URL("./second.png"), u\72l("./broken.png" junk)`;
  assert.deepEqual(scanToolcraftCssUrlTokens(value), []);
});

test("returns multiple valid URL tokens in deterministic source order", () => {
  const value = 'URL("./first.png"), url(  \'./second.png\'  )';
  const firstRaw = '"./first.png"';
  const secondRaw = "'./second.png'";

  assert.deepEqual(comparableTokens(scanToolcraftCssUrlTokens(value)), [
    {
      quoted: true,
      rawValue: firstRaw,
      start: value.indexOf(firstRaw),
      value: "./first.png",
    },
    {
      quoted: true,
      rawValue: secondRaw,
      start: value.indexOf(secondRaw),
      value: "./second.png",
    },
  ]);
});
