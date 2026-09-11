/** Small Canvas2D rig: shared photographic patches, composited at 30 fps. */
import type { PortraitMotion } from "./portraitMotion";
import { MOUTH_NAMES, PORTRAIT_FRAME_NAMES, mouthWeights } from "./portraitPose";
const WIDTH = 1536;
const HEIGHT = 1024;
interface Patch { canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number }

// Speech moves the cheek folds and chin as well as the lips. Keep this shared
// across every articulation source so the entire lower face blends together.
function lowerFace(image: HTMLImageElement): Patch {
  return patch(image, 780, 490, 215, 160);
}

function patch(image: HTMLImageElement, cx: number, cy: number, rx: number, ry: number): Patch {
  const canvas = document.createElement("canvas");
  canvas.width = rx * 2; canvas.height = ry * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, cx - rx, cy - ry, rx * 2, ry * 2, 0, 0, rx * 2, ry * 2);
  ctx.globalCompositeOperation = "destination-in";
  ctx.translate(rx, ry); ctx.scale(rx, ry);
  const feather = ctx.createRadialGradient(0, 0, 0.68, 0, 0, 1);
  feather.addColorStop(0, "rgba(0,0,0,1)"); feather.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = feather; ctx.fillRect(-1, -1, 2, 2);
  return { canvas, x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
}

/** Retain the base portrait and small patches, not fourteen decoded photographs. */
export function preparePortraitFrames(images: HTMLImageElement[]) {
  if (images.length !== PORTRAIT_FRAME_NAMES.length || images.some(image => image.naturalWidth !== WIDTH || image.naturalHeight !== HEIGHT)) throw new Error("Portrait frame size mismatch");
  const frame = (name: typeof PORTRAIT_FRAME_NAMES[number]) => images[PORTRAIT_FRAME_NAMES.indexOf(name)];
  const eyePair = (name: typeof PORTRAIT_FRAME_NAMES[number]) => [patch(frame(name), 695, 328, 70, 37), patch(frame(name), 843, 310, 66, 37)];
  const browPair = (name: typeof PORTRAIT_FRAME_NAMES[number]) => [patch(frame(name), 695, 287, 81, 44), patch(frame(name), 843, 269, 77, 44)];
  return {
    neutral: frame("portrait"),
    mouths: MOUTH_NAMES.map(name => lowerFace(frame(name))),
    halfEyes: eyePair("half-blink"), closedEyes: eyePair("blink"),
    brows: browPair("attentive"), focusedBrows: browPair("focused"),
    warm: patch(frame("warm"), 780, 392, 185, 200),
    smile: lowerFace(frame("smile")),
    extra: {} as Record<string, Patch[]>,
  };
}
export type PortraitFrames = ReturnType<typeof preparePortraitFrames>;

/** Extract only the relevant region; never mix a shifted generated background. */
export function prepareExtendedFrame(frames: PortraitFrames, name: string, image: HTMLImageElement) {
  if (image.naturalWidth !== WIDTH || image.naturalHeight !== HEIGHT) throw new Error("Extended portrait size mismatch");
  if (name.startsWith("breath-")) frames.extra[name] = [patch(image, 780, 820, 480, 195)];
  else if (name.includes("blink") || name.startsWith("saccade-")) {
    frames.extra[name] = [patch(image, 695, 328, 70, 37), patch(image, 843, 310, 66, 37)];
  } else frames.extra[name] = [lowerFace(image)];
}

/** Add weighted premultiplied patches before compositing: one feathered edge. */
function mixer(template: Patch) {
  const canvas = document.createElement("canvas");
  canvas.width = template.width; canvas.height = template.height;
  const ctx = canvas.getContext("2d")!;
  return (patches: Patch[], weights: number[]): Patch => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "lighter";
    patches.forEach((p, i) => {
      if (weights[i] > .001) { ctx.globalAlpha = weights[i]; ctx.drawImage(p.canvas, 0, 0); }
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    return { ...template, canvas };
  };
}

export function createPortraitRenderer(canvas: HTMLCanvasElement, input: PortraitFrames | HTMLImageElement[]) {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas is unavailable");
  const frames = Array.isArray(input) ? preparePortraitFrames(input) : input;
  const blendMouth = mixer(frames.mouths[0]);
  const blendEyes = frames.halfEyes.map(mixer);
  const draw = (p: Patch, alpha: number) => { ctx.globalAlpha = Math.max(0, Math.min(1, alpha)); ctx.drawImage(p.canvas, p.x, p.y); };
  return {
    render(state: PortraitMotion) {
      const scale = Math.max(canvas.width / WIDTH, canvas.height / HEIGHT);
      ctx.setTransform(scale, 0, 0, scale, (canvas.width - WIDTH * scale) / 2, (canvas.height - HEIGHT * scale) * 0.4);
      ctx.globalAlpha = 1; ctx.drawImage(frames.neutral, 0, 0);
      const extras = frames.extra;
      const breathe = extras[state.breath > 0 ? "breath-in" : "breath-out"];
      if (breathe && Math.abs(state.breath) > .01) draw(breathe[0], Math.abs(state.breath));
      // Fade all open-mouth smiles before a speech-driven or closed-lip pose.
      const resting = 1 - Math.min(1, state.mouth / .08);
      if (state.warmth > .01) draw(frames.warm, state.warmth * resting);
      if (state.smile > .01 && state.mouth === 0 && state.closure < .01) draw(extras["smile-closed"]?.[0] ?? frames.smile, state.smile);
      frames.brows.forEach(p => { if (state.attentive > .01) draw(p, state.attentive * (1 - state.blink.closed)); });
      frames.focusedBrows.forEach(p => { if (state.focused > .01) draw(p, state.focused * (1 - state.attentive) * (1 - state.blink.closed)); });
      if (state.mouth > .015) {
        // Favor one actual mouth over a translucent stack of different teeth.
        const raw = mouthWeights(state).map(w => w ** 4);
        const total = raw.reduce((sum, w) => sum + w, 0);
        const weights = raw.map(w => w / total);
        const neutral = MOUTH_NAMES.map((name, i) => extras[name]?.[0] ?? frames.mouths[i]);
        const warm = MOUTH_NAMES.map((name, i) => extras["warm-" + name]?.[0] ?? neutral[i]);
        const warmth = Math.min(.35, state.warmth);
        const transition = extras[state.mouth < .22 ? "contact-release" : "speech-transition"]?.[0];
        const recovery = extras.recovery?.[0];
        const recoveryWeight = recovery ? state.recovery : 0;
        const transitionWeight = transition ? state.transition * .35 * (1 - recoveryWeight) : 0;
        const remaining = 1 - recoveryWeight - transitionWeight;
        const patches = [...neutral, ...warm];
        const mix = [...weights.map(w => w * remaining * (1 - warmth)), ...weights.map(w => w * remaining * warmth)];
        if (transition) { patches.push(transition); mix.push(transitionWeight); }
        if (recovery) { patches.push(recovery); mix.push(recoveryWeight); }
        draw(blendMouth(patches, mix), Math.min(1, state.mouth / .12));
      }
      else if (state.closure > .01) draw(frames.mouths[6], state.closure);
      const gaze = extras[state.gaze > 0 ? "saccade-left" : "saccade-right"];
      if (gaze && state.blink.closed === 0) gaze.forEach(p => draw(p, Math.abs(state.gaze)));
      if (state.blink.closed > 0) {
        const closed = Math.max(0, state.blink.closed * 2 - 1);
        const halfEyes = state.mouth > .015 ? extras[state.rounded > .4 ? "speech-blink-rounded-half" : "speech-blink-half"] ?? frames.halfEyes : frames.halfEyes;
        const closedEyes = state.mouth > .015 ? extras["speech-blink-closed"] ?? frames.closedEyes : frames.closedEyes;
        const reopen = extras[Math.floor(state.elapsed / 7) % 2 ? "blink-reopen-left" : "blink-reopen-right"];
        const reopening = state.blink.elapsed !== null && state.blink.elapsed > .056 && reopen ? .2 * (1 - closed) : 0;
        halfEyes.forEach((half, i) => draw(blendEyes[i]([half, closedEyes[i], reopen?.[i] ?? half], [(1 - closed) * (1 - reopening), closed * (1 - reopening), reopening]), Math.min(1, state.blink.closed * 2)));
      }
      ctx.globalAlpha = 1;
    },
  };
}
