export * from "./performance-request-classifier";

export const TOOLCRAFT_PERFORMANCE_VERIFICATION_POLICY = {
  agentBrowser:
    "Agent-controlled browser checks are limited to diagnosis and targeted visual investigation; they do not mint durable performance baselines or receipts.",
  complaintRouting:
    "Performance authority and path localization are separate decisions. Classifier output establishes complaint authority only and never path localization. A localized complaint lets the agent select canonical affected paths and run one targeted iteration without asking the user. An ambiguous or unresolved localization requires one user-facing clarification naming visible operations and offering targeted diagnosis or a complete review; never ask the user for internal path ids. Regardless of whether the classifier returned high-confidence performance-iteration or needs-agent-judgment, unresolved localization creates neither performance-iteration intent nor canonical path authority. A broad or honestly unlocalizable problem may justify recommending the complete review immediately, but only the user's explicit request or acceptance authorizes it. A direct request for a complete review runs the full audit without another clarification.",
  deliveryBatch:
    "Run complete protected functional proof once for the first product version. Later ordinary edits are focused development work and never create another aggregate delivery boundary.",
  deliveryCommand:
    "Use pnpm verify:delivery for the first complete product proof or one exact request-authorized performance iteration. On a proven product without new performance authority it exits before inventory, tests, build, browser work, or checkpoint writes.",
  demandOnlyPerformance:
    "Only exact request authority can create a performance-iteration plan and run measured targeted performance. Changed files, verification tier, ownership classification, affected pass or path ids, and touched subsystems never authorize measured performance.",
  functionalChangeEvidence:
    "After first delivery, renderer, canvas, animation, export, timeline, layers, canvas.renderScale, bug fixes, and control changes use only focused evidence for the functionality being edited. Those changes never authorize an aggregate functional gate or measured performance.",
  fullAuditDiscovery:
    "The complete performance matrix remains outside conversational delivery. Complaints, repetition, tier, filename, and touched subsystem never launch it automatically. After two consecutive compatible protected performance iterations, the agent must offer a slower complete audit if the user remains unsatisfied; a demonstrably broad or unlocalizable cross-system problem may justify the same offer earlier. An explicit natural-language request for the complete audit, or explicit acceptance of the agent's offer, authorizes the agent acting as operator to run pnpm verify:perf; the user does not need to know the command name. After the audit, repair and rerun failed paths with focused checks, then run the complete matrix only once at the requested certification boundary.",
  performanceIterationDelivery:
    "The runtime request classifier is a tri-state guard, not a replacement for AI semantic judgment: high-confidence runtime complaints, responsiveness optimization, or excessive CPU, GPU, memory, or resource use classify as performance-iteration; high-confidence product motion, speed, freeze, terminology, or locally negated complaint commands classify as ordinary-product-work; ambiguous or unrecognized wording classifies as needs-agent-judgment and the AI decides from the actual user request. Ordinary work is rejected only for a high-confidence performance iteration. Every performance-iteration worklog intent quotes a nontrivial exact raw substring of Request; whitespace and Unicode code units must match before normalized tri-state classification. Invented, whitespace-collapsed, NFKC-equivalent, or mismatched evidence is rejected; high-confidence ordinary evidence is rejected; exact high-confidence performance-iteration evidence, or needs-agent-judgment evidence after semantic resolution, is accepted under agent ownership. Classifier output establishes complaint authority only and never path localization. Each performance iteration requires an exact reachable development fixture and fails with a configuration error instead of falling back to maximum. Only a localized complaint or a post-clarification targeted choice creates performance-iteration intent and one bounded iteration over exact canonical affected paths. Regardless of whether the classifier returned high-confidence performance-iteration or needs-agent-judgment, unresolved localization creates neither performance-iteration intent nor canonical path authority. Each repeated localized request may create one new bounded targeted iteration over its affected paths; repetition alone never expands scope or selects the complete performance matrix, creates or refreshes a durable baseline, or grants full-performance certification authority.",
  functionalInitialDelivery:
    'A functional delivery plan with basis "initial" runs complete functional proof and no measured performance. It preserves any independent full-performance baseline and cannot claim targeted or full performance evidence.',
  focusedLaterEdits:
    "A proven product has no later functional delivery plan. Ordinary edits run only feature-focused tests or browser inspection chosen from the edited behavior; commit, push, deploy, and preview do not authorize aggregate proof.",
  renderScaleFidelity:
    'canvas.renderScale is visible functional fidelity. Raster products declare typed renderScaleCoverage "selected-backing-pixels" for interaction and steady, plus playback when timeline is enabled, and prove real canvas backing pixels in every declared state. Every measured path in a render-scale-enabled raster product proves actual CSS × devicePixelRatio × 2 backing after each measured phase. Never downsample, stretch a lower-resolution backing canvas, blur output, or clamp the selected render scale to pass a performance budget.',
} as const;

export const TOOLCRAFT_PERFORMANCE_VERIFICATION_LIFECYCLE = {
  delivery: {
    command: "verify:delivery",
    modes: ["initial-functional", "performance-iteration"],
    selectors: "initial-complete-or-authority-exact",
  },
  fullPerformance: {
    command: "verify:perf",
    authority: "explicit-user-request-or-accepted-offer",
  },
} as const;

export const TOOLCRAFT_PERFORMANCE_VERIFICATION_POLICY_TEXT = [
  TOOLCRAFT_PERFORMANCE_VERIFICATION_POLICY.agentBrowser,
  TOOLCRAFT_PERFORMANCE_VERIFICATION_POLICY.complaintRouting,
  TOOLCRAFT_PERFORMANCE_VERIFICATION_POLICY.deliveryBatch,
  TOOLCRAFT_PERFORMANCE_VERIFICATION_POLICY.deliveryCommand,
  TOOLCRAFT_PERFORMANCE_VERIFICATION_POLICY.demandOnlyPerformance,
  TOOLCRAFT_PERFORMANCE_VERIFICATION_POLICY.functionalChangeEvidence,
  TOOLCRAFT_PERFORMANCE_VERIFICATION_POLICY.functionalInitialDelivery,
  TOOLCRAFT_PERFORMANCE_VERIFICATION_POLICY.focusedLaterEdits,
  TOOLCRAFT_PERFORMANCE_VERIFICATION_POLICY.renderScaleFidelity,
  TOOLCRAFT_PERFORMANCE_VERIFICATION_POLICY.performanceIterationDelivery,
  TOOLCRAFT_PERFORMANCE_VERIFICATION_POLICY.fullAuditDiscovery,
].join(" ");
