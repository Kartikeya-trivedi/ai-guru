import { openGeminiLive } from "../providers/gemini/live";
import { LIVE_MODEL } from "../providers/gemini/models";
import { startMicCapture, type MicCapture } from "../voice/capture";
import { createAudioSink, type AudioSink } from "../voice/playback";
import { GEMINI_INPUT_SAMPLE_RATE } from "../providers/gemini/live";
import { LatencyTracker } from "../voice/metrics";
import type { ParsedResume } from "../resume/types";
import type { RealtimeVoiceChannel } from "../providers/types";
import { interviewerPersona } from "./persona";
import { DEFAULT_STAGES } from "./stages";
import { assessAnswer } from "./assess";
import { decideNextMove } from "./depth";
import { candidateModelBrief, jobBrief, resumeBrief, stageBrief } from "./context";
import type {
  CandidateModel,
  JobTarget,
  StageDefinition,
  StageId,
  Thread,
} from "./types";

/**
 * The interview session — stage machine + depth controller wired to the
 * live voice channel.
 *
 * Timescale split (see ARCHITECTURE.md "Steering"): the persona drills
 * in-conversation at 544ms, while this orchestrator assesses asynchronously
 * and steers the *following* turn. Nothing here may ever block the audio
 * loop.
 */

export interface SessionCallbacks {
  onTranscript(role: "user" | "assistant", text: string): void;
  onStageChange(stage: StageDefinition): void;
  onThreadUpdate(threads: Thread[]): void;
  onLatency(summary: { count: number; p50: number | null; p95: number | null }): void;
  /** A fatal problem — the interview cannot continue. */
  onError(message: string): void;
  /**
   * A non-fatal, transient problem (e.g. one assessment failed). The
   * interview continues; the UI should show this calmly and clear it on the
   * next success, NOT render it like a fatal error.
   */
  onNotice(message: string): void;
  onStatus(status: "connecting" | "live" | "ended" | "disconnected"): void;
  /**
   * A complete turn of the transcript, fired at exchange boundaries so it can
   * be persisted. Off the audio path; the caller must not block on it.
   */
  onTurnComplete(role: "user" | "assistant", text: string, stage: StageId): void;
}

export interface SessionOptions {
  apiKey: string;
  resume: ParsedResume;
  jobTarget: JobTarget;
  stages?: StageDefinition[];
  maxDepthPerThread?: number;
  /** Speed up stage budgets for testing (e.g. 0.1 = 10x faster). */
  timeScale?: number;
}

/** Collision-free across app restarts (a module counter is not — it resets). */
function newThreadId(): string {
  return crypto.randomUUID();
}

export class InterviewSession {
  private channel: RealtimeVoiceChannel | null = null;
  private mic: MicCapture | null = null;
  private sink: AudioSink | null = null;
  private tracker = new LatencyTracker();

  private stages: StageDefinition[];
  private stageIndex = 0;
  private stageStartedAt = 0;

  private threads: Thread[] = [];
  private currentThread: Thread | null = null;
  private topicQueue: string[] = [];

  private candidate: CandidateModel = {
    claims: [],
    verifiedStrengths: [],
    exposedGaps: [],
    communicationNotes: [],
  };

  /** Accumulating text since the last turn boundary. */
  private userTurn = "";
  private assistantTurn = "";
  /**
   * The interviewer's PREVIOUS completed turn — i.e. the question the next
   * candidate answer will address. Gemini fires turn-complete when the MODEL
   * stops, so within one turn-complete window the buffers hold [answer to the
   * prior question] + [the follow-up just asked]. Pairing them directly would
   * grade every answer against the NEXT question. We carry the question across
   * the boundary instead.
   */
  private pendingQuestion = "";
  /** Exchanges awaiting assessment. Queued, never dropped — losing an answer
   *  loses report evidence for a real person. */
  private assessQueue: { question: string; answer: string }[] = [];
  private draining = false;

  constructor(
    private opts: SessionOptions,
    private cb: SessionCallbacks,
  ) {
    this.stages = opts.stages ?? DEFAULT_STAGES;
  }

  get stage(): StageDefinition {
    return this.stages[this.stageIndex];
  }

  getThreads(): Thread[] {
    return [...this.threads];
  }

  getCandidateModel(): CandidateModel {
    return { ...this.candidate };
  }

  async start(): Promise<void> {
    this.cb.onStatus("connecting");
    this.topicQueue = this.topicsForStage(this.stage.id);

    const system = [
      interviewerPersona(this.opts.jobTarget),
      jobBrief(this.opts.jobTarget),
      resumeBrief(this.opts.resume),
      stageBrief(this.stage),
      `Open the interview now: greet ${this.opts.resume.name.split(" ")[0]} warmly by name and ask them to introduce themselves. Keep it to one or two sentences.`,
    ].join("\n\n");

    this.sink = createAudioSink();
    this.channel = await openGeminiLive({
      apiKey: this.opts.apiKey,
      model: LIVE_MODEL,
      voiceName: "Charon",
      systemInstruction: system,
    });

    this.mic = await startMicCapture(GEMINI_INPUT_SAMPLE_RATE, (frame) =>
      this.channel?.sendAudio(frame),
    );

    this.stageStartedAt = performance.now();
    this.cb.onStatus("live");
    this.cb.onStageChange(this.stage);
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (!this.channel) return;
    for await (const ev of this.channel.events()) {
      switch (ev.type) {
        case "audio":
          if (this.tracker.markModelAudio()) this.cb.onLatency(this.tracker.summary());
          this.sink?.enqueue(ev.frame, ev.sampleRate);
          break;

        case "transcript":
          if (ev.role === "user") {
            this.tracker.markUserSpeech();
            this.userTurn += ev.text;
          } else {
            this.assistantTurn += ev.text;
          }
          this.cb.onTranscript(ev.role, ev.text);
          break;

        case "interrupted":
          // Barge-in — stop talking immediately, like a person would.
          this.sink?.flush();
          break;

        case "turn-complete":
          this.tracker.endTurn();
          // Rotate the buffers synchronously so the (question, answer) pair is
          // captured correctly, then assess off the audio path.
          this.onTurnComplete();
          break;

        case "error":
          this.cb.onError(ev.message);
          break;
      }
    }
    this.cb.onStatus("ended");
  }

  /**
   * A model turn just completed. Runs synchronously on the audio thread, so
   * it only rotates buffers and enqueues work — no awaiting here.
   *
   * Buffer rotation: the answer just given addresses `pendingQuestion` (the
   * interviewer's PREVIOUS turn), and the turn that just finished becomes the
   * next pending question. This is what keeps every assessment paired with the
   * question it actually answered.
   */
  private onTurnComplete(): void {
    const answer = this.userTurn.trim();
    const question = this.pendingQuestion;
    this.pendingQuestion = this.assistantTurn.trim();

    if (answer) this.cb.onTurnComplete("user", answer, this.stage.id);
    if (this.pendingQuestion) this.cb.onTurnComplete("assistant", this.pendingQuestion, this.stage.id);

    this.userTurn = "";
    this.assistantTurn = "";

    // No answer (the opening greeting), or no question yet — nothing to grade.
    if (!answer || !question) return;

    // Queue rather than drop. A slow assessment must delay steering, never
    // delete an answer — that answer is a real person's report evidence.
    this.assessQueue.push({ question, answer });
    void this.drainAssessments();
  }

  /** Process queued exchanges one at a time, off the audio path. */
  private async drainAssessments(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      let item: { question: string; answer: string } | undefined;
      while ((item = this.assessQueue.shift())) {
        await this.assessExchange(item.question, item.answer);
      }
    } finally {
      this.draining = false;
    }
  }

  private async assessExchange(question: string, answer: string): Promise<void> {
    const thread = this.ensureThread(question);
    try {
      const assessment = await assessAnswer(
        { topic: thread.topic, question, answer, depth: thread.depth },
        { apiKey: this.opts.apiKey },
      );

      // Decide BEFORE recording this assessment. depth.ts inspects
      // thread.assessments (its slice(-1) lookback) and thread.depth as the
      // state PRIOR to this answer — pushing first makes the gentle-reprobe
      // branch unreachable and adds a phantom depth layer.
      const move = decideNextMove({
        thread,
        assessment,
        maxDepthPerThread: this.opts.maxDepthPerThread ?? 4,
        topicsRemaining: this.topicQueue.length,
        stageBudgetSpent: this.stageBudgetSpent(),
      });

      thread.assessments.push(assessment);
      thread.depth += 1;
      thread.exhausted = assessment.atKnowledgeLimit;
      this.absorbIntoCandidateModel(assessment);
      this.cb.onThreadUpdate(this.getThreads());
      // A recovered assessment clears any lingering transient notice.
      this.cb.onNotice("");

      switch (move.kind) {
        case "drill":
          // The persona already drills on its own; only nudge toward the
          // specific angle the assessor found most revealing.
          if (move.probe) {
            this.steer(`[INTERVIEWER NOTE] Good answer — go one layer deeper. Most revealing follow-up: ${move.probe}`);
          }
          break;

        case "probe-gently":
          this.steer(
            `[INTERVIEWER NOTE] That answer was thin. Ask ONE gentler, more concrete follow-up to give them a fair chance — acknowledge the effort first. Do not pile on.${move.probe ? ` Try: ${move.probe}` : ""}`,
          );
          break;

        case "next-topic":
          this.moveToNextTopic(move.reason);
          break;

        case "next-stage":
          this.advanceStage(move.reason);
          break;
      }
    } catch (e) {
      // A failed assessment costs steering for one turn — the interview
      // continues. Surface it as a NON-fatal notice, never a fatal error.
      this.cb.onNotice(`Assessment degraded — the interviewer's steering may lag. (${e instanceof Error ? e.message : String(e)})`);
    }
  }

  private ensureThread(question: string): Thread {
    if (this.currentThread && !this.currentThread.exhausted) return this.currentThread;
    const topic = this.topicQueue[0] ?? `${this.stage.id}: ${question.slice(0, 60)}`;
    const thread: Thread = {
      id: newThreadId(),
      stage: this.stage.id,
      topic,
      depth: 0,
      assessments: [],
      exhausted: false,
    };
    this.threads.push(thread);
    this.currentThread = thread;
    return thread;
  }

  /** Evidence for the report, accumulated without an extra LLM call. */
  private absorbIntoCandidateModel(a: { quality: string; note: string }): void {
    if (!a.note) return;
    if (a.quality === "strong") this.candidate.verifiedStrengths.push(a.note);
    else if (a.quality === "shallow" || a.quality === "wrong" || a.quality === "evasive") {
      this.candidate.exposedGaps.push(a.note);
    } else this.candidate.claims.push(a.note);
  }

  private stageBudgetSpent(): boolean {
    const scale = this.opts.timeScale ?? 1;
    const elapsedMin = (performance.now() - this.stageStartedAt) / 60000;
    return elapsedMin >= this.stage.targetMinutes * scale;
  }

  private topicsForStage(stage: StageId): string[] {
    if (stage === "projects") {
      // Depth beats breadth: the two most substantial projects, not all of them.
      return this.opts.resume.projects
        .slice(0, 2)
        .map((p) => `${p.name} — ${p.technologies.slice(0, 3).join("/")}`);
    }
    if (stage === "resume") {
      return this.opts.resume.experience.map((e) => `${e.role} at ${e.company}`);
    }
    if (stage === "technical") {
      const reqs = this.opts.jobTarget.extractedRequirements ?? [];
      return (reqs.length ? reqs : this.opts.resume.skills).slice(0, 3);
    }
    if (stage === "behavioral") {
      return ["a conflict with a teammate", "a project that failed", "feedback they received"];
    }
    return [];
  }

  private moveToNextTopic(reason: string): void {
    this.topicQueue.shift();
    this.currentThread = null;
    const next = this.topicQueue[0];
    if (!next) return this.advanceStage(reason);
    this.steer(
      `[INTERVIEWER NOTE] ${reason}. Move on to: ${next}. Bridge naturally from what they just said — don't make the transition feel abrupt.`,
    );
  }

  private advanceStage(reason: string): void {
    if (this.stageIndex >= this.stages.length - 1) return;
    this.stageIndex += 1;
    this.stageStartedAt = performance.now();
    this.topicQueue = this.topicsForStage(this.stage.id);
    this.currentThread = null;
    this.steer([`[INTERVIEWER NOTE] ${reason}.`, stageBrief(this.stage), candidateModelBrief(this.candidate)].join("\n\n"));
    this.cb.onStageChange(this.stage);
  }

  /** Inject guidance the model reads but does not answer aloud. */
  private steer(instructions: string): void {
    this.channel?.updateContext(instructions);
  }

  // ── coding round ───────────────────────────────────────────────────

  /**
   * Hand the candidate a problem. The interviewer must NOT let them code
   * yet — the discussion comes first, and that ordering is the product.
   */
  presentProblem(problem: {
    title: string;
    statement: string;
    optimalComplexity: string;
    discussionAngles: string[];
    edgeCases: string[];
  }): void {
    this.currentThread = null;
    this.topicQueue = [`coding: ${problem.title}`];
    this.steer(
      `[CODING ROUND — the problem is now on the candidate's screen]

${problem.title}
${problem.statement}

Read them the gist out loud, then make them think BEFORE they type. Do not let them jump into code, and do not give away the approach.

Probe their plan:
${problem.discussionAngles.map((a) => `  - ${a}`).join("\n")}

Intended optimal: ${problem.optimalComplexity}. Edge cases a strong candidate raises unprompted: ${problem.edgeCases.join("; ")}. If they miss an edge case, do NOT list it for them — ask a question that leads them to it.

Once their plan is sound (or they're clearly stuck after honest effort), tell them to go ahead and write it.`,
    );
  }

  /** They're coding now — the interviewer watches rather than lectures. */
  enterCodingPhase(): void {
    this.steer(
      `[CANDIDATE IS NOW WRITING CODE]

Go quiet. Let them work and think aloud. Do not narrate, do not backseat-drive, do not point out bugs the moment you spot one — a real interviewer lets a candidate find their own mistake.

Answer questions if asked. If they are truly stuck for a long stretch, offer the smallest hint that unblocks them, and note that you had to.`,
    );
  }

  /** Feed the run outcome back so the interviewer can react like a human. */
  reportSolution(input: { passed: number; total: number; executed: boolean }): void {
    this.steer(
      input.executed
        ? `[SOLUTION SUBMITTED — tests: ${input.passed}/${input.total} passed]

React the way an interviewer would: if it passed, push on complexity and what they'd change at scale. If cases failed, don't announce which — ask them to walk through their code on an input that breaks it and let them find it.`
        : `[SOLUTION SUBMITTED — not executed in this language]

Walk through it with them: complexity, edge cases, what would break. Reason about correctness together rather than asserting a verdict.`,
    );
  }

  stop(): void {
    this.mic?.stop();
    this.mic = null;
    this.sink?.close();
    this.sink = null;
    this.channel?.close();
    this.channel = null;
    this.cb.onStatus("ended");
  }
}
