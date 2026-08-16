"use client";

import Link from "next/link";
import { WalletButton } from "../../components/WalletButton";

export default function StatsPage() {
  return <main className="shell"><header className="topbar"><Link className="brand" href="/">Narrative Markets</Link><nav className="nav"><Link href="/">♛ Home</Link><Link href="/history">◷ History</Link><Link href="/leaderboard">♜ Leaderboard</Link><Link className="active" href="/stats">⌁ My Stats</Link></nav><WalletButton /></header><section className="content"><div className="eyebrow">Your position</div><h1>Make your answer last.</h1><div className="grid" style={{ marginTop: 28 }}><div className="panel throne-panel"><div className="price-label">Wallet status</div><div className="price" style={{ fontSize: "clamp(2.8rem, 6vw, 5rem)" }}>Connect</div><div className="price-note">Connect a wallet to see live hold time, NARR rewards, takeovers, and daily wins.</div><div style={{ marginTop: 22 }}><WalletButton /></div></div><div className="panel standings"><div className="section-head"><h2>Stats preview</h2><span>Testnet</span></div><div className="notice"><strong>0 hours held</strong>Your narrative history will appear here after your first takeover.</div><div className="notice"><strong>0 NARR mined</strong>Emissions are fixed by the protocol and separate from takeover pricing.</div></div></div></section></main>;
}
