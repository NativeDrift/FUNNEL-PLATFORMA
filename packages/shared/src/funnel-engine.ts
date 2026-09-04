import type {
  Answers,
  AnswerValue,
  FunnelConfig,
  NextSpec,
  Step,
  TransitionCondition,
  Variant,
} from "./types.js";

export interface ResolvedFunnel {
  entryStepId: string;
  steps: Map<string, Step>;
}

/**
 * Applies a variant's patch (removed steps, field overrides) to the base config
 * and rewrites `next` pointers that used to target a removed step so they
 * skip straight to the next surviving step in that removed step's own chain.
 */
export function resolveFunnelForVariant(
  config: FunnelConfig,
  variant: Variant
): ResolvedFunnel {
  const patch = variant === "B" ? config.variants?.B : undefined;
  const removed = new Set(patch?.removeSteps ?? []);

  const baseSteps = new Map<string, Step>();
  for (const step of config.steps) {
    const override = patch?.stepOverrides?.[step.id];
    baseSteps.set(step.id, override ? { ...step, ...override } as Step : step);
  }

  const redirectTarget = (stepId: string, guard = new Set<string>()): string => {
    if (!removed.has(stepId)) return stepId;
    if (guard.has(stepId)) return stepId; // cycle guard, leave as-is
    guard.add(stepId);
    const step = baseSteps.get(stepId);
    const fallbackNext = step ? defaultNextId(step.next) : undefined;
    if (!fallbackNext) return stepId;
    return redirectTarget(fallbackNext, guard);
  };

  const rewriteNext = (next: NextSpec | undefined): NextSpec | undefined => {
    if (!next) return next;
    if (typeof next === "string") return redirectTarget(next);
    return {
      default: redirectTarget(next.default),
      rules: next.rules.map((rule) => ({
        ...rule,
        next: redirectTarget(rule.next),
      })),
    };
  };

  const steps = new Map<string, Step>();
  for (const [id, step] of baseSteps) {
    if (removed.has(id)) continue;
    steps.set(id, { ...step, next: rewriteNext(step.next) } as Step);
  }

  const entryStepId = redirectTarget(config.entryStepId);

  return { entryStepId, steps };
}

function defaultNextId(next: NextSpec | undefined): string | undefined {
  if (!next) return undefined;
  return typeof next === "string" ? next : next.default;
}

function evaluateCondition(condition: TransitionCondition, answers: Answers): boolean {
  const value = answers[condition.field];
  switch (condition.op) {
    case "answered":
      return value !== undefined && value !== null && value !== "";
    case "not_answered":
      return value === undefined || value === null || value === "";
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
    case "contains":
      return Array.isArray(value) ? value.map(String).includes(String(condition.value)) : false;
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

function stringifyAnswer(value: AnswerValue | undefined): string {
  if (value === undefined) return "";
  return Array.isArray(value) ? value.join(",") : String(value);
}

function numericAnswer(value: AnswerValue | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return NaN;
}

/** Resolves the next step id for a step given the answers collected so far. */
export function resolveNextStepId(step: Step, answers: Answers): string | undefined {
  if (step.type === "result") return undefined;
  const next = step.next;
  if (!next) return undefined;
  if (typeof next === "string") return next;
  for (const rule of next.rules) {
    if (evaluateCondition(rule.if, answers)) return rule.next;
  }
  return next.default;
}

/**
 * Walks the likely path from entry to result following the branch each
 * answer (or, absent an answer yet, the default branch) implies. Used to
 * compute progress against only the steps actually reachable by this user,
 * not the full config.
 */
export function computeLikelyPath(
  resolved: ResolvedFunnel,
  answers: Answers,
  maxSteps = 200
): string[] {
  const path: string[] = [];
  let currentId: string | undefined = resolved.entryStepId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId) && path.length < maxSteps) {
    visited.add(currentId);
    const step = resolved.steps.get(currentId);
    if (!step) break;
    path.push(currentId);
    if (step.type === "result") break;
    currentId = resolveNextStepId(step, answers);
  }

  return path;
}

export interface AnswerValidationResult {
  valid: boolean;
  error?: string;
}

export function validateAnswer(step: Step, value: AnswerValue | undefined): AnswerValidationResult {
  const required = step.required !== false && step.type !== "info" && step.type !== "result";

  if (value === undefined || value === null || value === "") {
    if (required) return { valid: false, error: "answer is required" };
    return { valid: true };
  }

  switch (step.type) {
    case "single-select": {
      const optionIds = new Set(step.options.map((o) => o.value));
      if (typeof value !== "string" || !optionIds.has(value)) {
        return { valid: false, error: "value is not a valid option" };
      }
      return { valid: true };
    }
    case "multi-select": {
      if (!Array.isArray(value)) return { valid: false, error: "expected an array" };
      const optionIds = new Set(step.options.map((o) => o.value));
      if (!value.every((v) => optionIds.has(v))) {
        return { valid: false, error: "value contains an invalid option" };
      }
      if (step.minSelected !== undefined && value.length < step.minSelected) {
        return { valid: false, error: `select at least ${step.minSelected}` };
      }
      if (step.maxSelected !== undefined && value.length > step.maxSelected) {
        return { valid: false, error: `select at most ${step.maxSelected}` };
      }
      return { valid: true };
    }
    case "number": {
      const num = typeof value === "number" ? value : Number(value);
      if (Number.isNaN(num)) return { valid: false, error: "value must be a number" };
      if (step.min !== undefined && num < step.min) {
        return { valid: false, error: `value must be >= ${step.min}` };
      }
      if (step.max !== undefined && num > step.max) {
        return { valid: false, error: `value must be <= ${step.max}` };
      }
      return { valid: true };
    }
    default:
      return { valid: true };
  }
}
