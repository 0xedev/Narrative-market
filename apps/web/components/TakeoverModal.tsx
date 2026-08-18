"use client";

import { useEffect, useState } from "react";
import { parseEther } from "viem";
import { useAccount, useChainId, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { narrativeThroneAbi } from "../lib/abi";
import { contentHash, createContentUri, normalizeAnswer } from "../lib/uri";

const contractAddress = process.env.NEXT_PUBLIC_NARRATIVE_THRONE_ADDRESS as `0x${string}` | undefined;

export function TakeoverModal({
  onClose,
  price,
  questionId,
  expectedEpoch
}: {
  onClose: () => void;
  price: string;
  questionId?: `0x${string}`;
  expectedEpoch?: bigint;
}) {
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [transactionHash, setTransactionHash] = useState<`0x${string}`>();
  const { address } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: transactionHash });

  useEffect(() => {
    if (receipt.isSuccess) setStatus("Confirmed. NARR rewards and ETH payouts completed in the same transaction.");
  }, [receipt.isSuccess]);

  async function submit() {
    setError("");
    if (!answer.trim()) return setError("Enter an answer before taking the Throne.");
    if (!address) return setError("Connect a wallet first.");
    if (!contractAddress) return setError("Testnet contract address is not configured yet.");
    if (!questionId || expectedEpoch === undefined) return setError("The active question is not available yet.");
    if (chainId !== 46630) return setError("Switch your wallet to Robinhood Chain testnet.");

    try {
      const normalized = normalizeAnswer(answer);
      const answerUri = createContentUri("answer", normalized);
      const answerHash = contentHash(normalized);
      const priceWei = parseEther(price);
      setStatus("Confirm the takeover in your wallet…");
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: narrativeThroneAbi,
        functionName: "takeThrone",
        args: [questionId, answerHash, answerUri, expectedEpoch, priceWei, BigInt(Math.floor(Date.now() / 1000) + 120)],
        value: priceWei
      });
      setTransactionHash(hash);
      setStatus(`Submitted: ${hash.slice(0, 10)}… Waiting for confirmation.`);
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
        <button className="takeover" onClick={submit} disabled={isPending || receipt.isLoading}>{isPending || receipt.isLoading ? "Confirming…" : `Take for ${price} ETH`}</button>
      </div>
    </div>
  </div>;
}
