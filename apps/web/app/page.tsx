"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { useReadContract } from "wagmi";
import { WalletButton } from "../components/WalletButton";
import { TakeoverModal } from "../components/TakeoverModal";
import { narrativeThroneAbi } from "../lib/abi";

const standings = [
  ["@OxKingOfTheNet", "Decentralized communities.", "05:42:18", "♛"],
  ["@WebWeaver", "Open protocols.", "03:15:07", "◈"],
  ["@NodeNomad", "The builders.", "02:48:33", "●"],
  ["@PacketPioneer", "Infrastructure layer.", "01:34:21", "✦"],
  ["@SilentDao", "The community decides.", "00:52:44", "◆"]
];
const contractAddress = process.env.NEXT_PUBLIC_NARRATIVE_THRONE_ADDRESS as `0x${string}` | undefined;
const readAddress = (contractAddress ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;

export default function Home() {
  const [showTakeover, setShowTakeover] = useState(false);
  const [seconds, setSeconds] = useState(151);
  const { data: onchainPrice } = useReadContract({
    address: readAddress,
    abi: narrativeThroneAbi,
    functionName: "getCurrentPrice",
    query: { enabled: Boolean(contractAddress), refetchInterval: 12_000 }
  });

  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value <= 0 ? 3600 : value - 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const timer = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const price = onchainPrice ? formatEther(onchainPrice) : "0.0012";

  return <main className="shell">
    <header className="topbar">
      <div className="brand">Narrative Markets</div>
      <nav className="nav"><a className="active" href="#today">♛ Home</a><a href="#history">◷ History</a><a href="#leaderboard">♜ Leaderboard</a><a href="#stats">⌁ My Stats</a></nav>
      <WalletButton />
    </header>
    <section className="content" id="today">
      <div className="hero-line"><div><div className="eyebrow">♛ Today’s narrative</div><h1>Who owns the internet today?</h1></div><div className="reset"><span>Daily reset in</span><strong>09:18:42</strong></div></div>
      <div className="grid">
        <div className="left">
          <div className="panel king-panel"><span className="king-ribbon">Current King</span><div className="king-content"><div className="avatar">♛</div><div className="king-name">@OxKingOfTheNet</div><div className="muted">King since 7:42 AM · 05:42:18 held</div></div></div>
          <div className="panel answer-panel"><div className="eyebrow">King’s submitted answer</div><blockquote>“Decentralized communities.”</blockquote><div className="answer-note">The internet belongs to the people, not platforms.</div></div>
          <div className="panel activity"><div className="section-head"><h2>⚡ Activity feed</h2><span>Live on Robinhood Chain</span></div><div className="activity-row"><div className="activity-item"><b>@OxKingOfTheNet</b> dethroned @WebWeaver <span className="muted">· 5m ago</span></div><div className="activity-item"><b>@PacketPioneer</b> took @NodeNomad <span className="muted">· 18m ago</span></div><div className="activity-item"><b>@SilentDao</b> challenged @ChainGardener <span className="muted">· 37m ago</span></div></div></div>
        </div>
        <aside className="right">
          <div className="panel throne-panel"><div className="price-label">Takeover price</div><div className="price">{price} <small>ETH</small></div><div className="price-note">Pay to surpass the current King.</div><div className="timer-wrap"><div className="timer"><strong>{timer}</strong><span>price decays</span></div><div><strong>Strike before the floor.</strong><div className="muted">The price decays independently from NARR emissions.</div></div></div><button className="takeover" onClick={() => setShowTakeover(true)}>♛ Take the Throne</button><div className="muted" style={{ textAlign: "center", marginTop: 12, fontSize: ".8rem" }}>You become the new King if your answer holds the longest.</div></div>
          <div className="panel standings"><div className="section-head"><h2>♛ Live standings</h2><span>Hold time⌄</span></div>{standings.map(([name, answer, hold, icon], index) => <div className="standing" key={name}><div className="rank">{index + 1}</div><div className="mini-avatar">{icon}</div><div><div className="standing-name">{name}</div><div className="standing-answer">{answer}</div></div><div className="hold">{hold}</div></div>)}<button className="full-leaderboard">View full leaderboard →</button></div>
          <div className="notice"><strong>Hold the longest. Rule today.</strong>A new King every day. One answer to rule them all. Come back tomorrow and take your shot.</div>
        </aside>
      </div>
    </section>
    {showTakeover && <TakeoverModal price={price} onClose={() => setShowTakeover(false)} />}
  </main>;
}
