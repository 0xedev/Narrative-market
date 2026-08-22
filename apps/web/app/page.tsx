"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEther } from "viem";
import { useReadContract } from "wagmi";
import { WalletButton } from "../components/WalletButton";
import { TakeoverModal } from "../components/TakeoverModal";
import { narrativeThroneAbi } from "../lib/abi";
import { activityQuery, leaderboardQuery, querySubgraph } from "../lib/subgraph";
import { decodeContentUri } from "../lib/uri";

const contractAddress = process.env.NEXT_PUBLIC_NARRATIVE_THRONE_ADDRESS as `0x${string}` | undefined;
const readAddress = (contractAddress ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;

type HolderRow = { id: string; totalHeldSeconds: string; takeovers: string; wins: string; rewardsMinted: string };
type ActivityRow = { id: string; price: string; timestamp: string; newHolder: { id: string }; previousHolder?: { id: string } | null };

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function shortAddress(address?: string | null) {
  if (!address) return "No holder yet";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function Home() {
  const [showTakeover, setShowTakeover] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [holders, setHolders] = useState<HolderRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [subgraphError, setSubgraphError] = useState("");

  const reads = {
    activeQuestionId: useReadContract({ address: readAddress, abi: narrativeThroneAbi, functionName: "activeQuestionId", query: { enabled: Boolean(contractAddress), refetchInterval: 12_000 } }),
    activeQuestionUri: useReadContract({ address: readAddress, abi: narrativeThroneAbi, functionName: "activeQuestionUri", query: { enabled: Boolean(contractAddress), refetchInterval: 12_000 } }),
    currentAnswerUri: useReadContract({ address: readAddress, abi: narrativeThroneAbi, functionName: "currentAnswerUri", query: { enabled: Boolean(contractAddress), refetchInterval: 12_000 } }),
    currentEpoch: useReadContract({ address: readAddress, abi: narrativeThroneAbi, functionName: "currentEpoch", query: { enabled: Boolean(contractAddress), refetchInterval: 12_000 } }),
    currentHolder: useReadContract({ address: readAddress, abi: narrativeThroneAbi, functionName: "currentHolder", query: { enabled: Boolean(contractAddress), refetchInterval: 12_000 } }),
    currentPrice: useReadContract({ address: readAddress, abi: narrativeThroneAbi, functionName: "getCurrentPrice", query: { enabled: Boolean(contractAddress), refetchInterval: 5_000 } }),
    questionEnd: useReadContract({ address: readAddress, abi: narrativeThroneAbi, functionName: "questionEnd", query: { enabled: Boolean(contractAddress), refetchInterval: 12_000 } })
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadIndexedData() {
      try {
        const [leaderboard, recent] = await Promise.all([
          querySubgraph<{ holders: HolderRow[] }>(leaderboardQuery),
          querySubgraph<{ takeovers: ActivityRow[] }>(activityQuery)
        ]);
        if (cancelled) return;
        setHolders(leaderboard?.holders ?? []);
        setActivity(recent?.takeovers ?? []);
        setSubgraphError("");
      } catch (error) {
        if (!cancelled) setSubgraphError(error instanceof Error ? error.message : "Subgraph unavailable");
      }
    }
    void loadIndexedData();
    const timer = setInterval(() => void loadIndexedData(), 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const questionId = reads.activeQuestionId.data as `0x${string}` | undefined;
  const questionUri = typeof reads.activeQuestionUri.data === "string" ? reads.activeQuestionUri.data : "";
  const answerUri = typeof reads.currentAnswerUri.data === "string" ? reads.currentAnswerUri.data : "";
  const questionText = decodeContentUri(questionUri) || "No active narrative yet";
  const answerText = decodeContentUri(answerUri);
  const price = reads.currentPrice.data === undefined ? "" : formatEther(reads.currentPrice.data);
  const remaining = Math.max(0, Number(reads.questionEnd.data ?? 0n) - now);
  const currentHolder = reads.currentHolder.data as string | undefined;
  const epoch = reads.currentEpoch.data as bigint | undefined;

  const standings = useMemo(() => holders.slice(0, 5), [holders]);

  return <main className="shell">
    <header className="topbar">
      <div className="brand">Narrative Markets</div>
      <nav className="nav">
        <a className="active" href="#today">♛ Home</a>
        <a href="/history">◷ History</a>
        <a href="/leaderboard">♜ Leaderboard</a>
        <a href="/stats">⌁ My Stats</a>
        <a href="/propose">＋ Propose</a>
      </nav>
      <WalletButton />
    </header>
    <section className="content" id="today">
      <div className="hero-line">
        <div><div className="eyebrow">♛ Today’s narrative</div><h1>{questionText}</h1></div>
        <div className="reset"><span>Question ends in</span><strong>{formatDuration(remaining)}</strong></div>
      </div>
      <div className="grid">
        <div className="left">
          <div className="panel king-panel"><span className="king-ribbon">Current King</span><div className="king-content"><div className="avatar">♛</div><div className="king-name">{shortAddress(currentHolder)}</div><div className="muted">Live holder on Robinhood Chain</div></div></div>
          <div className="panel answer-panel"><div className="eyebrow">King’s submitted answer</div><blockquote>{answerText ? `“${answerText}”` : "No answer submitted yet."}</blockquote><div className="answer-note">The answer with the longest hold time wins the question.</div></div>
          <div className="panel activity"><div className="section-head"><h2>⚡ Activity feed</h2><span>{subgraphError ? "Indexer unavailable" : "Live on Robinhood Chain"}</span></div><div className="activity-row">{activity.length ? activity.map((item) => <div className="activity-item" key={item.id}><b>{shortAddress(item.newHolder.id)}</b> took the Throne <span className="muted">· {formatDuration(Math.max(0, now - Number(item.timestamp))) } ago</span></div>) : <div className="muted">No indexed takeovers yet.</div>}</div></div>
        </div>
        <aside className="right">
          <div className="panel throne-panel"><div className="price-label">Takeover price</div><div className="price">{price || "—"} <small>ETH</small></div><div className="price-note">Pay the live price to become the new King.</div><div className="timer-wrap"><div className="timer"><strong>{price ? "LIVE" : "—"}</strong><span>onchain</span></div><div><strong>Current epoch {epoch?.toString() ?? "—"}</strong><div className="muted">The price decays independently from NARR emissions.</div></div></div><button className="takeover" onClick={() => setShowTakeover(true)} disabled={!contractAddress || !questionId || !price}>♛ Take the Throne</button><div className="muted" style={{ textAlign: "center", marginTop: 12, fontSize: ".8rem" }}>Your answer URI is recorded with the transaction.</div></div>
          <div className="panel standings"><div className="section-head"><h2>♛ Live standings</h2><span>Hold time</span></div>{standings.length ? standings.map((row, index) => <div className="standing" key={row.id}><div className="rank">{index + 1}</div><div className="mini-avatar">♛</div><div><div className="standing-name">{shortAddress(row.id)}</div><div className="standing-answer">{row.takeovers} takeovers · {row.wins} wins</div></div><div className="hold">{formatDuration(Number(row.totalHeldSeconds))}</div></div>) : <div className="muted" style={{ padding: "18px 8px" }}>No indexed holders yet.</div>}<a className="full-leaderboard" href="/leaderboard">View full leaderboard →</a></div>
          <div className="notice"><strong>Hold the longest. Rule today.</strong>Rewards mint when the current holder is settled by a takeover or question rotation.</div>
        </aside>
      </div>
    </section>
    {showTakeover && <TakeoverModal price={price} questionId={questionId} expectedEpoch={epoch} onClose={() => setShowTakeover(false)} />}
  </main>;
}
