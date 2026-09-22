function parseFenceOpening(line) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
  if (!match || (match[1][0] === "`" && match[2].includes("`"))) {
    return undefined;
  }
  return { character: match[1][0], length: match[1].length };
}

function isFenceClosing(line, fence) {
  const escaped = fence.character === "`" ? "`" : "~";
  return new RegExp(
    `^ {0,3}${escaped}{${fence.length},}[ \\t]*$`,
    "u",
  ).test(line);
}

function parseHeading(line) {
  const match = /^ {0,3}(#{1,6})(?:[ \t]+(.*?)|[ \t]*)$/u.exec(line);
  if (!match) return undefined;
  const text = (match[2] ?? "")
    .replace(/[ \t]+#+[ \t]*$/u, "")
    .trim();
  return { level: match[1].length, text };
}

function scanMarkdown(source) {
  const lines = source.split(/\r?\n/u);
  const authoritative = Array.from({ length: lines.length }, () => true);
  const headings = [];
  let fence;
  let unclosedFenceLine;

  for (const [index, line] of lines.entries()) {
    if (fence) {
      authoritative[index] = false;
      if (isFenceClosing(line, fence)) {
        fence = undefined;
        unclosedFenceLine = undefined;
      }
      continue;
    }
    const opening = parseFenceOpening(line);
    if (opening) {
      authoritative[index] = false;
      fence = opening;
      unclosedFenceLine = index;
      continue;
    }
    const heading = parseHeading(line);
    if (heading) headings.push({ ...heading, line: index });
  }
  return { authoritative, headings, lines, unclosedFenceLine };
}

function getSectionEnd(headings, section) {
  return (
    headings.find(
      (heading) =>
        heading.line > section.line && heading.level <= section.level,
    )?.line ?? Number.POSITIVE_INFINITY
  );
}

function getSanitizedLines(scan, start, end) {
  return scan.lines
    .slice(start, end)
    .map((line, offset) =>
      scan.authoritative[start + offset] ? line : "",
    );
}

/** Text recovery includes misplaced entries; authority parsing below rejects them. */
export function getToolcraftWorklogEntries(source) {
  const scan = scanMarkdown(source);
  return scan.headings.filter(({ level }) => level === 3).flatMap((heading) => {
    const end = Math.min(getSectionEnd(scan.headings, heading), scan.lines.length);
    const body = getSanitizedLines(scan, heading.line + 1, end).join("\n").trim();
    if (!/^(?:Iteration|Delivery|Diagnostic)\b/iu.test(heading.text) && !/^-[ \t]*Request:/imu.test(body)) return [];
    return [{ body, heading: heading.text, startLine: heading.line + 1, endLine: end }];
  });
}

export function getToolcraftMarkdownSectionBodies(source, sectionName) {
  const scan = scanMarkdown(source);
  return scan.headings
    .filter(
      (heading) =>
        heading.text.toLocaleLowerCase() ===
        sectionName.toLocaleLowerCase(),
    )
    .map((section) => {
      const end = Math.min(
        getSectionEnd(scan.headings, section),
        scan.lines.length,
      );
      return getSanitizedLines(scan, section.line + 1, end)
        .join("\n")
        .trim();
    });
}

export function parseToolcraftDecisionTrail(source) {
  const scan = scanMarkdown(source);
  const errors = [];
  const sections = scan.headings.filter(
    (heading) =>
      heading.level === 2 &&
      heading.text.toLocaleLowerCase() === "decision trail",
  );
  if (sections.length !== 1) {
    errors.push(
      "agent-worklog.md must include exactly one Decision Trail section.",
    );
    return Object.freeze({ errors: Object.freeze(errors), iterations: Object.freeze([]) });
  }

  const section = sections[0];
  const sectionEnd = Math.min(
    getSectionEnd(scan.headings, section),
    scan.lines.length,
  );
  for (const entry of getToolcraftWorklogEntries(source)) {
    if (entry.startLine <= section.line + 1 || entry.startLine > sectionEnd) {
      errors.push(`Worklog entry "${entry.heading}" at line ${entry.startLine} is outside Decision Trail; import the history or move the entry into that section.`);
    }
  }
  if (
    scan.unclosedFenceLine !== undefined &&
    scan.unclosedFenceLine > section.line &&
    scan.unclosedFenceLine < sectionEnd
  ) {
    errors.push(
      "agent-worklog.md Decision Trail contains an unclosed fenced code block.",
    );
  }
  const headings = scan.headings.filter(
    (heading) =>
      heading.level === 3 &&
      heading.line > section.line &&
      heading.line < sectionEnd,
  );
  const firstHeadingLine = headings[0]?.line ?? sectionEnd;
  if (
    getSanitizedLines(scan, section.line + 1, firstHeadingLine).some(
      (line) => line.trim().length > 0,
    )
  ) {
    errors.push(
      "agent-worklog.md Decision Trail cannot contain content before its first iteration heading.",
    );
  }
  if (headings.length === 0) {
    errors.push(
      "agent-worklog.md Decision Trail must include at least one iteration heading.",
    );
  }

  const seenHeadings = new Set();
  const iterations = headings.flatMap((heading, index) => {
    if (!heading.text) {
      errors.push(
        "agent-worklog.md Decision Trail iteration headings must contain text.",
      );
      return [];
    }
    const canonicalHeading = heading.text.toLocaleLowerCase();
    if (seenHeadings.has(canonicalHeading)) {
      errors.push(
        `agent-worklog.md has duplicate Decision Trail iteration heading "${heading.text}".`,
      );
    }
    seenHeadings.add(canonicalHeading);
    const end = headings[index + 1]?.line ?? sectionEnd;
    return [{
      body: getSanitizedLines(scan, heading.line + 1, end)
        .join("\n")
        .trim(),
      heading: heading.text,
    }];
  });

  return Object.freeze({
    errors: Object.freeze(errors),
    iterations: Object.freeze(iterations),
  });
}

export function selectToolcraftDecisionTrailIteration(source) {
  const trail = parseToolcraftDecisionTrail(source);
  if (trail.errors.length) throw new Error(trail.errors[0]);
  const activeIds = getSanitizedLines(scanMarkdown(source), 0, Number.POSITIVE_INFINITY)
    .flatMap((line) => {
      const match = /^(?:-[ \t]*)?Active change:[ \t]*(.*)$/iu.exec(line);
      if (!match) return [];
      const id = match[1].trim();
      if (!/^[a-z0-9._-]+$/iu.test(id)) throw new Error("Active change must contain one stable ID.");
      return [id];
    });
  const identified = new Map();
  for (const iteration of trail.iterations) {
    const ids = [...iteration.body.matchAll(/^-[ \t]*Change ID:[ \t]*(.*)$/gimu)].map((match) => match[1].trim());
    if (ids.some((id) => !/^[a-z0-9._-]+$/iu.test(id))) throw new Error("Change ID must contain one stable ID.");
    if (ids.length > 1 || (ids[0] && identified.has(ids[0]))) throw new Error("Decision Trail has duplicate Change ID values.");
    if (ids[0]) identified.set(ids[0], iteration);
  }
  if (activeIds.length) {
    if (activeIds.length !== 1 || !identified.has(activeIds[0])) throw new Error("Active change must identify exactly one Decision Trail Change ID.");
    return identified.get(activeIds[0]);
  }
  if (trail.iterations.length === 1) return trail.iterations[0];
  const numbers = trail.iterations.map(({ heading }) => /^(?:Iteration|Delivery)[ \t]+(\d+)\b/iu.exec(heading)?.[1]).map(Number);
  const steps = numbers.slice(1).map((value, index) => Math.sign(value - numbers[index]));
  if (identified.size || numbers.some((value) => !Number.isSafeInteger(value)) ||
    !steps.length || (!steps.every((step) => step === 1) && !steps.every((step) => step === -1))) {
    throw new Error("Decision Trail order is ambiguous; declare unique Change ID values and an explicit Active change.");
  }
  return steps[0] === 1 ? trail.iterations.at(-1) : trail.iterations[0];
}
