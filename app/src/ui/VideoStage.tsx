import { useEffect, useRef } from "react";

/**
 * The video surface of the interview room.
 *
 * The interviewer has no face. That is deliberate: a synthetic talking head
 * lands squarely in the uncanny valley and, worse, implies a person who is
 * not there. Instead it gets an audio-reactive presence tile — clearly a
 * system, unmistakably *listening*. (A real avatar would mean a third-party
 * video-generation service and a per-minute bill; noted as an option, not a
 * default.)
 *
 * The candidate's own tile is mirrored, like every video-call self-view, so
 * moving left moves the reflection left.
 */

function Stream({ stream, mirrored }: { stream: MediaStream; mirrored?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    // Autoplay can reject when the tab is backgrounded; the tile simply stays
    // black rather than throwing an unhandled rejection into the console.
    void el.play().catch(() => {});
    return () => {
      el.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={ref}
      muted
      playsInline
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        transform: mirrored ? "scaleX(-1)" : undefined,
        display: "block",
      }}
    />
  );
}

export function VideoStage({
  camera,
  screen,
  speaking,
  onToggleCamera,
  onToggleScreen,
  screenSupported,
}: {
  camera: MediaStream | null;
  screen: MediaStream | null;
  /** The interviewer is currently talking — drives the presence animation. */
  speaking: boolean;
  onToggleCamera: () => void;
  onToggleScreen: () => void;
  screenSupported: boolean;
}) {
  return (
    <div className="stage">
      {/* Screen share takes the main frame when present — it is what is being
          discussed. Otherwise the interviewer presence holds the space. */}
      <div className="stage-main">
        {screen ? (
          <Stream stream={screen} />
        ) : (
          <div className={`presence ${speaking ? "speaking" : ""}`}>
            <div className="presence-ring" />
            <div className="presence-core" />
            <div className="presence-label eyebrow">
              {speaking ? "Interviewer speaking" : "Interviewer listening"}
            </div>
          </div>
        )}
      </div>

      <div className="stage-side">
        <div className="tile">
          {camera ? (
            <Stream stream={camera} mirrored />
          ) : (
            <div className="tile-off faint small">Camera off</div>
          )}
          <span className="tile-tag">You</span>
        </div>

        {/* When a screen is up, the presence moves down here so the candidate
            still has a sense of being attended to. */}
        {screen && (
          <div className="tile">
            <div className={`presence small-presence ${speaking ? "speaking" : ""}`}>
              <div className="presence-core" />
            </div>
            <span className="tile-tag">Interviewer</span>
          </div>
        )}

        <div className="stage-controls">
          <button className="btn btn-ghost" onClick={onToggleCamera}>
            {camera ? "Turn camera off" : "Turn camera on"}
          </button>
          <button
            className="btn btn-ghost"
            onClick={onToggleScreen}
            disabled={!screenSupported}
            title={screenSupported ? undefined : "Screen sharing isn't available in this build"}
          >
            {screen ? "Stop sharing" : "Share screen"}
          </button>
        </div>
      </div>
    </div>
  );
}
