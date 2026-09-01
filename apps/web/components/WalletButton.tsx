"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export function WalletButton() {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <button className="wallet">Connect wallet</button>;
  }

  if (isConnected && address) {
    return <button className="wallet secondary" onClick={() => disconnect()}>{address.slice(0, 6)}…{address.slice(-4)}</button>;
  }

  return <button className="wallet" onClick={() => connect({ connector: connectors[0] })}>{isPending ? "Connecting…" : "Connect wallet"}</button>;
}

