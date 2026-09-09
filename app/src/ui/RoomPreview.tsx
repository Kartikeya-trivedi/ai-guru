import { useState } from "react";
import { VideoStage } from "./VideoStage";
import "./theme.css";
import "./portrait.css";

/** Development-only visual review; never opens a mic, provider, or database. */
export default function RoomPreview() {
  const [speaking, setSpeaking] = useState(false);
  const [notice, setNotice] = useState("");
  const [intensity, setIntensity] = useState("conversation");
  return <div className="shell">
    <header className="topbar"><span className="brand">Interview<em>.</em></span><span className="muted small">Visual demo · no audio or interview running</span><div className="spacer" />
      <button className="btn" onClick={() => setSpeaking(!speaking)}>{speaking ? "Preview listening" : "Preview speaking"}</button></header>
    <main className="main"><div className="split"><aside><span className="eyebrow">Your conversation</span>
      <div className="trace"><div className="trace-topic">Your project architecture</div><div className="trace-meta">2 follow-ups explored</div></div>
      <p className="muted small">Take a moment to think. You can ask for clarification at any point.</p>
      <label className="small muted" htmlFor="preview-voice">Try the facial range</label>
      <select id="preview-voice" value={intensity} onChange={e => { setIntensity(e.target.value); setSpeaking(true); }} style={{ width: "100%", marginTop: 8 }}>
        <option value="soft">Soft speech</option>
        <option value="conversation">Conversation</option>
        <option value="emphasis">Emphasis</option>
      </select>
      <p className="faint small">Silent demonstration. Mouth shapes follow simulated speech energy.</p>
      {notice && <p role="status" className="notice info">{notice}</p>}
    </aside><section>
      <VideoStage camera={null} screen={null} speaking={speaking} level={() => {
        if (!speaking) return 0;
        const t = performance.now() / 1000;
        const amplitude = intensity === "soft" ? .065 : intensity === "emphasis" ? .28 : .16;
        return Math.sin(t * 9) > -.55 ? amplitude * (.75 + .25 * Math.sin(t * 17)) : 0;
      }}
        onToggleCamera={() => setNotice("Camera is disabled in this design preview.")} onToggleScreen={() => {}} screenSupported={false}
        onEnd={() => setNotice("This is a preview. No interview has been started.")} />
      <div className="turn assistant"><div className="turn-who">Interviewer</div><div className="turn-text">Let's start with the project you're proudest of. What did you build, and what was your part in it?</div></div>
    </section></div></main>
  </div>;
}
