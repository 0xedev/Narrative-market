import Link from "next/link";
import { decodeContentUri } from "../../lib/uri";
import { querySubgraph } from "../../lib/subgraph";

type HistoryItem = { id: string; uri: string; startsAt: string; winningHoldSeconds?: string | null; winningHolder?: string | null; winningAnswer?: { uri: string } | null };

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default async function HistoryPage() {
  const data = await querySubgraph<{ questions: HistoryItem[] }>(`query History { questions(where: { status: "RESOLVED" }, first: 30, orderBy: startsAt, orderDirection: desc) { id uri startsAt winningHoldSeconds winningHolder winningAnswer { uri } } }`);
  const history = data?.questions ?? [];
  return (
    <section className="content">
      <div className="eyebrow">Archive of the arena</div>
      <h1>Past narratives.</h1>
      <div className="left" style={{ marginTop: 28 }}>
        {history.length ? (
          history.map((item) => (
            <article className="panel answer-panel" key={item.id}>
              <div className="section-head">
                <h2>{new Date(Number(item.startsAt) * 1000).toLocaleDateString()}</h2>
                <span>{formatDuration(Number(item.winningHoldSeconds ?? 0))} winning hold</span>
              </div>
              <blockquote>{decodeContentUri(item.uri)}</blockquote>
              <div className="answer-note">
                Winning answer: <strong style={{ color: "var(--lime)" }}>{item.winningAnswer ? decodeContentUri(item.winningAnswer.uri) : "Not indexed"}</strong>
              </div>
              <div className="muted" style={{ marginTop: 8 }}>Winner: {item.winningHolder ?? "Unknown"}</div>
            </article>
          ))
        ) : (
          <div className="panel answer-panel">
            <div className="muted">No resolved questions indexed yet.</div>
          </div>
        )}
      </div>
    </section>
  );
}
