/**
 * Session integrity monitoring.
 *
 * DESIGN STANCE — read before adding a "cheating score".
 *
 * This records OBSERVATIONS, never accusations. Every event here is a plain
 * verifiable fact about the session ("screen share stopped at 12:04",
 * "app lost focus for 40s"), timestamped, with no inference about intent.
 *
 * It deliberately does NOT do gaze tracking, face-count detection, or
 * "suspicious behaviour" scoring. Those are the standard proctoring features
 * and they are the ones with documented false-positive problems — they
 * misread people who think while looking away, people with disabilities, and
 * (in the case of face detection) darker-skinned candidates at markedly
 * higher rates. This product's first rule is never to tell a candidate
 * something false about themselves; a confident-but-wrong cheating verdict is
 * the single worst thing it could output.
 *
 * So: integrity events are surfaced as a factual timeline the human reader
 * interprets. They are NEVER fed into the report's scored dimensions, and
 * the interviewer is never told to treat them as evidence of dishonesty.
 */

export type IntegrityKind =
  | "focus-lost"
  | "focus-regained"
  | "screen-share-started"
  | "screen-share-stopped"
  | "camera-started"
  | "camera-stopped";

export interface IntegrityEvent {
  kind: IntegrityKind;
  at: string;
  /** Milliseconds since the session began — easier to read than a wall clock. */
  offsetMs: number;
  /** For focus-regained: how long focus was away. */
  durationMs?: number;
}

/** Focus blips shorter than this are normal (alt-tab reflex, notification). */
const FOCUS_NOISE_MS = 3000;

export class IntegrityMonitor {
  private events: IntegrityEvent[] = [];
  private startedAt = performance.now();
  private blurredAt: number | null = null;
  private detach: (() => void) | null = null;

  /**
   * Begin watching window focus. Camera/screen events are reported by the
   * caller. `target` is injectable so this is testable without a DOM, and so
   * constructing a monitor outside a browser context is a no-op rather than a
   * crash.
   */
  start(target?: EventTarget): void {
    const host = target ?? (typeof window !== "undefined" ? window : null);
    this.startedAt = performance.now();
    if (!host) return;

    const onBlur = (): void => {
      if (this.blurredAt !== null) return;
      this.blurredAt = performance.now();
    };
    const onFocus = (): void => {
      if (this.blurredAt === null) return;
      const away = performance.now() - this.blurredAt;
      this.blurredAt = null;
      // Only record a gap worth a human's attention. Recording every flicker
      // would bury the signal and read as surveillance theatre.
      if (away < FOCUS_NOISE_MS) return;
      this.record("focus-lost", { offsetOverride: performance.now() - away });
      this.record("focus-regained", { durationMs: Math.round(away) });
    };

    host.addEventListener("blur", onBlur);
    host.addEventListener("focus", onFocus);
    this.detach = () => {
      host.removeEventListener("blur", onBlur);
      host.removeEventListener("focus", onFocus);
    };
  }

  record(kind: IntegrityKind, opts: { durationMs?: number; offsetOverride?: number } = {}): void {
    const now = opts.offsetOverride ?? performance.now();
    this.events.push({
      kind,
      at: new Date().toISOString(),
      offsetMs: Math.max(0, Math.round(now - this.startedAt)),
      ...(opts.durationMs !== undefined ? { durationMs: opts.durationMs } : {}),
    });
  }

  all(): IntegrityEvent[] {
    return [...this.events];
  }

  /** Total time the app was in the background, for the session summary. */
  totalAwayMs(): number {
    return this.events
      .filter((e) => e.kind === "focus-regained")
      .reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
  }

  stop(): void {
    this.detach?.();
    this.detach = null;
  }
}

/** mm:ss for a session-relative offset. */
export function formatOffset(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * A neutral, human-readable timeline for the report.
 *
 * Phrased as facts with no verdict attached — the reader decides whether a
 * 90-second absence was a doorbell or something else. Returns null when
 * nothing notable happened, so a clean session adds no ominous empty section.
 */
export function describeIntegrity(events: IntegrityEvent[]): string[] | null {
  if (events.length === 0) return null;
  const lines: string[] = [];
  for (const e of events) {
    const t = formatOffset(e.offsetMs);
    switch (e.kind) {
      case "focus-regained":
        lines.push(`${t} — app was in the background for ${Math.round((e.durationMs ?? 0) / 1000)}s`);
        break;
      case "screen-share-started":
        lines.push(`${t} — screen sharing started`);
        break;
      case "screen-share-stopped":
        lines.push(`${t} — screen sharing stopped`);
        break;
      case "camera-started":
        lines.push(`${t} — camera on`);
        break;
      case "camera-stopped":
        lines.push(`${t} — camera off`);
        break;
      // focus-lost is implied by its paired focus-regained line.
      case "focus-lost":
        break;
    }
  }
  return lines.length ? lines : null;
}
