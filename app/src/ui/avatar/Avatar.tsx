import { useEffect, useRef } from "react";
import {
  breathe,
  createBlinkState,
  idleSway,
  opennessFromLevel,
  smoothOpenness,
  stepBlink,
  type BlinkState,
} from "./face";

/**
 * The interviewer's face.
 *
 * Deliberately STYLISED, not photoreal. A near-human render that is slightly
 * wrong is unsettling in a way a clean vector portrait is not, and this face
 * has to sit on screen for an hour while someone is already nervous. It is
 * lit like a studio portrait to match the rest of the app rather than looking
 * like a cartoon dropped into a control room.
 *
 * Everything animates by mutating SVG attributes from a single rAF loop.
 * Driving this through React state would re-render the whole tree ~60×/s
 * during an interview that is already latency-sensitive.
 */

export function Avatar({
  /** Live output loudness 0..1 — drives the mouth. */
  level,
  /** True when the interviewer is talking; also lights the rim. */
  speaking,
  /** Scales the whole face; the tile version passes a smaller value. */
  compact = false,
}: {
  level: () => number;
  speaking: boolean;
  compact?: boolean;
}) {
  const rootRef = useRef<SVGGElement>(null);
  const mouthRef = useRef<SVGPathElement>(null);
  const lidLRef = useRef<SVGRectElement>(null);
  const lidRRef = useRef<SVGRectElement>(null);
  const browsRef = useRef<SVGGElement>(null);
  const shouldersRef = useRef<SVGPathElement>(null);
  // Refs, not state: the loop reads these every frame and must never restart.
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;
  const levelRef = useRef(level);
  levelRef.current = level;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let open = 0;
    let blink: BlinkState = createBlinkState();
    const start = last;

    const frame = (now: number): void => {
      // Clamp dt so a backgrounded tab doesn't resume with one giant step
      // that snaps the face through a whole blink.
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - start) / 1000;

      open = smoothOpenness(open, opennessFromLevel(levelRef.current()), dt);
      blink = stepBlink(blink, dt);

      const sway = idleSway(t);
      rootRef.current?.setAttribute(
        "transform",
        `translate(${sway.x} ${sway.y}) rotate(${sway.tilt} 100 108)`,
      );
      shouldersRef.current?.setAttribute("transform", `translate(0 ${breathe(t)})`);

      // Mouth: a lens shape that opens vertically and widens slightly, so it
      // reads as speech rather than a hinge.
      const h = 1.5 + open * 13;
      const w = 17 + open * 4;
      mouthRef.current?.setAttribute(
        "d",
        `M ${100 - w} 132 Q 100 ${132 - h * 0.55} ${100 + w} 132 Q 100 ${132 + h} ${100 - w} 132 Z`,
      );

      // Eyelids close by growing downward over the eye.
      const lid = 1 + blink.closed * 11;
      lidLRef.current?.setAttribute("height", String(lid));
      lidRRef.current?.setAttribute("height", String(lid));

      // Brows lift a touch while speaking — the difference between a mask
      // and someone engaged in the conversation.
      const brow = speakingRef.current ? -1.8 : 0;
      browsRef.current?.setAttribute("transform", `translate(0 ${brow})`);

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const skin = "url(#av-skin)";

  return (
    <svg
      viewBox="0 0 200 200"
      className={`avatar ${speaking ? "speaking" : ""} ${compact ? "compact" : ""}`}
      role="img"
      aria-label={speaking ? "Interviewer, speaking" : "Interviewer, listening"}
    >
      <defs>
        {/* Warm key light from upper-left, matching the app's studio feel. */}
        <radialGradient id="av-skin" cx="38%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#5a5048" />
          <stop offset="55%" stopColor="#3b342e" />
          <stop offset="100%" stopColor="#221d19" />
        </radialGradient>
        <linearGradient id="av-hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2b2521" />
          <stop offset="100%" stopColor="#191512" />
        </linearGradient>
        <linearGradient id="av-shoulders" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a2622" />
          <stop offset="100%" stopColor="#14110f" />
        </linearGradient>
        <radialGradient id="av-glow" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="rgba(255,92,34,0)" />
          <stop offset="100%" stopColor="rgba(255,92,34,0.22)" />
        </radialGradient>
      </defs>

      {/* Speaking glow behind the head. */}
      <circle className="av-aura" cx="100" cy="105" r="78" fill="url(#av-glow)" />

      <g ref={shouldersRef}>
        <path
          d="M 34 200 C 38 168 62 152 100 152 C 138 152 162 168 166 200 Z"
          fill="url(#av-shoulders)"
        />
        {/* Collar line — enough clothing to read as a person, not a bust. */}
        <path
          d="M 84 154 L 100 172 L 116 154"
          fill="none"
          stroke="#0e0c0a"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>

      <g ref={rootRef}>
        {/* Neck */}
        <path d="M 88 132 L 88 158 Q 100 166 112 158 L 112 132 Z" fill="#2e2822" />

        {/* Head */}
        <path
          d="M 100 46
             C 128 46 143 66 143 94
             C 143 122 128 146 100 146
             C 72 146 57 122 57 94
             C 57 66 72 46 100 46 Z"
          fill={skin}
        />

        {/* Ears */}
        <ellipse cx="56" cy="100" rx="5" ry="9" fill="#332c26" />
        <ellipse cx="144" cy="100" rx="5" ry="9" fill="#332c26" />

        {/* Hair: simple swept shape — enough to read as a person without
            committing to a specific identity. */}
        <path
          d="M 57 92 C 55 60 74 42 100 42 C 126 42 145 60 143 92
             C 139 76 132 66 118 62 C 104 74 78 72 66 66 C 60 72 58 82 57 92 Z"
          fill="url(#av-hair)"
        />

        <g ref={browsRef}>
          <path d="M 74 86 Q 82 82 90 85" stroke="#211c18" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 110 85 Q 118 82 126 86" stroke="#211c18" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>

        {/* Eyes. The lid rect sits on top and grows down to blink. */}
        <g>
          <ellipse cx="82" cy="98" rx="9" ry="6" fill="#e8e2d8" />
          <circle cx="82" cy="98" r="4.2" fill="#2a1f16" />
          <circle cx="83.4" cy="96.4" r="1.4" fill="#efe9df" opacity="0.9" />
          <rect ref={lidLRef} x="72.5" y="92" width="19" height="1" fill={skin} />
        </g>
        <g>
          <ellipse cx="118" cy="98" rx="9" ry="6" fill="#e8e2d8" />
          <circle cx="118" cy="98" r="4.2" fill="#2a1f16" />
          <circle cx="119.4" cy="96.4" r="1.4" fill="#efe9df" opacity="0.9" />
          <rect ref={lidRRef} x="108.5" y="92" width="19" height="1" fill={skin} />
        </g>

        {/* Nose — a shadow line, not a shape. Less is more here. */}
        <path
          d="M 100 104 L 97 118 Q 100 121 103 118"
          fill="none"
          stroke="#241f1a"
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        <path ref={mouthRef} d="M 83 132 Q 100 131 117 132 Q 100 133 83 132 Z" fill="#1a1210" />

        {/* Rim light on the speaking side. */}
        <path
          className="av-rim"
          d="M 100 46 C 128 46 143 66 143 94 C 143 122 128 146 100 146"
          fill="none"
          stroke="var(--live)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
