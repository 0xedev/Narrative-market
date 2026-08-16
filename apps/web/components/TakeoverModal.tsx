"use client";

import { useState } from "react";
import { parseEther } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { narrativeThroneAbi } from "../lib/abi";

const contractAddress = process.env.NEXT_PUBLIC_NARRATIVE_THRONE_ADDRESS as `0x${string}` | undefined;
const questionId = (`0x${"11".repeat(32)}`) as `0x${string}`;

export function TakeoverModal({ onClose, price }: { onClose: () => void; price: string }) {
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();

  async function submit() {
    setError("");
    if (!answer.trim()) return setError("Enter an answer before taking the Throne.");
    if (!address) return setError("Connect a wallet first.");
    if (!contractAddress) return setError("Testnet contract address is not configured yet.");

    try {
      setStatus("Registering your answer…");
      const registration = await fetch("/api/answers/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId, answer, holderAddress: address })
      });
      if (!registration.ok) throw new Error("Could not register the answer.");
      const { answerHash } = await registration.json() as { answerHash: `0x${string}` };
      const priceWei = parseEther(price);
      setStatus("Confirm the takeover in your wallet…");
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: narrativeThroneAbi,
        functionName: "takeThrone",
        args: [questionId, answerHash, priceWei, BigInt(Math.floor(Date.now() / 1000) + 120)],
        value: priceWei
      });
      setStatus(`Submitted: ${hash.slice(0, 10)}…`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed.");
      setStatus("");
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
    <div className="modal">
      <div className="eyebrow">Enter the arena</div>
      <h2>What is your answer?</h2>
      <p>Your answer will compete for the longest hold time in today’s narrative.</p>
      <textarea className="answer-input" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Write the answer you want to rule with…" maxLength={280} />
      {status && <p className="muted">{status}</p>}
      {error && <div className="error">{error}</div>}
      <div className="modal-actions">
        <button className="full-leaderboard" onClick={onClose}>Cancel</button>
        <button className="takeover" onClick={submit} disabled={isPending}>{isPending ? "Confirming…" : `Take for ${price} ETH`}</button>
      </div>
    </div>
  </div>;
}
