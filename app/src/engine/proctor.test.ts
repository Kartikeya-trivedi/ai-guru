import { describe, it, expect, vi, afterEach } from "vitest";
import { IntegrityMonitor, describeIntegrity, formatOffset } from "./proctor";

/**
 * These tests pin the ETHICAL contract as much as the mechanics: integrity
 * output must stay factual and must never grow a verdict. If someone later
 * adds "suspicious" or a cheating score, the phrasing test should fail.
 */

afterEach(() => vi.restoreAllMocks());

describe("formatOffset", () => {
  it("renders mm:ss", () => {
    expect(formatOffset(0)).toBe("0:00");
    expect(formatOffset(65_000)).toBe("1:05");
    expect(formatOffset(600_000)).toBe("10:00");
  });
});

describe("IntegrityMonitor", () => {
  it("records explicit camera and screen events in order", () => {
    const m = new IntegrityMonitor();
    m.record("camera-started");
    m.record("screen-share-started");
    m.record("screen-share-stopped");
    expect(m.all().map((e) => e.kind)).toEqual([
      "camera-started",
      "screen-share-started",
      "screen-share-stopped",
    ]);
  });

  it("sums time spent away from the app", () => {
    const m = new IntegrityMonitor();
    m.record("focus-regained", { durationMs: 5_000 });
    m.record("focus-regained", { durationMs: 7_500 });
    expect(m.totalAwayMs()).toBe(12_500);
  });

  it("offsets are session-relative and never negative", () => {
    const m = new IntegrityMonitor();
    m.start(new EventTarget());
    // An offsetOverride from before the session start (clock skew) must clamp.
    m.record("camera-started", { offsetOverride: -99999 });
    expect(m.all()[0].offsetMs).toBe(0);
    m.stop();
  });

  it("stop() detaches listeners so a finished session stops recording", () => {
    const host = new EventTarget();
    const remove = vi.spyOn(host, "removeEventListener");
    const m = new IntegrityMonitor();
    m.start(host);
    m.stop();
    expect(remove).toHaveBeenCalledWith("blur", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("focus", expect.any(Function));
  });

  it("records a real focus gap once the window comes back", async () => {
    const host = new EventTarget();
    const m = new IntegrityMonitor();
    m.start(host);

    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    host.dispatchEvent(new Event("blur"));
    now += 40_000; // 40s away — well past the noise floor
    host.dispatchEvent(new Event("focus"));

    const gap = m.all().find((e) => e.kind === "focus-regained");
    expect(gap?.durationMs).toBe(40_000);
    m.stop();
  });

  it("ignores momentary alt-tab blips rather than crying wolf", () => {
    const host = new EventTarget();
    const m = new IntegrityMonitor();
    m.start(host);

    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    host.dispatchEvent(new Event("blur"));
    now += 500; // half a second: a notification, not an absence
    host.dispatchEvent(new Event("focus"));

    expect(m.all()).toHaveLength(0);
    m.stop();
  });

  it("survives having no DOM at all instead of throwing", () => {
    const m = new IntegrityMonitor();
    expect(() => m.start(undefined)).not.toThrow();
    m.stop();
  });
});

describe("describeIntegrity", () => {
  it("returns null for a clean session rather than an empty section", () => {
    // A spotless interview must not sprout an ominous blank "integrity" block.
    expect(describeIntegrity([])).toBeNull();
  });

  it("states facts with timestamps and no interpretation", () => {
    const lines = describeIntegrity([
      { kind: "focus-regained", at: "", offsetMs: 63_000, durationMs: 42_000 },
      { kind: "screen-share-stopped", at: "", offsetMs: 120_000 },
    ]);
    expect(lines).toEqual([
      "1:03 — app was in the background for 42s",
      "2:00 — screen sharing stopped",
    ]);
  });

  it("never emits accusatory language", () => {
    const lines =
      describeIntegrity([
        { kind: "focus-regained", at: "", offsetMs: 1000, durationMs: 90_000 },
        { kind: "camera-stopped", at: "", offsetMs: 2000 },
        { kind: "screen-share-stopped", at: "", offsetMs: 3000 },
      ]) ?? [];
    const text = lines.join(" ").toLowerCase();
    for (const word of ["cheat", "suspicious", "violation", "dishonest", "flag", "likely"]) {
      expect(text).not.toContain(word);
    }
  });

  it("does not double-report a focus gap (lost is implied by regained)", () => {
    const lines = describeIntegrity([
      { kind: "focus-lost", at: "", offsetMs: 10_000 },
      { kind: "focus-regained", at: "", offsetMs: 20_000, durationMs: 10_000 },
    ]);
    expect(lines).toHaveLength(1);
  });
});
