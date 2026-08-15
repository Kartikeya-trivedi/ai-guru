import { openGeminiLive } from "../providers/gemini/live";
import { LIVE_MODEL } from "../providers/gemini/models";
import { startMicCapture, type MicCapture } from "../voice/capture";
import { createAudioSink, type AudioSink } from "../voice/playback";
import { GEMINI_INPUT_SAMPLE_RATE } from "../providers/gemini/live";
import { LatencyTracker } from "../voice/metrics";
import type { ParsedResume } from "../resume/types";
import type { RealtimeVoiceChannel, VideoSource } from "../providers/types";
import {
  startCameraCapture,
  startScreenCapture,
  type VideoCapture,
} from "../video/capture";
import { IntegrityMonitor, type IntegrityEvent } from "./proctor";
import { openSimliAvatar, type PhotorealAvatar } from "../avatar/simli";
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
   * A camera or screen stream started or stopped, so the UI can show/hide the
   * tile. Null means that source is now off.
   */
  onVideoChange?(source: VideoSource, stream: MediaStream | null): void;
  /** The photoreal face connected (true) or dropped back to stylised (false). */
  onAvatarChange?(active: boolean): void;
  /**
   * The photoreal face started/stopped talking. More accurate than inferring
   * it from transcript chunks, since the avatar knows exactly when it speaks.
   */
  onAvatarSpeaking?(speaking: boolean): void;
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
  /**
   * Turn the candidate's camera on at the start. Opt-in: a video interview is
   * more realistic and more stressful, but sending someone's face to a model
   * must never be a silent default.
   */
  camera?: boolean;
  /**
   * Photoreal interviewer. Optional and independently keyed: without it the
   * app renders the local stylised face, which costs nothing and works
   * offline.
   */
  photoreal?: { apiKey: string; faceId?: string };
}

/** Collision-free across app restarts (a module counter is not — it resets). */
function newThreadId(): string {
  return crypto.randomUUID();
}

/** Turn a raw getUserMedia/WebSocket failure into something a candidate can act on. */
function translateStartError(e: unknown): Error {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new Error("This interview needs your microphone. Allow mic access in your browser or system settings, then try again.");
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return new Error("No microphone was found. Plug one in (a headset is best) and try again.");
  }
  if (name === "NotReadableError") {
    return new Error("Your microphone is in use by another app. Close it and try again.");
  }
  return e instanceof Error ? e : new Error(String(e));
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
  /** Set by stop(), so an event-loop exit can tell a clean end from a drop. */
  private stopped = false;

  private camera: VideoCapture | null = null;
  private screen: VideoCapture | null = null;
  private integrity = new IntegrityMonitor();
  /**
   * The wire protocol sends bare frames with no source label, so the model
   * would otherwise have no idea whether it is looking at a face or a code
   * editor. We announce a switch once, when the active source changes, rather
   * than tagging every frame — one line of context beats per-frame chatter.
   */
  private lastAnnouncedSource: VideoSource | null = null;

  /** Null whenever photoreal is off, unconfigured, or has dropped. */
  private avatar: PhotorealAvatar | null = null;

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
      // Vision guidance is baked in from the start when the camera is opted
      // into, so the interviewer never has to be told mid-flight that it
      // suddenly has eyes.
      interviewerPersona(this.opts.jobTarget, { camera: this.opts.camera }),
      jobBrief(this.opts.jobTarget),
      resumeBrief(this.opts.resume),
      stageBrief(this.stage),
      `Open the interview now: greet ${this.opts.resume.name.split(" ")[0]} warmly by name and ask them to introduce themselves. Keep it to one or two sentences.`,
    ].join("\n\n");

    // Acquire the microphone FIRST — it's the cheapest, most-likely-to-fail
    // resource, and there's no reason to open a billed Live session before we
    // know the candidate can actually speak. On any failure, release
    // everything so a denied mic can't leak an open WebSocket + AudioContext.
    try {
      this.mic = await startMicCapture(
        GEMINI_INPUT_SAMPLE_RATE,
        (frame) => this.channel?.sendAudio(frame),
        () => {
          // The input device vanished mid-interview (e.g. a Bluetooth headset
          // dropped). The socket is still open, so this is recoverable, but
          // the UI must not keep claiming "ON AIR" while deaf.
          this.cb.onStatus("disconnected");
          this.cb.onError("Microphone disconnected — reconnect it and restart the interview.");
        },
      );

      this.sink = createAudioSink();
      this.channel = await openGeminiLive({
        apiKey: this.opts.apiKey,
        model: LIVE_MODEL,
        voiceName: "Charon",
        systemInstruction: system,
      });
    } catch (e) {
      this.stop();
      throw translateStartError(e);
    }

    this.integrity.start();
    this.stageStartedAt = performance.now();
    this.cb.onStatus("live");
    this.cb.onStageChange(this.stage);
    void this.pump();

    // Camera comes up AFTER the session is live: a refused camera must never
    // cost the candidate the interview, so it is a soft failure by design.
    if (this.opts.camera) {
      void this.enableCamera().catch((e) => {
        this.cb.onNotice(e instanceof Error ? e.message : String(e));
      });
    }
  }

  // ── video ──────────────────────────────────────────────────────────

  private sendFrame = (jpeg: ArrayBuffer, source: VideoSource): void => {
    if (!this.channel?.sendVideo) return;
    // Screen wins while it is up: during a coding round what is on the screen
    // is the thing being discussed, and alternating sources frame-to-frame
    // would leave the model unsure what it is even looking at.
    const active: VideoSource = this.screen && !this.screen.ended() ? "screen" : "camera";
    if (source !== active) return;

    if (this.lastAnnouncedSource !== source) {
      this.lastAnnouncedSource = source;
      this.steer(
        source === "screen"
          ? "[VIDEO] You are now seeing the candidate's shared SCREEN rather than their camera."
          : "[VIDEO] You are now seeing the candidate's CAMERA.",
      );
    }
    this.channel.sendVideo(jpeg, source);
  };

  async enableCamera(): Promise<void> {
    if (this.camera && !this.camera.ended()) return;
    this.camera = await startCameraCapture(this.sendFrame);
    this.integrity.record("camera-started");
    this.cb.onVideoChange?.("camera", this.camera.stream);
  }

  disableCamera(): void {
    if (!this.camera) return;
    this.camera.stop();
    this.camera = null;
    this.integrity.record("camera-stopped");
    this.cb.onVideoChange?.("camera", null);
    if (this.lastAnnouncedSource === "camera") this.lastAnnouncedSource = null;
  }

  async startScreenShare(): Promise<void> {
    if (this.screen && !this.screen.ended()) return;
    this.screen = await startScreenCapture(this.sendFrame);
    this.integrity.record("screen-share-started");
    this.cb.onVideoChange?.("screen", this.screen.stream);

    // The browser's own "Stop sharing" bar ends the track without routing
    // through our UI — poll so the tile and the model both find out.
    const watch = setInterval(() => {
      if (this.screen && this.screen.ended()) {
        clearInterval(watch);
        this.stopScreenShare();
      }
      if (!this.screen) clearInterval(watch);
    }, 1000);

    this.steer(
      "[SCREEN SHARE ON] The candidate is now sharing their screen. Look at what they are actually doing and react like a human would. Do not narrate the screen back to them.",
    );
  }

  stopScreenShare(): void {
    if (!this.screen) return;
    this.screen.stop();
    this.screen = null;
    this.integrity.record("screen-share-stopped");
    this.cb.onVideoChange?.("screen", null);
    if (this.lastAnnouncedSource === "screen") this.lastAnnouncedSource = null;
    this.steer("[SCREEN SHARE OFF] You can no longer see their screen.");
  }

  // ── photoreal avatar ───────────────────────────────────────────────

  /**
   * Connect the photoreal face to DOM elements the UI owns.
   *
   * Separate from start() because the session has no DOM: React must mount
   * the <video>/<audio> pair first and hand them over. Safe to call when
   * photoreal is unconfigured — it simply does nothing, leaving the local
   * stylised face in place.
   *
   * Throws only so the caller can show a reason; the interview itself is
   * never at risk, because audio silently keeps playing locally.
   */
  async attachPhotorealAvatar(videoEl: HTMLVideoElement, audioEl: HTMLAudioElement): Promise<void> {
    const cfg = this.opts.photoreal;
    if (!cfg?.apiKey || this.avatar) return;

    this.avatar = await openSimliAvatar({
      apiKey: cfg.apiKey,
      faceId: cfg.faceId,
      videoEl,
      audioEl,
      onSpeakingChange: (speaking) => this.cb.onAvatarSpeaking?.(speaking),
      onDropped: (reason) => {
        // Drop the reference so the very next audio chunk routes back to the
        // local sink, then tell the UI to swap the face out.
        this.avatar = null;
        this.cb.onAvatarChange?.(false);
        this.cb.onNotice(`${reason} Falling back to the standard interviewer.`);
      },
    });

    this.cb.onAvatarChange?.(true);
  }

  isPhotorealActive(): boolean {
    return this.avatar?.isConnected() ?? false;
  }

  /** True when a key is configured, whether or not it has connected yet. */
  wantsPhotoreal(): boolean {
    return Boolean(this.opts.photoreal?.apiKey);
  }

  getIntegrityEvents(): IntegrityEvent[] {
    return this.integrity.all();
  }

  /**
   * Loudness of the interviewer's voice right now, 0..1. Polled per animation
   * frame by the avatar to drive its mouth, so it must stay allocation-free
   * and never throw once the sink is gone.
   */
  outputLevel(): number {
    return this.sink?.level() ?? 0;
  }

  private async pump(): Promise<void> {
    if (!this.channel) return;
    for await (const ev of this.channel.events()) {
      switch (ev.type) {
        case "audio":
          if (this.tracker.markModelAudio()) this.cb.onLatency(this.tracker.summary());
          // Exactly one of these owns playback. The avatar plays its own audio
          // so the mouth stays locked to the voice; doing both would double
          // the interviewer. If the avatar ever drops mid-interview this falls
          // back to local playback on the very next chunk, so the candidate
          // keeps hearing their interviewer either way.
          if (this.avatar?.isConnected()) {
            this.avatar.pushAudio(ev.frame, ev.sampleRate);
          } else {
            this.sink?.enqueue(ev.frame, ev.sampleRate);
          }
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
          // Barge-in — stop talking immediately, like a person would. Both
          // paths are cleared regardless of which is playing: a stale queue on
          // the idle path would replay a cut-off sentence if the other side
          // dropped a moment later.
          this.sink?.flush();
          this.avatar?.interrupt();
          break;

        case "turn-complete":
          this.tracker.endTurn();
          // Rotate the buffers synchronously so the (question, answer) pair is
          // captured correctly, then assess off the audio path.
          this.onTurnComplete();
          break;

        case "error":
          // A dropped connection is fatal to the live session: stop capturing
          // so the candidate isn't talking into nothing, and flag it clearly.
          this.cb.onError(ev.message);
          if (/connection lost/i.test(ev.message)) {
            this.mic?.stop();
            this.mic = null;
            this.cb.onStatus("disconnected");
          }
          break;
      }
    }
    // If the loop ended without an explicit stop(), the channel dropped.
    this.cb.onStatus(this.stopped ? "ended" : "disconnected");
    if (!this.stopped) {
      this.mic?.stop();
      this.mic = null;
    }
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
    this.stopped = true;
    this.integrity.stop();
    // Release the camera and screen explicitly — a lingering capture leaves
    // the OS "in use" indicator lit, which reads as the app spying after the
    // interview has ended.
    this.avatar?.close();
    this.avatar = null;
    this.camera?.stop();
    this.camera = null;
    this.screen?.stop();
    this.screen = null;
    this.mic?.stop();
    this.mic = null;
    this.sink?.close();
    this.sink = null;
    this.channel?.close();
    this.channel = null;
    this.cb.onStatus("ended");
  }
}
