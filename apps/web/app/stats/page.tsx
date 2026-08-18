"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { WalletButton } from "../../components/WalletButton";
import { narrativeThroneAbi, narrativeTokenAbi } from "../../lib/abi";
import { querySubgraph } from "../../lib/subgraph";

const throneAddress = process.env.NEXT_PUBLIC_NARRATIVE_THRONE_ADDRESS as `0x${string}` | undefined;
const readThrone = (throneAddress ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;

type HolderStats = { id: string; totalHeldSeconds: string; takeovers: string; wins: string; rewardsMinted: string };
type PayoutRow = { id: string; holderAmount: string; timestamp: string; question: { uri: string } };

export default function StatsPage() {
  const { address } = useAccount();
  const [stats, setStats] = useState<HolderStats | null>(null);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const tokenRead = useReadContract({ address: readThrone, abi: narrativeThroneAbi, functionName: "narr", query: { enabled: Boolean(throneAddress) } });
  const tokenAddress = tokenRead.data as `0x${string}` | undefined;
  const balanceRead = useReadContract({ address: tokenAddress ?? readThrone, abi: narrativeTokenAbi, functionName: "balanceOf", args: address ? [address] : undefined, query: { enabled: Boolean(tokenAddress && address), refetchInterval: 12_000 } });

  useEffect(() => {
    let cancelled = false;
    if (!address) { setStats(null); return; }
    const query = `query Holder($id: ID!) { holders(where: { id: $id }) { id totalHeldSeconds takeovers wins rewardsMinted } payouts(where: { previousHolder: $id }, first: 20, orderBy: timestamp, orderDirection: desc) { id holderAmount timestamp question { uri } } }`;
    void querySubgraph<{ holders: HolderStats[]; payouts: PayoutRow[] }>(query, { id: address.toLowerCase() }).then((data) => {
      if (!cancelled) {
        setStats(data?.holders?.[0] ?? null);
        setPayouts(data?.payouts ?? []);
      }
    }).catch(() => { if (!cancelled) setStats(null); });
    return () => { cancelled = true; };
  }, [address]);

  return <main className="shell"><header className="topbar"><Link className="brand" href="/">Narrative Markets</Link><nav className="nav"><Link href="/">♛ Home</Link><Link href="/history">◷ History</Link><Link href="/leaderboard">♜ Leaderboard</Link><Link className="active" href="/stats">⌁ My Stats</Link><Link href="/propose">＋ Propose</Link></nav><WalletButton /></header><section className="content"><div className="eyebrow">Your position</div><h1>Make your answer last.</h1><div className="grid" style={{ marginTop: 28 }}><div className="panel throne-panel"><div className="price-label">NARR balance</div><div className="price" style={{ fontSize: "clamp(2.8rem, 6vw, 5rem)" }}>{balanceRead.data === undefined ? "—" : formatEther(balanceRead.data)}</div><div className="price-note">NARR is minted directly when your holder position is settled.</div><div style={{ marginTop: 22 }}><WalletButton /></div></div><div className="panel standings"><div className="section-head"><h2>Live stats</h2><span>Subgraph</span></div>{address && stats ? <><div className="notice"><strong>{stats.totalHeldSeconds} seconds held</strong>Accumulated hold time across indexed questions.</div><div className="notice"><strong>{stats.takeovers} takeovers · {stats.wins} wins</strong>Your onchain competition record.</div><div className="notice"><strong>{formatEther(BigInt(stats.rewardsMinted))} NARR emitted</strong>Rewards settled directly to your wallet.</div></> : <div className="notice"><strong>Connect a wallet</strong>Your indexed hold time, takeovers, wins, and NARR emissions will appear here.</div>}</div></div>{address && <div className="panel standings" style={{ marginTop: 18 }}><div className="section-head"><h2>Direct payout history</h2><span>ETH sent onchain</span></div>{payouts.length ? payouts.map((payout) => <div className="activity-item" key={payout.id}><b>{formatEther(BigInt(payout.holderAmount))} ETH</b> received · {new Date(Number(payout.timestamp) * 1000).toLocaleString()}</div>) : <div className="muted" style={{ marginTop: 14 }}>No direct holder payouts indexed yet.</div>}</div>}</section></main>;
}
