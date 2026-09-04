import type { FunnelConfig } from "@funnel/shared";

export const testFunnelConfig: FunnelConfig = {
  key: "test-funnel",
  name: "Test Funnel",
  entryStepId: "s1",
  steps: [
    {
      id: "s1",
      type: "single-select",
      title: "Pick a track",
      options: [
        { id: "fast", label: "Fast", value: "fast" },
        { id: "slow", label: "Slow", value: "slow" },
      ],
      next: {
        rules: [{ if: { field: "s1", op: "eq", value: "fast" }, next: "s2b" }],
        default: "s2a",
      },
    },
    { id: "s2a", type: "info", title: "Slow track info", body: "...", next: "s3" },
    { id: "s2b", type: "info", title: "Fast track info", body: "...", next: "s3" },
    {
      id: "s3",
      type: "number",
      title: "How many?",
      min: 0,
      max: 10,
      next: "s4",
    },
    {
      id: "s4",
      type: "multi-select",
      title: "Pick options",
      options: [
        { id: "a", label: "A", value: "a" },
        { id: "b", label: "B", value: "b" },
      ],
      minSelected: 1,
      next: "s5",
    },
    {
      id: "s5",
      type: "result",
      title: "Done",
      body: "Result",
      ctaLabel: "Go",
    },
  ],
  variants: {
    B: {
      removeSteps: ["s2a", "s2b"],
      stepOverrides: {
        s5: { title: "Done (B)" },
      },
    },
  },
};
