export type Variant = "A" | "B";

export type StepType =
  | "single-select"
  | "multi-select"
  | "number"
  | "info"
  | "result";

export interface StepOption {
  id: string;
  label: string;
  value: string;
}

export type ConditionOp =
  | "eq"
  | "neq"
  | "in"
  | "not_in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "answered"
  | "not_answered";

export interface TransitionCondition {
  field: string;
  op: ConditionOp;
  value?: string | number | string[];
}

export interface TransitionRule {
  if: TransitionCondition;
  next: string;
}

export type NextSpec =
  | string
  | {
      rules: TransitionRule[];
      default: string;
    };

export interface BaseStep {
  id: string;
  type: StepType;
  title: string;
  subtitle?: string;
  required?: boolean;
  next?: NextSpec;
  /** custom event name fired once when this step becomes visible */
  onViewEvent?: string;
  /** custom event name fired when an answer for this step is submitted */
  onSubmitEvent?: string;
}

export interface SingleSelectStep extends BaseStep {
  type: "single-select";
  options: StepOption[];
}

export interface MultiSelectStep extends BaseStep {
  type: "multi-select";
  options: StepOption[];
  minSelected?: number;
  maxSelected?: number;
}

export interface NumberStep extends BaseStep {
  type: "number";
  min?: number;
  max?: number;
  placeholder?: string;
}

export interface InfoStep extends BaseStep {
  type: "info";
  body: string;
  ctaLabel?: string;
}

export interface ResultStep extends BaseStep {
  type: "result";
  body: string;
  ctaLabel: string;
  ctaUrl?: string;
}

export type Step =
  | SingleSelectStep
  | MultiSelectStep
  | NumberStep
  | InfoStep
  | ResultStep;

export interface VariantPatch {
  removeSteps?: string[];
  stepOverrides?: Record<string, Partial<Step>>;
}

export interface FunnelConfig {
  key: string;
  name: string;
  entryStepId: string;
  steps: Step[];
  variants?: {
    B?: VariantPatch;
  };
}

export type AnswerValue = string | string[] | number;

export type Answers = Record<string, AnswerValue>;

export const EVENT_TYPES = [
  "session_started",
  "step_viewed",
  "answer_submitted",
  "step_completed",
  "back_clicked",
  "result_viewed",
  "cta_clicked",
] as const;

export type KnownEventType = (typeof EVENT_TYPES)[number];

export interface TrackedEvent {
  event_id: string;
  session_id: string;
  type: string;
  client_ts: number;
  step_id?: string;
  properties?: Record<string, unknown>;
}
