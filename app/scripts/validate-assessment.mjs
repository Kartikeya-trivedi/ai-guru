/**
 * Phase 3 validation — answer assessment: latency AND judgement quality.
 *
 * Two things must hold:
 *  1. FAST. This runs while the candidate is talking. Phase 2 showed a big
 *     schema costs ~15-20s; that would be fatal here.
 *  2. RIGHT. It must reward reasoning over recall — that's the promise. The
 *     fixtures below are built to catch a grader that rewards fluency:
 *     the "confident wrong" and "fluent evasion" cases sound good and are not.
 *
 * Usage: node scripts/validate-assessment.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const text = readFileSync(join(__dirname, "..", ".env"), "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const API_KEY = loadEnv().GEMINI_API_KEY;

const MODELS = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];

const SCHEMA = {
  type: "object",
  properties: {
    quality: { type: "string", enum: ["strong", "adequate", "shallow", "evasive", "wrong"] },
    note: { type: "string" },
    suggestedProbe: { type: "string" },
    atKnowledgeLimit: { type: "boolean" },
  },
  required: ["quality", "note", "atKnowledgeLimit"],
};

const SYSTEM = `You are evaluating one answer from a technical interview, as a senior interviewer would.

Judge REASONING, not recall. A candidate who derives an answer imperfectly from first principles is STRONGER than one who recites a correct definition without understanding. Penalise fluent-sounding answers that dodge the actual question.

quality:
- strong: demonstrates real understanding; earns a deeper probe
- adequate: correct but surface-level; one more layer may reveal more
- shallow: vague, buzzword-y, or hand-waves the hard part
- evasive: talks around the question without answering it
- wrong: factually incorrect

Saying "I don't know" plainly is NOT evasive. Evasion is pretending to answer.
A candidate who names their limit honestly is being straight with you — grade
whatever substance they did offer, and set atKnowledgeLimit. Never label
honesty as evasion; it is the behaviour a good interview should reward.

atKnowledgeLimit: true when further drilling on THIS thread would only produce
guessing — they have reached the edge of what they actually know. A good
interviewer notices this and moves on rather than grinding the candidate down.

note: one short clause of evidence for the report, e.g. "Explained paged-KV
tradeoffs precisely but couldn't justify the eviction policy."

suggestedProbe: if a deeper layer is worth pulling, the single most revealing
follow-up. Omit if atKnowledgeLimit.

Be concise. Your output is consumed by code, not read aloud.`;

/** Each fixture: what a senior interviewer would say, and why. */
const FIXTURES = [
  {
    name: "reasoned-from-first-principles",
    topic: "kllm — paged-KV cache",
    question: "Why did you use a paged KV cache instead of a contiguous one?",
    answer:
      "Contiguous KV forces you to preallocate for max sequence length per request, so with variable-length requests you waste most of the VRAM on padding. Paging lets me allocate fixed-size blocks on demand and share them across sequences, so utilisation goes up and I can batch more. The cost is an indirection table per block and slightly worse locality on attention reads — I measured that as a few percent, worth it for roughly 2x the batch size.",
    depth: 1,
    expect: ["strong"],
    why: "Derives the tradeoff, quantifies the cost, names what he gave up.",
  },
  {
    name: "fluent-but-shallow",
    topic: "kllm — paged-KV cache",
    question: "Why did you use a paged KV cache instead of a contiguous one?",
    answer:
      "Paged attention is the industry standard approach used by vLLM and it's much more efficient for memory management. It's the state of the art for LLM serving, so I went with the proven architecture rather than reinventing the wheel.",
    depth: 1,
    expect: ["shallow", "evasive"],
    why: "Name-drops vLLM as a substitute for understanding. Must not score strong.",
  },
  {
    name: "confident-and-wrong",
    topic: "Python fundamentals",
    question: "What does the GIL prevent in CPython?",
    answer:
      "The GIL prevents multiple threads from running at all, so Python is completely single-threaded. That's why you have to use multiprocessing for any concurrency at all, including I/O work like network calls.",
    depth: 1,
    expect: ["wrong"],
    why: "Confidently false — threads do run, and the GIL is released on I/O.",
  },
  {
    name: "fluent-evasion",
    topic: "DockerWatch — alert engine",
    question: "How does your alert engine avoid false positives?",
    answer:
      "False positives are definitely a huge challenge in monitoring, and it's something we thought about a lot from day one. Alert fatigue is real and we wanted to build something production-grade that engineers would actually trust rather than mute.",
    depth: 2,
    expect: ["evasive", "shallow"],
    why: "Agrees the problem is hard, never answers. Classic dodge.",
  },
  {
    name: "honest-limit",
    topic: "kllm — CUDA kernels",
    question: "How does the warp scheduler decide which warp issues next on your kernel?",
    answer:
      "Honestly I don't know the details of the scheduler at that level. I know warps get swapped when one stalls on memory, which is why occupancy matters, but I've never looked at the issue policy itself. I tuned occupancy empirically rather than from first principles.",
    depth: 3,
    expect: ["adequate", "shallow"],
    expectLimit: true,
    why: "Honest boundary — should trigger atKnowledgeLimit, not more grinding.",
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

async function assess(fx, model) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [
            {
              role: "user",
              parts: [{
                text: `Topic: ${fx.topic}\nLayers already drilled: ${fx.depth}\n\nInterviewer asked: ${fx.question}\n\nCandidate answered: ${fx.answer}`,
              }],
            },
          ],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: SCHEMA },
        }),
      },
    );
    if (res.ok) {
      const json = await res.json();
      return JSON.parse((json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join(""));
    }
    if (!RETRYABLE.has(res.status) || attempt === 4) {
      throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 120)}`);
    }
    await sleep(400 * 2 ** (attempt - 1));
  }
}

for (const model of MODELS) {
  console.log(`\n=== ${model} ===`);
  const latencies = [];
  let correct = 0;

  for (const fx of FIXTURES) {
    let r, ms;
    try {
      const t0 = performance.now();
      r = await assess(fx, model);
      ms = Math.round(performance.now() - t0);
      latencies.push(ms);
    } catch (e) {
      console.log(`  ERROR ${fx.name}: ${String(e).slice(0, 100)}`);
      continue;
    }

    const qualityOk = fx.expect.includes(r.quality);
    const limitOk = fx.expectLimit === undefined || r.atKnowledgeLimit === fx.expectLimit;
    const ok = qualityOk && limitOk;
    if (ok) correct++;

    console.log(`  ${ok ? "PASS" : "FAIL"}  ${fx.name.padEnd(30)} → ${String(r.quality).padEnd(9)} limit=${String(r.atKnowledgeLimit).padEnd(5)} ${ms}ms`);
    if (!ok) console.log(`        expected ${fx.expect.join("|")}${fx.expectLimit !== undefined ? ` limit=${fx.expectLimit}` : ""} — ${fx.why}`);
    console.log(`        note: ${r.note}`);
  }

  if (latencies.length) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length / 2)];
    const max = sorted[sorted.length - 1];
    const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    console.log(`\n  judgement: ${correct}/${FIXTURES.length}`);
    console.log(`  latency:   avg ${avg}ms | p50 ${p50}ms | max ${max}ms`);
  }
}
