import {
  computeProgress,
  getStepDef,
  resolveResult,
  resolveResultId,
  resolveVisibleSequence,
  type Answers,
  type FunnelConfig,
  type ResolvedResult,
  type StepDef,
} from "@funnel/shared";
import type { SessionRow } from "../db/repo.js";

export interface SessionView {
  sessionId: string;
  funnelId: string;
  version: number;
  variant: string;
  currentStepId: string;
  currentStep: StepDef | undefined;
  result: ResolvedResult | undefined;
  answers: Answers;
  progress: { visited: number; total: number };
  position: { index: number; count: number };
}

export function buildSessionView(session: SessionRow, funnelId: string, config: FunnelConfig): SessionView {
  const answers = JSON.parse(session.answers_json) as Answers;
  const currentStep = getStepDef(config, session.variant, session.current_step_id);
  const result =
    currentStep?.type === "result"
      ? resolveResult(config, session.variant, resolveResultId(config, answers))
      : undefined;

  const visibleSequence = resolveVisibleSequence(config, session.variant, answers);

  return {
    sessionId: session.id,
    funnelId,
    version: session.version,
    variant: session.variant,
    currentStepId: session.current_step_id,
    currentStep,
    result,
    answers,
    progress: computeProgress(config, session.variant, answers),
    position: { index: visibleSequence.indexOf(session.current_step_id), count: visibleSequence.length },
  };
}
