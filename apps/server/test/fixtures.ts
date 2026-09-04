import type { FunnelConfig } from "@funnel/shared";

export const testFunnelConfig: FunnelConfig = {
  funnelId: "test-funnel",
  title: "Test Funnel",
  experiment: {
    id: "test-experiment",
    assignment: "server",
    variants: {
      A: {
        weight: 50,
        stepSequence: ["s1", "s2a", "s2b", "s3", "s4", "s5"],
      },
      B: {
        weight: 50,
        stepSequence: ["s1", "s3", "s4", "s5"],
        resultOverrides: {
          r_done: { title: "Done (B)" },
        },
      },
    },
  },
  steps: {
    s1: {
      id: "s1",
      type: "single-select",
      content: { title: "Pick a track" },
      input: {
        name: "s1",
        options: [
          { value: "fast", label: "Fast" },
          { value: "slow", label: "Slow" },
        ],
      },
    },
    s2a: {
      id: "s2a",
      type: "info",
      content: { title: "Slow track info", body: "..." },
      visibleWhen: { answer: "s1", operator: "eq", value: "slow" },
    },
    s2b: {
      id: "s2b",
      type: "info",
      content: { title: "Fast track info", body: "..." },
      visibleWhen: { answer: "s1", operator: "eq", value: "fast" },
    },
    s3: {
      id: "s3",
      type: "number",
      content: { title: "How many?" },
      input: { name: "s3", min: 0, max: 10 },
    },
    s4: {
      id: "s4",
      type: "multi-select",
      content: { title: "Pick options" },
      input: {
        name: "s4",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      },
      validation: { minSelections: 1 },
    },
    s5: {
      id: "s5",
      type: "result",
      content: { title: "Done" },
      resultSource: "resultRules",
    },
  },
  resultRules: [{ resultId: "r_done", when: { answer: "s1", operator: "eq", value: "fast" } }],
  defaultResultId: "r_done",
  results: {
    r_done: {
      id: "r_done",
      title: "Done",
      summary: "Result",
      cta: { label: "Go", action: "go" },
    },
  },
};
