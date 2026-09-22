import { describe, expect, it } from "vitest";

import {
  clearPerformanceSignalError,
  createPerformanceIterationWorklogFixture as renderPerformanceIterationWorklogFixture,
  fixturePerformancePathId,
} from "./app-acceptance.worklog-performance-intent-test-utils";
import {
  createAgentWorklogFixture,
  getAgentWorklogValidationErrors,
} from "./app-acceptance.worklog-test-utils";

const createPerformanceIterationWorklogFixture = (
  options: Parameters<typeof renderPerformanceIterationWorklogFixture>[1],
) =>
  renderPerformanceIterationWorklogFixture(
    createAgentWorklogFixture,
    options,
  );

describe("starter acceptance worklog performance intent", () => {
  it("rejects trivial single-character Request evidence", () => {
    const worklog = createPerformanceIterationWorklogFixture({
      evidence: "x",
      request: "x",
    });

    expect(getAgentWorklogValidationErrors(worklog)).not.toEqual([]);
  });

  it("preserves exact whitespace and Unicode code units in Request evidence", () => {
    const exactRequest = "The café  preview is unresponsive.";
    const normalizedWhitespace = createPerformanceIterationWorklogFixture({
      evidence: "The café preview is unresponsive.",
      request: exactRequest,
    });
    const normalizedUnicode = createPerformanceIterationWorklogFixture({
      evidence: "The cafe\u0301  preview is unresponsive.",
      request: exactRequest,
    });

    expect(
      getAgentWorklogValidationErrors(
        createPerformanceIterationWorklogFixture({ request: exactRequest }),
      ),
    ).toEqual([]);
    expect(getAgentWorklogValidationErrors(normalizedWhitespace)).not.toEqual([]);
    expect(getAgentWorklogValidationErrors(normalizedUnicode)).not.toEqual([]);
  });

  it("defaults missing intent to ordinary and rejects duplicate intent", () => {
    const missing = createAgentWorklogFixture({
      omitDecisionTrailFields: ["Performance intent"],
    });
    const duplicate = createAgentWorklogFixture().replace(
      "- Performance intent: ordinary-product-work",
      "- Performance intent: ordinary-product-work\n- Performance intent: ordinary-product-work",
    );

    expect(getAgentWorklogValidationErrors(missing)).toEqual([]);
    expect(getAgentWorklogValidationErrors(duplicate)).toContain(
      'agent-worklog.md Decision Trail iteration "Delivery 1 - Product build" must include exactly one "Performance intent:".',
    );
  });

  it("accepts separate domain-shaped performance authority fields", () => {
    const worklog = createPerformanceIterationWorklogFixture({
      evidence: "The canvas is delayed and unresponsive.",
      request: "Please fix this. The canvas is delayed and unresponsive.",
    });

    expect(getAgentWorklogValidationErrors(worklog)).toEqual([]);
  });

  it.each([
    ["Performance request evidence", "- Performance request evidence:"],
    ["Performance paths", "- Performance paths:"],
  ])("requires exactly one %s field for performance intent", (field, prefix) => {
    const fixture = createPerformanceIterationWorklogFixture({
      request: "The canvas lags while dragging.",
    });
    const renderedField = fixture
      .split("\n")
      .find((line) => line.startsWith(prefix));
    if (!renderedField) throw new Error(`Expected ${field} fixture field.`);
    const missing = fixture
      .split("\n")
      .filter((line) => line !== renderedField)
      .join("\n");
    const duplicate = fixture.replace(
      renderedField,
      `${renderedField}\n${renderedField}`,
    );

    expect(getAgentWorklogValidationErrors(missing)).toContain(
      `agent-worklog.md Decision Trail iteration "Delivery 1 - Product build" must include exactly one "${field}:".`,
    );
    expect(getAgentWorklogValidationErrors(duplicate)).toContain(
      `agent-worklog.md Decision Trail iteration "Delivery 1 - Product build" must include exactly one "${field}:".`,
    );
  });

  it.each([
    ["not JSON", "performance-path:unknown"],
    ["empty", "[]"],
    ["duplicate", JSON.stringify([fixturePerformancePathId, fixturePerformancePathId])],
    ["noncanonical", JSON.stringify(["performance-path:unknown"])],
  ])("rejects %s Performance paths", (_case, paths) => {
    const worklog = createPerformanceIterationWorklogFixture({
      request: "The canvas lags while dragging.",
    }).replace(
      `- Performance paths: ${JSON.stringify([fixturePerformancePathId])}`,
      `- Performance paths: ${paths}`,
    );

    expect(getAgentWorklogValidationErrors(worklog)).not.toEqual([]);
  });

  it.each([
    [
      "unknown profile",
      ["unknown-profile", "control-change", ["composite"], [], [], ["main"], []],
    ],
    [
      "unknown interaction",
      ["interactive-discrete", "unknown-interaction", ["composite"], [], [], ["main"], []],
    ],
    [
      "mismatched profile",
      ["interactive-continuous", "control-change", ["composite"], [], [], ["main"], []],
    ],
    [
      "duplicate signature members",
      [
        "interactive-discrete",
        "control-change",
        ["composite", "composite"],
        [],
        [],
        ["main"],
        [],
      ],
    ],
    [
      "unsorted signature members",
      [
        "interactive-discrete",
        "control-change",
        ["source", "composite"],
        [],
        [],
        ["main"],
        [],
      ],
    ],
  ])("rejects %s in canonical path signatures", (_case, signature) => {
    expect(signature).toHaveLength(7);
    const pathId = `performance-path:${encodeURIComponent(
      JSON.stringify(signature),
    )}`;
    const worklog = createPerformanceIterationWorklogFixture({
      pathIds: [pathId],
      request: "The canvas lags while dragging.",
    });

    expect(getAgentWorklogValidationErrors(worklog)).not.toEqual([]);
  });

  it.each([
    ["Build a poster.", "It lags."],
    ["The app lags.", "The app freezes."],
    ["THE APP LAGS.", "The app lags."],
    ["Increase animation speed.", "Increase animation speed."],
  ])("rejects iteration evidence not proven by the raw Request: %s", (request, evidence) => {
    const worklog = createPerformanceIterationWorklogFixture({
      evidence,
      request,
    });

    expect(getAgentWorklogValidationErrors(worklog)).not.toEqual([]);
  });

  it("accepts exact ambiguous Request evidence under agent semantic judgment", () => {
    const worklog = createPerformanceIterationWorklogFixture({
      request: "The controls feel sticky.",
    });

    expect(getAgentWorklogValidationErrors(worklog)).toEqual([]);
  });

  it("does not force an ambiguous Request out of ordinary agent judgment", () => {
    const worklog = createAgentWorklogFixture({
      trailFields: { Request: "The controls feel sticky." },
    });

    expect(getAgentWorklogValidationErrors(worklog)).toEqual([]);
  });

  it.each([
    "The app is not slow or unresponsive.",
    "The app isn’t slow or unresponsive.",
    "The app does not lag and does not freeze.",
    "No lag and no freezing.",
    "Приложение не тормозит и не зависает.",
    "Нет лагов и нет зависаний.",
  ])("keeps coordinated performance negation ordinary: %s", (request) => {
    expect(
      getAgentWorklogValidationErrors(
        createAgentWorklogFixture({ trailFields: { Request: request } }),
      ),
    ).toEqual([]);
  });

  it.each([
    "The app does not lag but it freezes.",
    "The app is not slow, but the editor hangs.",
    "Приложение не тормозит, но редактор зависает.",
  ])("requires performance intent for an independent complaint: %s", (request) => {
    expect(
      getAgentWorklogValidationErrors(
        createAgentWorklogFixture({ trailFields: { Request: request } }),
      ),
    ).toContain(clearPerformanceSignalError);
  });

  it("maps clear semantic performance requests to one performance iteration", () => {
    const signals = [
      "Improve application performance under normal use.",
      "Optimize performance and fix the performance regression.",
      "Speed up rendering because the preview is slow.",
      "Reduce input latency and delayed control updates.",
      "The app is laggy, janky, and stutters.",
      "Fix low FPS and unstable frame rate.",
      "Reduce high CPU, GPU, memory, and resource use.",
      "Исправить проблемы с перфом и производительностью приложения.",
      "Оптимизировать и ускорить медленный рендер.",
      "Уменьшить задержку и улучшить отклик интерфейса.",
      "Приложение лагает, тормозит, фризит и зависает.",
    ];

    for (const signal of signals) {
      expect(
        getAgentWorklogValidationErrors(
          createAgentWorklogFixture({ trailFields: { Request: signal } }),
        ),
        `ordinary intent should reject: ${signal}`,
      ).toContain(clearPerformanceSignalError);
      expect(
        getAgentWorklogValidationErrors(
          createPerformanceIterationWorklogFixture({ request: signal }),
        ),
        `performance iteration should accept: ${signal}`,
      ).toEqual([]);
    }
  });

  it("keeps non-performance uses of similar words ordinary", () => {
    const requests = [
      "Rename the preset to Frozen and the mode to Performance.",
      "Make the animation play faster and add a Slow timing option.",
      "Increase animation speed.",
      "Smooth the gradient and optimize its color-stop distribution.",
      "Add CPU, GPU, and Memory labels to the hardware legend.",
      "Назвать пресеты Быстрый, Медленный и Фриз.",
    ];

    for (const request of requests) {
      expect(
        getAgentWorklogValidationErrors(
          createAgentWorklogFixture({ trailFields: { Request: request } }),
        ),
      ).toEqual([]);
    }
  });

  it.each([
    ["request evidence", '- Performance request evidence: "Build a poster."'],
    ["performance paths", `- Performance paths: ${JSON.stringify([fixturePerformancePathId])}`],
  ])("rejects ordinary intent carrying %s authority", (_case, field) => {
    const worklog = createAgentWorklogFixture().replace(
      "- Performance intent: ordinary-product-work",
      `- Performance intent: ordinary-product-work\n${field}`,
    );

    expect(getAgentWorklogValidationErrors(worklog)).toContain(
      'agent-worklog.md Decision Trail iteration "Delivery 1 - Product build" ordinary-product-work cannot carry performance request authority.',
    );
  });

  it("rejects duplicate Request fields before classification", () => {
    const worklog = createPerformanceIterationWorklogFixture({
      request: "The app lags while dragging.",
    }).replace(
      "- Request: The app lags while dragging.",
      "- Request: The app lags while dragging.\n- Request: A conflicting request.",
    );

    expect(getAgentWorklogValidationErrors(worklog)).toContain(
      'agent-worklog.md Decision Trail iteration "Delivery 1 - Product build" must include exactly one "Request:" before performance authority can be evaluated.',
    );
  });
});
