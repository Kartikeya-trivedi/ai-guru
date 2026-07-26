import type { InterviewReport } from "../report/types";
import type { DimensionScore } from "../report/types";

/**
 * The report is the artifact the customer keeps. It is the only screen that
 * passes judgement on a person, so it uses the serif voice, shows its
 * evidence, and never reduces a human to a single number.
 */

const DIMENSIONS: { key: keyof InterviewReport; label: string; blurb: string }[] = [
  { key: "projectDepth", label: "Project depth", blurb: "How far your own work held up under drilling" },
  { key: "technicalKnowledge", label: "Technical knowledge", blurb: "Fundamentals for the role you targeted" },
  { key: "communication", label: "Communication", blurb: "Clarity and structure under pressure" },
  { key: "behavioralFit", label: "Behavioural", blurb: "Collaboration, conflict, and self-awareness" },
];

function Meter({ score }: { score: number }) {
  const tone = score <= 2 ? "bad" : score === 3 ? "low" : "";
  return (
    <div className={`meter ${tone}`} title={`${score} of 5`} aria-label={`${score} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= score ? "on" : ""} />
      ))}
    </div>
  );
}

function Dimension({ label, blurb, dim }: { label: string; blurb: string; dim: DimensionScore }) {
  return (
    <div>
      {/* data-score carries the number into print, where the meter is hidden. */}
      <div className="dim-row" data-score={dim.score}>
        <div>
          <div className="dim-name">{label}</div>
          <div className="faint small mono" style={{ marginTop: 2 }}>{blurb}</div>
          <div className="dim-just">{dim.justification}</div>
        </div>
        <Meter score={dim.score} />
      </div>
      {dim.evidence.length > 0 && (
        <div className="evidence">
          {dim.evidence.map((e, i) => (
            <div key={i} style={{ marginBottom: 4 }}>{e}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReportView({
  report,
  candidateName,
  onBack,
}: {
  report: InterviewReport;
  candidateName: string;
  onBack: () => void;
}) {
  return (
    <div className="center">
      <div className="stack">
        <div className="reveal">
          <span className="eyebrow">Evaluation · {new Date(report.createdAt).toLocaleDateString()}</span>
          <h1 className="serif-title" style={{ marginTop: 8 }}>{candidateName}</h1>
        </div>

        <div className="reveal verdict">{report.interviewReadiness}</div>

        <div className="reveal panel">
          <span className="eyebrow">Assessment</span>
          <div style={{ marginTop: 8 }}>
            {DIMENSIONS.map((d) => (
              <Dimension
                key={d.key}
                label={d.label}
                blurb={d.blurb}
                dim={report[d.key] as DimensionScore}
              />
            ))}
          </div>
        </div>

        <div className="reveal panel">
          <span className="eyebrow">What you did well</span>
          <div className="tags" style={{ marginTop: 10 }}>
            {report.strengths.map((s, i) => (
              <span key={i} className="tag good">{s}</span>
            ))}
          </div>

          <span className="eyebrow" style={{ display: "block", marginTop: 20 }}>Where you were exposed</span>
          <div className="tags" style={{ marginTop: 10 }}>
            {report.weaknesses.map((w, i) => (
              <span key={i} className="tag bad">{w}</span>
            ))}
          </div>
        </div>

        <div className="reveal panel">
          <span className="eyebrow">Do this next</span>
          <ol style={{ margin: "12px 0 0", paddingLeft: 18 }}>
            {report.actionableImprovements.map((a, i) => (
              <li key={i} style={{ margin: "8px 0", fontSize: 13 }}>{a}</li>
            ))}
          </ol>
        </div>

        <div style={{ display: "flex", gap: 10, paddingBottom: 40 }}>
          <button className="btn btn-ghost" onClick={onBack}>Back</button>
          <button className="btn" onClick={() => window.print()}>Export PDF</button>
        </div>
      </div>
    </div>
  );
}
