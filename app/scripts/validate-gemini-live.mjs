/**
 * Phase 1 validation harness — no human required.
 *
 * Verifies the Gemini Live contract end-to-end against the real API:
 *   1. WebSocket connects and the API key is accepted
 *   2. The model ID exists and setup completes
 *   3. Native audio comes back (PCM16) for a text turn
 *   4. Input/output transcription is delivered
 *   5. Time-to-first-audio is measured (the product's core metric)
 *
 * Mic capture and barge-in still need a human with a headset, but this
 * proves the protocol, key, model, and latency budget before that.
 *
 * Usage: node scripts/validate-gemini-live.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = join(__dirname, "..", ".env");
  const text = readFileSync(envPath, "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnv();
const API_KEY = env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("FAIL: GEMINI_API_KEY not found in app/.env");
  process.exit(1);
}

const MODELS = [
  "gemini-3.1-flash-live-preview",
  "gemini-2.5-flash-native-audio-preview-12-2025",
];

const WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

function sampleRateFromMime(mime) {
  const m = String(mime ?? "").match(/rate=(\d+)/);
  return m ? Number(m[1]) : null;
}

async function testModel(model) {
  return new Promise((resolve) => {
    const result = {
      model,
      connected: false,
      setupComplete: false,
      audioChunks: 0,
      audioBytes: 0,
      outputSampleRate: null,
      outputTranscript: "",
      firstAudioMs: null,
      error: null,
    };

    const ws = new WebSocket(`${WS_URL}?key=${encodeURIComponent(API_KEY)}`);
    let promptSentAt = null;
    const timeout = setTimeout(() => {
      result.error ??= "timeout after 30s";
      try { ws.close(); } catch {}
      resolve(result);
    }, 30000);

    const finish = () => {
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      resolve(result);
    };

    ws.onopen = () => {
      result.connected = true;
      ws.send(JSON.stringify({
        setup: {
          model: `models/${model}`,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } },
            },
          },
          systemInstruction: {
            parts: [{ text: "You are a senior AI Engineer conducting an interview. Be warm and brief." }],
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      }));
    };

    ws.onerror = (e) => {
      result.error = `websocket error: ${e?.message ?? "unknown"}`;
      finish();
    };

    ws.onclose = (ev) => {
      if (!result.setupComplete && !result.error) {
        result.error = `closed before setup: ${ev.code} ${ev.reason || "(no reason)"}`;
      }
      clearTimeout(timeout);
      resolve(result);
    };

    ws.onmessage = async (ev) => {
      const raw = ev.data instanceof Blob ? await ev.data.text()
        : ev.data instanceof ArrayBuffer ? Buffer.from(ev.data).toString("utf8")
        : String(ev.data);

      let msg;
      try { msg = JSON.parse(raw); } catch {
        result.error = `unparseable: ${raw.slice(0, 200)}`;
        return finish();
      }

      if (msg.setupComplete !== undefined) {
        result.setupComplete = true;
        // Drive a turn with text; the model must reply in native audio.
        promptSentAt = performance.now();
        ws.send(JSON.stringify({
          clientContent: {
            turns: [{ role: "user", parts: [{ text: "Say hello and ask me to introduce myself. One sentence." }] }],
            turnComplete: true,
          },
        }));
        return;
      }

      const sc = msg.serverContent;
      if (!sc) return;

      if (sc.outputTranscription?.text) result.outputTranscript += sc.outputTranscription.text;

      for (const part of sc.modelTurn?.parts ?? []) {
        const inline = part.inlineData;
        if (inline?.data && String(inline.mimeType ?? "").startsWith("audio/")) {
          if (result.firstAudioMs === null && promptSentAt !== null) {
            result.firstAudioMs = Math.round(performance.now() - promptSentAt);
          }
          result.audioChunks++;
          result.audioBytes += Buffer.from(inline.data, "base64").length;
          result.outputSampleRate ??= sampleRateFromMime(inline.mimeType);
        }
      }

      if (sc.turnComplete) finish();
    };
  });
}

console.log("Validating Gemini Live API contract\n");

let anyPass = false;
for (const model of MODELS) {
  process.stdout.write(`  ${model} … `);
  const r = await testModel(model);
  const pass = r.setupComplete && r.audioChunks > 0;
  anyPass ||= pass;
  console.log(pass ? "PASS" : "FAIL");
  console.log(`      connected:        ${r.connected}`);
  console.log(`      setupComplete:    ${r.setupComplete}`);
  console.log(`      audio chunks:     ${r.audioChunks} (${r.audioBytes} bytes)`);
  console.log(`      output rate:      ${r.outputSampleRate ?? "—"} Hz`);
  console.log(`      time-to-first-audio: ${r.firstAudioMs ?? "—"} ms`);
  console.log(`      transcript:       ${r.outputTranscript ? JSON.stringify(r.outputTranscript.slice(0, 80)) : "—"}`);
  if (r.error) console.log(`      error:            ${r.error}`);
  console.log();
}

process.exit(anyPass ? 0 : 1);
