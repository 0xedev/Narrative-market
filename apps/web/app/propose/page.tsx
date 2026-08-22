"use client";

import Link from "next/link";
import { useState } from "react";
import { keccak256, toBytes } from "viem";
import { useAccount, useChainId, useWriteContract } from "wagmi";
import { narrativeThroneAbi } from "../../lib/abi";
import { createContentUri } from "../../lib/uri";
import { activeChain } from "../../lib/chain";
import { WalletButton } from "../../components/WalletButton";

const contractAddress = process.env.NEXT_PUBLIC_NARRATIVE_THRONE_ADDRESS as `0x${string}` | undefined;

export default function ProposePage() {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const { address } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync, isPending } = useWriteContract();

  async function submit() {
    setError("");
    const normalized = question.trim().replace(/\s+/g, " ");
    if (normalized.length < 8) return setError("Question is too short.");
    if (normalized.length > 120) return setError("Question must be 120 characters or fewer.");
    if (!address) return setError("Connect a wallet first.");
    if (chainId !== activeChain.id) return setError(`Switch your wallet to ${activeChain.name}.`);
    if (!contractAddress) return setError("Testnet contract address is not configured yet.");
    try {
      setStatus("Confirm the proposal in your wallet…");
      const questionUri = createContentUri("question", normalized);
      const questionId = keccak256(toBytes(`${address.toLowerCase()}:${normalized}:${Date.now()}`));
      const hash = await writeContractAsync({ address: contractAddress, abi: narrativeThroneAbi, functionName: "proposeQuestion", args: [questionId, questionUri] });
      setStatus(`Proposed: ${hash.slice(0, 10)}…`);
      setQuestion("");
    } catch (cause) {
      setStatus("");
      setError(cause instanceof Error ? cause.message : "Proposal failed.");
    }
  }

  return <main className="shell"><header className="topbar"><Link className="brand" href="/">Narrative Markets</Link><nav className="nav"><Link href="/">♛ Home</Link><Link href="/history">◷ History</Link><Link href="/leaderboard">♜ Leaderboard</Link><Link href="/stats">⌁ My Stats</Link><Link className="active" href="/propose">＋ Propose</Link></nav><WalletButton /></header><section className="content"><div className="eyebrow">Onchain curator queue</div><h1>Ask a question worth fighting over.</h1><div className="panel modal" style={{ marginTop: 28 }}><p>Questions are published as onchain URIs and reviewed by the curator wallet before activation.</p><textarea className="answer-input" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={120} placeholder="What should everyone be arguing about tomorrow?" />{status && <p className="muted">{status}</p>}{error && <div className="error">{error}</div>}<button className="takeover" style={{ marginTop: 16 }} onClick={submit} disabled={isPending}>{isPending ? "Confirming…" : "Submit onchain"}</button></div></section></main>;
}
