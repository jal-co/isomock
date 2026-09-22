const fixtureSource = import.meta.url.includes(
  "/e2e/fixtures/vgpu-physical-feedback/",
);

if (fixtureSource && process.env.VITEST) {
  const { it } = await import("vitest");
  it.skip("VGPU generation reader fixture source is inert before installation", () => {});
}

if (!fixtureSource) {
  const [{ describe, expect, it }, generations] = await Promise.all([
    import("vitest"),
    import("../../e2e/vgpu-runtime-attributes"),
  ]);

  describe("VGPU generation attribute reader", () => {
    it.each([
      ["0", 0],
      ["7", 7],
      ["9007199254740991", Number.MAX_SAFE_INTEGER],
    ])("accepts canonical generation %s", (raw, expected) => {
      expect(generations.parsePhysicalFeedbackGenerationAttribute(raw, "data-generation"))
        .toBe(expected);
    });

    it.each([
      null,
      "",
      " ",
      "-1",
      "+1",
      "1.5",
      "01",
      "1 ",
      "NaN",
      "generation",
      "9007199254740992",
    ])("rejects missing or noncanonical generation %s", (raw) => {
      expect(() =>
        generations.parsePhysicalFeedbackGenerationAttribute(
          raw,
          "data-generation",
        ),
      ).toThrow(/data-generation.*canonical non-negative safe integer/iu);
    });
  });
}
