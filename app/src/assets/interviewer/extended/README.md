# Extended local avatar

27 frame slots supplement the original 14-frame rig. All twelve new movement
frames are used by the live Portrait component. Fifteen slots reuse the reviewed
v3 speech, warm speech and closed-smile candidates (two pairs share a source).

The renderer extracts a connected lower-face region (cheeks, mouth folds, lips
and chin), independent eye patches, and a feathered torso region. Speech and
smiles use the same lower-face footprint so cheek and jaw changes are retained.
The original room remains fixed. Extra images are decoded sequentially and only
their extracted canvases are retained by the rig. Rendering remains Canvas2D,
30 fps maximum, 1280 pixels maximum canvas width; no neural GPU runtime or avatar
service is required. Original PNGs add approximately 52 MiB before bundler deduplication.

## Playback

- Speech-transition and contact-release blend briefly during amplitude changes.
- Neutral and warm mouth variants follow speech energy/onsets, not detected phonemes.
- Recovery settles immediately after audio stops; silent holds keep lips closed.
- Open and rounded speaking blinks contribute eye patches independently of lips.
- Alternate partial reopening, small saccades and quiet shoulder breathing add idle variety.
- Reduced motion suppresses eye/shoulder decoration while preserving articulation.

## Sources and limitations

`sources.json` records the shipped image hashes and retained built-in imagegen prompts.
The saccade-left candidate was regenerated because its first gaze shift was too large.
The full v3/v4 candidate archives remain local review material, outside the release.

V3 mouth mapping (neutral): parted=c21-breath-pause; speaking/open=c18-ai;
rounded=c18-o; spread=c18-e; lip-bite=c18-fv; pressed=c18-mbp.
Warm equivalents use c19-rest/ai/o/e/ai/fv/mbp. Smile uses c10-smile-closed.

The remaining v3 head turns, laughter, concern, skepticism and tongue-specific
poses remain review assets. Audio energy alone cannot choose their meaning or
phoneme, and whole-frame head changes do not register cleanly with this fixed rig.
Dentition is synthetic; the closed-mouth reference cannot establish exact teeth.
This is photographic frame blending, not exact lip-sync or a continuous filmed actor.

Validation includes motion unit tests, a simulated thirty-minute state sequence,
production build/secret scan, a local browser speaking/listening check, and a
16-second export using the same renderer. These do not validate every machine or
a thirty-minute packaged WebView2 microphone session.
