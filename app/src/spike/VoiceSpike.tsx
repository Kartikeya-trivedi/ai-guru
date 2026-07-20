import { useCallback, useEffect, useRef, useState } from "react";
import {
  openGeminiLive,
  GEMINI_INPUT_SAMPLE_RATE,
} from "../providers/gemini/live";
import { startMicCapture, type MicCapture } from "../voice/capture";
import { createAudioSink, type AudioSink } from "../voice/playback";
import { LatencyTracker } from "../voice/metrics";
import { interviewerPersona } from "../engine/persona";
import type { RealtimeVoiceChannel } from "../providers/types";
import "../voice/selftest"; // dev: exposes window.runAudioSelfTests

/**
 * Phase 1 voice spike: mic → Gemini Live → speaker, with barge-in and
 * measured latency. This is the go/no-go gate for the whole product —
 * if conversation doesn't feel human here, nothing downstream matters.
 */

const LIVE_MODEL = "gemini-3.1-flash-live-preview";

type Status = "idle" | "connecting" | "live" | "error";

interface TranscriptLine {
  role: "user" | "assistant";
  text: string;
}

export function VoiceSpike() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [metrics, setMetrics] = useState({ count: 0, p50: null as number | null, p95: null as number | null });
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [level, setLevel] = useState(0);

  const channelRef = useRef<RealtimeVoiceChannel | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const sinkRef = useRef<AudioSink | null>(null);
  const trackerRef = useRef(new LatencyTracker());

  const stop = useCallback(() => {
    micRef.current?.stop();
    micRef.current = null;
    sinkRef.current?.close();
    sinkRef.current = null;
    channelRef.current?.close();
    channelRef.current = null;
    setStatus("idle");
    setLevel(0);
  }, []);

  useEffect(() => stop, [stop]);

  // Mic level meter — proves capture is alive before you hear anything back.
  useEffect(() => {
    if (status !== "live") return;
    const id = setInterval(() => setLevel(micRef.current?.level() ?? 0), 100);
    return () => clearInterval(id);
  }, [status]);

  const start = useCallback(async () => {
    const apiKey = import.meta.env.GEMINI_API_KEY as string | undefined;
    if (!apiKey) {
      setError("GEMINI_API_KEY missing from app/.env");
      setStatus("error");
      return;
    }

    setStatus("connecting");
    setError(null);
    setTranscript([]);
    trackerRef.current = new LatencyTracker();

    try {
      const sink = createAudioSink();
      sinkRef.current = sink;

      const channel = await openGeminiLive({
        apiKey,
        model: LIVE_MODEL,
        voiceName: "Charon",
        systemInstruction:
          interviewerPersona({ role: "AI Engineer", seniority: "mid" }) +
          "\n\nThis is a latency spike test. Greet the candidate briefly and ask one opening question, then respond conversationally.",
      });
      channelRef.current = channel;

      const mic = await startMicCapture(GEMINI_INPUT_SAMPLE_RATE, (frame) => {
        channelRef.current?.sendAudio(frame);
      });
      micRef.current = mic;
      setStatus("live");

      void (async () => {
        for await (const ev of channel.events()) {
          switch (ev.type) {
            case "audio": {
              const sample = trackerRef.current.markModelAudio();
              if (sample) {
                setLastLatency(sample.firstAudioMs);
                setMetrics(trackerRef.current.summary());
              }
              sinkRef.current?.enqueue(ev.frame, ev.sampleRate);
              break;
            }
            case "transcript": {
              if (ev.role === "user") trackerRef.current.markUserSpeech();
              setTranscript((prev) => {
                const last = prev[prev.length - 1];
                // Fragments stream in; append to the current speaker's line.
                if (last?.role === ev.role) {
                  return [...prev.slice(0, -1), { role: ev.role, text: last.text + ev.text }];
                }
                return [...prev, { role: ev.role, text: ev.text }];
              });
              break;
            }
            case "interrupted":
              // Barge-in: kill queued speech instantly.
              sinkRef.current?.flush();
              break;
            case "turn-complete":
              trackerRef.current.endTurn();
              break;
            case "error":
              setError(ev.message);
              setStatus("error");
              break;
          }
        }
      })();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
      stop();
    }
  }, [stop]);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 720 }}>
      <h1 style={{ marginBottom: 4 }}>Voice spike — Gemini Live</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Phase 1 gate: does conversation feel human? Target p95 first-audio &lt; 800ms.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "16px 0" }}>
        <button onClick={status === "live" ? stop : start} disabled={status === "connecting"}>
          {status === "live" ? "Stop" : status === "connecting" ? "Connecting…" : "Start interview"}
        </button>
        <span>Status: <strong>{status}</strong></span>
        <div style={{ width: 120, height: 8, background: "#eee", borderRadius: 4 }}>
          <div
            style={{
              width: `${Math.min(100, level * 200)}%`,
              height: "100%",
              background: "#4caf50",
              borderRadius: 4,
              transition: "width 100ms",
            }}
          />
        </div>
      </div>

      {error && <p style={{ color: "#c00" }}>Error: {error}</p>}

      <div style={{ display: "flex", gap: 24, margin: "12px 0", fontVariantNumeric: "tabular-nums" }}>
        <span>Last: <strong>{lastLatency ?? "—"}</strong> ms</span>
        <span>p50: <strong>{metrics.p50 ?? "—"}</strong> ms</span>
        <span>
          p95:{" "}
          <strong style={{ color: metrics.p95 != null && metrics.p95 > 800 ? "#c00" : "#080" }}>
            {metrics.p95 ?? "—"}
          </strong>{" "}
          ms
        </span>
        <span>turns: {metrics.count}</span>
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, minHeight: 200 }}>
        {transcript.length === 0 && <p style={{ color: "#999" }}>Transcript will appear here…</p>}
        {transcript.map((line, i) => (
          <p key={i} style={{ margin: "6px 0" }}>
            <strong style={{ color: line.role === "user" ? "#06c" : "#333" }}>
              {line.role === "user" ? "You" : "Interviewer"}:
            </strong>{" "}
            {line.text}
          </p>
        ))}
      </div>
    </div>
  );
}
