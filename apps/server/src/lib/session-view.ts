import {
  computeLikelyPath,
  resolveFunnelForVariant,
  type Answers,
  type FunnelConfig,
  type Step,
} from "@funnel/shared";
import type { SessionRow } from "../db/repo.js";

export interface SessionView {
  sessionId: string;
  funnelKey: string;
  version: number;
  variant: string;
  entryStepId: string;
  steps: Step[];
  currentStepId: string;
  currentStep: Step | undefined;
  answers: Answers;
  progress: { visited: number; likelyTotal: number };
}

export function buildSessionView(
  session: SessionRow,
  funnelKey: string,
  config: FunnelConfig
): SessionView {
  const resolved = resolveFunnelForVariant(config, session.variant);
  const answers = JSON.parse(session.answers_json) as Answers;
  const visitedSteps = JSON.parse(session.visited_steps_json) as string[];
  const likelyPath = computeLikelyPath(resolved, answers);

  return {
    sessionId: session.id,
    funnelKey,
    version: session.version,
    variant: session.variant,
    entryStepId: resolved.entryStepId,
    steps: [...resolved.steps.values()],
    currentStepId: session.current_step_id,
    currentStep: resolved.steps.get(session.current_step_id),
    answers,
    progress: { visited: visitedSteps.length, likelyTotal: likelyPath.length },
  };
}
