import type {
  Answers,
  AnswerValue,
  Condition,
  FunnelConfig,
  ResultCta,
  ResultDef,
  StepContent,
  StepDef,
  StepType,
  Variant,
} from "./types.js";

function stringifyAnswer(value: AnswerValue | undefined): string {
  if (value === undefined) return "";
  return Array.isArray(value) ? value.join(",") : String(value);
}

function numericAnswer(value: AnswerValue | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return NaN;
}

export function evaluateCondition(condition: Condition, answers: Answers): boolean {
  if ("any" in condition) return condition.any.some((c) => evaluateCondition(c, answers));
  if ("all" in condition) return condition.all.every((c) => evaluateCondition(c, answers));

  const value = answers[condition.answer];
  switch (condition.operator) {
    case "eq":
      return stringifyAnswer(value) === String(condition.value);
    case "neq":
      return stringifyAnswer(value) !== String(condition.value);
    case "in":
      return Array.isArray(condition.value)
        ? condition.value.map(String).includes(stringifyAnswer(value))
        : false;
    case "not_in":
      return Array.isArray(condition.value)
        ? !condition.value.map(String).includes(stringifyAnswer(value))
        : true;
    case "gt":
      return numericAnswer(value) > Number(condition.value);
    case "gte":
      return numericAnswer(value) >= Number(condition.value);
    case "lt":
      return numericAnswer(value) < Number(condition.value);
    case "lte":
      return numericAnswer(value) <= Number(condition.value);
    default:
      return false;
  }
}

function mergeContent(base: StepContent, override?: Partial<StepContent>): StepContent {
  return override ? { ...base, ...override } : base;
}

/** The step's definition with this variant's stepOverrides.content merged in. */
export function getStepDef(config: FunnelConfig, variant: Variant, stepId: string): StepDef {
  const base = config.steps[stepId];
  if (!base) throw new Error(`unknown step "${stepId}"`);
  const override = config.experiment.variants[variant].stepOverrides?.[stepId];
  return override?.content ? ({ ...base, content: mergeContent(base.content, override.content) } as StepDef) : base;
}

export function isStepVisible(config: FunnelConfig, stepId: string, answers: Answers): boolean {
  const step = config.steps[stepId];
  if (!step.visibleWhen) return true;
  return evaluateCondition(step.visibleWhen, answers);
}

/** The variant's stepSequence filtered down to steps whose visibleWhen (if any) currently holds. */
export function resolveVisibleSequence(config: FunnelConfig, variant: Variant, answers: Answers): string[] {
  return config.experiment.variants[variant].stepSequence.filter((id) => isStepVisible(config, id, answers));
}

export function getEntryStepId(config: FunnelConfig, variant: Variant): string {
  const [first] = resolveVisibleSequence(config, variant, {});
  return first;
}

/** Next visible step after currentStepId, given the answers collected so far (including the one just submitted). */
export function getNextStepId(
  config: FunnelConfig,
  variant: Variant,
  currentStepId: string,
  answers: Answers
): string | undefined {
  const sequence = resolveVisibleSequence(config, variant, answers);
  const index = sequence.indexOf(currentStepId);
  if (index === -1 || index === sequence.length - 1) return undefined;
  return sequence[index + 1];
}

export interface AnswerValidationResult {
  valid: boolean;
  error?: string;
}

export function validateAnswer(step: StepDef, value: AnswerValue | undefined): AnswerValidationResult {
  if (step.type === "info" || step.type === "result") return { valid: true };

  const messages = step.validation?.messages ?? {};
  const required = step.validation?.required !== false;
  const empty = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

  if (empty) {
    if (required) return { valid: false, error: messages.required ?? "This field is required." };
    return { valid: true };
  }

  switch (step.type) {
    case "number": {
      const num = typeof value === "number" ? value : Number(value);
      if (Number.isNaN(num)) return { valid: false, error: "Value must be a number." };
      if (num < step.input.min) return { valid: false, error: messages.min ?? `Must be at least ${step.input.min}.` };
      if (num > step.input.max) return { valid: false, error: messages.max ?? `Must be at most ${step.input.max}.` };
      return { valid: true };
    }
    case "single-select": {
      const values = new Set(step.input.options.map((o) => o.value));
      if (typeof value !== "string" || !values.has(value)) {
        return { valid: false, error: "Not a valid option." };
      }
      return { valid: true };
    }
    case "multi-select": {
      if (!Array.isArray(value)) return { valid: false, error: "Expected multiple values." };
      const values = new Set(step.input.options.map((o) => o.value));
      if (!value.every((v) => values.has(v))) return { valid: false, error: "Contains an invalid option." };
      const min = step.validation?.minSelections;
      const max = step.validation?.maxSelections;
      if (min !== undefined && value.length < min) {
        return { valid: false, error: messages.minSelections ?? `Choose at least ${min}.` };
      }
      if (max !== undefined && value.length > max) {
        return { valid: false, error: messages.maxSelections ?? `Choose at most ${max}.` };
      }
      return { valid: true };
    }
    default:
      return { valid: true };
  }
}

/**
 * A coarse, non-identifying summary of an answer for analytics events —
 * never the raw value for open-ended numeric input, per this funnel's
 * events.privacy.storeRawAnswers = false. Select-type answers are already
 * one of a small set of author-defined options, so they're passed through
 * as-is (that's the "kind", not "raw" free-form data); numeric answers are
 * bucketed into low/mid/high thirds of the input's configured range instead
 * of the exact number.
 */
export function deriveAnswerKind(step: StepDef, value: AnswerValue | undefined): string {
  if (value === undefined || value === null || value === "") return "empty";
  switch (step.type) {
    case "single-select":
      return String(value);
    case "multi-select":
      return Array.isArray(value) ? [...value].sort().join("+") : String(value);
    case "number": {
      const num = typeof value === "number" ? value : Number(value);
      const { min, max } = step.input;
      const span = (max - min) / 3;
      if (num <= min + span) return "low";
      if (num <= min + span * 2) return "mid";
      return "high";
    }
    default:
      return "n/a";
  }
}

export function resolveResultId(config: FunnelConfig, answers: Answers): string {
  for (const rule of config.resultRules) {
    if (evaluateCondition(rule.when, answers)) return rule.resultId;
  }
  return config.defaultResultId;
}

export interface ResolvedResult extends ResultDef {
  cta: ResultCta;
}

export function resolveResult(config: FunnelConfig, variant: Variant, resultId: string): ResolvedResult {
  const base = config.results[resultId];
  const override = config.experiment.variants[variant].resultOverrides?.[resultId];
  if (!override) return base;
  return {
    ...base,
    ...(override.title !== undefined ? { title: override.title } : {}),
    ...(override.summary !== undefined ? { summary: override.summary } : {}),
    cta: override.cta ? { ...base.cta, ...override.cta } : base.cta,
  };
}

export interface ProgressInfo {
  visited: number;
  total: number;
}

/** Counts only steps visible to this user in their current variant/answers, excluding config.progress.excludeTypes (info/result by default). */
export function computeProgress(config: FunnelConfig, variant: Variant, answers: Answers): ProgressInfo {
  const exclude = new Set<StepType>(config.progress?.excludeTypes ?? ["info", "result"]);
  const sequence = resolveVisibleSequence(config, variant, answers);
  const countable = sequence.filter((id) => !exclude.has(config.steps[id].type));
  const visited = countable.filter((id) => answers[id] !== undefined).length;
  return { visited, total: countable.length };
}
