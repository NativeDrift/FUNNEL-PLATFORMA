import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { resumeSession, startSession, submitAnswer, goBack, type SessionView } from "../api/client";
import { eventQueue } from "../lib/eventQueue";
import { clearStoredSessionId, getStoredSessionId, readQueryContext, setStoredSessionId } from "../lib/localSession";
import { StepRenderer } from "../components/StepRenderer";
import { ProgressBar } from "../components/ProgressBar";

const DEFAULT_FUNNEL_KEY = "fitness-onboarding";

export function FunnelPage() {
  const { funnelKey = DEFAULT_FUNNEL_KEY } = useParams();
  const [session, setSession] = useState<SessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lastViewedStepRef = useRef<string | null>(null);

  useEffect(() => {
    const stopQueue = eventQueue.start();
    let cancelled = false;

    async function init() {
      const { variant, utm } = readQueryContext();
      const existingId = getStoredSessionId(funnelKey);

      try {
        let view: SessionView;
        if (existingId) {
          try {
            view = await resumeSession(existingId);
          } catch {
            clearStoredSessionId(funnelKey);
            view = await startSession({ funnelKey, variant, utm });
            eventQueue.track({ session_id: view.sessionId, type: "session_started", step_id: view.currentStepId });
          }
        } else {
          view = await startSession({ funnelKey, variant, utm });
          eventQueue.track({ session_id: view.sessionId, type: "session_started", step_id: view.currentStepId });
        }
        if (cancelled) return;
        setStoredSessionId(funnelKey, view.sessionId);
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
  }, [funnelKey]);

  useEffect(() => {
    if (!session?.currentStepId) return;
    if (lastViewedStepRef.current === session.currentStepId) return;
    lastViewedStepRef.current = session.currentStepId;

    eventQueue.track({
      session_id: session.sessionId,
      type: session.currentStep?.type === "result" ? "result_viewed" : "step_viewed",
      step_id: session.currentStepId,
    });
  }, [session?.currentStepId, session?.sessionId, session?.currentStep?.type]);

  async function handleSubmit(value: string | string[] | number) {
    if (!session) return;
    setSubmitting(true);
    setError(null);
    const prevStepId = session.currentStepId;
    eventQueue.track({
      session_id: session.sessionId,
      type: "answer_submitted",
      step_id: prevStepId,
      properties: { value },
    });

    try {
      const updated = await submitAnswer(session.sessionId, prevStepId, value);
      eventQueue.track({ session_id: session.sessionId, type: "step_completed", step_id: prevStepId });
      setSession(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBack() {
    if (!session) return;
    eventQueue.track({ session_id: session.sessionId, type: "back_clicked", step_id: session.currentStepId });
    try {
      const updated = await goBack(session.sessionId);
      setSession(updated);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function handleCta() {
    if (!session) return;
    eventQueue.track({ session_id: session.sessionId, type: "cta_clicked", step_id: session.currentStepId });
    void eventQueue.flush();
  }

  if (error && !session) return <div className="page-center error">Failed to load funnel: {error}</div>;
  if (!session || !session.currentStep) return <div className="page-center">Loading…</div>;

  return (
    <div className="funnel-page">
      <ProgressBar visited={session.progress.visited} likelyTotal={session.progress.likelyTotal} />
      <div className="funnel-header">
        <button className="link" onClick={handleBack} disabled={session.progress.visited <= 1}>
          ← Back
        </button>
        <span className="variant-tag">variant {session.variant} · v{session.version}</span>
      </div>
      <StepRenderer
        step={session.currentStep}
        onSubmit={handleSubmit}
        onCta={handleCta}
        submitting={submitting}
        error={error}
      />
    </div>
  );
}
