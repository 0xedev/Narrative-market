import Link from "next/link";
import { querySubgraph } from "../../lib/subgraph";

type HolderRow = { id: string; totalHeldSeconds: string; takeovers: string; wins: string; rewardsMinted: string };

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default async function LeaderboardPage() {
  const data = await querySubgraph<{ holders: HolderRow[] }>(`query Leaderboard { holders(first: 50, orderBy: totalHeldSeconds, orderDirection: desc) { id totalHeldSeconds takeovers wins rewardsMinted } }`);
  const rows = data?.holders ?? [];
  return (
    <section className="content">
      <div className="eyebrow">The all-time arena</div>
      <h1>Long hold. Loud answer.</h1>
      <div className="panel standings" style={{ marginTop: 28 }}>
        {rows.length ? (
          rows.map((row, index) => (
            <div className="standing" key={row.id}>
              <div className="rank">{index + 1}</div>
              <div className="mini-avatar">♛</div>
              <div>
                <div className="standing-name">{shortAddress(row.id)}</div>
                <div className="standing-answer">{row.takeovers} takeovers · {row.wins} wins</div>
              </div>
              <div>
                <div className="hold">{formatDuration(Number(row.totalHeldSeconds))}</div>
                <div className="standing-answer">{row.rewardsMinted} raw NARR</div>
              </div>
            </div>
          ))
        ) : (
          <div className="muted" style={{ padding: "18px 8px" }}>No indexed holders yet.</div>
        )}
      </div>
    </section>
  );
}
