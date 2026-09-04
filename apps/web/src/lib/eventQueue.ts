import type { TrackedEvent } from "@funnel/shared";
import { sendEvents } from "../api/client";

const STORAGE_KEY = "funnel_event_queue";
const FLUSH_INTERVAL_MS = 1500;

function loadPending(): TrackedEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TrackedEvent[]) : [];
  } catch {
    return [];
  }
}

function savePending(events: TrackedEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // storage unavailable, drop silently
  }
}

class EventQueue {
  private pending: TrackedEvent[] = loadPending();
  private flushing = false;

  track(event: Omit<TrackedEvent, "event_id" | "client_ts">): void {
    const full: TrackedEvent = { ...event, event_id: crypto.randomUUID(), client_ts: Date.now() };
    this.pending.push(full);
    savePending(this.pending);
  }

  async flush(): Promise<void> {
    if (this.flushing || this.pending.length === 0) return;
    this.flushing = true;
    const batch = [...this.pending];
    try {
      await sendEvents(batch);
      this.pending = this.pending.filter((e) => !batch.includes(e));
      savePending(this.pending);
    } catch {
      // network error: keep events queued, safe to retry (idempotent by event_id)
    } finally {
      this.flushing = false;
    }
  }

  start(): () => void {
    const interval = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    const onHide = () => void this.flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }
}

export const eventQueue = new EventQueue();
