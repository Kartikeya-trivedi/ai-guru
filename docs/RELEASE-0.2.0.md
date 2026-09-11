# Interview 0.2.0 — public beta

The local interviewer now animates cheeks, mouth folds and chin together, with
warm speech variants, speaking blinks, small eye movements, breathing and smoother
speech-to-listening recovery. The photographic avatar runs locally without a
dedicated GPU or an avatar service.

This release also includes session history, recoverable report drafts and report
retry, better handling of the final answer when ending an interview, and clearer
explanations of which content is processed by AI providers.

The target job position accepts any typed title, with optional suggestions.

## Downloads

- `Interview_0.2.0_x64-setup.exe`: Windows x64 setup.
- `Interview_0.2.0_x64_en-US.msi`: Windows x64 MSI.
- `SHA256SUMS.txt`: checksums for both installers.

## Validation

- 238 JavaScript/TypeScript tests pass across 19 files, including real SQLite
  persistence tests and a simulated thirty-minute avatar motion sequence.
- Production frontend build and bundled-secret scan pass.
- Rust test build succeeds; the Rust targets currently contain zero tests.
- Render check confirms changes in both cheek regions and the chin while the
  sampled background stays unchanged.

## Known limits

This remains a public beta. Installers are unsigned. Mouth articulation follows
audio energy and onset, not recognized phonemes. Full microphone interviews,
installed-app history flows and sustained WebView2 behavior still need human
validation. Windows x64 is the only platform packaged in this release.
Regular beeps have been reported during testing; their source is still unconfirmed.
