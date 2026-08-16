"use client";

import Link from "next/link";
import { useState } from "react";

export default function ProposePage() {
  const [question, setQuestion] = useState("");
  return <main className="shell"><header className="topbar"><Link className="brand" href="/">Narrative Markets</Link><nav className="nav"><Link href="/">♛ Home</Link><Link href="/history">◷ History</Link><Link href="/leaderboard">♜ Leaderboard</Link></nav></header><section className="content"><div className="eyebrow">Curator queue</div><h1>Ask a question worth fighting over.</h1><div className="panel modal" style={{ marginTop: 28 }}><p>Questions are reviewed before they become the daily narrative.</p><textarea className="answer-input" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={120} placeholder="What should everyone be arguing about tomorrow?" /><button className="takeover" style={{ marginTop: 16 }}>Submit for review</button></div></section></main>;
}
