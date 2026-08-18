"use client";

import Link from "next/link";
import { useState } from "react";
import { isAddress, keccak256, parseEther, toBytes } from "viem";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";
import { WalletButton } from "../../components/WalletButton";
import { narrativeThroneAbi } from "../../lib/abi";
import { createContentUri } from "../../lib/uri";

const contractAddress = process.env.NEXT_PUBLIC_NARRATIVE_THRONE_ADDRESS as `0x${string}` | undefined;
const readAddress = (contractAddress ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;

export default function AdminPage() {
  const { address } = useAccount();
  const chainId = useChainId();
  const ownerRead = useReadContract({ address: readAddress, abi: narrativeThroneAbi, functionName: "owner", query: { enabled: Boolean(contractAddress), refetchInterval: 12_000 } });
  const { writeContractAsync, isPending } = useWriteContract();
  const [question, setQuestion] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [curator, setCurator] = useState("");
  const [duration, setDuration] = useState("86400");
  const [floor, setFloor] = useState("0.001");
  const [maximum, setMaximum] = useState("0.1");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const isOwner = Boolean(address && ownerRead.data && address.toLowerCase() === String(ownerRead.data).toLowerCase());

  function requireAdmin() {
    if (!contractAddress) throw new Error("Contract address is not configured.");
    if (!address) throw new Error("Connect the owner wallet first.");
    if (chainId !== 46630) throw new Error("Switch to Robinhood Chain testnet.");
    if (!isOwner) throw new Error("Connected wallet is not the contract owner.");
  }

  function getQuestionId() {
    const value = questionId.trim() || keccak256(toBytes(question.trim()));
    if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error("Question ID must be a 32-byte hex value.");
    return value as `0x${string}`;
  }

  function getCurator() {
    const value = (curator.trim() || address) as `0x${string}` | undefined;
    if (!value || !isAddress(value)) throw new Error("Enter a valid curator address.");
    return value;
  }

  async function run(action: () => Promise<`0x${string}`>) {
    setError("");
    try {
      requireAdmin();
      setStatus("Confirm the admin transaction in your wallet…");
      const hash = await action();
      setStatus(`Submitted: ${hash.slice(0, 10)}…`);
    } catch (cause) {
      setStatus("");
      setError(cause instanceof Error ? cause.message : "Admin transaction failed.");
    }
  }

  const questionUri = createContentUri("question", question.trim());
  return <main className="shell"><header className="topbar"><Link className="brand" href="/">Narrative Markets</Link><nav className="nav"><Link href="/">♛ Home</Link><Link href="/history">◷ History</Link><Link href="/leaderboard">♜ Leaderboard</Link><Link href="/stats">⌁ My Stats</Link></nav><WalletButton /></header><section className="content"><div className="eyebrow">Owner operations</div><h1>Run the arena.</h1>{!isOwner && <div className="notice"><strong>Owner wallet required.</strong>Connect the contract owner on Robinhood Chain testnet to operate questions and protocol pause controls.</div>}<div className="grid" style={{ marginTop: 28 }}><div className="panel modal"><h2>Question controls</h2><p>All question text is encoded into an onchain data URI.</p><input className="answer-input" style={{ minHeight: 0 }} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Question text" maxLength={120} /><input className="answer-input" style={{ minHeight: 0, marginTop: 10 }} value={questionId} onChange={(event) => setQuestionId(event.target.value)} placeholder="Question ID (optional 0x + 64 hex)" /><input className="answer-input" style={{ minHeight: 0, marginTop: 10 }} value={curator} onChange={(event) => setCurator(event.target.value)} placeholder="Curator address (defaults to owner)" /><div className="grid" style={{ marginTop: 10, gridTemplateColumns: "1fr 1fr 1fr" }}><input className="answer-input" style={{ minHeight: 0 }} value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="Duration seconds" /><input className="answer-input" style={{ minHeight: 0 }} value={floor} onChange={(event) => setFloor(event.target.value)} placeholder="Floor ETH" /><input className="answer-input" style={{ minHeight: 0 }} value={maximum} onChange={(event) => setMaximum(event.target.value)} placeholder="Max ETH" /></div><div className="modal-actions"><button className="full-leaderboard" onClick={() => void run(() => writeContractAsync({ address: contractAddress!, abi: narrativeThroneAbi, functionName: "queueQuestion", args: [getQuestionId(), getCurator(), questionUri] }))} disabled={isPending}>Queue</button><button className="takeover" onClick={() => void run(() => writeContractAsync({ address: contractAddress!, abi: narrativeThroneAbi, functionName: "startFirstQuestion", args: [getQuestionId(), getCurator(), questionUri, BigInt(duration), parseEther(floor), parseEther(maximum)] }))} disabled={isPending}>Start first</button></div><button className="takeover" style={{ marginTop: 10 }} onClick={() => void run(() => writeContractAsync({ address: contractAddress!, abi: narrativeThroneAbi, functionName: "rotateIfDue", args: [BigInt(duration), parseEther(floor), parseEther(maximum)] }))} disabled={isPending}>Rotate if due</button></div><div className="panel standings"><div className="section-head"><h2>Protocol controls</h2><span>{ownerRead.data ? `Owner ${String(ownerRead.data).slice(0, 8)}…` : "Not configured"}</span></div><button className="takeover" style={{ marginTop: 18 }} onClick={() => void run(() => writeContractAsync({ address: contractAddress!, abi: narrativeThroneAbi, functionName: "pause" }))} disabled={isPending}>Pause</button><button className="full-leaderboard" style={{ marginTop: 10 }} onClick={() => void run(() => writeContractAsync({ address: contractAddress!, abi: narrativeThroneAbi, functionName: "unpause" }))} disabled={isPending}>Unpause</button>{status && <p className="muted">{status}</p>}{error && <div className="error">{error}</div>}</div></div></section></main>;
}
