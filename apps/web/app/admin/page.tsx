"use client";

import Link from "next/link";
import { useState } from "react";
import { isAddress, keccak256, parseEther, toBytes } from "viem";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";
import { WalletButton } from "../../components/WalletButton";
import { narrativeThroneAbi } from "../../lib/abi";
import { activeChain } from "../../lib/chain";
import { createContentUri } from "../../lib/uri";

const contractAddress = process.env.NEXT_PUBLIC_NARRATIVE_THRONE_ADDRESS as `0x${string}` | undefined;
const readAddress = (contractAddress ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;

export default function AdminPage() {
  const { address } = useAccount();
  const chainId = useChainId();
  const ownerRead = useReadContract({
    address: readAddress,
    abi: narrativeThroneAbi,
    functionName: "owner",
    query: { enabled: Boolean(contractAddress), refetchInterval: 12_000 }
  });
  const { writeContractAsync, isPending } = useWriteContract();
  const [question, setQuestion] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [curator, setCurator] = useState("");
  const [duration, setDuration] = useState("86400");
  const [floor, setFloor] = useState("0.001");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const isOwner = Boolean(address && ownerRead.data && address.toLowerCase() === String(ownerRead.data).toLowerCase());

  function requireAdmin() {
    if (!contractAddress) throw new Error("Contract address is not configured.");
    if (!address) throw new Error("Connect the owner wallet first.");
    if (chainId !== activeChain.id) throw new Error(`Switch to ${activeChain.name}.`);
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

  function getDuration() {
    const value = BigInt(duration);
    if (value <= 0n) throw new Error("Duration must be positive.");
    return value;
  }

  function getFloor() {
    const value = parseEther(floor);
    if (value <= 0n) throw new Error("Floor must be positive.");
    return value;
  }

  async function run(action: () => Promise<`0x${string}`>) {
    setError("");
    try {
      requireAdmin();
      setStatus("Confirm the admin transaction in your wallet...");
      const hash = await action();
      setStatus(`Submitted: ${hash.slice(0, 10)}...`);
    } catch (cause) {
      setStatus("");
      setError(cause instanceof Error ? cause.message : "Admin transaction failed.");
    }
  }

  const questionUri = createContentUri("question", question.trim());
  const addressForWrite = contractAddress as `0x${string}`;

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/">Narrative Markets</Link>
        <nav className="nav">
          <Link href="/">Home</Link>
          <Link href="/history">History</Link>
          <Link href="/leaderboard">Leaderboard</Link>
          <Link href="/stats">My Stats</Link>
        </nav>
        <WalletButton />
      </header>
      <section className="content">
        <div className="eyebrow">Owner operations</div>
        <h1>Run the arena.</h1>
        {!isOwner && <div className="notice"><strong>Owner wallet required.</strong> Connect the contract owner on {activeChain.name} to operate questions and protocol controls.</div>}
        <div className="grid" style={{ marginTop: 28 }}>
          <div className="panel modal">
            <h2>Question controls</h2>
            <p>Prices double after each takeover and decay toward the floor. There is no protocol maximum.</p>
            <input className="answer-input" style={{ minHeight: 0 }} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Question text" maxLength={120} />
            <input className="answer-input" style={{ minHeight: 0, marginTop: 10 }} value={questionId} onChange={(event) => setQuestionId(event.target.value)} placeholder="Question ID (optional 0x + 64 hex)" />
            <input className="answer-input" style={{ minHeight: 0, marginTop: 10 }} value={curator} onChange={(event) => setCurator(event.target.value)} placeholder="Curator address (defaults to owner)" />
            <div className="grid" style={{ marginTop: 10, gridTemplateColumns: "1fr 1fr" }}>
              <input className="answer-input" style={{ minHeight: 0 }} value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="Duration seconds" />
              <input className="answer-input" style={{ minHeight: 0 }} value={floor} onChange={(event) => setFloor(event.target.value)} placeholder="Floor ETH" />
            </div>
            <div className="modal-actions">
              <button className="full-leaderboard" disabled={isPending} onClick={() => void run(() => writeContractAsync({ address: addressForWrite, abi: narrativeThroneAbi, functionName: "startFirstQuestion", args: [getQuestionId(), getCurator(), questionUri, getDuration(), getFloor()] }))}>Start first question</button>
              <button className="full-leaderboard" disabled={isPending} onClick={() => void run(() => writeContractAsync({ address: addressForWrite, abi: narrativeThroneAbi, functionName: "rotateIfDue", args: [getDuration(), getFloor()] }))}>Rotate if due</button>
              <button className="full-leaderboard" disabled={isPending} onClick={() => void run(() => writeContractAsync({ address: addressForWrite, abi: narrativeThroneAbi, functionName: "pause", args: [] }))}>Pause</button>
              <button className="full-leaderboard" disabled={isPending} onClick={() => void run(() => writeContractAsync({ address: addressForWrite, abi: narrativeThroneAbi, functionName: "unpause", args: [] }))}>Unpause</button>
            </div>
            {status && <p className="notice">{status}</p>}
            {error && <p className="notice">{error}</p>}
          </div>
        </div>
      </section>
    </main>
  );
}
