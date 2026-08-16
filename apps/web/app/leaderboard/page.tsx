import Link from "next/link";

const rows = [["@OxKingOfTheNet", "17h 42m", "12", "4,812 NARR"], ["@WebWeaver", "12h 08m", "8", "3,104 NARR"], ["@NodeNomad", "08h 51m", "6", "2,218 NARR"], ["@PacketPioneer", "05h 12m", "4", "1,009 NARR"]];

export default function LeaderboardPage() {
  return <main className="shell"><header className="topbar"><Link className="brand" href="/">Narrative Markets</Link><nav className="nav"><Link href="/">♛ Home</Link><Link href="/history">◷ History</Link><Link className="active" href="/leaderboard">♜ Leaderboard</Link><Link href="/stats">⌁ My Stats</Link></nav></header><section className="content"><div className="eyebrow">The all-time arena</div><h1>Long hold. Loud answer.</h1><div className="panel standings" style={{ marginTop: 28 }}>{rows.map(([name, held, takeovers, mined], index) => <div className="standing" key={name}><div className="rank">{index + 1}</div><div className="mini-avatar">♛</div><div><div className="standing-name">{name}</div><div className="standing-answer">{takeovers} takeovers</div></div><div><div className="hold">{held}</div><div className="standing-answer">{mined}</div></div></div>)}</div></section></main>;
}
