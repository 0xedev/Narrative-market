import Link from "next/link";

const history = [
  ["Who owns the internet today?", "Decentralized communities.", "05:42:18", "Today"],
  ["What should the web feel like?", "Fast, open, and weird.", "04:11:03", "Yesterday"],
  ["Which idea deserves the next block?", "Public goods.", "06:08:44", "Aug 14"]
];

export default function HistoryPage() {
  return <main className="shell"><header className="topbar"><Link className="brand" href="/">Narrative Markets</Link><nav className="nav"><Link href="/">♛ Home</Link><Link className="active" href="/history">◷ History</Link><Link href="/leaderboard">♜ Leaderboard</Link><Link href="/stats">⌁ My Stats</Link></nav></header><section className="content"><div className="eyebrow">Archive of the arena</div><h1>Yesterday’s narratives.</h1><div className="left" style={{ marginTop: 28 }}>{history.map(([question, answer, hold, date]) => <article className="panel answer-panel" key={question}><div className="section-head"><h2>{date}</h2><span>{hold} winning hold</span></div><blockquote>{question}</blockquote><div className="answer-note">Winning answer: <strong style={{ color: "var(--lime)" }}>{answer}</strong></div></article>)}</div></section></main>;
}
