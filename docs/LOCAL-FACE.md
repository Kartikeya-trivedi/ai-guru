# Human interviewer appearance

The default is a bundled photographic animation rig of a fictional human.
The mouth follows the actual speaker RMS envelope, with irregular blinks and
subtle smile/brow changes during listening. No avatar account, network call,
model download, Python installation, or dedicated GPU is needed at runtime.
This is amplitude-driven facial animation, not phoneme recognition or neural
video synthesis. It follows speech rhythm without claiming exact vowel shapes.

Fourteen registered photographs supply the base face, seven articulation poses,
half/full blinks, warmth, attentive/focused brows and an encouraging smile.
Canvas2D composites feathered facial patches, blending the photographed mouth
openings without stretching the skin. The background remains still. Images
are prepared once into shared small facial patches; only the base portrait and
patches are retained by the shared cache, allowing the other decoded source
images to be collected. Rendering is capped at 30 fps and
1280 pixels wide. Hidden tabs stop the animation loop. Reduced motion disables
decorative blinks/expressions while retaining mouth motion as speech feedback.
If frames fail to load, the original portrait remains visible with a status label.

Medium speech levels favor a rounded opening, louder speech a larger opening,
and new speech onsets gently vary the spread of the mouth. Lip contact appears
near quieter transitions; a short pressed-lip pose settles after speech ends.
Continuous sound does not keep advancing articulation styles. Mouth patches are
mixed with normalized weights in a small offscreen canvas, then placed once to
avoid stacking feathered edges. No skin stretching or full-frame swapping occurs.
These choices are artistic energy/onset heuristics, not recognition of phonemes.
Attentive/focused brows and restrained smiles vary while listening, and fade
during speech. Reduced motion suppresses all decorative expressions.

## Expanded set, 10 September 2026

Six additional built-in generated frames bring the selected set to fourteen:
`spread.png`, `open.png`, `lip-bite.png`, `pressed.png`, `focused.png`, `smile.png`.
All are saved in `app/src/assets/interviewer/`. Exact prompts are recorded in
[FACE-EXPANSION-PROMPTS.md](FACE-EXPANSION-PROMPTS.md). Full source photos remain
available for review; only the relevant facial patches are used in animation.
The preview offers Soft speech, Conversation and Emphasis modes.

Validation: 236 tests pass, production build and bundled-secret check pass.
New motion tests cover normalized mixtures, prompt closure, continuous-tone
stability and reduced-motion expressions. Browser preview and a 16-second export
use the same renderer. Exports: `artifacts/interviewer-motion-v2.gif` and `.mp4`.
No low-end hardware benchmark or exact lip-sync accuracy claim is implied.

## Additional frames, 9 September 2026

Generated with the built-in image tool, editing `portrait.png`, and saved as
`app/src/assets/interviewer/rounded.png` and `attentive.png` (1536 × 1024).
Only feathered mouth/brow regions are used, preserving the original background.

Prompt set:

- Shared: "Edit target: attached fictional interviewer portrait. Create a
  registered animation frame at EXACTLY 1536x1024. Preserve identical identity,
  head position, framing, nose, hair, body, clothing, lighting and background.
  No head movement or resize. One full photoreal image, no grid or text."
- Rounded: "Change ONLY the lips and immediate mouth area: lips naturally
  pursed into a small rounded open O, as softly saying 'oh'. Dark small oval
  mouth opening, no exaggerated expression, no smile or surprise. Upper lip
  remains at same height. Preserve eyes."
- Attentive: "Change ONLY eyebrows and upper eyelid expression: slight attentive
  eyebrow lift, subtle curious listening expression. Eyes stay looking directly
  into camera with pupils exactly same position. Mouth stays closed exactly as
  original, do not smile more. Natural small expression, not surprised or theatrical."

## Transition frames, 10 September 2026

Built-in image tool, editing `portrait.png`. New project assets:
`app/src/assets/interviewer/parted.png` and `half-blink.png`, both 1536 × 1024.
Blinking now passes through the half-closed frame on closing and reopening.
The parted frame supplies the quieter mouth opening; speech volume still
controls activation and silence closes the mouth. No phoneme detector was added.

Prompt set:

- Parted: "Edit target: fictional interviewer portrait. Registered animation frame
  EXACTLY 1536x1024. Preserve exact head and body position, identity, lighting,
  background, clothes, hair, eyes and eyebrows. Change ONLY mouth: gently parted
  lips with a narrow natural horizontal opening as during quiet speech, tiny
  sliver of upper teeth, relaxed cheeks, no grin. Upper lip stays at same height.
  No head shift or zoom. Photoreal, one full image, no text or grid."
- Half-blink: "Edit target: fictional interviewer portrait. Registered animation
  frame EXACTLY 1536x1024. Preserve exact head and body position, identity,
  lighting, background, clothes, hair, eyebrows and mouth. Change ONLY eyelids:
  BOTH upper eyelids halfway lowered in the middle of a natural blink. Eyes
  half-open, narrow apertures with iris still visible, relaxed lower lids; no
  squint or tired expression. Pupils and eye corners remain in exactly same
  position. Mouth closed exactly as original. No head shift or zoom. Photoreal,
  one full image, no text or grid."

The real interview reads `InterviewSession.outputLevel()` from the existing
audio analyser. Pauses and interruption produce zero level, closing the mouth.
The development preview uses an explicitly silent synthetic speech envelope.

The candidate camera defaults off. The preparation screen explicitly offers
local portrait or optional Simli video. Having an old Simli key stored no longer
automatically sends audio to that service.

## Open-source options checked on 2026-09-09

- [MuseTalk](https://github.com/TMElyralab/MuseTalk) is an audio-driven lip-sync
  option. Upstream reports 30 fps or more on an NVIDIA Tesla V100 and documents
  a Python/CUDA setup. That is evidence of feasibility on their hardware, not a
  benchmark for this laptop or a CPU-only shipping target.
- [LivePortrait](https://github.com/KlingAIResearch/LivePortrait) animates portraits
  using driving inputs. Its default pipeline is not a speech-to-face replacement
  for the current audio stream. Its [license notes](https://github.com/KlingAIResearch/LivePortrait/blob/main/LICENSE)
  also distinguish the project from third-party model terms.

A Ditto experiment was subsequently benchmarked on a GTX 1650: six seconds of
video took about 125 seconds to render, plus model startup. Its preview and
renderer code were removed in favor of the lightweight multi-frame face.
Downloaded experiment files remain in the ignored `.local-avatar/` folder;
the app does not load or ship them. The voice interview itself still uses the
configured AI providers.

## Asset provenance

Assets: `app/src/assets/interviewer/{portrait,speaking,blink,warm}.png`, generated with the built-in
image-generation tool for this project. It depicts a fictional person, not a
stock photograph or a known real individual.

Final prompt:

> Use case: photorealistic-natural. Create one fictional human interviewer portrait for a desktop mock interview app. Landscape 1536x1024. Authentic video-call composition, head and upper torso centered, Indian male senior software engineer around 38, short textured dark hair, subtle stubble, warm attentive expression, relaxed closed lips, natural skin texture, charcoal overshirt over muted cream t-shirt. Eye-level camera, head fully visible with generous space around it, softly blurred tasteful home office with warm neutral wall, daylight from side, subtle plant and books, calm understated colors. Looks like a real approachable person on a professional video call, not an avatar or illustration, no headset, no text, no logos, no watermarks. This is a fictional AI interviewer; do not depict a known real person.

Animation frame prompts used the original portrait as the edit reference, with
these shared constraints: "Edit this portrait as a precisely registered animation
frame. Output exactly 1536x1024, identical composition, camera, framing, scale,
face position, shoulders, hair, office, lighting, color, skin texture and identity.
Do not crop or zoom or shift anything. Preserve every other feature and background.
This frame will be layered over the original photograph so alignment is critical.
No text or graphics."

- Speaking: "Only change his mouth and immediately surrounding chin into a natural
  mid-speech AH vowel: lips parted around 12-16 pixels at this resolution, upper
  teeth visible subtly, dark interior, relaxed not smiling. His upper lip stays
  at the same height; lower lip and jaw move down a little. Eyes stay open exactly
  as reference. No exaggerated grin."
- Blink: "Only close BOTH eyes naturally in the middle of a blink, eyelids gently
  touching, with natural eyelid skin. Do not move the eyebrows, head or mouth.
  Mouth remains exactly closed as reference."
- Warm: "Only change facial expression to a slightly warmer small CLOSED-LIP smile
  and very subtly lifted eyebrows, engaged and encouraging. No teeth. No head
  movement. Preserve the same eye positions and identity."

## Preview

Run the development app and open `/?preview=room`. This development-only view
uses the real room component with demonstration data, without activating a
microphone, camera, database, or AI call. It is excluded from production builds.
