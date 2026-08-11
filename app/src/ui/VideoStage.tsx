import { useEffect, useRef } from "react";
import { Avatar } from "./avatar/Avatar";

/**
 * The video surface of the interview room.
 *
 * The interviewer is rendered as a stylised synthetic face that lip-syncs to
 * the real output audio (see avatar/face.ts). Stylised rather than photoreal
 * on purpose: a near-human render that is slightly off is unsettling to sit
 * across from for an hour, and photoreal would mean a third-party avatar
 * service billed per minute — which breaks the bring-your-own-key, works-
 * offline shape of the rest of the product.
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
  level,
  onToggleCamera,
  onToggleScreen,
  screenSupported,
}: {
  camera: MediaStream | null;
  screen: MediaStream | null;
  /** The interviewer is currently talking — lights the rim and lifts the brows. */
  speaking: boolean;
  /** Live output loudness 0..1, sampled per frame to drive the mouth. */
  level: () => number;
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
          <div className="avatar-frame">
            <Avatar level={level} speaking={speaking} />
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
            <div className="avatar-frame">
              <Avatar level={level} speaking={speaking} compact />
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
