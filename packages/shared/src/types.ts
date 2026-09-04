export type Variant = "A" | "B";

export type StepType = "info" | "number" | "single-select" | "multi-select" | "result";

export interface StepOption {
  value: string;
  label: string;
}

export interface StepContent {
  eyebrow?: string;
  title: string;
  body?: string;
  helperText?: string;
  primaryActionLabel?: string;
  loadingTitle?: string;
  errorTitle?: string;
  retryLabel?: string;
}

export interface NumberInput {
  name: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

export interface SelectInput {
  name: string;
  options: StepOption[];
}

export interface ValidationRule {
  required?: boolean;
  minSelections?: number;
  maxSelections?: number;
  messages?: Record<string, string>;
}

export type ConditionOp = "eq" | "neq" | "in" | "not_in" | "gt" | "gte" | "lt" | "lte";

export interface ConditionLeaf {
  answer: string;
  operator: ConditionOp;
  value?: string | number | string[];
}

export interface ConditionAny {
  any: Condition[];
}

export interface ConditionAll {
  all: Condition[];
}

export type Condition = ConditionLeaf | ConditionAny | ConditionAll;

interface BaseStepDef {
  id: string;
  content: StepContent;
  visibleWhen?: Condition;
}

export interface InfoStepDef extends BaseStepDef {
  type: "info";
}

export interface NumberStepDef extends BaseStepDef {
  type: "number";
  input: NumberInput;
  validation?: ValidationRule;
}

export interface SingleSelectStepDef extends BaseStepDef {
  type: "single-select";
  input: SelectInput;
  validation?: ValidationRule;
}

export interface MultiSelectStepDef extends BaseStepDef {
  type: "multi-select";
  input: SelectInput;
  validation?: ValidationRule;
}

export interface ResultStepDef extends BaseStepDef {
  type: "result";
  resultSource: "resultRules";
}

export type StepDef = InfoStepDef | NumberStepDef | SingleSelectStepDef | MultiSelectStepDef | ResultStepDef;

export interface ResultRule {
  resultId: string;
  when: Condition;
}

export interface ResultCta {
  label: string;
  action: string;
}

export interface ResultDef {
  id: string;
  title: string;
  summary: string;
  recommendations?: string[];
  cta: ResultCta;
}

export interface ResultOverride {
  title?: string;
  summary?: string;
  cta?: Partial<ResultCta>;
}

export interface StepOverride {
  content?: Partial<StepContent>;
}

export interface VariantDef {
  weight: number;
  stepSequence: string[];
  stepOverrides?: Record<string, StepOverride>;
  resultOverrides?: Record<string, ResultOverride>;
}

export interface EventDef {
  name: string;
  trigger?: string;
  properties?: string[];
}

export interface EventsConfig {
  baseProperties?: string[];
  allowed: EventDef[];
  privacy?: {
    storeRawAnswers?: boolean;
    allowAnswerKinds?: boolean;
  };
}

export interface FunnelConfig {
  schemaVersion?: string;
  funnelId: string;
  version?: number;
  status?: string;
  locale?: string;
  title: string;
  description?: string;
  session?: {
    ttlHours?: number;
    persistAnswers?: boolean;
    pinVersion?: boolean;
    pinExperimentVariant?: boolean;
  };
  progress?: {
    countVisibleOnly?: boolean;
    excludeTypes?: StepType[];
  };
  experiment: {
    id: string;
    assignment: string;
    sticky?: boolean;
    overrideQueryParam?: string;
    variants: Record<Variant, VariantDef>;
  };
  steps: Record<string, StepDef>;
  resultRules: ResultRule[];
  defaultResultId: string;
  results: Record<string, ResultDef>;
  events?: EventsConfig;
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
