import { useEffect, useRef, useState } from "react";
import portrait from "../../assets/interviewer/portrait.png";
import speakingFrame from "../../assets/interviewer/speaking.png";
import blinkFrame from "../../assets/interviewer/blink.png";
import warmFrame from "../../assets/interviewer/warm.png";
import roundedFrame from "../../assets/interviewer/rounded.png";
import attentiveFrame from "../../assets/interviewer/attentive.png";
import partedFrame from "../../assets/interviewer/parted.png";
import halfBlinkFrame from "../../assets/interviewer/half-blink.png";
import spreadFrame from "../../assets/interviewer/spread.png";
import openFrame from "../../assets/interviewer/open.png";
import contactFrame from "../../assets/interviewer/lip-bite.png";
import pressedFrame from "../../assets/interviewer/pressed.png";
import focusedFrame from "../../assets/interviewer/focused.png";
import smileFrame from "../../assets/interviewer/smile.png";
import { createPortraitMotion, stepPortraitMotion } from "./portraitMotion";
import { createPortraitRenderer, preparePortraitFrames, prepareExtendedFrame, type PortraitFrames } from "./portraitRenderer";

const extendedUrls = import.meta.glob<string>("../../assets/interviewer/extended/*.png", { eager: true, query: "?url", import: "default" });

let frames: Promise<PortraitFrames> | undefined;
function loadFrames() {
  return frames ??= Promise.all([portrait, speakingFrame, blinkFrame, warmFrame, roundedFrame, attentiveFrame, partedFrame, halfBlinkFrame,
    spreadFrame, openFrame, contactFrame, pressedFrame, focusedFrame, smileFrame].map(src => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src;
  }))).then(preparePortraitFrames).then(async prepared => {
    // Decode one extra at a time and retain only its small patches.
    for (const [path, src] of Object.entries(extendedUrls)) {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src;
      });
      prepareExtendedFrame(prepared, path.split("/").pop()!.replace(".png", ""), image);
    }
    return prepared;
  }).catch(error => { frames = undefined; throw error; });
}

/** Local photographic rig. Amplitude-driven articulation, not phoneme recognition. */
export function Portrait({ level, speaking, compact = false }: {
  level: () => number; speaking: boolean; compact?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const meter = useRef<HTMLDivElement>(null);
  const source = useRef(level); source.current = level;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let observer: ResizeObserver | undefined;
    let visibility: (() => void) | undefined;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const element = canvas.current!;
    loadFrames().then(images => {
      if (cancelled) return;
      const renderer = createPortraitRenderer(element, images);
      let state = createPortraitMotion();
      let last = 0;
      const resize = () => {
        const rect = element.getBoundingClientRect();
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
        const scale = Math.min(ratio, 1280 / Math.max(1, rect.width));
        element.width = Math.max(1, Math.round(rect.width * scale));
        element.height = Math.max(1, Math.round(rect.height * scale));
        renderer.render(state);
      };
      observer = new ResizeObserver(resize); observer.observe(element); resize();
      setReady(true);
      const draw = (now: number) => {
        if (cancelled || document.hidden) return;
        if (now - last >= 1000 / 30) {
          const dt = last ? (now - last) / 1000 : 1 / 30;
          last = now;
          state = stepPortraitMotion(state, source.current(), dt, motion.matches);
          renderer.render(state);
          meter.current?.style.setProperty("--voice-level", String(state.mouth));
        }
        raf = requestAnimationFrame(draw);
      };
      visibility = () => {
        cancelAnimationFrame(raf); last = 0;
        state = { ...state, mouth: 0 };
        if (!document.hidden) raf = requestAnimationFrame(draw);
      };
      document.addEventListener("visibilitychange", visibility);
      visibility();
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true; cancelAnimationFrame(raf); observer?.disconnect();
      if (visibility) document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return <div className={`portrait ${compact ? "compact" : ""} ${speaking ? "speaking" : ""}`}>
    {!ready && <img src={portrait} alt="Fictional AI interviewer in a warmly lit office" />}
    <canvas ref={canvas} className={ready ? "portrait-canvas ready" : "portrait-canvas"}
      role="img" aria-label="Animated AI interviewer with audio-driven mouth movement and expressions" />
    {!compact && <div className="portrait-caption">
      <div><strong>Your interviewer</strong><span>{failed ? "Animation unavailable · still portrait" : ready ? "AI interviewer · animated locally" : "Preparing expressions…"}</span></div>
      <div ref={meter} className="voice-bars" aria-label={speaking ? "Speaking" : "Listening"}>
        {[0, 1, 2, 3, 4].map(i => <i key={i} style={{ height: `${12 + (2 - Math.abs(2 - i)) * 7}px` }} />)}
      </div>
    </div>}
  </div>;
}
