import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { deriveAnswerKind } from "@funnel/shared";
import { resumeSession, startSession, submitAnswer, goBack, type SessionView } from "../api/client";
import { eventQueue } from "../lib/eventQueue";
import { clearStoredSessionId, getStoredSessionId, readQueryContext, setStoredSessionId } from "../lib/localSession";
import { StepRenderer } from "../components/StepRenderer";
import { ResultView } from "../components/ResultView";
import { ProgressBar } from "../components/ProgressBar";

const DEFAULT_FUNNEL_ID = "workstyle-planner";

export function FunnelPage() {
  const { funnelId = DEFAULT_FUNNEL_ID } = useParams();
  const [session, setSession] = useState<SessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lastViewedStepRef = useRef<string | null>(null);

  useEffect(() => {
    const stopQueue = eventQueue.start();
    let cancelled = false;

    async function init() {
      const { variant, utm } = readQueryContext();
      const existingId = getStoredSessionId(funnelId);

      try {
        let view: SessionView;
        if (existingId) {
          try {
            view = await resumeSession(existingId);
          } catch {
            clearStoredSessionId(funnelId);
            view = await startSession({ funnelId, variant, utm });
            eventQueue.track({ session_id: view.sessionId, type: "session_started", step_id: view.currentStepId });
          }
        } else {
          view = await startSession({ funnelId, variant, utm });
          eventQueue.track({ session_id: view.sessionId, type: "session_started", step_id: view.currentStepId });
        }
        if (cancelled) return;
        setStoredSessionId(funnelId, view.sessionId);
        setSession(view);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }

    void init();
    return () => {
      cancelled = true;
      stopQueue();
    };
  }, [funnelId]);

  useEffect(() => {
    if (!session?.currentStepId) return;
    if (lastViewedStepRef.current === session.currentStepId) return;
    lastViewedStepRef.current = session.currentStepId;

    if (session.currentStep?.type === "result" && session.result) {
      eventQueue.track({
        session_id: session.sessionId,
        type: "result_viewed",
        step_id: session.currentStepId,
        properties: { result_id: session.result.id },
      });
      return;
    }

    eventQueue.track({
      session_id: session.sessionId,
      type: "step_viewed",
      step_id: session.currentStepId,
      properties: {
        step_type: session.currentStep?.type,
        visible_step_index: session.position.index,
        visible_step_count: session.position.count,
      },
    });
  }, [session?.currentStepId, session?.sessionId, session?.currentStep?.type, session?.result]);

  async function handleSubmit(value: string | string[] | number) {
    if (!session || !session.currentStep) return;
    setSubmitting(true);
    setError(null);
    const prevStepId = session.currentStepId;
    const answerKind = deriveAnswerKind(session.currentStep, value);
    eventQueue.track({
      session_id: session.sessionId,
      type: "answer_submitted",
      step_id: prevStepId,
      properties: { answer_kind: answerKind },
    });

    try {
      const updated = await submitAnswer(session.sessionId, prevStepId, value);
      eventQueue.track({
        session_id: session.sessionId,
        type: "step_completed",
        step_id: prevStepId,
        properties: { next_step_id: updated.currentStepId },
      });
      setSession(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBack() {
    if (!session) return;
    try {
      const updated = await goBack(session.sessionId);
      eventQueue.track({
        session_id: session.sessionId,
        type: "back_clicked",
        step_id: session.currentStepId,
        properties: { destination_step_id: updated.currentStepId },
      });
      setSession(updated);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function handleCta() {
    if (!session?.result) return;
    eventQueue.track({
      session_id: session.sessionId,
      type: "cta_clicked",
      step_id: session.currentStepId,
      properties: { result_id: session.result.id, action: session.result.cta.action },
    });
    void eventQueue.flush();
  }

  if (error && !session) return <div className="page-center error">Failed to load funnel: {error}</div>;
  if (!session || !session.currentStep) return <div className="page-center">Loading…</div>;

  return (
    <div className="funnel-page">
      <ProgressBar visited={session.progress.visited} total={session.progress.total} />
      <div className="funnel-header">
        <button className="link" onClick={handleBack} disabled={session.position.index <= 0}>
          ← Back
        </button>
        <span className="variant-tag">variant {session.variant} · v{session.version}</span>
      </div>
      {session.currentStep.type === "result" && session.result ? (
        <ResultView key={session.result.id} result={session.result} onCta={handleCta} submitting={submitting} />
      ) : (
        <StepRenderer step={session.currentStep} onSubmit={handleSubmit} submitting={submitting} error={error} />
      )}
    </div>
  );
}
